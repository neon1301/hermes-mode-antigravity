import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { collectToolCalls } from './hermes-trigger.mjs';
import {
  atomicWriteJson,
  classifyGradeOverrideConsent,
  extractAskQuestionOptions,
  extractAuthenticAskAnswer,
  isGradeOverrideAskArgs,
  readGateModeConfig,
  readProtectedJsonlStrict,
  readProtectedJsonStrict
} from './consent-validator.mjs';
import { splitSystemDeliveries } from './subagent-binding.mjs';

export const VALID_GRADE_GATE_MODES = new Set(['strict', 'off']);
export const VALID_ITEM_VERDICTS = new Set(['FULFILLED', 'NOT_FULFILLED', 'UNKNOWN']);
export const REWORK_CEILING = 3;
const MAX_EVIDENCE_FILE_BYTES = 5 * 1024 * 1024;

// --- REQ-1: Mechanical Rubric Derivation from EARS-lite Plan ---

export function deriveRubricFromLint({ lint, taskHash, planHash, version = 1 }) {
  const rawItems = Array.isArray(lint?.items) ? lint.items : [];
  const usedIds = new Map();
  const items = rawItems.map((entry, idx) => {
    const baseId = entry.reqId ? String(entry.reqId).toUpperCase() : `ITEM-${idx + 1}`;
    const prevCount = usedIds.get(baseId) || 0;
    usedIds.set(baseId, prevCount + 1);
    const reqId = prevCount === 0 ? baseId : `${baseId}.${prevCount + 1}`;
    return {
      reqId,
      condition: String(entry.condition || '').trim(),
      behavior: String(entry.behavior || '').trim(),
      verification: String(entry.verification || '').trim()
    };
  });

  const canonicalPayload = JSON.stringify({ planHash, version, items });
  const rubricHash = crypto.createHash('sha256').update(canonicalPayload, 'utf-8').digest('hex');

  return {
    schemaVersion: '1.0',
    taskHash: String(taskHash || ''),
    planHash: String(planHash || ''),
    rubricHash,
    version: Number(version) || 1,
    generatedAt: new Date().toISOString(),
    items
  };
}

export function writeRubricArtifact({ activeWorkspaceDir, taskHash, planHash, version = 1, lint }) {
  const rubricPath = path.join(activeWorkspaceDir, '.hermes', 'rubric.json');
  const existing = readProtectedJsonStrict(rubricPath, '.hermes/rubric.json')?.data || null;
  const previousRubricHash = existing && existing.taskHash === taskHash ? (existing.rubricHash || null) : null;
  const rubric = deriveRubricFromLint({ lint, taskHash, planHash, version });
  atomicWriteJson(rubricPath, rubric);
  return { rubric, previousRubricHash };
}

// --- REQ-2: Evidence Path:Line Resolution & Grade Block Parsing ---

