// Shared Hermes activation detection for all hooks (single source of truth).
// Hermes is active only on an explicit request:
//   * `/hermes` as a command (start of the message or of a line), not a mention mid-sentence;
//   * an explicit request to enable Hermes Mode ("включи режим hermes", "enable hermes mode");
//   * a direct `@specialist` call (only for hooks that opt in via { includeMentions: true });
//   * the Lead already invoking a Hermes specialist subagent.
import fs from 'node:fs';

export const HERMES_AGENTS = new Set([
  'alexey', 'anna', 'artem', 'denis', 'dmitry', 'elena',
  'gleb', 'igor', 'kritik', 'mikhail', 'ruslan', 'sergey', 'stanislav', 'viktor'
]);

export const HERMES_AGENT_ALIASES = {
  mozgoeb: 'kritik',
  мозгоеб: 'kritik'
};

const MENTION_NAMES = [...HERMES_AGENTS, ...Object.keys(HERMES_AGENT_ALIASES), 'критик', 'мозгоеб', 'глеб'].join('|');
const WORD_END = `(?=$|[\\s.,:;!?)"'])`;

const SLASH_COMMAND_RE = new RegExp(`(?:^|\\n)[ \\t]*\\/hermes${WORD_END}`, 'i');
const MODE_REQUEST_RE = /(?:включи(?:ть)?|активируй|активировать|запусти(?:ть)?|enable|activate|turn\s+on|start)\s+(?:режим\s+hermes|hermes\s+mode)/i;
const MODE_ONLY_RE = /^\s*(?:режим\s+hermes|hermes\s+mode)\s*[.!]?\s*$/i;
const MENTION_RE = new RegExp(`(?:^|\\s)@(?:${MENTION_NAMES})${WORD_END}`, 'i');
const USER_REQUEST_RE = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i;

// Transcript USER_INPUT steps wrap the typed text in <USER_REQUEST> and append metadata
// (e.g. the hermes SKILL.md path whenever `/hermes` is mentioned anywhere). Only the typed text counts.
export function extractUserRequest(text) {
  const raw = String(text || '');
  const m = raw.match(USER_REQUEST_RE);
  return (m ? m[1] : raw).trim();
}

export function isHermesTrigger(text, { includeMentions = true } = {}) {
  const request = extractUserRequest(text);
  if (!request) return false;
  if (SLASH_COMMAND_RE.test(request) || MODE_REQUEST_RE.test(request) || MODE_ONLY_RE.test(request)) return true;
  return includeMentions && MENTION_RE.test(request);
}

export function isRealUserStep(step) {
  return step?.type === 'USER_INPUT' && (!step.source || step.source === 'USER_EXPLICIT');
}

export function collectToolCalls(step) {
  if (Array.isArray(step?.tool_calls)) return step.tool_calls;
  if (step?.toolCall) return [step.toolCall];
  return [];
}

export function isHermesSubagentCall(toolCall) {
  const name = String(toolCall?.name || '').toLowerCase();
  const typeName = String(toolCall?.args?.TypeName || toolCall?.args?.typeName || '').toLowerCase();
  return name === 'invoke_subagent' && (HERMES_AGENTS.has(typeName) || Boolean(HERMES_AGENT_ALIASES[typeName]));
}

export function detectHermesInSteps(steps, options = {}) {
  for (const s of steps) {
    if (isRealUserStep(s) && isHermesTrigger(s?.content, options)) return true;
    if (collectToolCalls(s).some(isHermesSubagentCall)) return true;
  }
  return false;
}

export function parseJsonl(text) {
  const steps = [];
  for (const line of String(text || '').split(/\r?\n/)) {
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

// Reads the transcript head (activation usually happens in the first user step) and tail
// (recent steps) without loading huge files into memory.
export function readTranscriptSlices(filePath, { maxTailBytes, headScanBytes }) {
  const stat = fs.statSync(filePath);
  if (stat.size <= maxTailBytes) {
    return { headText: '', tailText: fs.readFileSync(filePath, 'utf-8') };
  }
  const fd = fs.openSync(filePath, 'r');
  try {
    let headText = '';
    if (headScanBytes > 0) {
      const headBuf = Buffer.alloc(headScanBytes);
      const headRead = fs.readSync(fd, headBuf, 0, headScanBytes, 0);
      headText = headBuf.toString('utf-8', 0, headRead);
      const lastHeadNl = headText.lastIndexOf('\n');
      if (lastHeadNl >= 0) headText = headText.slice(0, lastHeadNl + 1);
    }

    const startOffset = stat.size - maxTailBytes;
    const tailBuf = Buffer.alloc(maxTailBytes);
    const tailRead = fs.readSync(fd, tailBuf, 0, maxTailBytes, startOffset);
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
