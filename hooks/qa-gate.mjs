import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  collectToolCalls,
  detectHermesInSteps,
  isHermesTrigger,
  isRealUserStep,
  parseJsonl,
  readTranscriptSlices
} from './hermes-trigger.mjs';
import { evaluateRules } from './rule-engine.mjs';
import { resolveWorkspaceDir } from './workspace.mjs';
import { validateSchema } from '../skills/compliance-policy-as-code/scripts/contract-validator.mjs';
import { computeWorkingTreeDiffHash, resolveBaseRef, getHermesConfig } from './qa-runner.mjs';
import {
  computeRecommendedSpecialists,
  CorruptArtifactError,
  DOMAIN_ROUTING_RULES,
  FORBIDDEN_SKIP_RECOMMENDED_RE,
  isXrayWindowAskArgs,
  RECOMMENDED_BADGE_RE,
  resolveTaskContext,
  SKIP_OPTION_RE,
  UI_SOURCE_FILE_RE
} from './consent-validator.mjs';
import { recordMechanicalLesson } from './lessons-ledger.mjs';
import { bindSubagentsFromSteps, splitSystemDeliveries } from './subagent-binding.mjs';
import { evaluateGradeGate } from './grade-gate.mjs';
import { computeCanonicalPlanHash } from './plan-gate.mjs';
import { readXrayConfig } from './xray-ledger.mjs';
import { runXrayScan } from '../scripts/xray-scan.mjs';

const hookStartMs = Date.now();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const MAX_RETURNS = 2;
const MAX_TAIL_BYTES = 8 * 1024 * 1024;
const HEAD_SCAN_BYTES = 64 * 1024;

const ABNORMAL_REASONS = new Set([
  'error',
  'max_steps_exceeded',
  'max_invocations',
  'max_forced_invocations',
  'max_token_budget_exceeded',
  'canceled',
  'cancelled',
  'user_canceled',
  'user_cancelled',
  'terminal_custom_hook'
]);

const WRITE_TOOL_NAMES = new Set([
  'write_file',
  'write_to_file',
  'edit_file',
  'replace_file_content',
  'multi_replace_file_content'
]);

const SOURCE_CODE_EXT_RE = /\.(cs|ts|tsx|js|jsx|mjs|cjs|py|go|java|rs|cpp|c|h|hpp|vb|xaml|razor|vue|svelte|css|scss|sass|less|html|htm)$/i;
const META_PATH_RE = /(?:^|[\\/])\.hermes[\\/]/i;

// REQ-1 & FIX-A: DOMAIN_ROUTING_RULES and computeRecommendedSpecialists are imported from consent-validator.mjs (single source of truth).

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

let isHermesSession = false;
let activeWorkspaceDir = process.cwd();

function logGateDecision({ decision, reason, missing, bindingConfidence, source, checks } = {}) {
  if (!isHermesSession) return;
  try {
    const hermesDir = path.join(activeWorkspaceDir, '.hermes');
    if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
    const logFile = path.join(hermesDir, 'gate-log.jsonl');
    try {
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > 512 * 1024) {
          const rotFile = path.join(hermesDir, 'gate-log.1.jsonl');
          try { if (fs.existsSync(rotFile)) fs.unlinkSync(rotFile); } catch {}
          fs.renameSync(logFile, rotFile);
        }
      }
    } catch {}
    const record = {
      timestamp: new Date().toISOString(),
      hook: 'qa-gate',
      decision,
      reason: reason || null,
      missing: missing || []
    };
    if (bindingConfidence !== undefined && bindingConfidence !== null) record.bindingConfidence = bindingConfidence;
    if (source !== undefined && source !== null) record.source = source;
    if (checks !== undefined) record.checks = checks;
    fs.appendFileSync(logFile, JSON.stringify(record) + '\n', 'utf-8');
  } catch {
    // Fail-open
  }
}

function allow(meta = {}) {
  logGateDecision({ decision: 'allow', ...meta });
  process.stdout.write(JSON.stringify({ decision: 'allow' }));
}

/**
 * Advisory fail-open X-ray scan on Stop allow path (REQ-6, v4.7.2).
 * NEVER blocks Stop and NEVER alters the `allow` decision.
 * Errors or insufficient timeout headroom are logged honestly as `xray_error` in gate-log.jsonl.
 */
function runAdvisoryXrayFailOpen(taskHash) {
  if (!isHermesSession) return;
  try {
    const cfg = readXrayConfig(activeWorkspaceDir);
    if (cfg.mode === 'off') return;
    if (process.env.HERMES_XRAY_FORCE_ERROR === '1') {
      throw new Error('simulated_xray_scanner_failure');
    }
    const elapsedMs = Date.now() - hookStartMs;
    const residualMs = Math.min(5000, 7500 - elapsedMs);
    if (residualMs < 400) {
      logGateDecision({
        decision: 'warn',
        reason: `xray_error: Stop hook timeout headroom exhausted (${elapsedMs}ms elapsed) — skipped fail-open`,
        source: 'xray:fail_open'
      });
      return;
    }
    runXrayScan(activeWorkspaceDir, {
      timeboxMs: residualMs,
      writeArtifacts: true,
      taskHash: taskHash || 'unknown'
    });
  } catch (err) {
    logGateDecision({
      decision: 'warn',
      reason: `xray_error: ${err?.message || 'scanner failed'} (fail-open advisory)`,
      source: 'xray:fail_open'
    });
  }
}

function blockStop(reason, meta = {}) {
  logGateDecision({ decision: 'continue', reason, ...meta });
  process.stdout.write(JSON.stringify({ decision: 'continue', reason }));
}

function isIgnoredArtifactOrMeta(targetPath, artifactDir) {
  if (META_PATH_RE.test(targetPath)) return true;
  if (artifactDir) {
    const norm = (x) => path.resolve(String(x || '')).replace(/\\/g, '/').toLowerCase();
    const normTarget = norm(targetPath);
    const normArtifact = norm(artifactDir);
    if (normTarget === normArtifact || normTarget.startsWith(normArtifact + '/')) {
      return true;
    }
  }
  return false;
}

function cleanupCounter(counterFile) {
  try {
    if (fs.existsSync(counterFile)) fs.unlinkSync(counterFile);
  } catch {
    // Ignore cleanup errors
  }
}

function getCounterFile(convId, turnMarker) {
  const key = crypto.createHash('sha1').update(`${convId}:${turnMarker}`).digest('hex').slice(0, 16);
  const stateDir = process.env.HERMES_QA_GATE_STATE_DIR || os.tmpdir();
  return path.join(stateDir, `hermes-qa-gate-${key}.json`);
}

function readCounter(counterFile) {
  try {
    if (!fs.existsSync(counterFile)) return 0;
    const data = JSON.parse(fs.readFileSync(counterFile, 'utf-8'));
    return Number.isInteger(data?.count) ? data.count : 0;
  } catch {
    return 0;
  }
}