export function validateEvidenceRef(evidence, workspaceDir, lineCountCache = new Map()) {
  const raw = String(evidence || '').trim();
  if (!raw) return { ok: false, reason: 'empty evidence path:line' };

  // Support: path/file.ext:42, path/file.ext:42-58, path\file.ext:42, hooks.json:14, path/file.ext#L42-L58
  const cleaned = raw.replace(/^file:\/\/\/?/i, '').replace(/\\/g, '/');
  const m = cleaned.match(/^(.+?)(?::|#L)(\d+)(?:-(?:L)?(\d+))?$/i);
  if (!m) {
    return { ok: false, reason: `invalid evidence format '${raw}' (expected path:line or path:start-end)` };
  }

  const relPath = m[1].trim();
  const startLine = Number.parseInt(m[2], 10);
  const endLine = m[3] ? Number.parseInt(m[3], 10) : startLine;

  if (!relPath || !Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) {
    return { ok: false, reason: `invalid line range in '${raw}'` };
  }
  if (/(?:^|\/)\.\.(?:\/|$)/.test(relPath)) {
    return { ok: false, reason: `path traversal rejected in '${raw}'` };
  }

  const absWorkspace = path.resolve(workspaceDir);
  let canonWorkspace = absWorkspace;
  try { canonWorkspace = fs.realpathSync(absWorkspace); } catch {}

  const candidatePath = path.isAbsolute(relPath) ? path.resolve(relPath) : path.resolve(absWorkspace, relPath);
  if (!fs.existsSync(candidatePath)) {
    return { ok: false, reason: `evidence file does not exist: '${relPath}'` };
  }

  let canonTarget;
  try {
    canonTarget = fs.realpathSync(candidatePath);
  } catch {
    return { ok: false, reason: `evidence file unreadable: '${relPath}'` };
  }

  const relCheck = path.relative(canonWorkspace, canonTarget);
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
    return { ok: false, reason: `evidence path escapes workspace: '${relPath}'` };
  }

  let stat;
  try {
    stat = fs.statSync(canonTarget);
  } catch {
    return { ok: false, reason: `cannot stat evidence file: '${relPath}'` };
  }
  if (!stat.isFile()) {
    return { ok: false, reason: `evidence path is not a file: '${relPath}'` };
  }
  if (stat.size > MAX_EVIDENCE_FILE_BYTES) {
    return { ok: false, reason: `evidence file exceeds 5MB limit: '${relPath}'` };
  }

  let totalLines = lineCountCache.get(canonTarget);
  if (totalLines === undefined) {
    try {
      const content = fs.readFileSync(canonTarget, 'utf-8');
      totalLines = content.length === 0 ? 0 : content.split(/\r?\n/).length;
      lineCountCache.set(canonTarget, totalLines);
    } catch {
      return { ok: false, reason: `cannot read evidence file: '${relPath}'` };
    }
  }

  if (totalLines === 0 || endLine > totalLines) {
    return { ok: false, reason: `line ${endLine} out of range for '${relPath}' (total lines: ${totalLines})` };
  }

  return {
    ok: true,
    normalized: `${relCheck.replace(/\\/g, '/')}:${startLine}${endLine !== startLine ? `-${endLine}` : ''}`,
    startLine,
    endLine,
    totalLines
  };
}

export function parseGradeBlockFromText(text) {
  const s = String(text || '');
  const blocks = [];

  // Primary fenced ```hermes-grade ... ```
  for (const m of s.matchAll(/```hermes-grade\s*\r?\n([\s\S]*?)```/gi)) {
    blocks.push(m[1].trim());
  }

  // Fallback fenced ```json ... ``` explicitly tagged with rubricHash + items + overall
  if (blocks.length === 0) {
    for (const m of s.matchAll(/```json\s*\r?\n([\s\S]*?)```/gi)) {
      const body = m[1].trim();
      if (/"rubricHash"/.test(body) && /"items"/.test(body) && /"overall"/.test(body)) {
        blocks.push(body);
      }
    }
  }

  if (blocks.length === 0) return null;
  const rawJson = blocks[blocks.length - 1];
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { parseError: 'hermes-grade block must be a JSON object' };
    }
    return { data: parsed };
  } catch (err) {
    return { parseError: `invalid JSON in hermes-grade block: ${err?.message || 'parse error'}` };
  }
}

export function computeExpectedOverall(items = []) {
  let hasUnknown = false;
  let hasNotFulfilled = false;
  for (const it of items) {
    if (it.verdict === 'UNKNOWN') hasUnknown = true;
    else if (it.verdict === 'NOT_FULFILLED') hasNotFulfilled = true;
  }
  if (hasUnknown) return 'NEEDS_HUMAN';
  if (hasNotFulfilled) return 'REWORK';
  return 'PASS';
}

