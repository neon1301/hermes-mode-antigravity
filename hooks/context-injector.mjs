import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectHermesInSteps, isHermesTrigger, parseJsonl, readTranscriptSlices } from './hermes-trigger.mjs';

const MAX_TAIL_BYTES = 4 * 1024 * 1024;
const HEAD_SCAN_BYTES = 64 * 1024;
const PROTOCOL_MARKER = '<!-- HERMES_PROTOCOL_LOADED -->';
const COMPACT_MARKER = '<!-- HERMES_COMPACT_SUGGESTED -->';
const COMPACT_STEP_THRESHOLD = Number(process.env.HERMES_COMPACT_STEP_THRESHOLD || 60);
const COMPACT_BYTE_THRESHOLD = Number(process.env.HERMES_COMPACT_BYTE_THRESHOLD || 350 * 1024);
const COMPACT_COOLDOWN_STEPS = 25;
const MAX_INSTINCTS = Number(process.env.HERMES_MAX_INSTINCTS || 8);
const MIN_INSTINCT_CONFIDENCE = Number(process.env.HERMES_INSTINCT_MIN_CONFIDENCE || 0.7);
// A single @specialist call does not need the full 15 KB fleet protocol (token budget).
const TRIGGER_OPTIONS = { includeMentions: false };

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

function inspectTranscript(steps) {
  const alreadyInjected = steps.some((s) => String(s?.content || '').includes(PROTOCOL_MARKER));
  const recentSteps = steps.slice(-COMPACT_COOLDOWN_STEPS);
  const compactRecentlySuggested = recentSteps.some((s) => String(s?.content || '').includes(COMPACT_MARKER));
  return {
    hermesActive: detectHermesInSteps(steps, TRIGGER_OPTIONS),
    alreadyInjected,
    compactRecentlySuggested,
    stepCount: steps.length
  };
}

function loadProjectInstincts(workspaceDir) {
  if (!workspaceDir) return '';
  const hermesDir = path.join(workspaceDir, '.hermes');
  const lines = [];

  const jsonPath = path.join(hermesDir, 'instincts.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.instincts) ? parsed.instincts : []);
      const valid = list
        .filter((item) => item && typeof item.rule === 'string' && item.rule.trim().length > 0)
        .map((item) => ({
          domain: String(item.domain || 'general').trim(),
          trigger: String(item.trigger || '').trim(),
          rule: String(item.rule).trim(),
          confidence: typeof item.confidence === 'number' ? item.confidence : 0.9
        }))
        .filter((item) => item.confidence >= MIN_INSTINCT_CONFIDENCE)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_INSTINCTS);

      for (const inst of valid) {
        const prefix = inst.trigger ? `[${inst.domain}] Когда ${inst.trigger}: ` : `[${inst.domain}] `;
        lines.push(`- **${prefix}**${inst.rule} *(conf: ${inst.confidence.toFixed(2)})*`);
      }
    } catch {
      // Ignore malformed instincts.json
    }
  }

  const mdPath = path.join(hermesDir, 'instincts.md');
  if (fs.existsSync(mdPath)) {
    try {
      const mdText = fs.readFileSync(mdPath, 'utf-8').trim().slice(0, 1500);
      if (mdText.length > 0) {
        lines.push(mdText);
      }
    } catch {
      // Ignore read errors
    }
  }

  if (lines.length === 0) return '';
  return `\n\n---\n## 🧠 Выученные инстинкты проекта (.hermes/instincts — применяй автоматически без напоминаний!)\n${lines.join('\n')}`;
}

function resolveWorkspaceDir(payload) {
  let rawDir = payload?.cwd;
  if (!rawDir && Array.isArray(payload?.workspacePaths) && payload.workspacePaths.length > 0) {
    rawDir = payload.workspacePaths[0];
  }
  if (!rawDir || typeof rawDir !== 'string') return null;
  const trimmed = rawDir.trim();
  if (trimmed.startsWith('file://')) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return null;
    }
  }
  return trimmed;
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

