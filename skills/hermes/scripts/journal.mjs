/**
 * Hermes Fleet Enterprise - Durable Recovery Journal (Track B6 & B8)
 * Append-only structured journal of recovery-critical events:
 * tool executions, gate decisions, wave shifts, and working tree diffHash state.
 * Implements safe session resumption and auto-rotation at 512 KB.
 * Adheres to Rule 13 (Data Honesty) & OpenTelemetry GenAI Semantic Conventions.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const MAX_JOURNAL_SIZE = 512 * 1024; // 512 KB, same as gate-log

export function computeWorkingTreeDiffHash(workspaceDir = process.cwd()) {
  try {
    const status = execSync('git status --porcelain', {
      cwd: workspaceDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const diff = execSync('git diff', {
      cwd: workspaceDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return crypto.createHash('sha256').update(status + '\n' + diff).digest('hex').slice(0, 16);
  } catch {
    return '0000000000000000';
  }
}

export function appendJournalEntry(workspaceDir, entry = {}) {
  try {
    const hermesDir = path.join(workspaceDir, '.hermes');
    if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
    const journalPath = path.join(hermesDir, 'journal.jsonl');

    // Auto-rotation at 512 KB
    if (fs.existsSync(journalPath)) {
      const stats = fs.statSync(journalPath);
      if (stats.size >= MAX_JOURNAL_SIZE) {
        const rotPath = path.join(hermesDir, 'journal.1.jsonl');
        try { if (fs.existsSync(rotPath)) fs.unlinkSync(rotPath); } catch {}
        fs.renameSync(journalPath, rotPath);
      }
    }

    const diffHash = entry.diffHash || computeWorkingTreeDiffHash(workspaceDir);
    const record = {
      timestamp: new Date().toISOString(),
      type: entry.type || 'checkpoint', // 'wave_transition' | 'tool_execution' | 'gate_decision' | 'checkpoint' | 'handshake'
      wave: entry.wave || null,
      phase: entry.phase || null,
      action: entry.action || null,
      details: entry.details || {},
      diffHash,
      // OpenTelemetry GenAI semantic conventions (Track B8)
      'gen_ai.operation.name': entry['gen_ai.operation.name'] || `journal.${entry.type || 'event'}`,
      'gen_ai.tool.name': entry['gen_ai.tool.name'] || null,
      'gen_ai.usage.input_tokens': entry['gen_ai.usage.input_tokens'] ?? null,
      'gen_ai.usage.output_tokens': entry['gen_ai.usage.output_tokens'] ?? null
    };

    fs.appendFileSync(journalPath, JSON.stringify(record) + '\n', 'utf-8');
    return record;
  } catch {
    // Fail-open: logging errors must never abort execution
    return null;
  }
}

export function replayJournal(workspaceDir = process.cwd()) {
  const hermesDir = path.join(workspaceDir, '.hermes');
  const journalPath = path.join(hermesDir, 'journal.jsonl');
  if (!fs.existsSync(journalPath)) {
    return {
      entriesCount: 0,
      currentWave: null,
      lastAction: null,
      lastDiffHash: null,
      completedWaves: [],
      gateDecisions: [],
      toolInvocations: []
    };
  }

  const lines = fs.readFileSync(journalPath, 'utf-8').trim().split('\n').filter(Boolean);
  const state = {
    entriesCount: lines.length,
    currentWave: null,
    lastAction: null,
    lastDiffHash: null,
    completedWaves: [],
    gateDecisions: [],
    toolInvocations: []
  };

  for (const line of lines) {
    try {
      const item = JSON.parse(line);
      state.lastDiffHash = item.diffHash || state.lastDiffHash;
      state.lastAction = item.action || item.type;
      if (item.wave) state.currentWave = item.wave;

      if (item.type === 'wave_transition') {
        if (item.details?.status === 'COMPLETED' && item.wave) {
          state.completedWaves.push(item.wave);
        }
      } else if (item.type === 'gate_decision') {
        state.gateDecisions.push(item);
      } else if (item.type === 'tool_execution') {
        state.toolInvocations.push(item);
      }
    } catch {}
  }

  return state;
}

export function resumeFromJournal(workspaceDir = process.cwd()) {
  const state = replayJournal(workspaceDir);
  const currentDiffHash = computeWorkingTreeDiffHash(workspaceDir);
  const hashMatches = state.lastDiffHash ? state.lastDiffHash === currentDiffHash : true;

  return {
    state,
    currentDiffHash,
    isConsistent: hashMatches,
    recoveryPlan: {
      resumedWave: state.currentWave,
      completedWaves: state.completedWaves,
      actionsToReplay: state.toolInvocations.length,
      driftDetected: !hashMatches
    }
  };
}
