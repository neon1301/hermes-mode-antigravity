#!/usr/bin/env node
/**
 * verify-sap-nco-hygiene.mjs
 * Mechanical verification script for Ruslan's SAP NCo Connector & COM Hygiene skill.
 * Tests documentation integrity, COM release patterns, BAPI transaction integrity, and agent alignment.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');

const manualPath = resolve(rootDir, 'skills/sap-enterprise-automation/references/sap-nco-com-hygiene.md');
const skillPath = resolve(rootDir, 'skills/sap-enterprise-automation/SKILL.md');
const agentPath = resolve(rootDir, 'agents/ruslan.md');

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

console.log('--- Ruslan SAP NCo & COM Hygiene Skill Verification ---');

// 1. Manual file exists and is non-empty
assert(existsSync(manualPath), 'sap-nco-com-hygiene.md reference manual exists');
const manualContent = existsSync(manualPath) ? readFileSync(manualPath, 'utf8') : '';
assert(manualContent.length > 1000, 'Manual contains comprehensive content (>1000 chars)');

// 2. Marshal.FinalReleaseComObject pattern
assert(manualContent.includes('Marshal.FinalReleaseComObject'), 'Marshal.FinalReleaseComObject pattern documented');

// 3. BAPI transaction commit with WAIT = X
assert(manualContent.includes('BAPI_TRANSACTION_COMMIT') && manualContent.includes('"WAIT", "X"'), 'BAPI transaction commit with WAIT = X documented');

// 4. BAPI rollback on error
assert(manualContent.includes('BAPI_TRANSACTION_ROLLBACK'), 'BAPI rollback pattern documented');

// 5. RfcSessionManager context handling
assert(manualContent.includes('RfcSessionManager.BeginContext') && manualContent.includes('RfcSessionManager.EndContext'), 'RfcSessionManager Begin/EndContext documented');

// 6. Skill manifest references the playbook
const skillContent = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
assert(skillContent.includes('sap-nco-com-hygiene.md'), 'SKILL.md references sap-nco-com-hygiene.md');

// 7. Agent card alignment
const agentContent = existsSync(agentPath) ? readFileSync(agentPath, 'utf8') : '';
assert(agentContent.includes('sap-nco-com-hygiene') || agentContent.includes('COM'), 'Ruslan agent card aligns with SAP COM hygiene skill');

console.log(`\nResult: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
