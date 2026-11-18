import {
  collectToolCalls,
  HERMES_AGENTS,
  HERMES_AGENT_ALIASES
} from './hermes-trigger.mjs';

export function extractSubagentSpecs(args) {
  if (Array.isArray(args?.Subagents) && args.Subagents.length > 0) {
    return args.Subagents.filter(Boolean);
  }
  if (Array.isArray(args?.subagents) && args.subagents.length > 0) {
    return args.subagents.filter(Boolean);
  }
  if (args && (args.TypeName || args.typeName || args.Role || args.role)) {
    return [args];
  }
  return [];
}

export function resolveCanonicalAgentName(raw) {
  const lower = String(raw || '').replace(/^@/, '').trim().toLowerCase();
  if (!lower) return '';
  const aliased = HERMES_AGENT_ALIASES[lower] || lower;
  return HERMES_AGENTS.has(aliased) ? aliased : lower;
}

/**
 * Slices a SYSTEM / SYSTEM_MESSAGE step into individual per-sender delivery chunks
 * so batched deliveries (e.g. viktor + grader in one step) never drop the second sender
 * and never contaminate verdicts across senders.
 */
export function splitSystemDeliveries(step) {
  if (!step || typeof step !== 'object') return [];
  const src = String(step.source || '').toUpperCase();
  const typ = String(step.type || '').toUpperCase();
  if (src !== 'SYSTEM' && typ !== 'SYSTEM_MESSAGE') return [];

  const contentStr = typeof step.content === 'string'
    ? step.content
    : (step.content?.text ? String(step.content.text) : JSON.stringify(step.content || ''));

  const results = [];
  const messageBlockRegex = /\[Message\]\s+[^\r\n]*?sender=["']?([0-9a-f-]{36})["']?[\s\S]*?(?=\[Message\]\s+[^\r\n]*?sender=|$)/gi;
  let mBlock;
  let hasBlocks = false;
  while ((mBlock = messageBlockRegex.exec(contentStr)) !== null) {
    hasBlocks = true;
    results.push({ senderUuid: mBlock[1].toLowerCase(), text: mBlock[0] });
  }

  if (!hasBlocks) {
    const senderMatches = [...contentStr.matchAll(/sender=["']?([0-9a-f-]{36})["']?/gi)];
    if (senderMatches.length > 0) {
      for (let k = 0; k < senderMatches.length; k++) {
        const segStart = senderMatches[k].index;
        const segEnd = k + 1 < senderMatches.length ? senderMatches[k + 1].index : contentStr.length;
        results.push({
          senderUuid: senderMatches[k][1].toLowerCase(),
          text: contentStr.slice(segStart, segEnd)
        });
      }
    } else {
      const sSender = String(step.sender || '').toLowerCase();
      if (/^[0-9a-f-]{36}$/.test(sSender)) {
        results.push({ senderUuid: sSender, text: contentStr });
      }
    }
  }

  return results;
}

/**
 * Unified subagent UUID binder (REQ-5 / TASK-005 + REQ-2 write-worker tracking):
 * - tool_call_id exact match -> bindingConfidence: "exact"
 * - single unbound invoke_subagent -> bindingConfidence: "fifo"
 * - multi unbound invoke_subagent in same step without tool_call_id -> bindingConfidence: "uncertain"
 * Also tracks write-worker UUIDs ("self", custom define_subagent(EnableWriteTools:true), swarm).
 */
export function bindSubagentsFromSteps(steps = [], { startIdx = 0, lastUserIdx = -1 } = {}) {
  const safeStart = Math.max(0, startIdx);
  const toolCallIdToUuid = new Map();

  for (let j = safeStart; j < steps.length; j++) {
    const stepJ = steps[j];
    const stepJType = String(stepJ?.type || '').toUpperCase();
    // HIGH-4: Never trust MODEL PLANNER_RESPONSE prose for subagent creation UUID bindings
    if (stepJType === 'PLANNER_RESPONSE') continue;
    const stepTcId = String(stepJ?.tool_call_id || stepJ?.toolCallId || stepJ?.call_id || '');
    if (!stepTcId) continue;
    const cStr = typeof stepJ?.content === 'string' ? stepJ.content : JSON.stringify(stepJ);
    const m =
      cStr.match(/Created the following subagent:\s*\{[^}]*"conversationId"\s*:\s*"([0-9a-f-]{36})"/i) ||
      cStr.match(/"conversationId"\s*:\s*"([0-9a-f-]{36})"/i);
    if (m) {
      toolCallIdToUuid.set(stepTcId, m[1].toLowerCase());
    }
  }

  const dispatchedUuids = new Set();
  const uuidToAgent = new Map();
  const agentToUuids = new Map();
  const uuidBindingConfidence = new Map();
  const writeWorkerTypes = new Set(['self']);
  const writeWorkerUuids = new Set();
  const uncertainUuids = new Set();
  const uncertainAgents = new Set();
  const invokedSpecialistsInTurn = new Set();
  const pendingFifo = [];

  const registerBinding = (agentName, uuid, confidence, isWriteWorker) => {
    const u = String(uuid || '').toLowerCase();
    const name = String(agentName || '').toLowerCase();
    if (!u || !name) return;
    dispatchedUuids.add(u);
    uuidToAgent.set(u, name);
    if (!agentToUuids.has(name)) agentToUuids.set(name, new Set());
    agentToUuids.get(name).add(u);
    uuidBindingConfidence.set(u, confidence);
    if (confidence === 'uncertain') {
      uncertainUuids.add(u);
      uncertainAgents.add(name);
    }
    if (isWriteWorker) {
      writeWorkerUuids.add(u);
    }
  };

  for (let i = safeStart; i < steps.length; i++) {
    const s = steps[i];
    const stepType = String(s?.type || '').toUpperCase();
    const contentStr = typeof s?.content === 'string' ? s.content : JSON.stringify(s);

    const stepUuids = [];
    // HIGH-4: Ignore PLANNER_RESPONSE prose so model text cannot spoof "Created the following subagent"
    if (stepType !== 'PLANNER_RESPONSE') {
      for (const m of contentStr.matchAll(/Created the following subagent:\s*\{[^}]*"conversationId"\s*:\s*"([0-9a-f-]{36})"/gi)) {
        stepUuids.push(m[1].toLowerCase());
      }
      if (stepUuids.length === 0 && (stepType === 'GENERIC' || s?.source === 'SYSTEM' || stepType === 'TOOL_OUTPUT' || stepType === 'TOOL_RESULT')) {
        for (const m of contentStr.matchAll(/"conversationId"\s*:\s*"([0-9a-f-]{36})"/gi)) {
          stepUuids.push(m[1].toLowerCase());
        }
      }
    }

    const stepToolCalls = collectToolCalls(s);
    const invokeEntries = [];
    for (const tc of stepToolCalls) {
      const tcName = String(tc?.name || '').toLowerCase();
      const tcArgs = tc?.args || {};
      if (tcName === 'define_subagent') {
        if (tcArgs.EnableWriteTools === true || tcArgs.enableWriteTools === true) {
          const defName = String(tcArgs.Name || tcArgs.name || '').trim().toLowerCase();
          if (defName) writeWorkerTypes.add(defName);
        }
      } else if (tcName === 'invoke_subagent') {
        const tcId = String(tc?.id || tc?.tool_call_id || tc?.call_id || '');
        const specs = extractSubagentSpecs(tcArgs);
        for (const spec of specs) {
          invokeEntries.push({ tcId, spec, singleSpecInCall: specs.length === 1 });
        }
      } else if (tcName === 'swarm') {
        const action = String(tcArgs.action || tcArgs.Action || '').toLowerCase();
        if (action === 'add' && (tcArgs.workspace === 'share' || tcArgs.workspace === 'branch')) {
          const swName = String(tcArgs.name || tcArgs.Name || '').trim().toLowerCase();
          if (swName) writeWorkerTypes.add(swName);
        }
      } else if (tcName === 'send_message' && i > lastUserIdx) {
        const recipient = String(tcArgs.Recipient || tcArgs.recipient || '').toLowerCase();
        const mappedAgent = uuidToAgent.get(recipient);
        if (mappedAgent) invokedSpecialistsInTurn.add(mappedAgent);
      }
    }

    const stepOwnTcId = String(s?.tool_call_id || s?.toolCallId || s?.call_id || '');
    if (invokeEntries.length === 0 && stepUuids.length > 0 && (!stepOwnTcId || !toolCallIdToUuid.has(stepOwnTcId))) {
      for (const u of stepUuids) {
        if (!uuidToAgent.has(u) && pendingFifo.length > 0) {
          const next = pendingFifo.shift();
          registerBinding(next.name, u, next.confidence, next.isWriteWorker);
        }
      }
    }

    if (String(s?.status || '').toUpperCase() === 'ERROR' && stepUuids.length === 0 && invokeEntries.length === 0 && pendingFifo.length > 0) {
      // Pre-tool-denied or errored invoke_subagent produces no UUID — drop its ghost entry immediately
      pendingFifo.shift();
    }

    // Discard any stale uncreated FIFO entries from an earlier PLANNER_RESPONSE before queueing new invokes
    if (invokeEntries.length > 0 && pendingFifo.length > 0) {
      pendingFifo.length = 0;
    }

    const unboundCount = invokeEntries.filter((e) => !(e.tcId && e.singleSpecInCall && toolCallIdToUuid.has(e.tcId))).length;
    const isMultiUnboundStep = unboundCount > 1;
    let uIdx = 0;

    for (const entry of invokeEntries) {
      const { tcId, spec, singleSpecInCall } = entry;
      const rawType = String(spec?.TypeName || spec?.typeName || spec?.Role || spec?.role || '').trim();
      const agentName = resolveCanonicalAgentName(rawType);
      if (!agentName) continue;
      if (i > lastUserIdx) invokedSpecialistsInTurn.add(agentName);
      const isWriteWorker =
        agentName === 'self' ||
        writeWorkerTypes.has(agentName) ||
        spec?.EnableWriteTools === true ||
        spec?.enableWriteTools === true;

      if (tcId && singleSpecInCall && toolCallIdToUuid.has(tcId)) {
        const u = toolCallIdToUuid.get(tcId);
        registerBinding(agentName, u, 'exact', isWriteWorker);
      } else {
        const confidence = isMultiUnboundStep ? 'uncertain' : 'fifo';
        if (confidence === 'uncertain') uncertainAgents.add(agentName);
        if (uIdx < stepUuids.length) {
          const u = stepUuids[uIdx++];
          registerBinding(agentName, u, confidence, isWriteWorker);
        } else {
          pendingFifo.push({ name: agentName, confidence, isWriteWorker });
        }
      }
    }
  }

  const getTrustedUuidsForAgent = (agentName) => {
    const out = new Set();
    const all = agentToUuids.get(String(agentName || '').toLowerCase());
    if (!all) return out;
    for (const u of all) {
      if (uuidBindingConfidence.get(u) !== 'uncertain') {
        out.add(u);
      }
    }
    return out;
  };

  const getAgentConfidence = (agentName) => {
    const key = String(agentName || '').toLowerCase();
    const all = agentToUuids.get(key);
    if (!all || all.size === 0) {
      return uncertainAgents.has(key) ? 'uncertain' : null;
    }
    let hasExact = false;
    let hasFifo = false;
    let hasUncertain = false;
    for (const u of all) {
      const c = uuidBindingConfidence.get(u);
      if (c === 'exact') hasExact = true;
      else if (c === 'fifo') hasFifo = true;
      else if (c === 'uncertain') hasUncertain = true;
    }
    if (hasExact) return 'exact';
    if (hasFifo) return 'fifo';
    if (hasUncertain) return 'uncertain';
    return null;
  };

  return {
    dispatchedUuids,
    uuidToAgent,
    agentToUuids,
    uuidBindingConfidence,
    writeWorkerTypes,
    writeWorkerUuids,
    uncertainUuids,
    uncertainAgents,
    invokedSpecialistsInTurn,
    getTrustedUuidsForAgent,
    getAgentConfidence
  };
}
