import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
const connStrNoSemi = ['Server=db;', 'Password', '=', 'Sup3rSecret!'].join('');

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
  { name: 'deny_git_commit_unquoted_m_then_sed_i', expected: 'deny', payload: { toolCall: { name: 'run_command', args: { CommandLine: 'git commit -m foo;sed -i s/a/b/ app.ts' } } } },
  { name: 'deny_sed_i_bak', expected: 'deny', payload: { toolCall: { name: 'run_command', args: { CommandLine: 'sed -i.bak s/a/b/ src/app.ts' } } } },
  { name: 'deny_sed_in_place', expected: 'deny', payload: { toolCall: { name: 'run_command', args: { CommandLine: 'sed --in-place s/a/b/ src/app.ts' } } } },

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
  { name: 'deny_connection_string_no_trailing_semicolon', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Db.cs', Content: `var cs = ${q(connStrNoSemi)};` } } } },
  { name: 'deny_ts_typed_secret', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Auth.ts', Content: `const apiKey: string = ${q('abc123def456')};` } } } },
  { name: 'deny_go_walrus_secret', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/auth.go', Content: `apiKey := ${q('abc123def456')}` } } } },
  { name: 'deny_task_delay_with_ct', expected: 'deny', payload: { toolCall: { name: 'edit_file', args: { Path: 'src/Worker.cs', Replacement: 'await Task.Delay(5000, cancellationToken);' } } } },
  { name: 'deny_razor_secret', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Page.razor', Content: `var Token = ${q('abc123def456ghi789')};` } } } },

  // Must ALLOW cases (zero false positives)
  { name: 'allow_rg_quoted_gt_before_ts', expected: 'allow', payload: { toolCall: { name: 'run_command', args: { CommandLine: 'rg "a > b" src/app.ts' } } } },
  { name: 'allow_users_web_avatar_route', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'src/App.tsx', Content: 'const x = "/users/me/avatar.png";' } } } },
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
  { name: 'allow_dotnet_test', expected: 'allow', payload: { toolCall: { name: 'run_command', args: { CommandLine: 'dotnet test --no-build' } } } },

  // Env/config fallback defaults are not hardcode (literal is overridable)
  { name: 'allow_env_fallback_loopback_ts', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'src/config.ts', Content: `export const host = process.env.HOST ?? ${q(loopIp)};` } } } },
  { name: 'allow_env_or_fallback_js', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'src/config.js', Content: `const host = process.env.HOST || ${q(loopIp)};` } } } },
  { name: 'allow_python_getenv_default', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'src/settings.py', Content: `HOST = os.getenv(${q('HOST')}, ${q(ip)})` } } } },
  { name: 'allow_python_getenv_or_default', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'src/settings.py', Content: `HOST = os.getenv(${q('HOST')}) or ${q(loopIp)}` } } } },
  { name: 'allow_csharp_getvalue_default', expected: 'allow', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Startup.cs', Content: `var host = config.GetValue<string>(${q('Plc:Host')}, ${q(ip)});` } } } },
  { name: 'deny_env_fallback_secret_still_leaks', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/ai.ts', Content: `const k = process.env.OPENAI_KEY ?? ${q(skTok)};` } } } },
  { name: 'deny_ip_next_to_unrelated_fallback', expected: 'deny', payload: { toolCall: { name: 'write_file', args: { Path: 'src/Client.ts', Content: `const name = process.env.NAME ?? ${q('svc')}; const url = ${q('http://' + ip + '/api')};` } } } },

  // Activation: Rules 8/9 apply only in Hermes Mode
  { name: 'allow_non_hermes_sed_i', expected: 'allow', hermes: false, payload: { toolCall: { name: 'run_command', args: { CommandLine: 'sed -i s/a/b/g src/app.ts' } } } },
  { name: 'allow_non_hermes_hardcoded_ip', expected: 'allow', hermes: false, payload: { toolCall: { name: 'write_file', args: { Path: 'src/Client.cs', Content: `var url = ${q('http://' + ip + ':8080/api')};` } } } },
  { name: 'allow_mid_sentence_hermes_mention', expected: 'allow', hermes: false, payload: { lastUserInput: 'почему правило активно без вызова /hermes ?', toolCall: { name: 'run_command', args: { CommandLine: 'git apply fix.diff' } } } },
  { name: 'allow_hermes_only_in_metadata', expected: 'allow', hermes: false, payload: { lastUserInput: `<USER_REQUEST>\nчто такое режим hermes?\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\n/hermes is a [Slash Command]: hermes-fleet/skills/hermes/SKILL.md\n</ADDITIONAL_METADATA>`, toolCall: { name: 'run_command', args: { CommandLine: 'git apply fix.diff' } } } },
  { name: 'deny_hermes_slash_inside_user_request', expected: 'deny', hermes: false, payload: { lastUserInput: '<USER_REQUEST>\n/hermes fix backend\n</USER_REQUEST>', toolCall: { name: 'run_command', args: { CommandLine: 'git apply fix.diff' } } } },
  { name: 'deny_hermes_via_at_specialist', expected: 'deny', hermes: false, payload: { lastUserInput: '@dmitry поправь API', toolCall: { name: 'run_command', args: { CommandLine: 'git apply fix.diff' } } } },
  { name: 'deny_hermes_via_transcript_history', expected: 'deny', hermes: false, transcript: [{ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\n/hermes refactor\n</USER_REQUEST>' }, { step_index: 1, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: 'продолжай' }], payload: { lastUserInput: 'продолжай', toolCall: { name: 'run_command', args: { CommandLine: 'git apply fix.diff' } } } },
  { name: 'allow_transcript_without_hermes', expected: 'allow', hermes: false, transcript: [{ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: 'fix a typo' }], payload: { lastUserInput: 'fix a typo', toolCall: { name: 'run_command', args: { CommandLine: 'git apply fix.diff' } } } },

  // Rule 12: Model Handshake (ask_question) & Model tier handling on invoke_subagent
  { name: 'deny_invoke_subagent_without_model_handshake', expected: 'deny', hermes: false, transcript: [{ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\n/hermes посмотри баг\n</USER_REQUEST>' }], payload: { lastUserInput: '/hermes посмотри баг', toolCall: { name: 'invoke_subagent', args: { TypeName: 'viktor', Model: 'flash' } } } },
  { name: 'allow_invoke_subagent_after_ask_question', expected: 'allow', hermes: false, transcript: [{ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\n/hermes посмотри баг\n</USER_REQUEST>' }, { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'ask_question', args: {} }] }], payload: { lastUserInput: 'Gemini 3.8 Flash', toolCall: { name: 'invoke_subagent', args: { TypeName: 'viktor', Model: 'flash' } } } },
  { name: 'allow_invoke_subagent_inherit_on_flash_high', expected: 'allow', payload: { modelName: 'gemini-3.8-flash-high', toolCall: { name: 'invoke_subagent', args: { TypeName: 'kritik', Model: 'inherit' } } } },
  { name: 'deny_invoke_subagent_invalid_model_enum', expected: 'deny', payload: { modelName: 'gemini-3.8-flash-high', toolCall: { name: 'invoke_subagent', args: { TypeName: 'kritik', Model: 'gemini-3.8-flash-high' } } } },
  { name: 'allow_invoke_subagent_tier_high_with_inherit', expected: 'allow', payload: { modelName: 'gemini-3.8-flash-high', checkpointText: '- **Subagent Model:** `Gemini 3.8 Flash (High)`', toolCall: { name: 'invoke_subagent', args: { TypeName: 'kritik', Model: 'inherit' } } } },
  { name: 'deny_invoke_subagent_tier_high_downgrade_to_flash', expected: 'deny', payload: { modelName: 'gemini-3.8-flash-high', checkpointText: '- **Subagent Model:** `Gemini 3.8 Flash (High)`', toolCall: { name: 'invoke_subagent', args: { TypeName: 'kritik', Model: 'flash' } } } },
  { name: 'deny_invoke_subagent_tier_medium_overspend_inherit_on_high_host', expected: 'deny', payload: { modelName: 'gemini-3.8-flash-high', checkpointText: '- **Subagent Model:** `Gemini 3.8 Flash (Medium)`', toolCall: { name: 'invoke_subagent', args: { TypeName: 'kritik', Model: 'inherit' } } } },
  { name: 'allow_invoke_subagent_tier_medium_with_flash', expected: 'allow', payload: { modelName: 'gemini-3.8-flash-high', checkpointText: '- **Subagent Model:** `Gemini 3.8 Flash (Medium)`', toolCall: { name: 'invoke_subagent', args: { TypeName: 'kritik', Model: 'flash' } } } },
  { name: 'allow_invoke_subagent_tier_low_with_flash_lite', expected: 'allow', payload: { modelName: 'gemini-3.8-flash-high', checkpointText: '- **Subagent Model:** `Gemini 3.8 Flash (Low)`', toolCall: { name: 'invoke_subagent', args: { TypeName: 'kritik', Model: 'flash_lite' } } } },
  { name: 'deny_invoke_subagent_tier_low_overspend_with_flash', expected: 'deny', payload: { modelName: 'gemini-3.8-flash-high', checkpointText: '- **Subagent Model:** `Gemini 3.8 Flash (Low)`', toolCall: { name: 'invoke_subagent', args: { TypeName: 'kritik', Model: 'flash' } } } },
  { name: 'allow_browser_subagent_without_handshake', expected: 'allow', hermes: false, transcript: [{ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\n/hermes посмотри баг\n</USER_REQUEST>' }], payload: { lastUserInput: '/hermes посмотри баг', toolCall: { name: 'invoke_subagent', args: { TypeName: 'browser', Model: 'flash' } } } },
  { name: 'deny_premature_kill_all_before_subagent_replies', expected: 'deny', hermes: false, transcript: [{ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\n/hermes fix ui\n</USER_REQUEST>' }, { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'invoke_subagent', args: { TypeName: 'elena', Model: 'flash' } }] }, { step_index: 2, source: 'MODEL', type: 'GENERIC', content: 'Created the following subagent:\n{\n  "conversationId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"\n}' }], payload: { lastUserInput: '/hermes fix ui', toolCall: { name: 'manage_subagents', args: { Action: 'kill_all' } } } },
  { name: 'allow_kill_all_after_subagent_replied', expected: 'allow', hermes: false, transcript: [{ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\n/hermes fix ui\n</USER_REQUEST>' }, { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'invoke_subagent', args: { TypeName: 'elena', Model: 'flash' } }] }, { step_index: 2, source: 'MODEL', type: 'GENERIC', content: 'Created the following subagent:\n{\n  "conversationId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"\n}' }, { step_index: 3, source: 'SYSTEM', type: 'SYSTEM_MESSAGE', content: '[Message] sender=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee content=[DESIGN PASS]' }], payload: { lastUserInput: '/hermes fix ui', toolCall: { name: 'manage_subagents', args: { Action: 'kill_all' } } } },
  { name: 'deny_post_edit_subagent_without_asking_user_first', expected: 'deny', hermes: false, transcript: [{ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\n/hermes fix button\n</USER_REQUEST>' }, { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'ask_question', args: {} }] }, { step_index: 2, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\nпродолжай\n</USER_REQUEST>' }, { step_index: 3, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'edit_file', args: { Path: 'src/MainForm.cs' } }] }], payload: { lastUserInput: 'продолжай', toolCall: { name: 'invoke_subagent', args: { TypeName: 'viktor', Model: 'flash' } } } },
  { name: 'allow_post_edit_subagent_after_asking_user', expected: 'allow', hermes: false, transcript: [{ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\n/hermes fix button\n</USER_REQUEST>' }, { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'ask_question', args: {} }] }, { step_index: 2, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\nпродолжай\n</USER_REQUEST>' }, { step_index: 3, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'edit_file', args: { Path: 'src/MainForm.cs' } }] }, { step_index: 4, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'ask_question', args: {} }] }], payload: { lastUserInput: 'продолжай', toolCall: { name: 'invoke_subagent', args: { TypeName: 'viktor', Model: 'flash' } } } },
  { name: 'deny_run_command_before_handshake_even_with_settings_change_and_checkpoint', expected: 'deny', hermes: false, transcript: [{ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\n/hermes этот список станков можно сделать стиль как левый основной меню ?\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 3.8 Flash (High).\n</USER_SETTINGS_CHANGE>' }, { step_index: 1, source: 'SYSTEM_SDK', type: 'SYSTEM_MESSAGE', content: '<!-- HERMES_PROTOCOL_LOADED -->\n- **Subagent Model:** `Gemini 3.8 Flash (High)` -> `Model: "flash"`' }], payload: { lastUserInput: '/hermes этот список станков можно сделать стиль как левый основной меню ?', toolCall: { name: 'run_command', args: { CommandLine: 'Get-ChildItem -Recurse -Filter "*.cs"' } } } },
  { name: 'deny_read_project_file_before_model_handshake', expected: 'deny', hermes: false, transcript: [{ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\n/hermes проверь форму\n</USER_REQUEST>' }], payload: { lastUserInput: '/hermes проверь форму', toolCall: { name: 'read_file', args: { Path: 'E:\\PRO\\SERVER_Modernized\\LoomConnectionSettingsForm.cs' } } } },
  { name: 'allow_read_skill_md_before_model_handshake', expected: 'allow', hermes: false, transcript: [{ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>\n/hermes проверь форму\n</USER_REQUEST>' }], payload: { lastUserInput: '/hermes проверь форму', toolCall: { name: 'read_file', args: { Path: 'C:\\Users\\User\\.gemini\\config\\plugins\\hermes-fleet\\skills\\hermes\\SKILL.md' } } } },
  { name: 'allow_subagent_run_command_without_own_handshake', expected: 'allow', hermes: false, transcript: [{ step_index: 0, source: 'SYSTEM', type: 'SYSTEM_MESSAGE', content: '[Message] sender=f4d054f4-bbad-455f-85c8-ed9a9c607a9c content=Ты — Елена (@elena)' }], payload: { lastUserInput: '', toolCall: { name: 'run_command', args: { CommandLine: 'Select-String -Path "ServerTheme.cs" -Pattern "TreeView"' } } } }
];

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-guard-test-'));

function buildInput(c, index) {
  const input = c.hermes === false ? { ...c.payload } : { lastUserInput: '/hermes test', ...c.payload };
  if (c.transcript) {
    const p = path.join(tmpDir, `t${index}.jsonl`);
    fs.writeFileSync(p, c.transcript.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf-8');
    input.transcriptPath = p;
  }
  return input;
}

let failed = 0;
try {
  cases.forEach((c, index) => {
    const out = execFileSync('node', [hookPath], { input: JSON.stringify(buildInput(c, index)), encoding: 'utf-8' });
    const parsed = JSON.parse(out);
    const ok = parsed.decision === c.expected;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}: expected=${c.expected} actual=${parsed.decision}`);
  });
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
console.log(`GUARD SUMMARY: ${cases.length - failed}/${cases.length} passed`);
process.exit(failed > 0 ? 1 : 0);
