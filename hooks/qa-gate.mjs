import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
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
const UI_SOURCE_FILE_RE = /\.(?:tsx|jsx|xaml|razor|vue|svelte|css|scss|sass|less|html|htm)$|(?:^|[\\/])[^\\/]*(?:Form|Window|Dialog|Control|View|Panel|Modal|Popup|Flyout|Theme|Style|Widget|Screen|Page|Layout|ScrollBar|Menu|Toolbar)[^\\/]*\.(?:cs|ts|js|py|cpp|vb)$|\.Designer\.(?:cs|vb)$/i;
const META_PATH_RE = /(?:^|[\\/])\.hermes[\\/]/i;

const DOMAIN_ROUTING_RULES = [
  {
    agents: ['@elena (дизайн/окна)', '@kritik (пост-проверка UX)'],
    keys: ['elena', 'kritik'],
    re: /\.(?:tsx|jsx|xaml|razor|vue|svelte|css|scss|sass|less|html|htm)$|(?:Form|Window|Dialog|Control|View|Panel|Modal|Popup|Flyout|Theme|Style|ScrollBar|DataGridView|DoubleBuffered|MouseLeave|Deactivate)/i
  },
  {
    agents: ['@denis (БД/индексы/WAL)'],
    keys: ['denis'],
    re: /(?:Database|DbContext|Repository|Migration|Sqlite|Postgres|Mssql|SqlConnection|SqliteConnection|PRAGMA\s+journal_mode|BEGIN\s+IMMEDIATE|SELECT\s+.+\s+FROM)/i
  },
  {
    agents: ['@alexey (протоколы/сокеты)', '@igor (эмуляция/стресс-тест)'],
    keys: ['alexey', 'igor'],
    re: /(?:Socket|TcpClient|UdpClient|NetworkStream|ReadExactly|Modbus|OpcUa|Profinet|SerialPort|Plc)/i
  },
  {
    agents: ['@ruslan (SAP/BAPI/COM)'],
    keys: ['ruslan'],
    re: /(?:RfcDestination|IRfcFunction|BAPI_|IDoc|FinalReleaseComObject|SapGui)/i
  },
  {
    agents: ['@mikhail (AI/RAG/LLM)'],
    keys: ['mikhail'],
    re: /(?:Embedding|Qdrant|PgVector|CrossEncoder|Langfuse|vLLM|Whisper|Docling|Promptfoo)/i
  },
  {
    agents: ['@artem (реверс/бинарные фреймы)'],
    keys: ['artem'],
    re: /(?:BinaryPrimitives|Crc16|Crc32|Endian|Disasm|EvidenceLedger)/i
  },
  {
    agents: ['@gleb (3D/Digital Twin/WebGL)'],
    keys: ['gleb'],
    re: /(?:\bThree(?:\.js)?\b|WebGL|DigitalTwin|WebView2|InstancedMesh|OrbitControls)/i
  },
  {
    agents: ['@dmitry (Backend/API/Конфиг)', '@elena (проверить, нужно ли вывести новые настройки/статусы в окно)'],
    keys: ['dmitry', 'elena'],
    re: /(?:Controller|Endpoint|Outbox|Idempotency|ProblemDetails|appsettings|IOptions|Channel<)/i
  }
];

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

let isHermesSession = false;
let activeWorkspaceDir = process.cwd();

function logGateDecision({ decision, reason, missing } = {}) {
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
    fs.appendFileSync(logFile, JSON.stringify(record) + '\n', 'utf-8');
  } catch {
    // Fail-open
  }
}