function writeCounter(counterFile, count) {
  try {
    fs.writeFileSync(counterFile, JSON.stringify({ count }), 'utf-8');
  } catch {
    // Ignore temp write failures (fail-open)
  }
}

function checkUserRemovalConsent(turnSteps = [], postEditAskAnswer = '', parityReport = {}) {
  let askQuestionCalled = false;
  for (const s of turnSteps) {
    for (const tc of collectToolCalls(s)) {
      if (String(tc?.name || '').toLowerCase() === 'ask_question') {
        askQuestionCalled = true;
        break;
      }
    }
    if (askQuestionCalled) break;
  }
  if (!askQuestionCalled) return false;

  const userTexts = [];
  if (postEditAskAnswer) userTexts.push(postEditAskAnswer);
  for (const s of turnSteps) {
    if (isRealUserStep(s) || s?.source === 'USER' || s?.source === 'USER_EXPLICIT') {
      const c = typeof s?.content === 'string' ? s.content : (s?.content?.text || JSON.stringify(s?.content || ''));
      userTexts.push(c);
    }
  }
  const combined = userTexts.join('\n');
  const REMOVAL_CONSENT_RE = /(?:удалить|удали|да|согласен|подтверждаю|remove|delete|yes|approved|approve|confirm|dropped|drop)(?![а-яёa-z0-9_-])/i;
  const REMOVAL_REJECTION_RE = /(?:не\s+(?:удаляй|надо|удалять)|оставь|сохрани|keep|don'?t\s+remove|no(?![а-яёa-z0-9_-]))/i;

  if (REMOVAL_REJECTION_RE.test(combined) && !REMOVAL_CONSENT_RE.test(combined)) {
    return false;
  }
  return REMOVAL_CONSENT_RE.test(combined);
}

const raw = readStdin().trim();
if (!raw) {
  allow();
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  allow();
  process.exit(0);
}

activeWorkspaceDir = resolveWorkspaceDir(payload, process.cwd());

if (payload?.fullyIdle === false) {
  allow();
  process.exit(0);
}

const termReason = String(payload?.terminationReason || '').trim().toLowerCase();
if (termReason && ABNORMAL_REASONS.has(termReason)) {
  allow();
  process.exit(0);
}

const transcriptPath = payload?.transcriptPath;
if (!transcriptPath || !fs.existsSync(transcriptPath)) {
  allow();
  process.exit(0);
}

let headText = '';
let tailText = '';
try {
  ({ headText, tailText } = readTranscriptSlices(transcriptPath, {
    maxTailBytes: MAX_TAIL_BYTES,
    headScanBytes: HEAD_SCAN_BYTES
  }));
} catch {
  allow();
  process.exit(0);
}

const steps = parseJsonl(tailText);
if (steps.length === 0) {
  allow();
  process.exit(0);
}

let hermesActive =
  isHermesTrigger(payload?.lastUserInput) ||
  (headText ? detectHermesInSteps(parseJsonl(headText)) : false);
let lastUserIdx = -1;

const askQuestionToolCallIds = new Set();
for (let i = 0; i < steps.length; i++) {
  for (const tc of collectToolCalls(steps[i])) {
    if (String(tc?.name || '').toLowerCase() === 'ask_question') {
      const id = String(tc?.id || tc?.tool_call_id || tc?.call_id || '');
      if (id) askQuestionToolCallIds.add(id);
    }
  }
}

for (let i = 0; i < steps.length; i++) {
  const s = steps[i];
  if (isRealUserStep(s)) {
    const stepTcId = String(s?.tool_call_id || s?.toolCallId || s?.call_id || '');
    const text = typeof s?.content === 'string' ? s.content : (s?.content?.text || '');
    const isBoundAskAnswer = Boolean(stepTcId && askQuestionToolCallIds.has(stepTcId));
    const prevWasAsk = i > 0 && collectToolCalls(steps[i - 1]).some((tc) => String(tc?.name || '').toLowerCase() === 'ask_question');
    const isAskResponseInSameTurn = (isBoundAskAnswer || prevWasAsk) && !isHermesTrigger(text);
    if (!isAskResponseInSameTurn) {
      lastUserIdx = i;
    }
  }
}
if (!hermesActive && detectHermesInSteps(steps)) {
  hermesActive = true;
}

isHermesSession = hermesActive;

if (!hermesActive) {
  allow();
  process.exit(0);
}

const artifactDir = String(payload?.artifactDirectoryPath || '');
const taskContext = resolveTaskContext({ combinedSteps: steps, payload });
const qaTaskHash = taskContext.taskHash;
const turnSteps = steps.slice(lastUserIdx >= 0 ? lastUserIdx + 1 : 0);
const editedSourceFiles = new Set();
const editedNonMetaFiles = new Set();
const editedUiFiles = new Set();
const touchedSnapshots = [];
let hasQaPass = false;
let viktorTranscriptQaPass = false;
let lastViktorQaStepIdx = -1;
let hasUxPass = false;
let hasCompliancePass = false;
let hasSecurityPass = false;
let lastWriteIdx = -1;
let lastNonMetaWriteIdx = -1;
let postEditAskIdx = -1;
let postEditAskAnswer = '';
let postEditAskToolCallId = '';

const hermesConfig = getHermesConfig(activeWorkspaceDir);
const qaVerdictMode = hermesConfig.qaVerdictMode;

// REQ-5 (TASK-005, v4.7.1): Unified tool_call_id-first L2 subagent binding (exact / fifo / uncertain)
const binding = bindSubagentsFromSteps(steps, { startIdx: 0, lastUserIdx });
const invokedSpecialists = new Set(binding.invokedSpecialistsInTurn);
const viktorSubagentUuids = binding.getTrustedUuidsForAgent('viktor');
const stanislavSubagentUuids = binding.getTrustedUuidsForAgent('stanislav');
const kritikSubagentUuids = binding.getTrustedUuidsForAgent('kritik');
const l2UncertainRejections = [];
const observedL2Confidences = [];

const REQUEST_OR_WAITING_RE = /(?:ожида[юем]|жд[уём]|требуется|получит[ье]|перед|после|ready\s+for|waiting\s+for|need)\s+[^\n]{0,40}\[(?:QA|UX|COMPLIANCE)\s+PASS\]/gi;
const viktorDeliveryTexts = [];

for (let stepIdx = 0; stepIdx < turnSteps.length; stepIdx++) {
  const s = turnSteps[stepIdx];
  // Only accept verdicts from real incoming subagent deliveries (per-sender sliced), never MODEL prose/thinking or Stop-hook self-reminders
  if (s?.source === 'SYSTEM' || s?.type === 'SYSTEM_MESSAGE') {
    const deliveries = splitSystemDeliveries(s);
    for (const { senderUuid, text: sysText } of deliveries) {
      const isStopReminder = /Stop hook blocked termination:|Hermes Gate \(попытка/i.test(sysText);
      if (isStopReminder) continue;

      if (senderUuid && binding.uncertainUuids.has(senderUuid)) {
        const uAgent = binding.uuidToAgent.get(senderUuid) || 'auditor';
        if (uAgent === 'viktor' || uAgent === 'kritik' || uAgent === 'stanislav') {
          l2UncertainRejections.push(`${uAgent} (${senderUuid})`);
          logGateDecision({
            decision: 'continue',
            reason: `l2_binding_uncertain: ${uAgent} delivery (${senderUuid}) rejected because multiple unbound invoke_subagent calls occurred in one step without tool_call_id. Re-invoke ${uAgent} as a single invoke_subagent call.`,
            bindingConfidence: 'uncertain',
            source: 'l2_binding:uncertain'
          });
          continue;
        }
      }

      const isViktorSender = Boolean(senderUuid && viktorSubagentUuids.has(senderUuid));
      const isStanislavSender = Boolean(senderUuid && stanislavSubagentUuids.has(senderUuid));
      const isKritikSender = Boolean(senderUuid && kritikSubagentUuids.has(senderUuid));

      if (isViktorSender) {
        const conf = binding.uuidBindingConfidence.get(senderUuid) || 'fifo';
        observedL2Confidences.push({ agent: 'viktor', confidence: conf });
        viktorDeliveryTexts.push(sysText);
        const strippedSysText = sysText.replace(REQUEST_OR_WAITING_RE, '');
        if (/\[QA REJECT(?::[^\]]*)?\]/.test(sysText)) {
          recordMechanicalLesson({ activeWorkspaceDir, taskHash: qaTaskHash, rule: 'qa_reject', reason: sysText.slice(0, 200) });
        }
        if (/\[SECURITY REJECT(?::[^\]]*)?\]/.test(sysText)) {
          recordMechanicalLesson({ activeWorkspaceDir, taskHash: qaTaskHash, rule: 'security_reject', reason: sysText.slice(0, 200) });
        }
        if (/\[QA PASS\]/.test(strippedSysText) && !/\[QA REJECT(?::[^\]]*)?\]/.test(sysText)) {
          viktorTranscriptQaPass = true;
          lastViktorQaStepIdx = stepIdx;
          if (qaVerdictMode === 'legacy') {
            console.warn('[QA GATE DEPRECATION WARNING] qaVerdictMode is "legacy": accepting [QA PASS] token from transcript alone without mechanical artifact. Migrate to "artifact" mode.');
            hasQaPass = true;
          }
        }
        if (/\[SECURITY PASS\]/.test(strippedSysText) && !/\[SECURITY REJECT(?::[^\]]*)?\]/.test(sysText)) {
          hasSecurityPass = true;
        }
      }

      if (isStanislavSender) {
        const conf = binding.uuidBindingConfidence.get(senderUuid) || 'fifo';
        observedL2Confidences.push({ agent: 'stanislav', confidence: conf });
        const strippedSysText = sysText.replace(REQUEST_OR_WAITING_RE, '');
        if (/\[COMPLIANCE PASS\]/.test(strippedSysText) && !/\[RULE VIOLATION/.test(sysText)) {
          hasCompliancePass = true;
        }
      }

      if (isKritikSender) {
        const conf = binding.uuidBindingConfidence.get(senderUuid) || 'fifo';
        observedL2Confidences.push({ agent: 'kritik', confidence: conf });
        const strippedSysText = sysText.replace(REQUEST_OR_WAITING_RE, '');
        if (/\[UX PASS\]/.test(strippedSysText) && !/\[UX REJECT\]/.test(sysText)) {
          hasUxPass = true;
        }
      }
    }
  }

  // Only accept user choice from real user input, bound system tool outputs, or authentic harness execution outputs
  // with mandatory status: 'DONE' and tool_call_id binding to ask_question (strictly rejecting Lead model prose, forged banners, and sourceless steps)
  if (postEditAskIdx >= 0 && stepIdx > postEditAskIdx) {
    const isDirectNext = stepIdx === postEditAskIdx + 1;
    const sContent = String(s?.content || '');
    const stepType = String(s?.type || '').toUpperCase();
    const isGenericOrTool = stepType === 'GENERIC' || stepType === 'TOOL_OUTPUT' || stepType === 'TOOL_RESULT';

    // 1. Explicit user input
    const isUserSource = s?.source === 'USER_EXPLICIT' || s?.source === 'USER';

    // 2. Harness metadata: status === 'DONE' and tool_call_id matching ask_question
    const stepToolCallId = String(s?.tool_call_id || s?.toolCallId || s?.call_id || '');
    const hasStatusDone = String(s?.status || '').toUpperCase() === 'DONE';
    const hasHarnessBanner = /(?:Created|Completed)\s+At:\s*\d{4}-\d{2}-\d{2}/i.test(sContent);

    // Explicit binding to ask_question call ID (when platform provides tool_call_id)
    const isBoundByToolId = Boolean(
      postEditAskToolCallId &&
      stepToolCallId &&
      stepToolCallId === postEditAskToolCallId
    );

    // 3. System tool output explicitly bound to ask_question (strictly requires tool_call_id match)
    const isSystemToolOutput =
      (s?.source === 'SYSTEM' || s?.source === 'SYSTEM_SDK') &&
      isBoundByToolId &&
      isGenericOrTool &&
      !s?.sender &&
      !/<SYSTEM_MESSAGE/i.test(sContent);

    // 4. Authentic harness execution output:
    // When postEditAskToolCallId is present: strictly requires isBoundByToolId
    // When postEditAskToolCallId is empty (unbound platform): strictly requires isDirectNext && !stepToolCallId
    const isBoundOrUnboundDirectNext = postEditAskToolCallId
      ? isBoundByToolId
      : (isDirectNext && !stepToolCallId);

    const isAuthenticHarnessOutput =
      isDirectNext &&
      isGenericOrTool &&
      hasStatusDone &&
      isBoundOrUnboundDirectNext &&
      hasHarnessBanner;

    if (isUserSource || isSystemToolOutput || isAuthenticHarnessOutput) {
      postEditAskAnswer += '\n' + sContent;
    }
  }

  for (const tc of collectToolCalls(s)) {
    const name = String(tc?.name || '').toLowerCase();
    const args = tc?.args || {};
    if (name === 'ask_question' && lastWriteIdx >= 0 && !isXrayWindowAskArgs(JSON.stringify(args))) {
      postEditAskIdx = stepIdx;
      postEditAskAnswer = '';
      postEditAskToolCallId = String(tc?.id || tc?.tool_call_id || tc?.call_id || '');
    }
    if (WRITE_TOOL_NAMES.has(name)) {
      const targetPath = String(args.Path || args.TargetFile || args.AbsolutePath || args.path || '');
      if (targetPath && !isIgnoredArtifactOrMeta(targetPath, artifactDir)) {
        editedNonMetaFiles.add(path.normalize(targetPath));
        lastNonMetaWriteIdx = stepIdx;
      }
      if (SOURCE_CODE_EXT_RE.test(targetPath) && !isIgnoredArtifactOrMeta(targetPath, artifactDir)) {
        const normPath = path.normalize(targetPath);
        editedSourceFiles.add(normPath);
        const snippet = String(args.Content || args.Replacement || args.CodeContent || '');
        let diskContent = '';
        try {
          if (fs.existsSync(normPath)) {
            diskContent = fs.readFileSync(normPath, 'utf-8');
          }
        } catch {}
        touchedSnapshots.push(`${targetPath}\n${snippet}\n${diskContent}`);
        if (UI_SOURCE_FILE_RE.test(targetPath)) {
          editedUiFiles.add(normPath);
        }
        lastWriteIdx = stepIdx;
        postEditAskIdx = -1;
        postEditAskAnswer = '';
        // A new source edit invalidates earlier QA/UX/Compliance approvals in the same turn
        hasQaPass = false;
        hasUxPass = false;
        hasCompliancePass = false;
        hasSecurityPass = false;
      }
    }
  }
}

