import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendJournalEntry,
  computeWorkingTreeDiffHash,
  replayJournal,
  resumeFromJournal
} from '../skills/hermes/scripts/journal.mjs';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

let totalTests = 0;
let failed = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-journal-test-'));

// 1. Basic append and diffHash calculation
await test('append_journal_entry_with_diffhash_and_otel', () => {
  const entry = appendJournalEntry(tmpDir, {
    type: 'tool_execution',
    action: 'edit_file',
    details: { file: 'src/app.ts' },
    'gen_ai.tool.name': 'edit_file',
    'gen_ai.usage.input_tokens': 120,
    'gen_ai.usage.output_tokens': 45
  });

  if (!entry) throw new Error('appendJournalEntry returned null');
  if (!entry.diffHash) throw new Error('Missing diffHash in journal entry');
  if (entry['gen_ai.tool.name'] !== 'edit_file') throw new Error('Missing OTel tool name');
  if (entry['gen_ai.usage.input_tokens'] !== 120) throw new Error('Missing OTel input tokens');

  const journalPath = path.join(tmpDir, '.hermes', 'journal.jsonl');
  if (!fs.existsSync(journalPath)) throw new Error('journal.jsonl not created');
  const lines = fs.readFileSync(journalPath, 'utf-8').trim().split('\n');
  if (lines.length !== 1) throw new Error(`Expected 1 line in journal, got ${lines.length}`);
});

// 2. Wave transitions and replay state reconstruction
await test('replay_journal_wave_transitions', () => {
  appendJournalEntry(tmpDir, {
    type: 'wave_transition',
    wave: 'Wave-1-Scout',
    action: 'scout_start',
    details: { status: 'STARTED' }
  });
  appendJournalEntry(tmpDir, {
    type: 'wave_transition',
    wave: 'Wave-1-Scout',
    action: 'scout_finish',
    details: { status: 'COMPLETED' }
  });
  appendJournalEntry(tmpDir, {
    type: 'wave_transition',
    wave: 'Wave-2-Write',
    action: 'write_start',
    details: { status: 'STARTED' }
  });

  const state = replayJournal(tmpDir);
  if (state.currentWave !== 'Wave-2-Write') {
    throw new Error(`Expected currentWave 'Wave-2-Write', got '${state.currentWave}'`);
  }
  if (!state.completedWaves.includes('Wave-1-Scout')) {
    throw new Error('Expected completedWaves to include Wave-1-Scout');
  }
});

// 3. Crash recovery mid-wave simulation
await test('crash_mid_wave_recovery_simulation', () => {
  // Simulate mid-wave tool execution before sudden abort
  appendJournalEntry(tmpDir, {
    type: 'tool_execution',
    wave: 'Wave-2-Write',
    action: 'write_file',
    details: { file: 'src/Service.cs' }
  });

  const resume = resumeFromJournal(tmpDir);
  if (resume.recoveryPlan.resumedWave !== 'Wave-2-Write') {
    throw new Error(`Expected recovery wave Wave-2-Write, got ${resume.recoveryPlan.resumedWave}`);
  }
  if (resume.recoveryPlan.actionsToReplay < 1) {
    throw new Error('Expected actionsToReplay >= 1');
  }
  if (!resume.isConsistent) {
    throw new Error('Expected clean working tree to be consistent');
  }
});

// 4. Drift detection when working tree diffHash diverges
await test('resume_detects_drift_when_diffhash_diverges', () => {
  // Append an entry with a synthetic previous diffHash
  appendJournalEntry(tmpDir, {
    type: 'checkpoint',
    wave: 'Wave-2-Write',
    diffHash: 'synthetic_old_hash_12345'
  });

  const resume = resumeFromJournal(tmpDir);
  if (resume.isConsistent) {
    throw new Error('Expected isConsistent=false when diffHash diverges');
  }
  if (!resume.recoveryPlan.driftDetected) {
    throw new Error('Expected driftDetected=true');
  }
});

// 5. Auto-rotation at 512 KB
await test('journal_auto_rotation_at_512kb', () => {
  const rotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-journal-rot-'));
  const hermesDir = path.join(rotDir, '.hermes');
  fs.mkdirSync(hermesDir, { recursive: true });
  const journalPath = path.join(hermesDir, 'journal.jsonl');

  // Fill journal to 512 KB
  const dummyBlock = JSON.stringify({ type: 'dummy', text: 'x'.repeat(1024) }) + '\n';
  const blockCount = 513; // > 512 KB
  fs.writeFileSync(journalPath, dummyBlock.repeat(blockCount), 'utf-8');

  // Next append must trigger rotation
  appendJournalEntry(rotDir, { type: 'post_rotation_event' });

  const rotPath = path.join(hermesDir, 'journal.1.jsonl');
  if (!fs.existsSync(rotPath)) throw new Error('Expected journal.1.jsonl to exist after rotation');
  const newJournal = fs.readFileSync(journalPath, 'utf-8').trim().split('\n');
  if (newJournal.length !== 1) {
    throw new Error(`Expected new journal to have exactly 1 record after rotation, got ${newJournal.length}`);
  }
});

console.log(`JOURNAL SUMMARY: ${totalTests - failed}/${totalTests} passed`);
if (failed > 0) process.exit(1);
