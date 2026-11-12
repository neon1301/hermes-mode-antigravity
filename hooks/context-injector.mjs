import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_TAIL_BYTES = 4 * 1024 * 1024;
const PROTOCOL_MARKER = '<!-- HERMES_PROTOCOL_LOADED -->';
const HERMES_TRIGGER_RE = /(?:^|\s)\/hermes(?=$|[\s.,:;!?)"'])|режим\s+hermes|hermes\s+mode/i;
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

function allowEmpty() {
  process.stdout.write('{}');
}

function parseJsonl(text) {
  const steps = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      steps.push(JSON.parse(trimmed));
    } catch {
      // Ignore partial lines after slice
    }
  }
  return steps;
}

function readTailText(transcriptPath) {
  const stat = fs.statSync(transcriptPath);
  if (stat.size <= MAX_TAIL_BYTES) {
    return fs.readFileSync(transcriptPath, 'utf-8');
  }
  const fd = fs.openSync(transcriptPath, 'r');
  try {
    const startOffset = stat.size - MAX_TAIL_BYTES;
    const buf = Buffer.alloc(MAX_TAIL_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, MAX_TAIL_BYTES, startOffset);
    let text = buf.toString('utf-8', 0, bytesRead);
    const firstNl = text.indexOf('\n');
    if (firstNl >= 0) {
      const rem = text.slice(firstNl + 1);
      if (rem.trim().length > 0) text = rem;
    }
    return text;
  } finally {
    fs.closeSync(fd);
  }
}

function collectToolCalls(step) {
  if (Array.isArray(step?.tool_calls)) return step.tool_calls;
  if (step?.toolCall) return [step.toolCall];
  return [];
}

function inspectTranscript(steps) {
  let hermesActive = false;
  let alreadyInjected = false;

  for (const s of steps) {
    const content = String(s?.content || '');
    if (content.includes(PROTOCOL_MARKER)) {
      alreadyInjected = true;
    }
    if (s?.type === 'USER_INPUT' && (!s.source || s.source === 'USER_EXPLICIT')) {
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

  return { hermesActive, alreadyInjected };
}

const raw = readStdin().trim();
if (!raw) {
  allowEmpty();
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  allowEmpty();
  process.exit(0);
}

let hermesActive = HERMES_TRIGGER_RE.test(String(payload?.lastUserInput || ''));
let alreadyInjected = false;

const transcriptPath = payload?.transcriptPath;
if (transcriptPath && fs.existsSync(transcriptPath)) {
  try {
    const tailText = readTailText(transcriptPath);
    const info = inspectTranscript(parseJsonl(tailText));
    hermesActive = hermesActive || info.hermesActive;
    alreadyInjected = info.alreadyInjected;
  } catch {
    // Ignore transcript read failures
  }
}

if (!hermesActive || alreadyInjected) {
  allowEmpty();
  process.exit(0);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const protocolPath = path.resolve(__dirname, '..', 'skills', 'hermes', 'references', 'fleet-protocol.md');

if (!fs.existsSync(protocolPath)) {
  allowEmpty();
  process.exit(0);
}

try {
  const protocolText = fs.readFileSync(protocolPath, 'utf-8').trim();
  const content = protocolText.includes(PROTOCOL_MARKER)
    ? protocolText
    : `${PROTOCOL_MARKER}\n${protocolText}`;
  process.stdout.write(JSON.stringify({
    injectSteps: [
      {
        systemMessage: {
          systemMessage: content
        }
      }
    ]
  }));
} catch {
  allowEmpty();
}