const convId = String(payload?.conversationId || transcriptPath);
const turnMarker = steps[lastUserIdx]?.step_index ?? lastUserIdx;
const counterFile = getCounterFile(convId, turnMarker);

const primaryL2BindingConfidence =
  observedL2Confidences.find((c) => c.confidence === 'exact')?.confidence ||
  observedL2Confidences.find((c) => c.confidence === 'fifo')?.confidence ||
  (l2UncertainRejections.length > 0 ? 'uncertain' : null);

function runGradeGateFailClosed() {
  try {
    return evaluateGradeGate({
      activeWorkspaceDir,
      taskContext,
      turnSteps,
      allSteps: steps,
      lastAnyWriteIdx: Math.max(lastWriteIdx, lastNonMetaWriteIdx),
      convId,
      binding,
      computeCanonicalPlanHash,
      logGateDecision,
      recordMechanicalLesson
    });
  } catch (err) {
    if (err instanceof CorruptArtifactError) {
      blockStop(
        `⛔ Hermes «Инспектор» (corrupt_protected_artifact): защищённый артефакт ${err.artifactName} повреждён (${err.detail}). Завершение заблокировано в режиме fail-closed.\n[EN: Hermes Inspector (corrupt_protected_artifact): protected artifact ${err.artifactName} is corrupted (${err.detail}). Stop blocked fail-closed.]`,
        { missing: [err.artifactName], source: 'fail_closed:corrupt_artifact' }
      );
      process.exit(0);
    }
    throw err;
  }
}

