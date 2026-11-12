import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hookPath = path.join(__dirname, 'clean-edits-guard.mjs');

const q = (s) => `"${s}"`;
const bt = (s) => `\`${s}\``;
const ip = ['192', '168', '1', '50'].join('.');
const loopIp = ['127', '0', '0', '1'].join('.');
const winPath = ['C:', 'data', 'db.sqlite'].join('\\');
const winSlash = ['C:', 'Users', 'me', 'db.sqlite'].join('/');
const linuxFile = ['', 'home', 'me', 'db.sqlite'].join('/');
const sleepCall = ['Thread', 'Sleep(5000);'].join('.');
const pyAsyncSleep = ['await asyncio', 'sleep(5)'].join('.');
const timeoutStmt = ['Timeout', '=', '30000;'].join(' ');
const jwtTok = ['eyJhbGciOiJIUzI1NiJ9', 'abcdef123456'].join('.');
const skTok = ['sk-live', 'abcdef1234567890abcd'].join('-');
const connStr = ['Server=db;', 'Password', '=', 'Sup3rSecret!;'].join('');

const cases = [
  // Rule 8 deny cases (including bypass wrappers)
  { name: 'deny_patch_ps1', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'patch_db.ps1', Content: 'ok' } } } },
  { name: 'deny_sed_i', expected: 'deny', payload: { toolCall: { name: 'run_command', args: { CommandLine: 'sed -i s/a/b/g src/app.ts' } } } },
  { name: 'deny_xargs_sed_i', expected: 'deny', payload: { toolCall: { name: 'run_command', args: { CommandLine: "git ls-files | xargs sed -i 's/a/b/'" } } } },
  { name: 'deny_find_exec_sed_i', expected: 'deny', payload: { toolCall: { name: 'run_command', args: { CommandLine: "find . -name '*.cs' -exec sed -i 's/a/b/' {} +" } } } },
  { name: 'deny_bash_c_sed_i', expected: 'deny', payload: { toolCall: { name: 'run_command', args: { CommandLine: 'bash -c "sed -i s/a/b/ app.py"' } } } },
  { name: 'deny_python_semicolon_write_text', expected: 'deny', payload: { toolCall: { name: 'run_command', args: { CommandLine: `python3 -c "from pathlib import Path;Path('a.py').write_text('x')"` } } } },
  { name: 'deny_node_eval_write', expected: 'deny', payload: { toolCall: { name: 'run_command', args: { CommandLine: `node -e "fs.writeFileSync('app.ts','x')"` } } } },
  { name: 'deny_redirect_cs', expected: 'deny', payload: { toolCall: { name: 'run_command', args: { CommandLine: 'echo x > app.cs' } } } },
  { name: 'deny_tee_cs', expected: 'deny', payload: { toolCall: { name: 'run_command', args: { CommandLine: 'cat foo | tee app.cs' } } } },
  { name: 'deny_git_apply', expected: 'deny', payload: { toolCall: { name: 'run_command', args: { CommandLine: 'git apply fix.diff' } } } },
  { name: 'deny_ps_set_content_cs', expected: 'deny', payload: { toolCall: { name: 'run_command', args: { CommandLine: 'Set-Content -Path src/Program.cs -Value hello' } } } },

  // Rule 9 deny cases
  { name: 'deny_hardcode_url_ip_cs', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Client.cs', Content: `var url = ${q('http://' + ip + ':8080/api')};` } } } },
  { name: 'deny_hardcode_path_bslash', expected: 'deny', payload: { toolCall: { name: 'edit_file', args: { Path: 'src/Loader.cs', Replacement: `var p = "${winPath.replaceAll('\\', '\\\\')}";` } } } },
  { name: 'deny_hardcode_path_fslash', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Loader.cs', Content: `var p = ${q(winSlash)};` } } } },
  { name: 'deny_hardcode_linux_home_file', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Loader.cs', Content: `var p = ${q(linuxFile)};` } } } },
  { name: 'deny_hardcode_sleep_cs', expected: 'deny', payload: { toolCall: { name: 'edit_file', args: { Path: 'src/Worker.cs', Replacement: sleepCall } } } },
  { name: 'deny_hardcode_timeout', expected: 'deny', payload: { toolCall: { name: 'edit_file', args: { Path: 'src/Worker.cs', Replacement: timeoutStmt } } } },
  { name: 'deny_hardcode_asyncio_sleep', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/worker.py', Content: pyAsyncSleep } } } },
  { name: 'deny_csharp_password_prop', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Auth.cs', Content: `public string Password { get; set; } = ${q('Sup3rSecret!')};` } } } },
  { name: 'deny_weak_password_literal', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Auth.cs', Content: `string pwd = ${q('password')};` } } } },
  { name: 'deny_jwt_token', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Auth.cs', Content: `var Token = ${q(jwtTok)};` } } } },
  { name: 'deny_backtick_sk_token', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/ai.ts', Content: `const k = ${bt(skTok)};` } } } },
  { name: 'deny_token_alnum_literal', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Auth.cs', Content: `var Token = ${q('abc123def456ghi789')};` } } } },
  { name: 'deny_connection_string_password', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Db.cs', Content: `var cs = ${q(connStr)};` } } } },

  // Must ALLOW cases (zero false positives)
  { name: 'allow_forgot_password_ui_text', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'src/LoginVm.cs', Content: 'Password = "Forgot password?";' } } } },
  { name: 'allow_aspnet_antiforgery_token', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'src/SecurityHeaders.cs', Content: 'var Token = "AntiForgeryToken";' } } } },
  { name: 'allow_csharp_password_label', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'src/LoginVm.cs', Content: 'public string Password { get; set; } = "PasswordLabel";' } } } },
  { name: 'allow_parameterized_conn_string', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Db.ts', Content: 'const cs = `Server=db;Password=${process.env.DB_PASS};`;' } } } },
  { name: 'allow_mvc_home_privacy_route', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Controllers/HomeController.cs', Content: 'return RedirectToAction("Index", "/home/privacy");' } } } },
  { name: 'allow_nested_web_route', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'src/App.tsx', Content: 'navigate("/home/account/settings");' } } } },
  { name: 'allow_git_commit_msg_mentioning_sed', expected: 'allow', payload: { toolCall: { name: 'run_command', args: { CommandLine: 'git add -A && git commit -m "Block sed -i and Set-Content"' } } } },
  { name: 'allow_test_file_ip', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'tests/Client.test.ts', Content: `const host = ${q(loopIp)};` } } } },
  { name: 'allow_markdown_doc', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'README.md', Content: `Example ${ip} and ${sleepCall}` } } } },
  { name: 'allow_clean_ts', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'src/client.ts', Content: 'const host = process.env.HOST ?? "localhost";' } } } },
  { name: 'allow_dotnet_test', expected: 'allow', payload: { toolCall: { name: 'run_command', args: { CommandLine: 'dotnet test --no-build' } } } }
];

let failed = 0;
for (const c of cases) {
  const out = execFileSync('node', [hookPath], { input: JSON.stringify(c.payload), encoding: 'utf-8' });
  const parsed = JSON.parse(out);
  const ok = parsed.decision === c.expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}: expected=${c.expected} actual=${parsed.decision}`);
}
console.log(`GUARD SUMMARY: ${cases.length - failed}/${cases.length} passed`);
process.exit(failed > 0 ? 1 : 0);
