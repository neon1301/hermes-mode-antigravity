import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

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
const HERMES_TRIGGER_RE = /(?:^|\s)(?:\/hermes\b|@(?:dmitry|elena|mozgoeb|мозгоеб|viktor|alexey|ruslan|artem|mikhail|sergey|igor|anna|denis|stanislav)\b)|hermes-fleet[\\/](?:skills[\\/]hermes|rules[\\/]AGENTS\.md)/i;
const HERMES_AGENTS = new Set([
  'alexey', 'anna', 'artem', 'denis', 'dmitry', 'elena',
  'igor', 'mikhail', 'mozgoeb', 'ruslan', 'sergey', 'stanislav', 'viktor'
]);

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

function readTranscriptSlices(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size <= MAX_TAIL_BYTES) {
    return { headText: '', tailText: fs.readFileSync(filePath, 'utf-8') };
  }
  const fd = fs.openSync(filePath, 'r');
  try {
    const headBuf = Buffer.alloc(HEAD_SCAN_BYTES);
    const headRead = fs.readSync(fd, headBuf, 0, HEAD_SCAN_BYTES, 0);
    let headText = headBuf.toString('utf-8', 0, headRead);
    const lastHeadNl = headText.lastIndexOf('\n');
    if (lastHeadNl >= 0) headText = headText.slice(0, lastHeadNl + 1);

    const startOffset = stat.size - MAX_TAIL_BYTES;
    const tailBuf = Buffer.alloc(MAX_TAIL_BYTES);
    const tailRead = fs.readSync(fd, tailBuf, 0, MAX_TAIL_BYTES, startOffset);
    let tailText = tailBuf.toString('utf-8', 0, tailRead);
    // Drop partial first JSONL line after mid-file seek unless doing so empties a complete final line
    const firstNl = tailText.indexOf('\n');
    if (firstNl >= 0) {
      const remainder = tailText.slice(firstNl + 1);
      if (remainder.trim().length > 0) tailText = remainder;
    }
    return { headText, tailText };
  } finally {
    fs.closeSync(fd);
  }
}

function parseJsonl(text) {
  const steps = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      steps.push(JSON.parse(trimmed));
    } catch {
      // Ignore partial/malformed lines (fail-safe)
    }
  }
  return steps;
}

function isRealUserStep(step) {
  return step?.type === 'USER_INPUT' && (!step.source || step.source === 'USER_EXPLICIT');
}

function collectToolCalls(step) {
  if (Array.isArray(step?.tool_calls)) return step.tool_calls;
  if (step?.toolCall) return [step.toolCall];
  return [];
}

function detectHermesInSteps(stepList) {
  for (const s of stepList) {
    if (isRealUserStep(s) && HERMES_TRIGGER_RE.test(String(s?.content || ''))) {
      return true;
    }
    for (const tc of collectToolCalls(s)) {
      const name = String(tc?.name || '').toLowerCase();
      const args = tc?.args || {};
      if (name === 'invoke_subagent' && HERMES_AGENTS.has(String(args.TypeName || '').toLowerCase())) {
        return true;
      }
    }
  }
  return false;
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
  ({ headText, tailText } = readTranscriptSlices(transcriptPath));
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
  HERMES_TRIGGER_RE.test(String(payload?.lastUserInput || '')) ||
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

for (const s of turnSteps) {
  // Only accept verdicts from real incoming subagent deliveries, never from MODEL prose/thinking, outgoing send_message, or Stop-hook self-reminders
  if (s?.source === 'SYSTEM' || s?.type === 'SYSTEM_MESSAGE') {
    const sysText = String(s?.content || '');
    const isStopReminder = /Stop hook blocked termination:|Hermes Gate \(попытка/i.test(sysText);
    if (!isStopReminder) {
      if (/\[QA PASS\]/.test(sysText) && !/\[QA REJECT\]/.test(sysText)) hasQaPass = true;
      if (/\[COMPLIANCE PASS\]/.test(sysText) && !/\[RULE VIOLATION/.test(sysText)) hasCompliancePass = true;
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