if (editedSourceFiles.size === 0) {
  if (editedNonMetaFiles.size > 0) {
    const nonCodeGrade = runGradeGateFailClosed();
    if (nonCodeGrade.active && !nonCodeGrade.passed) {
      blockStop(nonCodeGrade.reason, { missing: [nonCodeGrade.code || 'grade_missing'] });
      process.exit(0);
    }
  }
  allow({ bindingConfidence: primaryL2BindingConfidence });
  process.exit(0);
}

const gradeEval = runGradeGateFailClosed();

const lastUserContent = lastUserIdx >= 0
  ? (typeof steps[lastUserIdx]?.content === 'string' ? steps[lastUserIdx].content : (steps[lastUserIdx]?.content?.text || ''))
  : '';

// REQ-2: Rewrite Parity Gate (Sergey)
const REWRITE_TRIGGER_RE = /(?:перепиши|переписат[ье]|rewrite|recreate|заново|с\s+нуля)/i;
let isCompleteFileReplacement = false;
for (const s of turnSteps) {
  for (const tc of collectToolCalls(s)) {
    const name = String(tc?.name || '').toLowerCase();
    const args = tc?.args || {};
    if (WRITE_TOOL_NAMES.has(name)) {
      const targetPath = String(args.Path || args.TargetFile || args.AbsolutePath || args.path || '');
      if (SOURCE_CODE_EXT_RE.test(targetPath) && !isIgnoredArtifactOrMeta(targetPath, artifactDir)) {
        if (args.Overwrite === true || args.overwrite === true) {
          isCompleteFileReplacement = true;
        }
      }
    }
  }
}

const isRewriteTask =
  REWRITE_TRIGGER_RE.test(payload?.lastUserInput || '') ||
  REWRITE_TRIGGER_RE.test(lastUserContent) ||
  isCompleteFileReplacement;

if (isRewriteTask) {
  const hermesDir = path.join(activeWorkspaceDir, '.hermes');
  const parityReportPath = path.join(hermesDir, 'parity-report.json');

  if (!fs.existsSync(parityReportPath)) {
    blockStop(
      `Hermes Gate [QA REJECT: Rewrite Parity]: Задача по переписыванию компонента требует Feature Inventory и отчёта .hermes/parity-report.json с silentlyLost === 0. См. skills/hermes/references/rewrite-parity-protocol.md.\n[EN: Hermes Gate [QA REJECT: Rewrite Parity]: Component rewrite detected. Feature Inventory and .hermes/parity-report.json with silentlyLost === 0 are required. See skills/hermes/references/rewrite-parity-protocol.md.]`,
      { missing: ['parity-report.json'] }
    );
    process.exit(0);
  }

  let parityReport;
  try {
    parityReport = JSON.parse(fs.readFileSync(parityReportPath, 'utf-8'));
  } catch (err) {
    blockStop(
      `Hermes Gate [QA REJECT: Rewrite Parity]: Некорректный JSON в .hermes/parity-report.json: ${err.message}`,
      { missing: ['valid parity-report.json'] }
    );
    process.exit(0);
  }

  const silentlyLost = Number(parityReport?.silentlyLost ?? 0);
  if (silentlyLost > 0) {
    recordMechanicalLesson({ activeWorkspaceDir, taskHash: qaTaskHash, rule: 'rewrite_parity_reject', reason: `silentlyLost=${silentlyLost}` });
    blockStop(
      `Hermes Gate [QA REJECT: Rewrite Parity]: Обнаружена молчаливая потеря функциональности (${silentlyLost} функций в silentlyLost > 0). Восстановите функции или согласуйте удаление с пользователем через ask_question.\n[EN: Hermes Gate [QA REJECT: Rewrite Parity]: Silent feature loss detected (${silentlyLost} features in silentlyLost > 0). Restore features or obtain explicit user removal approval via ask_question.]`,
      { missing: ['zero silentlyLost'] }
    );
    process.exit(0);
  }

  const approvedRemoved = Number(parityReport?.approvedRemoved ?? 0);
  if (approvedRemoved > 0) {
    const hasRemovalConsent = checkUserRemovalConsent(turnSteps, postEditAskAnswer, parityReport);
    if (!hasRemovalConsent) {
      blockStop(
        `Hermes Gate [QA REJECT: Rewrite Parity]: В отчёте заявлено ${approvedRemoved} удалённых функций (approvedRemoved > 0), но отсутствует явное согласие пользователя через инструмент ask_question.\n[EN: Hermes Gate [QA REJECT: Rewrite Parity]: ${approvedRemoved} removed features declared in approvedRemoved, but explicit user confirmation via ask_question is missing.]`,
        { missing: ['user removal consent via ask_question'] }
      );
      process.exit(0);
    }
  }
}

