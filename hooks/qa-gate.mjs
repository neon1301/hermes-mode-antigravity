import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_RETURNS = 2;

const WRITE_TOOL_NAMES = new Set([
  'write_file',
  'write_to_file',
  'edit_file',
  'replace_file_content',
  'multi_replace_file_content'
]);

const SOURCE_CODE_EXT_RE = /\.(cs|ts|tsx|js|jsx|mjs|cjs|py|go|java|rs|cpp|c|h|hpp|vb|xaml|razor|vue|svelte)$/i;
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

function extractSteps(transcriptText) {
  const steps = [];
  for (const line of transcriptText.split(/\r?\n/)) {
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

function getCounterFile(convId, turnMarker) {
  const key = crypto.createHash('sha1').update(`${convId}:${turnMarker}`).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), `hermes-qa-gate-${key}.json`);
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

if (payload?.terminationReason && payload.terminationReason !== 'NO_TOOL_CALL') {
  allow();
  process.exit(0);
}

const transcriptPath = payload?.transcriptPath;
if (!transcriptPath || !fs.existsSync(transcriptPath)) {
  allow();
  process.exit(0);
}

let steps;
try {
  steps = extractSteps(fs.readFileSync(transcriptPath, 'utf-8'));
} catch {
  allow();
  process.exit(0);
}

if (steps.length === 0) {
  allow();
  process.exit(0);
}

let hermesActive = false;
let lastUserIdx = -1;

for (let i = 0; i < steps.length; i++) {
  const s = steps[i];
  const content = String(s?.content || '');
  if (isRealUserStep(s)) {
    lastUserIdx = i;
    if (HERMES_TRIGGER_RE.test(content)) hermesActive = true;
  }
  for (const tc of collectToolCalls(s)) {
    const name = String(tc?.name || '').toLowerCase();
    const args = tc?.args || {};
    if (name === 'invoke_subagent' && HERMES_AGENTS.has(String(args.TypeName || '').toLowerCase())) {
      hermesActive = true;
    }
  }
}

if (!hermesActive) {
  allow();
  process.exit(0);
}

const turnSteps = steps.slice(lastUserIdx >= 0 ? lastUserIdx + 1 : 0);
const editedSourceFiles = new Set();
let hasQaPass = false;
let hasCompliancePass = false;

for (const s of turnSteps) {
  const text = `${s?.content || ''}\n${s?.thinking || ''}`;
  if (/\[QA PASS\]/.test(text)) hasQaPass = true;
  if (/\[COMPLIANCE PASS\]/.test(text)) hasCompliancePass = true;

  for (const tc of collectToolCalls(s)) {
    const name = String(tc?.name || '').toLowerCase();
    const args = tc?.args || {};
    if (WRITE_TOOL_NAMES.has(name)) {
      const targetPath = String(args.Path || args.TargetFile || args.AbsolutePath || args.path || '');
      if (SOURCE_CODE_EXT_RE.test(targetPath)) {
        editedSourceFiles.add(path.normalize(targetPath));
      }
    }
    if (name === 'send_message' && typeof args.Message === 'string') {
      if (/\[QA PASS\]/.test(args.Message)) hasQaPass = true;
      if (/\[COMPLIANCE PASS\]/.test(args.Message)) hasCompliancePass = true;
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

if (missing.length === 0) {
  allow();
  process.exit(0);
}

const convId = String(payload?.conversationId || transcriptPath);
const turnMarker = steps[lastUserIdx]?.step_index ?? lastUserIdx;
const counterFile = getCounterFile(convId, turnMarker);
const attempt = readCounter(counterFile);

if (attempt >= MAX_RETURNS) {
  allow();
  process.exit(0);
}

writeCounter(counterFile, attempt + 1);
blockStop(
  `Hermes Gate (попытка ${attempt + 1}/${MAX_RETURNS}): изменено исходников: ${editedSourceFiles.size}. Перед завершением получите ${missing.join(' и ')}.`
);
