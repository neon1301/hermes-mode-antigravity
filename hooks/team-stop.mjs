import fs from 'node:fs';
import path from 'node:path';
import { collectToolCalls, HERMES_AGENTS } from './hermes-trigger.mjs';
import {
  atomicWriteJson,
  classifyTeamStopUnblockConsent,
  extractAskQuestionOptions,
  extractAuthenticAskAnswer,
  isTeamStopUnblockAskArgs,
  readProtectedJsonStrict
} from './consent-validator.mjs';

export const HARD_STOP_RULES = Object.freeze(new Set([
  'sec_l1_pattern',
  'tamper_protected',
  'plan_tampered'
]));

export function getTeamStopPath(activeWorkspaceDir) {
  return path.join(activeWorkspaceDir, '.hermes', 'team-stop.json');
}

export function triggerTeamStop({
  activeWorkspaceDir,
  taskHash,
  conversationId = '',
  rule,
  reason,
  triggerStepIdx = -1
}) {
  if (!activeWorkspaceDir || !HARD_STOP_RULES.has(rule)) return null;
  const record = {
    taskHash: String(taskHash || 'unknown'),
    conversationId: String(conversationId || ''),
    rule,
    reason: String(reason || '').slice(0, 300),
    ts: new Date().toISOString(),
    status: 'active',
    triggerStepIdx: Number.isInteger(triggerStepIdx) ? triggerStepIdx : -1
  };
  try {
    atomicWriteJson(getTeamStopPath(activeWorkspaceDir), record);
    return record;
  } catch {
    return null;
  }
}

export function isTeamStopActiveForContext({
  activeWorkspaceDir,
  taskContext,
  isSubagent = false,
  logGateDecision = null
}) {
  const stopPath = getTeamStopPath(activeWorkspaceDir);
  const res = readProtectedJsonStrict(stopPath, '.hermes/team-stop.json');
  const state = res?.data || null;
  if (!state || state.status !== 'active') {
    return { active: false, state, superseded: false };
  }

  // Task isolation for Lead: a stop from a different taskHash must not leak into a new task.
  // Mark stale active stop as 'superseded' so subagents of the new task are not ambushed either.
  if (!isSubagent) {
    const curTaskHash = String(taskContext?.taskHash || '');
    const stopTaskHash = String(state.taskHash || '');
    if (curTaskHash && stopTaskHash && stopTaskHash !== 'unknown' && curTaskHash !== stopTaskHash) {
      const updated = {
        ...state,
        status: 'superseded',
        supersededAt: new Date().toISOString(),
        supersededByTaskHash: curTaskHash
      };
      try {
        atomicWriteJson(stopPath, updated);
      } catch {}
      if (typeof logGateDecision === 'function') {
        logGateDecision({
          decision: 'allow',
          reason: `Team stop from prior task (${stopTaskHash}) superseded by new task (${curTaskHash})`,
          source: 'team_stop:task_isolation'
        });
      }
      return { active: false, state: updated, superseded: true };
    }
  }

  // For subagents: subagent transcripts lack parent USER_INPUT, so any active stop in workspace applies.
  return { active: true, state, superseded: false };
}

function findLatestTeamStopUnblockAsk(combinedSteps, minStepIdx) {
  let askIdx = -1;
  let askToolCallId = '';
  const start = Math.max(0, minStepIdx);
  for (let i = start; i < combinedSteps.length; i++) {
    const s = combinedSteps[i];
    for (const tc of collectToolCalls(s)) {
      if (String(tc?.name || '').toLowerCase() !== 'ask_question') continue;
      const argsStr = JSON.stringify(tc?.args || '');
      if (isTeamStopUnblockAskArgs(argsStr)) {
        askIdx = i;
        askToolCallId = String(tc?.id || tc?.tool_call_id || tc?.call_id || '');
      }
    }
  }
  return { askIdx, askToolCallId };
}

function isWriteSubagentSpawn({ toolName, args, combinedSteps, extractSubagentSpecs }) {
  if (toolName === 'swarm') return true;
  if (toolName === 'define_subagent') {
    return args?.EnableWriteTools === true || args?.enableWriteTools === true;
  }
  if (toolName !== 'invoke_subagent') return false;

  const customWriteTypes = new Set(['self']);
  for (const s of combinedSteps || []) {
    for (const tc of collectToolCalls(s)) {
      const n = String(tc?.name || '').toLowerCase();
      if (n === 'define_subagent' && (tc?.args?.EnableWriteTools === true || tc?.args?.enableWriteTools === true)) {
        const defName = String(tc?.args?.Name || tc?.args?.name || '').trim().toLowerCase();
        if (defName) customWriteTypes.add(defName);
      }
    }
  }

  const specs = extractSubagentSpecs(args);
  return specs.some((spec) => {
    const t = String(spec?.TypeName || spec?.typeName || '').trim().toLowerCase();
    return (
      customWriteTypes.has(t) ||
      spec?.EnableWriteTools === true ||
      spec?.enableWriteTools === true ||
      (!HERMES_AGENTS.has(t) && t !== 'research' && t !== 'browser')
    );
  });
}