// Token economy skip requires explicit option selection or positive intent anchored to option/line start.
// Casual words like "нет", "не нужно", "достаточно", "no" or negations like "don't skip", "нельзя пропустить",
// "не оставляй без проверки", "без проверки не оставляй" MUST NOT bypass verification.
const NEGATION_SKIP_RE = /(?:(?:не|нельзя|никогда|don'?t|do\s+not|never)(?![\wА-Яа-яЁё])[^\r\n]{0,35}(?:skip|без\s+проверки|пропустит[ье]|пропускай|пропуск))|(?:(?:skip|без\s+проверки|пропустит[ье]|пропускай|пропуск)(?![\wА-Яа-яЁё])[^\r\n]{0,35}(?:не|нельзя|никогда|don'?t|do\s+not|never)(?![\wА-Яа-яЁё]))/i;
const POSITIVE_SKIP_RE = /(?:^|\n)\s*(?:[A-Za-z]?\d+[:.)]\s*|option\s+\d+[:.]\s*|[-*]\s*)?(?:\(recommended\)\s*)?(?:завершить\s+без\s+проверки|без\s+проверки|skip\b|пропустить\s+проверк[уае]?)/i;

const hasNegationOfSkip = NEGATION_SKIP_RE.test(postEditAskAnswer);
const hasPositiveSkip = POSITIVE_SKIP_RE.test(postEditAskAnswer);

// FIX-B: Check if the skip was nudged via a forbidden (Recommended) badge when source files were modified
let isForbiddenRecommendedSkip = false;
if (hasPositiveSkip && editedSourceFiles.size > 0 && postEditAskIdx >= 0) {
  const askStep = turnSteps[postEditAskIdx];
  if (askStep) {
    for (const tc of collectToolCalls(askStep)) {
      if (String(tc?.name || '').toLowerCase() === 'ask_question') {
        const qList = tc?.args?.questions;
        if (Array.isArray(qList)) {
          for (const q of qList) {
            if (Array.isArray(q?.options)) {
              for (const opt of q.options) {
                const optStr = String(opt || '');
                if (FORBIDDEN_SKIP_RECOMMENDED_RE.test(optStr) || (SKIP_OPTION_RE.test(optStr) && RECOMMENDED_BADGE_RE.test(optStr))) {
                  isForbiddenRecommendedSkip = true;
                }
              }
            }
          }
        }
      }
    }
  }
}
if (isForbiddenRecommendedSkip) {
  logGateDecision({ decision: 'continue', reason: 'invalid_skip_nudge_with_recommended_tag' });
}

const isEconomySkipRequested = postEditAskIdx > lastWriteIdx && hasPositiveSkip && !hasNegationOfSkip && !isForbiddenRecommendedSkip;

// In economy mode: allow immediately if no UI files were edited or if UX PASS is already granted,
// EXCEPT confirmed-plan tasks with an active Grade Gate (REQ-3: confirmed plan always requires grade PASS or validated user override).
if (isEconomySkipRequested && (editedUiFiles.size === 0 || hasUxPass) && (!gradeEval.active || gradeEval.passed)) {
  cleanupCounter(counterFile);
  runAdvisoryXrayFailOpen(qaTaskHash);
  allow({ bindingConfidence: primaryL2BindingConfidence });
  process.exit(0);
}

const POSITIVE_ONLY_UX_RE = /(?:^|\n)\s*(?:[A-Za-z]?\d+[:.)]\s*|option\s+\d+[:.]\s*|[-*]\s*)?(?:запустить\s+)?(?:только\s+(?:критик|kritik|ux|окн|дизайн)|only\s+ux)/i;
const POSITIVE_ONLY_QA_RE = /(?:^|\n)\s*(?:[A-Za-z]?\d+[:.)]\s*|option\s+\d+[:.]\s*|[-*]\s*)?(?:запустить\s+)?(?:только\s+(?:виктор|viktor|qa)|only\s+qa)/i;

const onlyUxRequested =
  (postEditAskIdx > lastWriteIdx && POSITIVE_ONLY_UX_RE.test(postEditAskAnswer)) ||
  (isEconomySkipRequested && editedUiFiles.size > 0);
const onlyQaRequested =
  !isEconomySkipRequested &&
  postEditAskIdx > lastWriteIdx &&
  POSITIVE_ONLY_QA_RE.test(postEditAskAnswer);

function computeDiffHash(snapshots = []) {
  if (!snapshots || snapshots.length === 0) return 'empty';
  const h = crypto.createHash('sha256');
  for (const s of snapshots) {
    h.update(String(s));
  }
  return h.digest('hex');
}

function logCostMetrics({ convId, turnMarker, editedFilesCount = 0, toolCallsCount = 0, event = 'Stop' } = {}) {
  if (!isHermesSession) return;
  try {
    const hermesDir = path.join(activeWorkspaceDir, '.hermes');
    if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
    const costFile = path.join(hermesDir, 'cost-log.jsonl');
    try {
      if (fs.existsSync(costFile)) {
        const stats = fs.statSync(costFile);
        if (stats.size > 512 * 1024) {
          const rotFile = path.join(hermesDir, 'cost-log.1.jsonl');
          try { if (fs.existsSync(rotFile)) fs.unlinkSync(rotFile); } catch {}
          fs.renameSync(costFile, rotFile);
        }
      }
    } catch {}
    const record = {
      timestamp: new Date().toISOString(),
      conversationId: convId || null,
      turnMarker: turnMarker ?? null,
      event,
      editedFilesCount,
      toolCallsCount
    };
    fs.appendFileSync(costFile, JSON.stringify(record) + '\n', 'utf-8');
  } catch {
    // Fail-open
  }
}

const currentDiffHash = computeDiffHash(touchedSnapshots);

