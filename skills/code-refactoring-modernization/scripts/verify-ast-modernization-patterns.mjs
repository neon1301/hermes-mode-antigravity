#!/usr/bin/env node
/**
 * verify-ast-modernization-patterns.mjs
 * Mechanical verification script for Sergey's Modern C# Refactoring & AST Modernization skill.
 * Tests documentation integrity, C# 14 pattern matching, guard clause inversion, partial splitting, and agent alignment.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');

const manualPath = resolve(rootDir, 'skills/code-refactoring-modernization/references/csharp-ast-modernization.md');
const skillPath = resolve(rootDir, 'skills/code-refactoring-modernization/SKILL.md');
const agentPath = resolve(rootDir, 'agents/sergey.md');

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

console.log('--- Sergey C# AST Modernization Skill Verification ---');

// 1. Manual file exists and is non-empty
assert(existsSync(manualPath), 'csharp-ast-modernization.md reference manual exists');
const manualContent = existsSync(manualPath) ? readFileSync(manualPath, 'utf8') : '';
assert(manualContent.length > 1000, 'Manual contains comprehensive content (>1000 chars)');

// 2. Monolith partial class split
assert(manualContent.includes('partial class MainForm') && manualContent.includes('MainForm.Telemetry.cs'), 'Monolith partial class split documented');

// 3. Flattening with Guard Clauses
assert(manualContent.includes('ArgumentNullException.ThrowIfNull') || manualContent.includes('Guard Clauses'), 'Guard clauses flattening documented');

// 4. Pattern matching switch expressions
assert(manualContent.includes('ev switch') && manualContent.includes('SpeedAlarmEvent'), 'C# pattern matching switch expressions documented');

// 5. Primary constructors
assert(manualContent.includes('public sealed class TelemetryService('), 'C# primary constructors pattern documented');

// 6. Breaking cyclic dependencies
assert(manualContent.includes('IStatusSink') && manualContent.includes('Decoupling Interface'), 'Breaking cyclic dependencies documented');

// 7. Skill manifest references the playbook
const skillContent = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
assert(skillContent.includes('csharp-ast-modernization.md'), 'SKILL.md references csharp-ast-modernization.md');

// 8. Agent card alignment
const agentContent = existsSync(agentPath) ? readFileSync(agentPath, 'utf8') : '';
assert(agentContent.includes('csharp-ast-modernization') || agentContent.includes('AST'), 'Sergey agent card aligns with AST modernization skill');

console.log(`\nResult: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
