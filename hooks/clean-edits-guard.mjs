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

const PATCH_FILE_RE = /(?:^|[\\/])patch_[^\\/]*\.(ps1|bat|cmd|py|sh)$/i;
const SHELL_PATCH_CREATE_RE = /\b(?:out-file|set-content|add-content|tee-object|cat\s*>|echo\s+.*>|touch|ni|new-item)\b[^\n]*\bpatch_[a-z0-9._-]*\.(ps1|bat|cmd|py|sh)\b|(?:>|>>)\s*["']?[^"'\s]*patch_[a-z0-9._-]*\.(ps1|bat|cmd|py|sh)\b/i;
const SHELL_CODE_MUTATE_RE = /(?:^|[;&|\n]\s*)(?:sed\s+-i(?:\s|$)|perl\s+-p?i\b)/i;
const SHELL_INLINE_CODE_WRITE_RE = /(?:^|[;&|\n]\s*)(?:set-content|out-file|add-content)\b[^\n;|&]*\.(?:cs|ts|tsx|js|jsx|mjs|py|go|java|rs|cpp|c|h|xaml|vue|svelte)\b|(?:^|[;&|\n]\s*)python[3]?\s+-c\b[^\n;|&]*\b(?:open\([^)]*['"][wa]['"]|write_text\(|write_bytes\()/i;

const SOURCE_CODE_EXT_RE = /\.(cs|ts|tsx|js|jsx|mjs|cjs|py|go|java|rs|cpp|c|h|hpp|vb)$/i;
const HARDCODE_SKIP_PATH_RE = /(?:^|[\\/])(?:tests?|__tests__|specs?|fixtures?|mocks?|samples?|examples?|docs?|hooks|scripts|\.hermes)[\\/]|(?:\.test\.|\.spec\.|Tests?\.(?:cs|py|ts|js)$)/i;

const HARDCODE_RULES = [
  {
    name: 'Private/Loopback IPv4 literal',
    re: /(["'])(?:127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\1/
  },
  {
    name: 'Absolute Windows/Unix filesystem path',
    re: /(["'])(?:[A-Za-z]:\\\\[^"'\n]{2,}|[A-Za-z]:\\[^\\"\n]{2,}|\/(?:var|etc|opt|home|Users)\/[^"'\n]{2,})\1/
  },
  {
    name: 'Magic sleep/delay literal (>= 1000ms)',
    re: /\b(?:Thread\.Sleep|Task\.Delay|time\.sleep)\(\s*[1-9]\d{3,}\s*\)/
  },
  {
    name: 'Hardcoded secret/password literal',
    re: /\b(?:password|passwd|api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*(["'])(?!<|\$\{|env\.|process\.env|changeme|example|placeholder|your[-_])[^"'\s]{8,}\1/i
  }
];

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
  const cmd = String(args.CommandLine || args.command || '');
  if (SHELL_PATCH_CREATE_RE.test(cmd)) {
    deny(
      'Hermes Rule 8 (Clean Edits Policy): запрещено создавать временные патч-скрипты (patch_*.ps1/.bat/.py/.sh) через shell. Используйте edit_file / write_file напрямую.'
    );
    process.exit(0);
  }
  if (SHELL_CODE_MUTATE_RE.test(cmd) || SHELL_INLINE_CODE_WRITE_RE.test(cmd)) {
    deny(
      'Hermes Rule 8 (Clean Edits Policy): запрещено модифицировать исходный код через sed -i / perl -i / python -c / Set-Content. Используйте edit_file / write_file напрямую.'
    );
    process.exit(0);
  }
}

allow();
