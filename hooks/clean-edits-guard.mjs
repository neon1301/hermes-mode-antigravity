import fs from 'node:fs';
import path from 'node:path';
import {
  collectToolCalls,
  detectHermesInSteps,
  HERMES_AGENTS,
  isHermesTrigger,
   isRealUserStep,
  parseJsonl,
  readTranscriptSlices
} from './hermes-trigger.mjs';

const MAX_TAIL_BYTES = 4 * 1024 * 1024;
const HEAD_SCAN_BYTES = 64 * 1024;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function isHermesActive(payload) {
  if (isHermesTrigger(payload?.lastUserInput)) return true;
  const transcriptPath = payload?.transcriptPath;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return false;
  try {
    const { headText, tailText } = readTranscriptSlices(transcriptPath, {
      maxTailBytes: MAX_TAIL_BYTES,
      headScanBytes: HEAD_SCAN_BYTES
    });
    return detectHermesInSteps([...parseJsonl(headText), ...parseJsonl(tailText)]);
  } catch {
    return false;
  }
}

function allow() {
  process.stdout.write(JSON.stringify({ decision: 'allow' }));
}

function deny(reason) {
  process.stdout.write(JSON.stringify({ decision: 'deny', reason }));
}

function collectWrittenText(args) {
  const parts = [];
  for (const key of ['Content', 'CodeContent', 'Replacement', 'ReplacementContent', 'content', 'replacement']) {
    if (typeof args[key] === 'string' && args[key].length > 0) parts.push(args[key]);
  }
  if (Array.isArray(args.ReplacementChunks)) {
    for (const chunk of args.ReplacementChunks) {
      if (typeof chunk?.ReplacementContent === 'string') parts.push(chunk.ReplacementContent);
    }
  }
  return parts.join('\n');
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

const toolName = String(payload?.toolCall?.name || '').toLowerCase();
const args = payload?.toolCall?.args || {};

// Rules 8/9 are Hermes Fleet policy: outside Hermes Mode the agent works as a standard agent.
if (!isHermesActive(payload)) {
  allow();
  process.exit(0);
}

const FILE_WRITE_TOOLS = new Set([
  'write_file',
  'write_to_file',
  'edit_file',
  'replace_file_content',
  'multi_replace_file_content'
]);

const CODE_EXT_LIST = '(?:cs|ts|tsx|js|jsx|mjs|cjs|py|go|java|rs|cpp|c|h|hpp|vb|xaml|razor|vue|svelte)';
const PATCH_FILE_RE = /(?:^|[\\/])patch_[^\\/]*\.(ps1|bat|cmd|py|sh)$/i;
const SHELL_PATCH_CREATE_RE = new RegExp(
  `\\b(?:out-file|set-content|add-content|tee-object|tee|touch|ni|new-item)\\b[^\\n]*\\bpatch_[a-z0-9._-]*\\.(?:ps1|bat|cmd|py|sh)\\b|(?:^|[^<>])>{1,2}\\s*["']?[^"'\\s]*patch_[a-z0-9._-]*\\.(?:ps1|bat|cmd|py|sh)(?=$|[\\s"'|;&])`,
  'i'
);

const SHELL_MUTATE_PATTERNS = [
  { name: 'sed -i / perl -i', re: /(?:^|[;&|\n]\s*|(?:xargs|find\b[^\n]*-exec|(?:ba|z)?sh\s+-c)\s+[^\n]*)(?:sed\s+(?:-[a-z]*i\S*|--in-place(?:=\S*)?)(?:\s|$)|perl\s+-[^\n;&|]*i\b)/i },
  { name: 'python -c file write', re: /\bpython[3]?\s+-c\b[^\n]*\b(?:open\([^)]*['"][wa]['"]|write_text\(|write_bytes\()/i },
  { name: 'node -e file write', re: /\bnode\s+(?:-e|--eval)\b[^\n]*\b(?:writeFile(?:Sync)?|appendFile(?:Sync)?)\b/i },
  {
    name: 'shell Set-Content/Out-File/redirect/tee on source file',
    re: new RegExp(
      `(?:^|[;&|\\n]\\s*|(?:pwsh|powershell)(?:\\.exe)?\\s+[^\\n]*|\\s["'])(?:set-content|out-file|add-content|tee(?:-object)?)\\b[^\\n|;&]*\\.${CODE_EXT_LIST}\\b|(?:^|[^<>])>{1,2}\\s*(?:"[^"\\n]*\\.${CODE_EXT_LIST}"|'[^'\\n]*\\.${CODE_EXT_LIST}'|[^\\s"'|;&>]*\\.${CODE_EXT_LIST})(?=$|[\\s"'|;&])`,
      'i'
    )
  },
  { name: 'git apply', re: /(?:^|[;&|\n]\s*)git\s+apply\b/i }
];

const SOURCE_CODE_EXT_RE = /\.(cs|ts|tsx|js|jsx|mjs|cjs|py|go|java|rs|cpp|c|h|hpp|vb|xaml|razor|vue|svelte)$/i;
const HARDCODE_SKIP_PATH_RE = /(?:^|[\\/])(?:tests?|__tests__|specs?|fixtures?|mocks?|samples?|examples?|docs?|hooks|scripts|\.hermes)[\\/]|(?:\.test\.|\.spec\.|Tests?\.(?:cs|py|ts|js)$)/i;

const KNOWN_SECRET_PREFIX_RE = /(["'`])(?:eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|sk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{16,}|gh[po]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[0-9A-Za-z-]{15,})[^"'`\n]*\1/;
const SECRET_ASSIGN_RE = /\b(?:password|passwd|pwd|api[_-]?key|secret[_-]?key|access[_-]?token|token|secret|credential)\b(?:\s*\{[^}]*\})?(?:\s*:\s*[A-Za-z_][\w.<>\[\]| ?]{0,40})?\s*(?::=|=|:)\s*(["'`])([^"'`\n]{6,})\1/gi;
const CONN_SECRET_RE = /(["'`])[^"'`\n]*\b(?:Password|Pwd)\s*=\s*(?!\$\{|<|\{|env\.|process\.env|changeme|example|placeholder)[^;"'`\n\s]{6,}(?:;[^"'`\n]*)?\1/i;
const PLACEHOLDER_VALUE_RE = /^(?:<[^>]+>|\$\{|\{\{|env\.|process\.env|changeme|example|placeholder|your[-_]|replace[-_]|todo|\*{3,})/i;
const WEAK_LITERAL_RE = /^(?:password\d*|passwd|admin\d*|qwerty\d*|letmein|welcome\d*|secret\d*|123456\d*)$/i;

function hasHardcodedSecret(text) {
  if (KNOWN_SECRET_PREFIX_RE.test(text)) return true;
  if (CONN_SECRET_RE.test(text)) return true;
  SECRET_ASSIGN_RE.lastIndex = 0;
  let match;
  while ((match = SECRET_ASSIGN_RE.exec(text)) !== null) {
    const val = match[2].trim();
    if (!val || /\$\{/.test(val) || PLACEHOLDER_VALUE_RE.test(val)) continue;
    if (WEAK_LITERAL_RE.test(val)) return true;
    // Plain UI/header/constant words (no digits, no symbols) like "AntiForgeryToken", "PasswordLabel"
    if (/^[A-Za-z][A-Za-z ]*$/.test(val)) continue;
    // Ignore UI copy with spaces like "Forgot password?" or "Enter your password:"
    if (/[\d!@#$%^&*_+=:;/?~.-]/.test(val) && !/\s/.test(val)) return true;
  }
  return false;
}

// Env/config-overridable defaults: `process.env.HOST ?? "127.0.0.1"`, `os.getenv("HOST") or "..."`,
// `os.getenv("HOST", "...")`, `config.GetValue("Host", "...")`. The literal is only a fallback, not a hardcode.
const FALLBACK_LITERAL_RE = /(?:\?\?|\|\||\bor\b)\s*(["'`])[^"'`\n]*\1/g;
const DEFAULT_ARG_CALL_RE = /\b(?:os\.getenv|os\.environ\.get|getenv|Environment\.GetEnvironmentVariable|GetValue(?:OrDefault)?(?:<[^>\n]*>)?|config\.get|settings\.get)\s*\(\s*(["'`])[^"'`\n]*\1\s*,\s*(["'`])[^"'`\n]*\2/g;

function stripEnvFallbacks(text) {
  return text
    .replace(FALLBACK_LITERAL_RE, '?? ""')
    .replace(DEFAULT_ARG_CALL_RE, (call) => call.replace(/,\s*(["'`])[^"'`\n]*\1$/, ', ""'));
}

const HARDCODE_RULES = [
  {
    name: 'Private/Loopback IPv4 literal',
    test: (t) => /(?:["'`]|:\/\/|@)(?:127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})/.test(stripEnvFallbacks(t))
  },
  {
    name: 'Absolute Windows/Unix filesystem path',
    test: (t) => /(["'`])(?:[A-Za-z]:(?:\\\\|\\|\/)[^"'`\n]{2,}|\/(?:Users|home)\/[^/\s"'`\\]+\/(?:\.[^"'`\s]+|[^"'`\n]*\.[A-Za-z0-9]{1,8})|\/(?:var|etc|opt)\/[A-Za-z0-9._-]+\/[^"'`\n]*\.[A-Za-z0-9]{1,8})\1/.test(t)
  },
  {
    name: 'Magic sleep/timeout literal',
    test: (t) => /\b(?:Thread\.Sleep|Task\.Delay)\(\s*[1-9]\d{3,}\s*(?:,|\))|\b(?:time\.sleep|asyncio\.sleep)\(\s*(?:[2-9]|[1-9]\d+)\s*(?:,|\))|\bTimeout(?:Ms)?\s*[:=]\s*[1-9]\d{3,}\b/i.test(t)
  },
  {
    name: 'Hardcoded secret/JWT/password literal',
    test: hasHardcodedSecret
  }
];

function stripGitCommitMessages(cmd) {
  return cmd.replace(
    /(\bgit\s+commit\b[^\n;&|]*?)(?:\s-(?:[a-z]*m|F)\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+))+/gi,
    '$1'
  );
}

if (FILE_WRITE_TOOLS.has(toolName)) {
  const targetPath = String(args.Path || args.TargetFile || args.AbsolutePath || args.path || '');
  if (PATCH_FILE_RE.test(targetPath)) {
    deny(
      `Hermes Rule 8 (Clean Edits Policy): запрещено создавать или редактировать временные патч-скрипты (${targetPath}). Используйте edit_file / write_file напрямую.`
    );
    process.exit(0);
  }

  if (SOURCE_CODE_EXT_RE.test(targetPath) && !HARDCODE_SKIP_PATH_RE.test(targetPath)) {
    const written = collectWrittenText(args);
    for (const rule of HARDCODE_RULES) {
      if (rule.test(written)) {
        deny(
          `Hermes Rule 9 (Zero-Hardcode Policy): в ${targetPath} обнаружен ${rule.name}. Вынесите значение в конфиг/переменную окружения или пути от рабочей директории.`
        );
        process.exit(0);
      }
    }
  }
}

if (toolName === 'run_command') {
  const rawCmd = String(args.CommandLine || args.command || '');
  const cmd = stripGitCommitMessages(rawCmd);
  if (SHELL_PATCH_CREATE_RE.test(cmd)) {
    deny(
      'Hermes Rule 8 (Clean Edits Policy): запрещено создавать временные патч-скрипты (patch_*.ps1/.bat/.py/.sh) через shell. Используйте edit_file / write_file напрямую.'
    );
    process.exit(0);
  }
  for (const mut of SHELL_MUTATE_PATTERNS) {
    if (mut.re.test(cmd)) {
      deny(
        `Hermes Rule 8 (Clean Edits Policy): запрещено модифицировать исходный код через ${mut.name}. Используйте edit_file / write_file напрямую.`
      );
      process.exit(0);
    }
  }
}

if (toolName === 'invoke_subagent') {
  const subType = String(args.TypeName || args.typeName || '').toLowerCase();
  if (HERMES_AGENTS.has(subType) || subType === 'self') {
    const reqModel = String(args.Model || args.model || 'inherit').toLowerCase().replace(/["']/g, '');
    const hostModel = String(payload?.modelName || '').toLowerCase();

    if (reqModel === 'inherit' && hostModel.includes('flash')) {
      deny(
        'Hermes Rule 12 (Anti-503 Flash Routing): не используйте Model: "inherit" на Gemini Flash (пул gemini-3.8-flash-high часто возвращает 503 No capacity). Передайте явно Model: "flash" (или "flash_lite" для Low).'
      );
      process.exit(0);
    }
  }
}

// Step 0 Model Handshake & Post-Edit Token Economy Gate (transcript-aware checks)
const subType = toolName === 'invoke_subagent' ? String(args.TypeName || args.typeName || '').toLowerCase() : '';
const readTarget = toolName === 'read_file' ? String(args.Path || args.TargetFile || args.AbsolutePath || args.path || '') : '';
const isSkillOrAgentDocRead = toolName === 'read_file' && /[\\/](?:skills|agents)[\\/]/i.test(readTarget);
const requiresStep0Handshake =
  (toolName === 'read_file' && !isSkillOrAgentDocRead) ||
  toolName === 'run_command' ||
  FILE_WRITE_TOOLS.has(toolName) ||
  (toolName === 'invoke_subagent' && (HERMES_AGENTS.has(subType) || subType === 'self'));

if (requiresStep0Handshake) {
  const transcriptPath = payload?.transcriptPath;
  if (transcriptPath && fs.existsSync(transcriptPath)) {
    try {
      const { headText, tailText } = readTranscriptSlices(transcriptPath, {
        maxTailBytes: MAX_TAIL_BYTES,
        headScanBytes: HEAD_SCAN_BYTES
      });
      const steps = [...parseJsonl(headText), ...parseJsonl(tailText)];
      const isParentSession = steps.some(isRealUserStep);
      const slashHermesSession =
        isHermesTrigger(payload?.lastUserInput, { includeMentions: false }) ||
        detectHermesInSteps(steps, { includeMentions: false });

      if (isParentSession && slashHermesSession) {
        const hasHandshake = steps.some((s) =>
          collectToolCalls(s).some((tc) => String(tc?.name || '').toLowerCase() === 'ask_question')
        );
        if (!hasHandshake) {
          deny(
            'Hermes Rule 12 (Step 0 Model Handshake): В этом чате ещё не выполнен выбор модели для субагентов! ПЕРВЫМ действием в новой сессии /hermes (до чтения файлов проекта, запуска команд, правок или вызова субагентов) вызовите инструмент ask_question с 2 вопросами: (1) "Какую модель ИИ использовать для всех субагентов?" и (2) "Какой режим (уровень ума) поставить субагентам?" (Medium, High, Low). Старый .hermes/checkpoint.md от прошлых чатов не заменяет опрос в новом чате!'
          );
          process.exit(0);
        }
      }

      if (toolName === 'invoke_subagent' && HERMES_AGENTS.has(subType)) {
        const tailSteps = parseJsonl(tailText);
        let lastUserIdx = -1;
        for (let i = 0; i < tailSteps.length; i++) {
          if (isRealUserStep(tailSteps[i])) lastUserIdx = i;
        }
        const turnSteps = tailSteps.slice(lastUserIdx >= 0 ? lastUserIdx + 1 : 0);
        let lastWriteIdx = -1;
        let postEditAskIdx = -1;
        for (let i = 0; i < turnSteps.length; i++) {
          for (const tc of collectToolCalls(turnSteps[i])) {
            const tcName = String(tc?.name || '').toLowerCase();
            const tcArgs = tc?.args || {};
            if (tcName === 'ask_question' && lastWriteIdx >= 0) {
              postEditAskIdx = i;
            }
            if (FILE_WRITE_TOOLS.has(tcName)) {
              const p = String(tcArgs.Path || tcArgs.TargetFile || tcArgs.AbsolutePath || tcArgs.path || '');
              if (SOURCE_CODE_EXT_RE.test(p)) {
                lastWriteIdx = i;
                postEditAskIdx = -1;
              }
            }
          }
        }
        if (lastWriteIdx >= 0 && postEditAskIdx < lastWriteIdx) {
          deny(
            'Hermes Token Economy Rule: Вы уже изменили код в этом ходе. Не запускайте сотрудников на проверку автоматически! Сначала вызовите инструмент ask_question с вопросом: «Я закончил доработку. Запустить сотрудников на проверку или завершить без проверки (экономия токенов)?»'
          );
          process.exit(0);
        }
      }
    } catch {
      // Ignore transcript read errors
    }
  }
}

if (toolName === 'manage_subagents') {
  const action = String(args.Action || args.action || '').toLowerCase().replace(/["']/g, '');
  if (action === 'kill' || action === 'kill_all') {
    const transcriptPath = payload?.transcriptPath;
    if (transcriptPath && fs.existsSync(transcriptPath)) {
      try {
        const { tailText } = readTranscriptSlices(transcriptPath, {
          maxTailBytes: MAX_TAIL_BYTES,
          headScanBytes: 0
        });
        const tailSteps = parseJsonl(tailText);
        let lastUserIdx = -1;
        for (let i = 0; i < tailSteps.length; i++) {
          if (isRealUserStep(tailSteps[i])) lastUserIdx = i;
        }
        const turnSteps = tailSteps.slice(lastUserIdx >= 0 ? lastUserIdx + 1 : 0);

        const pendingIds = new Set();
        let lastDispatchedIdx = -1;
        let lastReplyIdx = -1;
        let dispatchedCount = 0;
        let replyCount = 0;

        for (let i = 0; i < turnSteps.length; i++) {
          const s = turnSteps[i];
          for (const tc of collectToolCalls(s)) {
            const n = String(tc?.name || '').toLowerCase();
            if (n === 'invoke_subagent' || n === 'send_message') {
              lastDispatchedIdx = i;
              dispatchedCount++;
            }
          }
          const contentStr = typeof s?.content === 'string' ? s.content : JSON.stringify(s);
          const createdMatch = contentStr.match(/Created the following subagent:\s*\{[^}]*"conversationId"\s*:\s*"([0-9a-f-]{36})"/i);
          if (createdMatch) {
            pendingIds.add(createdMatch[1].toLowerCase());
          }
          if (s?.source === 'SYSTEM' || s?.type === 'SYSTEM_MESSAGE') {
            const senderMatch = contentStr.match(/sender=["']?([0-9a-f-]{36})["']?/i);
            if (senderMatch) {
              pendingIds.delete(senderMatch[1].toLowerCase());
              lastReplyIdx = i;
              replyCount++;
            }
          }
        }

        if (pendingIds.size > 0 || (dispatchedCount > replyCount) || (lastDispatchedIdx > lastReplyIdx)) {
          deny(
            'Hermes Rule 12 (Anti-Premature Kill): ЗАПРЕЩЕНО вызывать manage_subagents(kill / kill_all), пока запущенные субагенты ещё работают и не прислали отчёт! После вызова invoke_subagent или send_message НЕМЕДЛЕННО ЗАВЕРШИТЕ СВОЙ ХОД (не вызывайте больше инструментов и НЕ выдумывайте отчёт за сотрудников) — система сама разбудит вас, когда субагенты ответят.'
          );
          process.exit(0);
        }
      } catch {
        // Ignore transcript read errors
      }
    }
  }
}

allow();