// Mechanical QA Rails Acceptance (REQ-1, REQ-2, REQ-3 / B1)
const qaVerdictFile = path.join(activeWorkspaceDir, '.hermes', 'qa-verdict.json');
if (qaVerdictMode === 'artifact') {
  hasQaPass = false; // Never accept transcript token alone in artifact mode
  if (fs.existsSync(qaVerdictFile)) {
    try {
      const verdictData = JSON.parse(fs.readFileSync(qaVerdictFile, 'utf-8'));

      // 1. Schema check
      let isSchemaValid = true;
      const schemaPaths = [
        path.join(activeWorkspaceDir, 'skills', 'compliance-policy-as-code', 'references', 'schemas', 'qa-verdict.schema.json'),
        path.join(rootDir, 'skills', 'compliance-policy-as-code', 'references', 'schemas', 'qa-verdict.schema.json')
      ];
      for (const sp of schemaPaths) {
        if (fs.existsSync(sp)) {
          try {
            const schema = JSON.parse(fs.readFileSync(sp, 'utf-8'));
            const val = validateSchema(verdictData, schema);
            isSchemaValid = val.valid;
          } catch {
            isSchemaValid = false;
          }
          break;
        }
      }

      // 2. Runner must be 'mechanical' (Zero LLM-prose)
      const isMechanicalRunner = verdictData?.runner === 'mechanical';

      // 3. Status must be PASS
      const isPass = verdictData?.status === 'PASS';

      // 4. Test exit codes: must exist, array of integers, all === 0
      const hasZeroExitCodes = Array.isArray(verdictData?.testExitCodes) &&
        verdictData.testExitCodes.length > 0 &&
        verdictData.testExitCodes.every((c) => Number.isInteger(c) && c === 0);

      // 5. reqLedger must be array and non-empty (REQ-3: zero fabrication)
      const hasReqLedger = Array.isArray(verdictData?.reqLedger) && verdictData.reqLedger.length > 0;
      let hasCompleteTasksCoverage = true;
      const ledgerSet = new Set(verdictData?.reqLedger || []);
      const promptReqs = [...lastUserContent.matchAll(/\b(REQ-\d+)\b/gi)].map((m) => m[1].toUpperCase());
      if (promptReqs.length > 0) {
        hasCompleteTasksCoverage = promptReqs.every((req) => ledgerSet.has(req));
      }

      // 6. diffHash binding (changes-under-review, ADR-0005)
      const workingTreeHash = computeWorkingTreeDiffHash(activeWorkspaceDir);
      const EMPTY_DIFF_HASHES = new Set(['01ba4719c80b6fe9', 'e3b0c44298fc1c14']);
      const hasChangesUnderReview = workingTreeHash !== '0000000000000000' && !EMPTY_DIFF_HASHES.has(workingTreeHash);
      const isDegenerateEmptyVerdict = EMPTY_DIFF_HASHES.has(verdictData?.diffHash) && hasChangesUnderReview;

      const hasDiffHashMatch = Boolean(
        verdictData?.diffHash &&
        !isDegenerateEmptyVerdict &&
        (verdictData.diffHash === currentDiffHash ||
         (workingTreeHash !== '0000000000000000' && verdictData.diffHash === workingTreeHash))
      );

      // 7. Freshness TTL (configurable via hermesConfig.qaVerdictTtlMs, Rule 9 / REQ-6)
      const verdictTtlMs = hermesConfig.qaVerdictTtlMs || 300000;
      const reviewedAtMs = Date.parse(verdictData?.timestamp || verdictData?.reviewedAt || '');
      const isFresh = !isNaN(reviewedAtMs) && Math.abs(Date.now() - reviewedAtMs) <= verdictTtlMs;

      // 8. Transcript proof: Viktor must have been explicitly invoked in this turn
      const hasTranscriptProof = invokedSpecialists.has('viktor');

      // 8b. Transcript QA PASS delivery: Viktor must have delivered QA PASS in incoming message after last edit
      const hasTranscriptQaPass = viktorTranscriptQaPass && (lastWriteIdx === -1 || lastViktorQaStepIdx > lastWriteIdx);

      // 8c. Anti-Show Protection: Viktor's delivery text must include the diffHash (REQ-4)
      const hasViktorDeliveryWithHash = viktorDeliveryTexts.some(
        (txt) =>
          (verdictData?.diffHash && txt.includes(verdictData.diffHash)) ||
          (workingTreeHash !== '0000000000000000' && txt.includes(workingTreeHash)) ||
          (currentDiffHash !== 'empty' && txt.includes(currentDiffHash))
      );

      // 9. Viktor UUID binding (REQ-4: strictly mandatory, must match active subagent UUID)
      const hasValidViktorUuid = Boolean(
        verdictData?.viktorUuid &&
        viktorSubagentUuids.has(String(verdictData.viktorUuid).toLowerCase())
      );

      // 9b. Dynamic ackToken binding (REQ-4: static default 'viktor-qa-pass' rejected)
      const hasAckToken = Boolean(
        verdictData?.ackToken &&
        typeof verdictData.ackToken === 'string' &&
        verdictData.ackToken !== 'viktor-qa-pass' &&
        verdictData.ackToken.trim().length >= 8
      );

      // 9c. conversationId + turnMarker binding (REQ-4: strictly required, mirroring security-verdict)
      const hasConvMatch = Boolean(
        verdictData?.conversationId &&
        String(verdictData.conversationId) === String(convId)
      );
      const hasTurnMatch = Boolean(
        verdictData?.turnMarker !== undefined &&
        String(verdictData.turnMarker) === String(turnMarker)
      );

      // 10. Mutation check (B3, Rule 13, REQ-2, REQ-6)
      let isMutationOk = true;
      let mutationFreshness = true;
      const mutationMode = process.env.HERMES_MUTATION_MODE || hermesConfig.mutationMode || 'advisory';
      if (verdictData?.mutation) {
        const mutTimestampMs = Date.parse(verdictData.mutation.timestamp || '');
        if (!isNaN(mutTimestampMs) && Math.abs(Date.now() - mutTimestampMs) > verdictTtlMs) {
          mutationFreshness = false;
        }
      }
      if (mutationMode === 'strict') {
        const mut = verdictData?.mutation;
        if (!mut || !mutationFreshness) {
          isMutationOk = false;
        } else {
          const mutStatus = mut.status;
          const survived = Number(mut.survived ?? 0);
          const mutantsTotal = Number(mut.mutantsTotal ?? 0);
          if (mutStatus !== 'PASS' || mutantsTotal === 0 || survived > 0 || mut.killRate === null) {
            isMutationOk = false;
          }
        }
      }

      if (
        isSchemaValid &&
        isMechanicalRunner &&
        isPass &&
        hasZeroExitCodes &&
        hasReqLedger &&
        hasCompleteTasksCoverage &&
        hasDiffHashMatch &&
        isFresh &&
        hasTranscriptProof &&
        hasTranscriptQaPass &&
        hasViktorDeliveryWithHash &&
        hasAckToken &&
        hasValidViktorUuid &&
        hasConvMatch &&
        hasTurnMatch &&
        isMutationOk
      ) {
        hasQaPass = true;
      } else {
        const failedChecks = [];
        if (!isSchemaValid) failedChecks.push('schema validation error');
        if (!isMechanicalRunner) failedChecks.push(`runner is '${verdictData?.runner}', expected 'mechanical'`);
        if (!isPass) failedChecks.push(`verdict status is '${verdictData?.status}', expected 'PASS'`);
        if (!hasZeroExitCodes) failedChecks.push(`testExitCodes=[${verdictData?.testExitCodes}], expected all 0`);
        if (!hasReqLedger) failedChecks.push('reqLedger is empty (Lead must bootstrap .hermes/tasks.json or pass --reqLedger=...)');
        if (!hasCompleteTasksCoverage) failedChecks.push('reqLedger does not cover all requirements (REQ-N) from user prompt');
        if (!hasDiffHashMatch) failedChecks.push(`diffHash mismatch (verdict=${verdictData?.diffHash}, current=${currentDiffHash}, working=${workingTreeHash})`);
        if (isDegenerateEmptyVerdict) failedChecks.push(`verdict diffHash is degenerate empty (${verdictData?.diffHash}) while real changes exist under review`);
        if (!isFresh) failedChecks.push(`verdict artifact is stale (older than ${verdictTtlMs}ms TTL)`);
        if (!hasTranscriptProof) failedChecks.push('Viktor was not invoked in this turn');
        if (!hasTranscriptQaPass) failedChecks.push('Viktor delivery message with [QA PASS] after last code write is missing');
        if (!hasViktorDeliveryWithHash) failedChecks.push(`Viktor delivery text does not contain diffHash (${verdictData?.diffHash})`);
        if (!hasAckToken) failedChecks.push('invalid or static ackToken');
        if (!hasValidViktorUuid) failedChecks.push(`viktorUuid '${verdictData?.viktorUuid}' does not match active Viktor subagent UUID in turn`);
        if (!hasConvMatch) failedChecks.push(`conversationId '${verdictData?.conversationId}' does not match session conversationId '${convId}'`);
        if (!hasTurnMatch) failedChecks.push(`turnMarker '${verdictData?.turnMarker}' does not match session turnMarker '${turnMarker}'`);
        if (!isMutationOk) failedChecks.push(mutationFreshness ? 'mutation testing criteria failed' : 'stale mutation report artifact');

        const rejectReason = failedChecks.length > 0
          ? `qa-verdict.json rejected: ${failedChecks.join('; ')}`
          : 'qa-verdict.json rejected: mechanical verification check failed';
        recordMechanicalLesson({ activeWorkspaceDir, taskHash: qaTaskHash, rule: 'qa_reject', reason: rejectReason });
        logGateDecision({
          decision: 'continue',
          reason: rejectReason,
          checks: {
            isSchemaValid,
            isMechanicalRunner,
            isPass,
            hasZeroExitCodes,
            hasReqLedger,
            hasCompleteTasksCoverage,
            hasDiffHashMatch,
            isDegenerateEmptyVerdict,
            isFresh,
            hasTranscriptProof,
            hasTranscriptQaPass,
            hasViktorDeliveryWithHash,
            hasAckToken,
            hasValidViktorUuid,
            hasConvMatch,
            hasTurnMatch,
            isMutationOk
          }
        });
      }
    } catch (err) {
      logGateDecision({ decision: 'continue', reason: `qa-verdict.json parse error: ${err.message}` });
    }
  } else {
    logGateDecision({ decision: 'continue', reason: 'qa-verdict.json missing: mechanical artifact required in artifact mode' });
  }
}
const secVerdictFile = path.join(activeWorkspaceDir, '.hermes', 'security-verdict.json');
if (!hasSecurityPass && fs.existsSync(secVerdictFile)) {
  try {
    const verdictData = JSON.parse(fs.readFileSync(secVerdictFile, 'utf-8'));
    const isPass = verdictData?.status === 'PASS';
    const hasAckToken = Boolean(verdictData?.ackToken || verdictData?.signature);
    // R1: unresolvedHighCritical must be explicitly === 0. Missing or non-zero = reject
    const noUnresolved = verdictData?.unresolvedHighCritical === 0;

    // (a) Transcript evidence: Viktor must have been explicitly invoked in this turn
    const hasTranscriptProof = invokedSpecialists.has('viktor');

    // (a2) R2: Real delivery from Viktor containing diffHash (Anti-Show Protection)
    const hasViktorDeliveryWithHash = viktorDeliveryTexts.some((txt) => txt.includes(currentDiffHash));

    // (b) Binding to current diff hash (whitelisted touched files in turn)
    const hasDiffHashMatch = Boolean(verdictData?.diffHash && verdictData.diffHash === currentDiffHash);

    // (c) conversationId + turnMarker binding
    const hasConvMatch = Boolean(verdictData?.conversationId && String(verdictData.conversationId) === String(convId));
    const hasTurnMatch = verdictData?.turnMarker !== undefined && String(verdictData.turnMarker) === String(turnMarker);

    // (d) Freshness TTL (must be signed within 5 minutes)
    const reviewedAtMs = Date.parse(verdictData?.reviewedAt || '');
    const isFresh = !isNaN(reviewedAtMs) && Math.abs(Date.now() - reviewedAtMs) <= 5 * 60 * 1000;

    if (isPass && hasAckToken && noUnresolved && hasTranscriptProof && hasViktorDeliveryWithHash && hasDiffHashMatch && hasConvMatch && hasTurnMatch && isFresh) {
      hasSecurityPass = true;
    } else {
      recordMechanicalLesson({ activeWorkspaceDir, taskHash: qaTaskHash, rule: 'security_reject', reason: 'security-verdict.json rejected: anti-self-signing check failed' });
      logGateDecision({
        decision: 'continue',
        reason: 'security-verdict.json rejected: anti-self-signing check failed',
        checks: { isPass, hasAckToken, noUnresolved, hasTranscriptProof, hasViktorDeliveryWithHash, hasDiffHashMatch, hasConvMatch, hasTurnMatch, isFresh }
      });
    }
  } catch (err) {
    logGateDecision({ decision: 'continue', reason: `security-verdict.json parse error: ${err.message}` });
  }
}