function appendGradeLedger(activeWorkspaceDir, entry) {
  const hermesDir = path.join(activeWorkspaceDir, '.hermes');
  if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
  const ledgerPath = path.join(hermesDir, 'grade-ledger.jsonl');
  fs.appendFileSync(ledgerPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf-8');
}

/**
 * Used by clean-edits-guard.mjs (post-edit ask_question gate) to avoid spamming duplicate
 * economy popups while Lead is inside an active REWORK (1..3) cycle for the same task+plan.
 */
export function hasActiveReworkForTask({ activeWorkspaceDir, taskHash, planHash }) {
  try {
    const reportPath = path.join(activeWorkspaceDir, '.hermes', 'grade-report.json');
    const rep = readProtectedJsonStrict(reportPath, '.hermes/grade-report.json')?.data || null;
    if (!rep) return false;
    return rep.taskHash === taskHash && (!planHash || rep.planHash === planHash) && rep.overall === 'REWORK';
  } catch {
    return false;
  }
}

function findLatestGradeOverrideAsk(steps, minStepIdx) {
  let askIdx = -1;
  let askToolCallId = '';
  const start = Math.max(0, minStepIdx);
  for (let i = start; i < steps.length; i++) {
    for (const tc of collectToolCalls(steps[i])) {
      if (String(tc?.name || '').toLowerCase() !== 'ask_question') continue;
      if (isGradeOverrideAskArgs(JSON.stringify(tc?.args || ''))) {
        askIdx = i;
        askToolCallId = String(tc?.id || tc?.tool_call_id || tc?.call_id || '');
      }
    }
  }
  return { askIdx, askToolCallId };
}

/**
 * Evaluates Independent Grading Gate (REQ-2 + REQ-3) inside hooks/qa-gate.mjs Stop hook.
 * - Active strictly for tasks with a confirmed plan (.hermes/plan-state.json + .hermes/rubric.json)
 *   and no micro/fast-path/@specialist/fix-warnings bypass.
 * - Orthogonal to qaVerdictMode ("legacy" NEVER disables Grade Gate) and isEconomySkipRequested.
 */
export function evaluateGradeGate({
  activeWorkspaceDir,
  taskContext,
  turnSteps,
  allSteps,
  lastAnyWriteIdx,
  convId,
  binding,
  computeCanonicalPlanHash,
  logGateDecision,
  recordMechanicalLesson
}) {
  // Micro / fast-path / direct @specialist / fix-warnings -> no rubric, no grade gate
  if (taskContext?.bypassKind) {
    return { active: false, status: 'bypassed' };
  }

  const cfgRes = readGateModeConfig(activeWorkspaceDir, {
    key: 'gradeGate',
    envVar: 'HERMES_GRADE_GATE',
    validModes: VALID_GRADE_GATE_MODES,
    defaultMode: 'strict'
  });
  if (cfgRes.mode === 'off') {
    logGateDecision({
      decision: 'allow',
      reason: `Grade Gate bypassed: gradeGate="off" (source: ${cfgRes.source})`,
      source: cfgRes.source
    });
    return { active: false, status: 'off' };
  }

  const hermesDir = path.join(activeWorkspaceDir, '.hermes');
  const planStatePath = path.join(hermesDir, 'plan-state.json');
  const rubricPath = path.join(hermesDir, 'rubric.json');
  const reportPath = path.join(hermesDir, 'grade-report.json');
  const ledgerPath = path.join(hermesDir, 'grade-ledger.jsonl');
  const planMdPath = path.join(hermesDir, 'plan.md');
  const councilStatePath = path.join(hermesDir, 'council-state.json');

  const planState = readProtectedJsonStrict(planStatePath, '.hermes/plan-state.json')?.data || null;
  if (!planState || planState.status !== 'confirmed' || planState.taskHash !== taskContext.taskHash) {
    return { active: false, status: 'no_confirmed_plan' };
  }

  const rubric = readProtectedJsonStrict(rubricPath, '.hermes/rubric.json')?.data || null;
  if (!rubric || rubric.taskHash !== taskContext.taskHash) {
    return {
      active: true,
      passed: false,
      code: 'grade_missing',
      reason:
        `⛔ Hermes «Инспектор» (grade_missing): для подтверждённого плана отсутствует актуальная рубрика .hermes/rubric.json.\n` +
        `[EN: Hermes Inspector (grade_missing): rubric .hermes/rubric.json is missing for the confirmed plan.]`
    };
  }

  // Verify live plan.md matches confirmed planState.planHash
  if (fs.existsSync(planMdPath) && typeof computeCanonicalPlanHash === 'function') {
    const livePlanHash = computeCanonicalPlanHash(fs.readFileSync(planMdPath, 'utf-8'));
    if (livePlanHash !== planState.planHash || rubric.planHash !== planState.planHash) {
      return {
        active: true,
        passed: false,
        code: 'grade_hash_mismatch',
        reason:
          `⛔ Hermes «Инспектор» (grade_hash_mismatch): хэш .hermes/plan.md или .hermes/rubric.json не совпадает с подтверждённым планом.\n` +
          `[EN: Hermes Inspector (grade_hash_mismatch): plan.md or rubric.json hash does not match confirmed plan.]`
      };
    }
  }

  const ledgerRecords = readProtectedJsonlStrict(ledgerPath, '.hermes/grade-ledger.jsonl');
  const councilState = readProtectedJsonStrict(councilStatePath, '.hermes/council-state.json')?.data || null;

  // Collect council roster UUIDs (active + pruned) for this taskHash
  const councilRosterUuids = new Set();
  if (councilState && councilState.taskHash === taskContext.taskHash) {
    for (const m of Array.isArray(councilState.roster) ? councilState.roster : []) {
      if (m?.uuid) councilRosterUuids.add(String(m.uuid).toLowerCase());
    }
    for (const u of Array.isArray(councilState.prunedUuids) ? councilState.prunedUuids : []) {
      if (u) councilRosterUuids.add(String(u).toLowerCase());
    }
  }

  const leadConvLower = String(convId || '').toLowerCase();
  const rubricReqIds = (Array.isArray(rubric.items) ? rubric.items : []).map((it) => String(it.reqId).toUpperCase());
  const rubricReqSet = new Set(rubricReqIds);
  const lineCountCache = new Map();

  let latestValidGrade = null;
  let latestValidStepIdx = -1;
  let latestRejection = null;

  // Scan incoming SYSTEM deliveries AFTER last non-meta write (any edit invalidates prior grade)
  const scanFrom = lastAnyWriteIdx >= 0 ? lastAnyWriteIdx + 1 : 0;
  for (let stepIdx = scanFrom; stepIdx < turnSteps.length; stepIdx++) {
    const step = turnSteps[stepIdx];
    const deliveries = splitSystemDeliveries(step);
    for (const { senderUuid, text } of deliveries) {
      if (/Stop hook blocked termination:|Hermes Gate \(попытка/i.test(text)) continue;
      const parsed = parseGradeBlockFromText(text);
      if (!parsed) continue;

      if (parsed.parseError) {
        latestRejection = { code: 'grade_schema_invalid', detail: parsed.parseError };
        continue;
      }

      const block = parsed.data;
      const confidence = binding.uuidBindingConfidence.get(senderUuid) || null;

      // 1. Authentic harness-bound subagent UUID (never uncertain, never unknown, never Lead)
      if (!senderUuid || !binding.dispatchedUuids.has(senderUuid)) {
        latestRejection = { code: 'grade_not_independent', detail: `unknown grader UUID '${senderUuid || 'none'}' not bound to invoke_subagent` };
        continue;
      }
      if (confidence === 'uncertain') {
        latestRejection = {
          code: 'l2_binding_uncertain',
          detail: `grader UUID '${senderUuid}' has bindingConfidence="uncertain" (multi-invoke without tool_call_id); re-invoke grader as a single invoke_subagent call`
        };
        continue;
      }

      // 2. Independence check: graderUuid ∉ councilRoster ∪ writeWorkers ∪ {Lead}
      if (senderUuid === leadConvLower) {
        latestRejection = { code: 'grade_conflict_of_interest', detail: 'grader UUID matches Lead conversationId' };
        continue;
      }
      if (councilRosterUuids.has(senderUuid)) {
        latestRejection = { code: 'grade_conflict_of_interest', detail: `grader UUID '${senderUuid}' participated in council roster for this task` };
        continue;
      }
      if (binding.writeWorkerUuids.has(senderUuid)) {
        latestRejection = { code: 'grade_conflict_of_interest', detail: `grader UUID '${senderUuid}' is a write-worker for this task` };
        continue;
      }

      // 3. Hash binding: taskHash, planHash, rubricHash
      if (
        String(block.taskHash || '') !== taskContext.taskHash ||
        String(block.planHash || '') !== planState.planHash ||
        String(block.rubricHash || '') !== rubric.rubricHash
      ) {
        latestRejection = {
          code: 'grade_hash_mismatch',
          detail: `taskHash/planHash/rubricHash mismatch (got task=${block.taskHash}, plan=${block.planHash}, rubric=${block.rubricHash})`
        };
        continue;
      }

      // 4. Items schema & 100% reqId coverage
      if (!Array.isArray(block.items) || block.items.length === 0) {
        latestRejection = { code: 'grade_incomplete_coverage', detail: 'hermes-grade items[] is empty' };
        continue;
      }

      const seenReqIds = new Set();
      const normalizedItems = [];
      let itemError = null;

      for (const item of block.items) {
        const reqId = String(item?.reqId || '').trim().toUpperCase();
        const verdict = String(item?.verdict || '').trim().toUpperCase();
        const evidence = String(item?.evidence || '').trim();

        if (!reqId) {
          itemError = { code: 'grade_schema_invalid', detail: 'item missing reqId' };
          break;
        }
        if (seenReqIds.has(reqId)) {
          itemError = { code: 'grade_schema_invalid', detail: `duplicate reqId '${reqId}' in hermes-grade` };
          break;
        }
        if (!VALID_ITEM_VERDICTS.has(verdict)) {
          itemError = { code: 'grade_schema_invalid', detail: `invalid verdict '${verdict}' for ${reqId} (expected FULFILLED|NOT_FULFILLED|UNKNOWN)` };
          break;
        }
        seenReqIds.add(reqId);

        let normalizedEvidence = evidence;
        if (verdict !== 'UNKNOWN' || evidence.length > 0) {
          const evCheck = validateEvidenceRef(evidence, activeWorkspaceDir, lineCountCache);
          if (!evCheck.ok) {
            itemError = { code: 'grade_evidence_invalid', detail: `${reqId}: ${evCheck.reason}` };
            break;
          }
          normalizedEvidence = evCheck.normalized;
        }

        normalizedItems.push({ reqId, verdict, evidence: normalizedEvidence });
      }

      if (itemError) {
        latestRejection = itemError;
        continue;
      }

      const missingReqs = rubricReqIds.filter((r) => !seenReqIds.has(r));
      if (missingReqs.length > 0) {
        latestRejection = {
          code: 'grade_incomplete_coverage',
          detail: `missing required rubric reqIds: ${missingReqs.join(', ')}`
        };
        continue;
      }

      // 5. Mechanical overall recomputation (UNKNOWN > NOT_FULFILLED > FULFILLED)
      const expectedOverall = computeExpectedOverall(normalizedItems);
      const declaredOverall = String(block.overall || '').trim().toUpperCase();
      if (declaredOverall !== expectedOverall) {
        latestRejection = {
          code: 'grade_overall_mismatch',
          detail: `declared overall '${declaredOverall}' contradicts items (computed '${expectedOverall}'; UNKNOWN can never be PASS)`
        };
        continue;
      }

      const graderAgent = binding.uuidToAgent.get(senderUuid) || 'unknown';
      const priorVersions = ledgerRecords.filter(
        (r) => r.event === 'GRADE_RECORDED' && r.taskHash === taskContext.taskHash
      ).length;

      const dedupKey = `${taskContext.taskHash}|${rubric.rubricHash}|${senderUuid}|${stepIdx}|${expectedOverall}`;
      const alreadyInLedger = ledgerRecords.some((r) => r.dedupKey === dedupKey);
      const reportVersion = alreadyInLedger ? Math.max(1, priorVersions) : (priorVersions + 1);

      const report = {
        schemaVersion: '1.0',
        source: 'mechanical',
        taskHash: taskContext.taskHash,
        planHash: planState.planHash,
        rubricHash: rubric.rubricHash,
        rubricVersion: rubric.version || 1,
        version: reportVersion,
        graderUuid: senderUuid,
        graderAgent,
        bindingConfidence: confidence,
        overall: expectedOverall,
        items: normalizedItems,
        ts: new Date().toISOString()
      };

      atomicWriteJson(reportPath, report);
      if (!alreadyInLedger) {
        const ledgerEntry = {
          event: 'GRADE_RECORDED',
          dedupKey,
          taskHash: taskContext.taskHash,
          planHash: planState.planHash,
          rubricHash: rubric.rubricHash,
          version: reportVersion,
          graderUuid: senderUuid,
          graderAgent,
          bindingConfidence: confidence,
          overall: expectedOverall
        };
        appendGradeLedger(activeWorkspaceDir, ledgerEntry);
        ledgerRecords.push(ledgerEntry);
      }

      latestValidGrade = report;
      latestValidStepIdx = stepIdx;
      latestRejection = null;
    }
  }

  // If valid PASS grade was delivered after last write -> allow!
  if (latestValidGrade && latestValidGrade.overall === 'PASS') {
    logGateDecision({
      decision: 'allow',
      reason: `Grade Gate PASS v${latestValidGrade.version} by @${latestValidGrade.graderAgent} (${latestValidGrade.bindingConfidence})`,
      bindingConfidence: latestValidGrade.bindingConfidence
    });
    return { active: true, passed: true, report: latestValidGrade };
  }

  // Count unique REWORK cycles on this taskHash across grade-ledger.jsonl
  const reworkCount = ledgerRecords.filter(
    (r) => r.event === 'GRADE_RECORDED' && r.taskHash === taskContext.taskHash && r.overall === 'REWORK'
  ).length;

  // Check validated user override window (NEEDS_HUMAN or REWORK ceiling / accept-as-is)
  const existingReport = latestValidGrade || (() => {
    const diskRep = readProtectedJsonStrict(reportPath, '.hermes/grade-report.json')?.data || null;
    if (
      diskRep &&
      diskRep.source === 'mechanical' &&
      diskRep.taskHash === taskContext.taskHash &&
      diskRep.planHash === planState.planHash &&
      diskRep.rubricHash === rubric.rubricHash
    ) {
      return diskRep;
    }
    return null;
  })();

  // HIGH-3: Any code write after a previous GRADE_USER_OVERRIDE invalidates that override
  const turnOffset = allSteps.length - turnSteps.length;
  const lastWriteGlobalIdx = lastAnyWriteIdx >= 0 ? (turnOffset + lastAnyWriteIdx + 1) : 0;
  const minOverrideIdx = Math.max(
    taskContext.taskStartIdx ?? 0,
    latestValidStepIdx >= 0 ? (turnOffset + latestValidStepIdx) : 0,
    lastWriteGlobalIdx
  );
  const { askIdx: overrideAskIdx, askToolCallId: overrideAskTcId } = findLatestGradeOverrideAsk(allSteps, minOverrideIdx);

  if (overrideAskIdx >= 0 && existingReport && (existingReport.overall === 'NEEDS_HUMAN' || existingReport.overall === 'REWORK')) {
    const { options } = extractAskQuestionOptions(allSteps[overrideAskIdx]);
    const answer = extractAuthenticAskAnswer(allSteps, overrideAskIdx, overrideAskTcId);
    if (answer.trim()) {
      const consent = classifyGradeOverrideConsent(answer, options);
      if (consent.decision === 'accept_as_is') {
        // NEVER flip grade-report.json.overall to PASS — log human override in grade-ledger.jsonl!
        appendGradeLedger(activeWorkspaceDir, {
          event: 'GRADE_USER_OVERRIDE',
          taskHash: taskContext.taskHash,
          planHash: planState.planHash,
          rubricHash: rubric.rubricHash,
          previousOverall: existingReport.overall,
          decision: 'accept_as_is',
          reason: (consent.selectedOptionText || consent.reason || answer).slice(0, 240),
          source: 'user_ask_question:grade_override'
        });
        logGateDecision({
          decision: 'allow',
          reason: `Grade Gate user override (accept_as_is, previous=${existingReport.overall})`,
          source: 'user_ask_question:grade_override'
        });
        return { active: true, passed: true, override: 'accept_as_is', report: existingReport };
      }
      if (consent.decision === 'stop_task') {
        appendGradeLedger(activeWorkspaceDir, {
          event: 'GRADE_USER_OVERRIDE',
          taskHash: taskContext.taskHash,
          planHash: planState.planHash,
          rubricHash: rubric.rubricHash,
          previousOverall: existingReport.overall,
          decision: 'stop_task',
          reason: (consent.selectedOptionText || consent.reason || answer).slice(0, 240),
          source: 'user_ask_question:grade_override'
        });
        logGateDecision({
          decision: 'allow',
          reason: 'Grade Gate stopped by validated user decision (stop_task)',
          source: 'user_ask_question:grade_override'
        });
        return { active: true, passed: true, override: 'stop_task', report: existingReport };
      }
      if (consent.decision === 'negated') {
        return {
          active: true,
          passed: false,
          code: 'grade_override_negated',
          reason:
            `⛔ Hermes «Инспектор» (grade_override_negated): пользователь отклонил «Принять как есть» (зафиксировано отрицание). Вердикт ${existingReport.overall} остаётся активным — выполните доработку или уточните решение.\n` +
            `[EN: Hermes Inspector (grade_override_negated): user negated accept-as-is override. Verdict ${existingReport.overall} remains active.]`
        };
      }
    }
  }

  // Handle NEEDS_HUMAN immediately -> mandatory user window
  if (latestValidGrade && latestValidGrade.overall === 'NEEDS_HUMAN') {
    const unknownIds = latestValidGrade.items.filter((i) => i.verdict === 'UNKNOWN').map((i) => i.reqId);
    const notFulfilledIds = latestValidGrade.items.filter((i) => i.verdict === 'NOT_FULFILLED').map((i) => i.reqId);
    return {
      active: true,
      passed: false,
      code: 'grade_needs_human',
      reason:
        `⛔ Hermes «Инспектор» (grade_needs_human): грейдер не смог верифицировать пункты [${unknownIds.join(', ')}]` +
        (notFulfilledIds.length > 0 ? ` (также NOT_FULFILLED: [${notFulfilledIds.join(', ')}])` : '') +
        `. Вызовите ask_question и предложите пользователю: [Дать улику / уточнить], [Переделать проблемный пункт] или [Принять риск как есть].\n` +
        `[EN: Hermes Inspector (grade_needs_human): grader marked [${unknownIds.join(', ')}] as UNKNOWN. Invoke ask_question: provide evidence, rework item, or accept risk as is.]`
    };
  }

  // Handle REWORK -> up to 3 cycles, then mandatory user window
  if (latestValidGrade && latestValidGrade.overall === 'REWORK') {
    const failedIds = latestValidGrade.items.filter((i) => i.verdict === 'NOT_FULFILLED').map((i) => i.reqId);
    if (reworkCount >= REWORK_CEILING) {
      if (typeof recordMechanicalLesson === 'function') {
        recordMechanicalLesson({
          activeWorkspaceDir,
          taskHash: taskContext.taskHash,
          rule: 'grade_rework_ceiling',
          reason: `REWORK ceiling (${reworkCount}/${REWORK_CEILING}) reached on [${failedIds.join(', ')}]`,
          count: reworkCount
        });
      }
      return {
        active: true,
        passed: false,
        code: 'grade_rework_ceiling',
        reason:
          `⛔ Hermes «Инспектор» (grade_rework_ceiling): достигнут потолок доработок (${reworkCount}/${REWORK_CEILING}) по пунктам [${failedIds.join(', ')}]. Обязательно вызовите ask_question для пользователя: [Продолжить доработку], [Принять как есть] или [Остановить задачу].\n` +
          `[EN: Hermes Inspector (grade_rework_ceiling): REWORK ceiling (${reworkCount}/${REWORK_CEILING}) reached on [${failedIds.join(', ')}]. Invoke ask_question: continue rework, accept as is, or stop task.]`
      };
    }
    return {
      active: true,
      passed: false,
      code: 'grade_rework_required',
      reason:
        `⛔ Hermes «Инспектор» (grade_rework_required): грейдер вернул REWORK (цикл ${reworkCount}/${REWORK_CEILING}) по пунктам [${failedIds.join(', ')}]. Исправьте замечания и запросите повторный независимый грейд.\n` +
        `[EN: Hermes Inspector (grade_rework_required): grader returned REWORK (cycle ${reworkCount}/${REWORK_CEILING}) on [${failedIds.join(', ')}]. Fix issues and re-run independent grader.]`
    };
  }

  // Handle specific rejection of an invalid/forged/conflicted grader delivery
  if (latestRejection) {
    if (typeof recordMechanicalLesson === 'function') {
      recordMechanicalLesson({
        activeWorkspaceDir,
        taskHash: taskContext.taskHash,
        rule: latestRejection.code,
        reason: latestRejection.detail
      });
    }
    return {
      active: true,
      passed: false,
      code: latestRejection.code,
      reason:
        `⛔ Hermes «Инспектор» (${latestRejection.code}): доставка грейдера отклонена (${latestRejection.detail}). Вызовите независимого read-only специалиста вне совета и воркеров.\n` +
        `[EN: Hermes Inspector (${latestRejection.code}): grader delivery rejected (${latestRejection.detail}). Invoke an independent read-only specialist outside council roster and write workers.]`
    };
  }

  // No grader delivery yet for this confirmed-plan task
  return {
    active: true,
    passed: false,
    code: 'grade_missing',
    reason:
      `⛔ Hermes «Инспектор» (grade_missing): для задачи с подтверждённым планом отсутствует подлинный вердикт независимого грейдера (PASS) по .hermes/rubric.json. Вызовите read-only специалиста вне совета и воркеров с путями к .hermes/rubric.json, артефактам и git diff (см. skills/hermes/references/independent-grading-protocol.md).\n` +
      `[EN: Hermes Inspector (grade_missing): confirmed-plan task requires authentic independent grader PASS against .hermes/rubric.json (see skills/hermes/references/independent-grading-protocol.md).]`
  };
}