function allow(meta = {}) {
  logGateDecision({ decision: 'allow', ...meta });
  process.stdout.write(JSON.stringify({ decision: 'allow' }));
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

for (let i = 0; i < steps.length; i++) {
  const s = steps[i];
  if (isRealUserStep(s)) {
    lastUserIdx = i;
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
const turnSteps = steps.slice(lastUserIdx >= 0 ? lastUserIdx + 1 : 0);
const editedSourceFiles = new Set();
const editedUiFiles = new Set();
const invokedSpecialists = new Set();
const touchedSnapshots = [];
let hasQaPass = false;
let hasUxPass = false;
let hasCompliancePass = false;
let hasSecurityPass = false;
let lastWriteIdx = -1;
let postEditAskIdx = -1;
let postEditAskAnswer = '';
let postEditAskToolCallId = '';

const nonAuditorSubagentIds = new Set();
const viktorSubagentUuids = new Set();
let pendingNonAuditorCount = 0;
let pendingViktorCount = 0;

for (const s of turnSteps) {
  for (const tc of collectToolCalls(s)) {
    const name = String(tc?.name || '').toLowerCase();
    const args = tc?.args || {};
    if (name === 'invoke_subagent') {
      const typeName = String(args.TypeName || args.typeName || '').toLowerCase();
      if (typeName) invokedSpecialists.add(typeName);
      if (typeName === 'viktor') {
        pendingViktorCount++;
      } else if (typeName !== 'stanislav' && typeName !== 'kritik') {
        pendingNonAuditorCount++;
      }
    }
  }

  const stepType = String(s?.type || '').toUpperCase();
  const textToScan = typeof s?.content === 'string' ? s.content : JSON.stringify(s);
  if (pendingViktorCount > 0 && (stepType === 'GENERIC' || s?.source === 'SYSTEM')) {
    const m = textToScan.match(/"conversationId"\s*:\s*"([0-9a-f-]{36})"/i);
    if (m) {
      viktorSubagentUuids.add(m[1].toLowerCase());
      pendingViktorCount--;
    }
  }
  if (pendingNonAuditorCount > 0 && (stepType === 'GENERIC' || s?.source === 'SYSTEM')) {
    const m = textToScan.match(/"conversationId"\s*:\s*"([0-9a-f-]{36})"/i);
    if (m) {
      nonAuditorSubagentIds.add(m[1].toLowerCase());
      pendingNonAuditorCount--;
    }
  }
}

const REQUEST_OR_WAITING_RE = /(?:ожида[юем]|жд[уём]|требуется|получит[ье]|перед|после|ready\s+for|waiting\s+for|need)\s+[^\n]{0,40}\[(?:QA|UX|COMPLIANCE)\s+PASS\]/gi;
const viktorDeliveryTexts = [];

for (let stepIdx = 0; stepIdx < turnSteps.length; stepIdx++) {
  const s = turnSteps[stepIdx];
  // Only accept verdicts from real incoming subagent deliveries, never from MODEL prose/thinking, outgoing send_message, or Stop-hook self-reminders
  if (s?.source === 'SYSTEM' || s?.type === 'SYSTEM_MESSAGE') {
    const sysText = String(s?.content || '');
    const isStopReminder = /Stop hook blocked termination:|Hermes Gate \(попытка/i.test(sysText);
    if (!isStopReminder) {
      const senderMatch = sysText.match(/sender=["']?([0-9a-f-]{36})["']?/i);
      const senderUuid = senderMatch ? senderMatch[1].toLowerCase() : (String(s?.sender || '').match(/^[0-9a-f-]{36}$/i) ? String(s.sender).toLowerCase() : '');
      const isFromNonAuditor = senderUuid && nonAuditorSubagentIds.has(senderUuid);
      const isViktorSender = Boolean(senderUuid && viktorSubagentUuids.has(senderUuid));

      if (!isFromNonAuditor) {
        if (isViktorSender) {
          viktorDeliveryTexts.push(sysText);
        }

        const strippedSysText = sysText.replace(REQUEST_OR_WAITING_RE, '');
        if (/\[QA PASS\]/.test(strippedSysText) && !/\[QA REJECT\]/.test(sysText)) {
          hasQaPass = true;
        }
        if (isViktorSender && /\[SECURITY PASS\]/.test(strippedSysText) && !/\[SECURITY REJECT\]/.test(sysText)) {
          hasSecurityPass = true;
        }
        if (/\[UX PASS\]/.test(strippedSysText) && !/\[UX REJECT\]/.test(sysText)) hasUxPass = true;
        if (/\[COMPLIANCE PASS\]/.test(strippedSysText) && !/\[RULE VIOLATION/.test(sysText)) hasCompliancePass = true;
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
    if (name === 'ask_question' && lastWriteIdx >= 0) {
      postEditAskIdx = stepIdx;
      postEditAskAnswer = '';
      postEditAskToolCallId = String(tc?.id || tc?.tool_call_id || tc?.call_id || '');
    }
    if (WRITE_TOOL_NAMES.has(name)) {
      const targetPath = String(args.Path || args.TargetFile || args.AbsolutePath || args.path || '');
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

if (editedSourceFiles.size === 0) {
  allow();
  process.exit(0);
}

const convId = String(payload?.conversationId || transcriptPath);
const turnMarker = steps[lastUserIdx]?.step_index ?? lastUserIdx;
const counterFile = getCounterFile(convId, turnMarker);

// Token economy skip requires explicit option selection or positive intent anchored to option/line start.
// Casual words like "нет", "не нужно", "достаточно", "no" or negations like "don't skip", "нельзя пропустить",
// "не оставляй без проверки", "без проверки не оставляй" MUST NOT bypass verification.
const NEGATION_SKIP_RE = /(?:(?:не|нельзя|никогда|don'?t|do\s+not|never)(?![\wА-Яа-яЁё])[^\r\n]{0,35}(?:skip|без\s+проверки|пропустит[ье]|пропускай|пропуск))|(?:(?:skip|без\s+проверки|пропустит[ье]|пропускай|пропуск)(?![\wА-Яа-яЁё])[^\r\n]{0,35}(?:не|нельзя|никогда|don'?t|do\s+not|never)(?![\wА-Яа-яЁё]))/i;
const POSITIVE_SKIP_RE = /(?:^|\n)\s*(?:[A-Za-z]?\d+[:.)]\s*|option\s+\d+[:.]\s*|[-*]\s*)?(?:\(recommended\)\s*)?(?:без\s+проверки|skip\b|пропустить\s+проверк[уае]?)/i;

const hasNegationOfSkip = NEGATION_SKIP_RE.test(postEditAskAnswer);
const hasPositiveSkip = POSITIVE_SKIP_RE.test(postEditAskAnswer);
const isEconomySkipRequested = postEditAskIdx > lastWriteIdx && hasPositiveSkip && !hasNegationOfSkip;

// In economy mode: allow immediately if no UI files were edited or if UX PASS is already granted.
// If UI files were modified, UX review by Kritik is strictly required even in economy mode to prevent broken layouts.
if (isEconomySkipRequested && (editedUiFiles.size === 0 || hasUxPass)) {
  cleanupCounter(counterFile);
  allow();
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
const secVerdictFile = path.join(activeWorkspaceDir, '.hermes', 'security-verdict.json');
if (!hasSecurityPass && fs.existsSync(secVerdictFile)) {
  try {
    const verdictData = JSON.parse(fs.readFileSync(secVerdictFile, 'utf-8'));
    const isPass = verdictData?.status === 'PASS';
    const hasSignature = Boolean(verdictData?.signature);
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

    if (isPass && hasSignature && noUnresolved && hasTranscriptProof && hasViktorDeliveryWithHash && hasDiffHashMatch && hasConvMatch && hasTurnMatch && isFresh) {
      hasSecurityPass = true;
    } else {
      logGateDecision({
        decision: 'continue',
        reason: 'security-verdict.json rejected: anti-self-signing check failed',
        checks: { isPass, hasSignature, noUnresolved, hasTranscriptProof, hasViktorDeliveryWithHash, hasDiffHashMatch, hasConvMatch, hasTurnMatch, isFresh }
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
const lastUserContent = lastUserIdx >= 0
  ? (typeof steps[lastUserIdx]?.content === 'string' ? steps[lastUserIdx].content : (steps[lastUserIdx]?.content?.text || ''))
  : '';
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

if (missing.length === 0) {
  cleanupCounter(counterFile);
  allow();
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
  allow();
  process.exit(0);
}

writeCounter(counterFile, attempt + 1);

const combinedTouched = touchedSnapshots.join('\n');
const recommendedTeam = new Set();
for (const rule of DOMAIN_ROUTING_RULES) {
  if (rule.re.test(combinedTouched)) {
    const missingKey = rule.keys.some((k) => !invokedSpecialists.has(k));
    if (missingKey) {
      for (const label of rule.agents) recommendedTeam.add(label);
    }
  }
}
if (editedUiFiles.size === 0 && !invokedSpecialists.has('elena') && !invokedSpecialists.has('kritik')) {
  recommendedTeam.add('@elena / @kritik (оцените: не нужно ли после изменений кода переделать окна/дизайн?)');
}
const teamHint = recommendedTeam.size > 0
  ? ` Подключите профильных специалистов по затронутым узлам: ${[...recommendedTeam].join(', ')}.`
  : '';

const blockReason = (isEconomySkipRequested && editedUiFiles.size > 0 && !hasUxPass)
  ? `Hermes Gate (попытка ${attempt + 1}/${MAX_RETURNS}): Режим экономии активирован (QA пропущен), но затронуты UI-файлы (${[...editedUiFiles].join(', ')}). Для исключения дефектов дизайна требуется вердикт [UX PASS] от Kritik.`
  : `Hermes Gate (попытка ${attempt + 1}/${MAX_RETURNS}): изменено исходников: ${editedSourceFiles.size}. Чтобы не тратить токены на мелких правках, вызовите ask_question и спросите пользователя: «Я закончил доработку. Запустить сотрудников на проверку (${missing.join(', ')}) или завершить без проверки (экономия токенов)?» (Либо если пользователь уже подтвердил проверку — дождитесь ${missing.join(' и ')}).${teamHint}`;

blockStop(blockReason);