logCostMetrics({
  convId,
  turnMarker,
  editedFilesCount: editedSourceFiles.size,
  toolCallsCount: touchedSnapshots.length,
  event: 'Stop'
});

// REQ-6: Bounded Convergence Loop (--loop / /hermes fix-warnings --loop / /hermes loop)
const LOOP_COMMAND_RE = /(?:--loop|\/hermes\s+(?:loop|fix-warnings\s+--loop))/i;
const isLoopRequested = LOOP_COMMAND_RE.test(payload?.lastUserInput || '') || LOOP_COMMAND_RE.test(lastUserContent);
const LOOP_CEILING = 25;

const isSecReviewEnabled = process.env.HERMES_SEC_REVIEW !== '0';
const needQa = !onlyUxRequested && !isEconomySkipRequested;
const needUx = (editedUiFiles.size > 0 || onlyUxRequested) && !onlyQaRequested;
const needCompliance = editedSourceFiles.size >= 4 && !onlyUxRequested && !onlyQaRequested && !isEconomySkipRequested;
// L2 Security Diff-Review runs once at the end of the convergence loop after QA pass is achieved
const needSecurity = isSecReviewEnabled && editedSourceFiles.size > 0 && !onlyUxRequested && !isEconomySkipRequested &&
                     (!isLoopRequested || hasQaPass);

