#!/usr/bin/env node
/**
 * verify-living-c4-patterns.mjs
 * Mechanical verification script for Anna's Living C4 Architecture & Sequence Flows skill.
 * Tests documentation integrity, Mermaid C4 models, sequence flows, ADR governance, and agent alignment.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');

const manualPath = resolve(rootDir, 'skills/c4-architecture-mermaid/references/c4-mermaid-living-architecture.md');
const skillPath = resolve(rootDir, 'skills/c4-architecture-mermaid/SKILL.md');
const agentPath = resolve(rootDir, 'agents/anna.md');

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

console.log('--- Anna Living C4 Architecture Skill Verification ---');

// 1. Manual file exists and is non-empty
assert(existsSync(manualPath), 'c4-mermaid-living-architecture.md reference manual exists');
const manualContent = existsSync(manualPath) ? readFileSync(manualPath, 'utf8') : '';
assert(manualContent.length > 1000, 'Manual contains comprehensive content (>1000 chars)');

// 2. C4 Container diagram
assert(manualContent.includes('C4Container') && manualContent.includes('System_Boundary'), 'Mermaid C4Container diagram documented');

// 3. Quoted labels rule
assert(manualContent.includes('double-quoted') || manualContent.includes('quoted'), 'Quoted labels rule documented');

// 4. Protocol sequence diagram
assert(manualContent.includes('sequenceDiagram') && manualContent.includes('autonumber'), 'Protocol sequence diagram with autonumber documented');

// 5. Living OpenAPI & RFC 7807
assert(manualContent.includes('RFC 7807') && manualContent.includes('OpenAPI'), 'Living OpenAPI synchronization documented');

// 6. ADR lifecycle
assert(manualContent.includes('ADR-NNNN') && manualContent.includes('Accepted'), 'ADR lifecycle governance documented');

// 7. Skill manifest references the playbook
const skillContent = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
assert(skillContent.includes('c4-mermaid-living-architecture.md'), 'SKILL.md references c4-mermaid-living-architecture.md');

// 8. Agent card alignment
const agentContent = existsSync(agentPath) ? readFileSync(agentPath, 'utf8') : '';
assert(agentContent.includes('c4-mermaid-living-architecture') || agentContent.includes('C4'), 'Anna agent card aligns with living architecture skill');

console.log(`\nResult: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
