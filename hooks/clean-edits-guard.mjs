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

const PATCH_FILE_RE = /(?:^|[\\/])patch_[^\\/]*\.(ps1|bat|cmd|py|sh)$/i;
const SHELL_PATCH_CREATE_RE = /\b(?:out-file|set-content|add-content|tee-object|cat\s*>|echo\s+.*>|touch|ni|new-item)\b[^\n]*\bpatch_[a-z0-9._-]*\.(ps1|bat|cmd|py|sh)\b|(?:>|>>)\s*["']?[^"'\s]*patch_[a-z0-9._-]*\.(ps1|bat|cmd|py|sh)\b/i;

if (
  toolName === 'write_file' ||
  toolName === 'write_to_file' ||
  toolName === 'edit_file' ||
  toolName === 'replace_file_content' ||
  toolName === 'multi_replace_file_content'
) {
  const targetPath = String(args.Path || args.TargetFile || args.path || '');
  if (PATCH_FILE_RE.test(targetPath)) {
    deny(
      `Hermes Rule 8 (Clean Edits Policy): запрещено создавать или редактировать временные патч-скрипты (${targetPath}). Используйте edit_file / write_file напрямую.`
    );
    process.exit(0);
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
}

allow();