const missing = [];
if (needQa && !hasQaPass) missing.push('[QA PASS] (Viktor)');
if (needUx && !hasUxPass) missing.push('[UX PASS] (Kritik — проверка окон/дизайна после доработки)');
if (needCompliance && !hasCompliancePass) missing.push('[COMPLIANCE PASS] (Stanislav)');
if (needSecurity && !hasSecurityPass) missing.push('[SECURITY PASS] (Viktor / AppSec Reviewer — L2 Diff-Review)');

// Declarative Rule Engine on Stop event
try {
  const hermesRulesDir = path.join(activeWorkspaceDir, '.hermes', 'rules');
  const ruleEval = evaluateRules({
    event: 'Stop',
    context: {
      terminationReason: termReason,
      editedFilesCount: editedSourceFiles.size
    },
    rulesDir: hermesRulesDir
  });
  if (ruleEval.blocked) {
    const br = ruleEval.blockingRules[0];
    blockStop(`Hermes Rule Policy (${br.name}): ${br.message || 'Blocked by declarative rule'}`);
    process.exit(0);
  }
} catch {}

// REQ-2 & REQ-3 (v4.7.1): Explicit grader rejections, REWORK/ceiling, NEEDS_HUMAN, or negated override
// ALWAYS block Stop directly outside MAX_RETURNS=2 so they can never be silently bypassed.
if (gradeEval.active && !gradeEval.passed && gradeEval.code && gradeEval.code !== 'grade_missing') {
  blockStop(gradeEval.reason, { missing: [gradeEval.code], bindingConfidence: primaryL2BindingConfidence });
  process.exit(0);
}

if (missing.length === 0) {
  if (gradeEval.active && !gradeEval.passed) {
    blockStop(gradeEval.reason, { missing: [gradeEval.code || 'grade_missing'], bindingConfidence: primaryL2BindingConfidence });
    process.exit(0);
  }
  cleanupCounter(counterFile);
  runAdvisoryXrayFailOpen(qaTaskHash);
  allow({ bindingConfidence: primaryL2BindingConfidence });
  process.exit(0);
}

// REQ-5 (TASK-005): Fail-closed block when L2 auditor delivery was rejected due to uncertain multi-invoke binding
if (l2UncertainRejections.length > 0) {
  blockStop(
    `⛔ Hermes «Инспектор» (l2_binding_uncertain): вердикт L2-аудитора (${l2UncertainRejections.join(', ')}) отклонён (bindingConfidence="uncertain" — несколько invoke_subagent в одном шаге без tool_call_id). Перевызовите аудитора одиночным вызовом invoke_subagent.\n` +
    `[EN: Hermes Inspector (l2_binding_uncertain): L2 auditor delivery (${l2UncertainRejections.join(', ')}) rejected (bindingConfidence="uncertain" — multi-invoke without tool_call_id). Re-invoke auditor as a single invoke_subagent call.]`,
    { missing: ['l2_binding_uncertain', ...missing], bindingConfidence: 'uncertain' }
  );
  process.exit(0);
}

if (isLoopRequested) {
  const safeId = String(convId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const hermesDir = path.join(activeWorkspaceDir, '.hermes');
  if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
  const loopFile = path.join(hermesDir, `loop-state-${safeId}.json`);
  let loopIteration = 0;
  try {
    if (fs.existsSync(loopFile)) {
      loopIteration = JSON.parse(fs.readFileSync(loopFile, 'utf-8')).iteration || 0;
    }
  } catch {}
  loopIteration++;
  try {
    fs.writeFileSync(loopFile, JSON.stringify({ conversationId: convId, iteration: loopIteration, updatedAt: new Date().toISOString() }), 'utf-8');
  } catch {}

  if (loopIteration >= LOOP_CEILING) {
    try {
      const blockersPath = path.join(hermesDir, 'loop-blockers.md');
      const blockerReport = `# 🛑 Hermes Convergence Loop Blockers\n\n- **Conversation ID:** \`${convId}\`\n- **Iterations:** ${loopIteration}/${LOOP_CEILING} (Ceiling Exhausted)\n- **Unresolved Invariants:** ${missing.join(', ')}\n\nLoop exhausted maximum allowed iterations. Manual review required.\n`;
      fs.writeFileSync(blockersPath, blockerReport, 'utf-8');
    } catch {}
    cleanupCounter(counterFile);
    allow();
    process.exit(0);
  }
}

const attempt = readCounter(counterFile);

if (!isLoopRequested && attempt >= MAX_RETURNS) {
  // HIGH-1 (REQ-3): Confirmed-plan Grade Gate MUST NEVER be silently bypassed via MAX_RETURNS = 2
  if (gradeEval.active && !gradeEval.passed) {
    blockStop(gradeEval.reason, {
      missing: [gradeEval.code || 'grade_missing', ...missing],
      bindingConfidence: primaryL2BindingConfidence
    });
    process.exit(0);
  }
  runAdvisoryXrayFailOpen(qaTaskHash);
  allow();
  process.exit(0);
}

writeCounter(counterFile, attempt + 1);

const routing = computeRecommendedSpecialists(touchedSnapshots, {
  invokedSpecialists,
  editedSourceFiles,
  editedUiFiles
});
const recommendedTeam = new Set(routing.recommendedLabels);
if (editedUiFiles.size === 0 && !invokedSpecialists.has('elena') && !invokedSpecialists.has('kritik')) {
  recommendedTeam.add('@elena / @kritik (оцените: не нужно ли после изменений кода переделать окна/дизайн?)');
}
const teamHint = recommendedTeam.size > 0
  ? ` Подключите профильных специалистов по затронутым узлам: ${[...recommendedTeam].join(', ')}.`
  : '';

const blockReason = (isEconomySkipRequested && editedUiFiles.size > 0 && !hasUxPass)
  ? `Hermes Gate (попытка ${attempt + 1}/${MAX_RETURNS}): Режим экономии активирован (QA пропущен), но затронуты UI-файлы (${[...editedUiFiles].join(', ')}). Для исключения дефектов дизайна требуется вердикт [UX PASS] от Kritik.\n[EN: Hermes Gate (attempt ${attempt + 1}/${MAX_RETURNS}): Economy mode active (QA skipped), but UI files modified (${[...editedUiFiles].join(', ')}). [UX PASS] verdict from Kritik is required.]`
  : `Hermes Gate (попытка ${attempt + 1}/${MAX_RETURNS}): изменено исходников: ${editedSourceFiles.size}. Чтобы не тратить токены на мелких правках, вызовите ask_question и спросите пользователя: «Я закончил доработку. Запустить сотрудников на проверку (${missing.join(', ')}) или завершить без проверки (экономия токенов)?» (Либо если пользователь уже подтвердил проверку — дождитесь ${missing.join(' и ')}).${teamHint}\n[EN: Hermes Gate (attempt ${attempt + 1}/${MAX_RETURNS}): ${editedSourceFiles.size} source files modified. To save tokens on small edits, invoke ask_question to ask user: "Finished modifications. Run verification (${missing.join(', ')}) or finish without verification (token economy)?" (Or if user already approved verification — await ${missing.join(' and ')}).]`;

blockStop(blockReason);