let hermesActive = isHermesTrigger(payload?.lastUserInput, TRIGGER_OPTIONS);
let alreadyInjected = false;
let compactRecentlySuggested = false;
let stepCount = 0;
let transcriptBytes = 0;

const transcriptPath = payload?.transcriptPath;
if (transcriptPath && fs.existsSync(transcriptPath)) {
  try {
    transcriptBytes = fs.statSync(transcriptPath).size;
    const { headText, tailText } = readTranscriptSlices(transcriptPath, {
      maxTailBytes: MAX_TAIL_BYTES,
      headScanBytes: HEAD_SCAN_BYTES
    });
    const info = inspectTranscript([...parseJsonl(headText), ...parseJsonl(tailText)]);
    hermesActive = hermesActive || info.hermesActive;
    alreadyInjected = info.alreadyInjected;
    compactRecentlySuggested = info.compactRecentlySuggested;
    stepCount = info.stepCount;
  } catch {
    // Ignore transcript read failures
  }
}

if (!hermesActive) {
  allowEmpty();
  process.exit(0);
}

if (alreadyInjected) {
  if (
    !compactRecentlySuggested &&
    (stepCount >= COMPACT_STEP_THRESHOLD || transcriptBytes >= COMPACT_BYTE_THRESHOLD)
  ) {
    const kb = Math.max(1, Math.round(transcriptBytes / 1024));
    const compactMsg = `${COMPACT_MARKER}\n⚠️ **Контроль бюджета контекста (Hermes Strategic Compact):** В текущем чате накопилось уже ${stepCount} шагов (~${kb} КБ лога). Чтобы модель не теряла точность и не тратила лишние токены на перечитывание длинной истории, после завершения текущего шага обновите \`.hermes/checkpoint.md\` и порекомендуйте пользователю выполнить команду \`/compact\`!`;
    process.stdout.write(JSON.stringify({
      injectSteps: [
        {
          systemMessage: {
            systemMessage: compactMsg
          }
        }
      ]
    }));
    process.exit(0);
  }
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
  let content = protocolText.includes(PROTOCOL_MARKER)
    ? protocolText
    : `${PROTOCOL_MARKER}\n${protocolText}`;

  const workspaceDir = resolveWorkspaceDir(payload);
  if (workspaceDir) {
    const checkpointPath = path.join(workspaceDir, '.hermes', 'checkpoint.md');
    if (fs.existsSync(checkpointPath)) {
      try {
        const stat = fs.statSync(checkpointPath);
        if (stat.size > 0) {
          let cpText = fs.readFileSync(checkpointPath, 'utf-8');
          if (cpText.length > 2048) {
            cpText = cpText.slice(0, 2048);
          }
          if (cpText.trim().length > 0) {
            content += `\n\n---\n## 📌 Авто-подхват чекпоинта прошлой сессии (.hermes/checkpoint.md)\n> ⚠️ **ВАЖНО:** Запись о модели в этом чекпоинте относится к прошлому чату и НЕ освобождает от ШАГА 0! В текущем чате ты ОБЯЗАН ПЕРВЫМ действием вызвать \`ask_question\` для выбора модели субагентов.\n\n${cpText}`;
          }
        }
      } catch {
        // Ignore checkpoint read failures
      }
    }

    const instinctsBlock = loadProjectInstincts(workspaceDir);
    if (instinctsBlock) {
      content += instinctsBlock;
    }
  }

  content = `${PROTOCOL_MARKER}\n🚨 **MANDATORY FIRST TOOL CALL (ШАГ 0):** В этом чате ещё не выбрана модель для субагентов! ПЕРВЫМ ЖЕ действием (до чтения кода проекта, до запуска команд и до вызова субагентов — даже если в \`.hermes/checkpoint.md\` есть старая запись от прошлого чата!) вызовите инструмент \`ask_question\` с 2 вопросами: (1) «Какую модель ИИ использовать для всех субагентов?» и (2) «Какой режим (уровень ума) поставить субагентам?» (см. раздел ШАГ 0 ниже).\n\n` + content.replace(PROTOCOL_MARKER, '').trim();

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
