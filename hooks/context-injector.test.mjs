import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hookPath = path.join(__dirname, 'context-injector.mjs');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-ctx-inj-test-'));

function writeTranscript(name, steps) {
  const p = path.join(tmpDir, `${name}.jsonl`);
  fs.writeFileSync(p, steps.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf-8');
  return p;
}

function runInjector(payload) {
  const out = execFileSync('node', [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf-8'
  });
  return JSON.parse(out);
}

const cases = [
  {
    name: 'skip_non_hermes_normal_chat',
    check: (res) => !res.injectSteps,
    run: () => runInjector({
      lastUserInput: 'Fix a bug in Program.cs',
      transcriptPath: writeTranscript('normal', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: 'Fix a bug in Program.cs' }
      ])
    })
  },
  {
    name: 'skip_when_system_context_only_mentions_hermes_without_trigger',
    check: (res) => !res.injectSteps,
    run: () => runInjector({
      lastUserInput: 'Explain C# records',
      transcriptPath: writeTranscript('sys_only', [
        { step_index: 0, source: 'SYSTEM', type: 'SYSTEM_MESSAGE', content: 'loaded hermes-fleet plugin' },
        { step_index: 1, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: 'Explain C# records' }
      ])
    })
  },
  {
    name: 'inject_once_on_slash_hermes_trigger',
    check: (res) => Array.isArray(res.injectSteps)
      && res.injectSteps.length === 1
      && String(res.injectSteps[0]?.systemMessage?.systemMessage || '').includes('<!-- HERMES_PROTOCOL_LOADED -->')
      && String(res.injectSteps[0]?.systemMessage?.systemMessage || '').includes('Zero-Hardcode'),
    run: () => runInjector({
      lastUserInput: '/hermes check architecture',
      transcriptPath: writeTranscript('slash_hermes', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '/hermes check architecture' }
      ])
    })
  },
  {
    name: 'inject_on_cyrillic_at_mozgoeb_mention',
    check: (res) => Array.isArray(res.injectSteps) && res.injectSteps.length === 1,
    run: () => runInjector({
      lastUserInput: '@мозгоеб прожарь интерфейс'
    })
  },
  {
    name: 'dedup_skip_when_protocol_already_in_transcript',
    check: (res) => !res.injectSteps,
    run: () => runInjector({
      lastUserInput: 'continue',
      transcriptPath: writeTranscript('already_loaded', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '/hermes build' },
        { step_index: 1, source: 'SYSTEM', type: 'SYSTEM_MESSAGE', content: '<!-- HERMES_PROTOCOL_LOADED -->\n# Full rules...' },
        { step_index: 2, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: 'continue' }
      ])
    })
  }
];

let failed = 0;
try {
  for (const c of cases) {
    const res = c.run();
    const ok = c.check(res);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}`);
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
console.log(`CONTEXT-INJECTOR SUMMARY: ${cases.length - failed}/${cases.length} passed`);
process.exit(failed > 0 ? 1 : 0);
