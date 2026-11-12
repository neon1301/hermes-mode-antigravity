import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gatePath = path.join(__dirname, 'qa-gate.mjs');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-qa-gate-test-'));

function writeTranscript(name, steps) {
  const p = path.join(tmpDir, `${name}.jsonl`);
  fs.writeFileSync(p, steps.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf-8');
  return p;
}

function runGate(payload) {
  const out = execFileSync('node', [gatePath], { input: JSON.stringify(payload), encoding: 'utf-8' });
  return JSON.parse(out);
}

const cases = [
  {
    name: 'allow_non_hermes_even_with_edits',
    expected: 'allow',
    run: () => runGate({
      conversationId: 'c1',
      terminationReason: 'NO_TOOL_CALL',
      transcriptPath: writeTranscript('t1', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: 'fix one typo' },
        { step_index: 1, type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'edit_file', args: { Path: 'src/a.ts' } }] }
      ])
    })
  },
  {
    name: 'allow_hermes_without_source_edits',
    expected: 'allow',
    run: () => runGate({
      conversationId: 'c2',
      terminationReason: 'NO_TOOL_CALL',
      transcriptPath: writeTranscript('t2', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '/hermes check architecture' },
        { step_index: 1, type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'write_file', args: { Path: 'README.md' } }] }
      ])
    })
  },
  {
    name: 'continue_2_files_missing_qa_pass',
    expected: 'continue',
    run: () => runGate({
      conversationId: 'c3',
      terminationReason: 'NO_TOOL_CALL',
      transcriptPath: writeTranscript('t3', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '/hermes fix backend' },
        {
          step_index: 1,
          type: 'PLANNER_RESPONSE',
          tool_calls: [
            { name: 'edit_file', args: { Path: 'src/a.ts' } },
            { name: 'edit_file', args: { Path: 'src/b.ts' } }
          ]
        }
      ])
    })
  },
  {
    name: 'allow_2_files_with_qa_pass_only',
    expected: 'allow',
    run: () => runGate({
      conversationId: 'c4',
      terminationReason: 'NO_TOOL_CALL',
      transcriptPath: writeTranscript('t4', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '@dmitry fix' },
        {
          step_index: 1,
          type: 'PLANNER_RESPONSE',
          content: '[QA PASS]',
          tool_calls: [
            { name: 'edit_file', args: { Path: 'src/a.ts' } },
            { name: 'edit_file', args: { Path: 'src/b.ts' } }
          ]
        }
      ])
    })
  },
  {
    name: 'continue_4_files_missing_compliance_pass',
    expected: 'continue',
    run: () => runGate({
      conversationId: 'c5',
      terminationReason: 'NO_TOOL_CALL',
      transcriptPath: writeTranscript('t5', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '/hermes refactor module' },
        {
          step_index: 1,
          type: 'PLANNER_RESPONSE',
          content: '[QA PASS]',
          tool_calls: [
            { name: 'edit_file', args: { Path: 'src/1.ts' } },
            { name: 'edit_file', args: { Path: 'src/2.ts' } },
            { name: 'edit_file', args: { Path: 'src/3.ts' } },
            { name: 'edit_file', args: { Path: 'src/4.ts' } }
          ]
        }
      ])
    })
  },
  {
    name: 'allow_4_files_with_both_passes',
    expected: 'allow',
    run: () => runGate({
      conversationId: 'c6',
      terminationReason: 'NO_TOOL_CALL',
      transcriptPath: writeTranscript('t6', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '/hermes refactor module' },
        {
          step_index: 1,
          type: 'PLANNER_RESPONSE',
          content: '[QA PASS] and [COMPLIANCE PASS]',
          tool_calls: [
            { name: 'edit_file', args: { Path: 'src/1.ts' } },
            { name: 'edit_file', args: { Path: 'src/2.ts' } },
            { name: 'edit_file', args: { Path: 'src/3.ts' } },
            { name: 'edit_file', args: { Path: 'src/4.ts' } }
          ]
        }
      ])
    })
  },
  {
    name: 'retry_cap_releases_on_3rd_attempt',
    expected: 'allow',
    run: () => {
      const tp = writeTranscript('t7', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '/hermes edit' },
        { step_index: 1, type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'edit_file', args: { Path: 'src/x.cs' } }] }
      ]);
      const p = { conversationId: `cap-${Date.now()}`, terminationReason: 'NO_TOOL_CALL', transcriptPath: tp };
      const r1 = runGate(p);
      const r2 = runGate(p);
      const r3 = runGate(p);
      if (r1.decision !== 'continue' || r2.decision !== 'continue') {
        return { decision: `unexpected_${r1.decision}_${r2.decision}` };
      }
      return r3;
    }
  }
];

let failed = 0;
for (const c of cases) {
  const res = c.run();
  const ok = res.decision === c.expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}: expected=${c.expected} actual=${res.decision}`);
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`QA-GATE SUMMARY: ${cases.length - failed}/${cases.length} passed`);
process.exit(failed > 0 ? 1 : 0);
