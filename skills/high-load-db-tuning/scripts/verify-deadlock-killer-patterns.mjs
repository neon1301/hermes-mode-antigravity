#!/usr/bin/env node
/**
 * verify-deadlock-killer-patterns.mjs
 * Mechanical verification script for Denis's High-Load Deadlock Killer & Concurrency Isolation skill.
 * Tests documentation integrity, C# / SQL code patterns, SQLite WAL pragmas, and agent alignment.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');

const manualPath = resolve(rootDir, 'skills/high-load-db-tuning/references/high-load-deadlock-killer.md');
const skillPath = resolve(rootDir, 'skills/high-load-db-tuning/SKILL.md');
const agentPath = resolve(rootDir, 'agents/denis.md');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
  }
}

console.log('--- Denis Deadlock Killer Skill Verification ---');

// 1. Manual file exists and is non-empty
assert(existsSync(manualPath), 'high-load-deadlock-killer.md reference manual exists');
const manualContent = existsSync(manualPath) ? readFileSync(manualPath, 'utf8') : '';
assert(manualContent.length > 1000, 'Manual contains comprehensive content (>1000 chars)');

// 2. RCSI documented
assert(manualContent.includes('READ_COMMITTED_SNAPSHOT ON'), 'RCSI T-SQL command is documented');

// 3. Lock escalation defense documented
assert(manualContent.includes('TOP (@BatchSize)') || manualContent.includes('DELETE TOP'), 'Chunked DML batch pattern documented');

// 4. Deadlock 1205 retry pattern in C#
assert(manualContent.includes('1205') && manualContent.includes('SqlException'), 'Deadlock 1205 retry handler in C# documented');

// 5. SQLite WAL and busy_timeout pragmas
assert(manualContent.includes('journal_mode = WAL') && manualContent.includes('busy_timeout = 5000'), 'SQLite WAL and busy_timeout pragmas documented');

// 6. SQLite BEGIN IMMEDIATE guard
assert(manualContent.includes('BEGIN IMMEDIATE'), 'SQLite BEGIN IMMEDIATE pattern documented');

// 7. Deadlock graph XML elements
assert(manualContent.includes('<victim-list>') && manualContent.includes('<keylock>'), 'Deadlock Graph XML triage documented');

// 8. Skill manifest references the playbook
const skillContent = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
assert(skillContent.includes('high-load-deadlock-killer.md'), 'SKILL.md references high-load-deadlock-killer.md');

// 9. Agent card alignment
const agentContent = existsSync(agentPath) ? readFileSync(agentPath, 'utf8') : '';
assert(agentContent.includes('high-load-deadlock-killer') || agentContent.includes('deadlock'), 'Denis agent card aligns with deadlock killer skill');

console.log(`\nResult: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
