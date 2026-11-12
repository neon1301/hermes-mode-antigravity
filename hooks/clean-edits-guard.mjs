import fs from 'node:fs';

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

const FILE_WRITE_TOOLS = new Set([
  'write_file',
  'write_to_file',
  'edit_file',
  'replace_file_content',
  'multi_replace_file_content'
]);

const CODE_EXT_LIST = '(?:cs|ts|tsx|js|jsx|mjs|cjs|py|go|java|rs|cpp|c|h|hpp|vb|xaml|razor|vue|svelte)';
const PATCH_FILE_RE = /(?:^|[\\/])patch_[^\\/]*\.(ps1|bat|cmd|py|sh)$/i;
const SHELL_PATCH_CREATE_RE = /\b(?:out-file|set-content|add-content|tee-object|tee|cat\s*>|echo\s+.*>|touch|ni|new-item)\b[^\n]*\bpatch_[a-z0-9._-]*\.(ps1|bat|cmd|py|sh)\b|(?:>|>>)\s*["']?[^"'\s]*patch_[a-z0-9._-]*\.(ps1|bat|cmd|py|sh)\b/i;

const SHELL_MUTATE_PATTERNS = [
  { name: 'sed -i / perl -i', re: /(?:^|[;&|\n]\s*|(?:xargs|find\b[^\n]*-exec|(?:ba|z)?sh\s+-c)\s+[^\n]*)(?:sed\s+-i(?:\s|$)|perl\s+-[^\n;&|]*i\b)/i },
  { name: 'python -c file write', re: /\bpython[3]?\s+-c\b[^\n]*\b(?:open\([^)]*['"][wa]['"]|write_text\(|write_bytes\()/i },
  { name: 'node -e file write', re: /\bnode\s+(?:-e|--eval)\b[^\n]*\b(?:writeFile(?:Sync)?|appendFile(?:Sync)?)\b/i },
  { name: 'shell Set-Content/Out-File/redirect/tee on source file', re: new RegExp(`(?:\\b(?:set-content|out-file|add-content|tee)\\b|(?:^|[^>])>(?:>)?\\s*)[^\\n|;&]*\\.${CODE_EXT_LIST}\\b`, 'i') },
  { name: 'git apply', re: /(?:^|[;&|\n]\s*)git\s+apply\b/i }
];

const SOURCE_CODE_EXT_RE = /\.(cs|ts|tsx|js|jsx|mjs|cjs|py|go|java|rs|cpp|c|h|hpp|vb)$/i;
const HARDCODE_SKIP_PATH_RE = /(?:^|[\\/])(?:tests?|__tests__|specs?|fixtures?|mocks?|samples?|examples?|docs?|hooks|scripts|\.hermes)[\\/]|(?:\.test\.|\.spec\.|Tests?\.(?:cs|py|ts|js)$)/i;

const HARDCODE_RULES = [
  {
    name: 'Private/Loopback IPv4 literal',
    re: /(?:["']|:\/\/|@)(?:127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})/
  },
  {
    name: 'Absolute Windows/Unix filesystem path',
    re: /(["'])(?:[A-Za-z]:(?:\\\\|\\|\/)[^"'\n]{2,}|\/(?:Users|home)\/[^/\s"'\\]+\/(?:\.[^"'\s]+|[^"'\n]*\.[a-z0-9]{1,8})|\/(?:var|etc|opt)\/[a-z0-9._-]+\/[^"'\n]*\.[a-z0-9]{1,8})\1/i
  },
  {
    name: 'Magic sleep/timeout literal',
    re: /\b(?:Thread\.Sleep|Task\.Delay)\(\s*[1-9]\d{3,}\s*\)|\b(?:time\.sleep|asyncio\.sleep)\(\s*(?:[2-9]|[1-9]\d+)\s*\)|\bTimeout(?:Ms)?\s*[:=]\s*[1-9]\d{3,}\b/i
  },
  {
    name: 'Hardcoded secret/JWT/password literal',
    re: /\b(?:password|passwd|api[_-]?key|secret[_-]?key|access[_-]?token|token)\b(?:\s*\{[^}]*\})?\s*[:=]\s*(["'])(?!<|\$\{|env\.|process\.env|changeme|example|placeholder|your[-_])[^"'\s]{8,}\1|(["'])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/i
  }
];

function stripGitCommitMessages(cmd) {
  return cmd.replace(/(\bgit\s+commit\b[^\n;&|]*?)\s-(?:m|F)\s+(?:"[^"]*"|'[^']*'|\S+)/gi, '$1');
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
      if (rule.re.test(written)) {
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

allow();
