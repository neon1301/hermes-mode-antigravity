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

const SOURCE_CODE_EXT_RE = /\.(cs|ts|tsx|js|jsx|mjs|cjs|py|go|java|rs|cpp|c|h|hpp|vb|xaml|razor|vue|svelte)$/i;
const META_PATH_RE = /(?:^|[\\/])\.hermes[\\/]/i;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function allow() {
  process.stdout.write(JSON.stringify({ decision: 'allow' }));
}

function blockStop(reason) {
  process.stdout.write(JSON.stringify({ decision: 'continue', reason }));
}

function isIgnoredArtifactOrMeta(targetPath, artifactDir) {
  if (META_PATH_RE.test(targetPath)) return true;
  if (artifactDir) {
    const normTarget = path.resolve(targetPath).toLowerCase();
    const normArtifact = path.resolve(artifactDir).toLowerCase();
    if (normTarget === normArtifact || normTarget.startsWith(normArtifact + path.sep)) {
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

if (!hermesActive) {
  allow();
  process.exit(0);
}

const artifactDir = String(payload?.artifactDirectoryPath || '');
const turnSteps = steps.slice(lastUserIdx >= 0 ? lastUserIdx + 1 : 0);
const editedSourceFiles = new Set();
let hasQaPass = false;
let hasCompliancePass = false;

const nonAuditorSubagentIds = new Set();
let pendingNonAuditorCount = 0;

for (const s of turnSteps) {
  for (const tc of collectToolCalls(s)) {
    const name = String(tc?.name || '').toLowerCase();
    const args = tc?.args || {};
    if (name === 'invoke_subagent') {
      const typeName = String(args.TypeName || args.typeName || '').toLowerCase();
      if (typeName !== 'viktor' && typeName !== 'stanislav') {
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

const REQUEST_OR_WAITING_RE = /(?:ожида[юем]|жд[уём]|требуется|получит[ье]|перед|после|ready\s+for|waiting\s+for|need)\s+[^\n]{0,40}\[(?:QA|COMPLIANCE)\s+PASS\]/gi;

for (const s of turnSteps) {
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
        if (/\[COMPLIANCE PASS\]/.test(strippedSysText) && !/\[RULE VIOLATION/.test(sysText)) hasCompliancePass = true;
      }
    }
  }

  for (const tc of collectToolCalls(s)) {
    const name = String(tc?.name || '').toLowerCase();
    const args = tc?.args || {};
    if (WRITE_TOOL_NAMES.has(name)) {
      const targetPath = String(args.Path || args.TargetFile || args.AbsolutePath || args.path || '');
      if (SOURCE_CODE_EXT_RE.test(targetPath) && !isIgnoredArtifactOrMeta(targetPath, artifactDir)) {
        editedSourceFiles.add(path.normalize(targetPath));
        // A new source edit invalidates earlier QA/Compliance approvals in the same turn
        hasQaPass = false;
        hasCompliancePass = false;
      }
    }
  }
}

if (editedSourceFiles.size === 0) {
  allow();
  process.exit(0);
}

const needCompliance = editedSourceFiles.size >= 4;
const missing = [];
if (!hasQaPass) missing.push('[QA PASS] (Viktor)');
if (needCompliance && !hasCompliancePass) missing.push('[COMPLIANCE PASS] (Stanislav)');

const convId = String(payload?.conversationId || transcriptPath);
const turnMarker = steps[lastUserIdx]?.step_index ?? lastUserIdx;
const counterFile = getCounterFile(convId, turnMarker);

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
blockStop(
  `Hermes Gate (попытка ${attempt + 1}/${MAX_RETURNS}): изменено исходников: ${editedSourceFiles.size}. Перед завершением получите ${missing.join(' и ')}.`
);