/**
 * Enforces REQ-4 Hard-Stop (.hermes/team-stop.json) across Lead and subagents.
 * - Blocks all file writes, mutating shell commands, and write-worker spawns while active.
 * - Allows read-only council dispatches, read-only diagnostics, ask_question, and manage_subagents(kill/kill_all).
 * - Cleared ONLY by a validated user response via consent-validator.mjs (never by mechanical PASS).
 */
export function verifyTeamStopGate({
  toolName,
  args,
  activeWorkspaceDir,
  taskContext,
  combinedSteps = [],
  isSubagent = false,
  fileWriteToolsSet,
  isMutatingCmd,
  extractSubagentSpecs,
  logGateDecision,
  deny
}) {
  const { active, state } = isTeamStopActiveForContext({
    activeWorkspaceDir,
    taskContext,
    isSubagent,
    logGateDecision
  });
  if (!active || !state) return { active: false, state };

  // Check validated human unblock strictly on Lead path (after triggerStepIdx)
  if (!isSubagent && Array.isArray(combinedSteps) && combinedSteps.length > 0) {
    const minAskIdx = Math.max(
      taskContext?.taskStartIdx ?? 0,
      Number.isInteger(state.triggerStepIdx) && state.triggerStepIdx >= 0 ? state.triggerStepIdx + 1 : 0
    );
    const { askIdx, askToolCallId } = findLatestTeamStopUnblockAsk(combinedSteps, minAskIdx);
    if (askIdx >= 0) {
      const { options } = extractAskQuestionOptions(combinedSteps[askIdx]);
      const answer = extractAuthenticAskAnswer(combinedSteps, askIdx, askToolCallId);
      if (answer.trim()) {
        const consent = classifyTeamStopUnblockConsent(answer, options);
        if (consent.decision === 'unblock') {
          const cleared = {
            ...state,
            status: 'unblocked',
            unblockedAt: new Date().toISOString(),
            unblockReason: (consent.selectedOptionText || consent.reason || answer).slice(0, 240),
            unblockAskStepIdx: askIdx,
            unblockAskToolCallId: askToolCallId || null,
            source: 'user_ask_question:team_stop_unblock'
          };
          atomicWriteJson(getTeamStopPath(activeWorkspaceDir), cleared);
          logGateDecision({
            toolName,
            decision: 'allow',
            reason: `Team stop unblocked by validated user decision (${cleared.unblockReason})`,
            source: 'user_ask_question:team_stop_unblock'
          });
          return { active: false, state: cleared };
        }
        if (consent.decision === 'negated') {
          logGateDecision({
            toolName,
            decision: 'deny',
            reason: 'Team stop unblock rejected: negated consent detected',
            source: 'team_stop:unblock_negated'
          });
        }
      }
    }
  }

  // Always allow read-only tools, ask_question, manage_subagents (including emergency kill), and read-only council
  if (
    toolName === 'read_file' ||
    toolName === 'view_file' ||
    toolName === 'ask_question' ||
    toolName === 'manage_subagents'
  ) {
    return { active: true, state };
  }

  if (toolName === 'run_command') {
    const cmdLine = String(args?.CommandLine || args?.command || args?.cmd || '');
    if (!isMutatingCmd(cmdLine)) {
      return { active: true, state };
    }
  }

  if (toolName === 'invoke_subagent' || toolName === 'define_subagent') {
    if (!isWriteSubagentSpawn({ toolName, args, combinedSteps, extractSubagentSpecs })) {
      logGateDecision({
        toolName,
        decision: 'allow',
        reason: `Read-only council/diagnostic subagent allowed during active team-stop (${state.rule})`,
        source: 'team_stop:readonly_council_allowed'
      });
      return { active: true, state };
    }
  }

  const isBlockedAction =
    fileWriteToolsSet.has(toolName) ||
    toolName === 'run_command' ||
    isWriteSubagentSpawn({ toolName, args, combinedSteps, extractSubagentSpecs });

  if (isBlockedAction) {
    const who = isSubagent ? 'Субагент' : 'Команда';
    deny(
      `⛔ Hermes «Инспектор» (team_stop_active): ${who} остановлена после жёсткого нарушения [${state.rule}] (${toolName} заблокирован).\n` +
      `Причина стопа: ${state.reason}\n` +
      `Как разблокировать: разберите проблему (read-only совет разрешён) и получите явное подтверждение пользователя через ask_question («Разблокировать команду» + причина). Механический PASS тестов стоп не снимает.\n` +
      `[EN: Hermes Inspector (team_stop_active): Team stopped after hard violation [${state.rule}] (${toolName} blocked). Resolve issue (read-only council allowed) and obtain validated user unblock via ask_question. Mechanical PASS never clears team-stop.]`,
      { toolName, rule: 'team_stop_active', taskHash: state.taskHash, source: `team_stop:${state.rule}`, skipLessonTrack: true }
    );
    process.exit(0);
  }

  return { active: true, state };
}
