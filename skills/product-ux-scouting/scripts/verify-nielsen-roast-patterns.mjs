#!/usr/bin/env node
/**
 * verify-nielsen-roast-patterns.mjs
 * Mechanical verification script for Kritik's Nielsen Ergonomics Roast & UX Audit skill.
 * Tests documentation integrity, 10 Nielsen heuristics, 0-4 severity rating, Fitts's law, and agent alignment.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');

const manualPath = resolve(rootDir, 'skills/product-ux-scouting/references/nielsen-ergonomics-roast.md');
const skillPath = resolve(rootDir, 'skills/product-ux-scouting/SKILL.md');
const agentPath = resolve(rootDir, 'agents/kritik.md');

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

console.log('--- Kritik Nielsen Ergonomics Roast Skill Verification ---');

// 1. Manual file exists and is non-empty
assert(existsSync(manualPath), 'nielsen-ergonomics-roast.md reference manual exists');
const manualContent = existsSync(manualPath) ? readFileSync(manualPath, 'utf8') : '';
assert(manualContent.length > 1000, 'Manual contains comprehensive content (>1000 chars)');

// 2. 10 Nielsen heuristics
assert(manualContent.includes('Visibility of System Status') && manualContent.includes('Error Prevention'), '10 Nielsen heuristics table documented');

// 3. Severity 0-4 rating scale
assert(manualContent.includes('0 = Not a usability problem') && manualContent.includes('4 = Usability catastrophe'), 'Nielsen 0-4 severity rating scale documented');

// 4. Fitts's Law
assert(manualContent.includes("Fitts's Law") || manualContent.includes('log_2'), 'Fitts\'s Law for touch panels documented');

// 5. Touch target 48x48px rule
assert(manualContent.includes('48') && manualContent.includes('touch'), 'Touch target sizing rule documented');

// 6. Alarm silence 1-click rule
assert(manualContent.includes('Alarm Silence') && manualContent.includes('1 click'), 'Single-click alarm silence rule documented');

// 7. Skill manifest references the playbook
const skillContent = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
assert(skillContent.includes('nielsen-ergonomics-roast.md'), 'SKILL.md references nielsen-ergonomics-roast.md');

// 8. Agent card alignment
const agentContent = existsSync(agentPath) ? readFileSync(agentPath, 'utf8') : '';
assert(agentContent.includes('nielsen-ergonomics-roast') || agentContent.includes('Nielsen'), 'Kritik agent card aligns with Nielsen roast skill');

console.log(`\nResult: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
