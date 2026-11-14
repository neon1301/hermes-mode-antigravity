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

function logGateDecision({ decision, reason, missing } = {}) {
  if (!isHermesSession) return;
  try {
    const cwd = process.cwd();
    const hermesDir = path.join(cwd, '.hermes');
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
let lastWriteIdx = -1;
let postEditAskIdx = -1;
let postEditAskAnswer = '';
let postEditAskToolCallId = '';

const nonAuditorSubagentIds = new Set();
let pendingNonAuditorCount = 0;

for (const s of turnSteps) {
  for (const tc of collectToolCalls(s)) {
    const name = String(tc?.name || '').toLowerCase();
    const args = tc?.args || {};
    if (name === 'invoke_subagent') {
      const typeName = String(args.TypeName || args.typeName || '').toLowerCase();
      if (typeName) invokedSpecialists.add(typeName);
      if (typeName !== 'viktor' && typeName !== 'stanislav' && typeName !== 'kritik') {
        pendingNonAuditorCount++;
      }
    }
  }

  const stepType = String(s?.type || '').toUpperCase();
  if (pendingNonAuditorCount > 0 && (stepType === 'GENERIC' || s?.source === 'SYSTEM')) {
    const textToScan = typeof s?.content === 'string' ? s.content : JSON.stringify(s);
    const m = textToScan.match(/"conversationId"\s*:\s*"([0-9a-f-]{36})"/i);
    if (m) {
      nonAuditorSubagentIds.add(m[1].toLowerCase());
      pendingNonAuditorCount--;
    }
  }
}

const REQUEST_OR_WAITING_RE = /(?:ожида[юем]|жд[уём]|требуется|получит[ье]|перед|после|ready\s+for|waiting\s+for|need)\s+[^\n]{0,40}\[(?:QA|UX|COMPLIANCE)\s+PASS\]/gi;

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

      if (!isFromNonAuditor) {
        const strippedSysText = sysText.replace(REQUEST_OR_WAITING_RE, '');
        if (/\[QA PASS\]/.test(strippedSysText) && !/\[QA REJECT\]/.test(sysText)) hasQaPass = true;
        if (/\[UX PASS\]/.test(strippedSysText) && !/\[UX REJECT\]/.test(sysText)) hasUxPass = true;
        if (/\[COMPLIANCE PASS\]/.test(strippedSysText) && !/\[RULE VIOLATION/.test(sysText)) hasCompliancePass = true;
      }
    }
  }

  // Only accept user choice from real user input or tool execution results bound to ask_question, NEVER from MODEL prose/thinking or sourceless steps (self-signing protection)
  if (postEditAskIdx >= 0 && stepIdx > postEditAskIdx) {
    const isFromModel = s?.source === 'MODEL';
    if (!isFromModel) {
      const stepType = String(s?.type || '').toUpperCase();
      const isUserSource = s?.source === 'USER_EXPLICIT' || s?.source === 'USER';
      const stepToolCallId = String(s?.tool_call_id || s?.toolCallId || s?.call_id || '');
      const stepToolName = String(s?.tool_name || s?.toolName || s?.name || '').toLowerCase();
      const isBoundToAskTool =
        (postEditAskToolCallId && stepToolCallId === postEditAskToolCallId) ||
        stepToolName === 'ask_question';
      const isToolOutput =
        s?.source === 'SYSTEM' &&
        isBoundToAskTool &&
        (stepType === 'GENERIC' || stepType === 'TOOL_OUTPUT' || stepType === 'TOOL_RESULT') &&
        !s?.sender &&
        !/<SYSTEM_MESSAGE/i.test(String(s?.content || ''));
      if (isUserSource || isToolOutput) {
        postEditAskAnswer += '\n' + String(s?.content || '');
      }
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
        const snippet = String(args.Content || args.Replacement || args.CodeContent || '').slice(0, 2000);
        touchedSnapshots.push(`${targetPath}\n${snippet}`);
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

const needQa = !onlyUxRequested && !isEconomySkipRequested;
const needUx = (editedUiFiles.size > 0 || onlyUxRequested) && !onlyQaRequested;
const needCompliance = editedSourceFiles.size >= 4 && !onlyUxRequested && !onlyQaRequested && !isEconomySkipRequested;
const missing = [];
if (needQa && !hasQaPass) missing.push('[QA PASS] (Viktor)');
if (needUx && !hasUxPass) missing.push('[UX PASS] (Kritik — проверка окон/дизайна после доработки)');
if (needCompliance && !hasCompliancePass) missing.push('[COMPLIANCE PASS] (Stanislav)');

if (missing.length === 0) {
  cleanupCounter(counterFile);
  allow();
  process.exit(0);
}

const attempt = readCounter(counterFile);

if (attempt >= MAX_RETURNS) {
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
