// skills/compliance-policy-as-code/scripts/verify-thermonuclear-review.mjs
// Automated verification test for thermo-nuclear-code-quality-review skill reference.
// Validates presence, 4 inspection vectors, severity ledger, and agent integration.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '../../..');

console.log('☢️  [VERIFY THERMO-NUCLEAR] Testing thermo-nuclear-code-quality-review skill...');

let passed = 0;
let total = 0;

function check(name, fn) {
  total++;
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}: ${err.message}`);
  }
}

// 1. File existence
const refPath = path.join(rootDir, 'skills', 'compliance-policy-as-code', 'references', 'thermo-nuclear-code-quality-review.md');
check('ref_file_exists', () => {
  if (!fs.existsSync(refPath)) throw new Error('thermo-nuclear-code-quality-review.md is missing');
});

const content = fs.existsSync(refPath) ? fs.readFileSync(refPath, 'utf-8') : '';

// 2. Blast radius inspection vector
check('blast_radius_vector_defined', () => {
  if (!content.includes('Blast Radius') || !content.includes('Cross-Subsystem Side-Effects')) {
    throw new Error('Missing blast radius and cross-subsystem inspection vector');
  }
});

// 3. Anti-code-slop and abstraction hygiene
check('anti_code_slop_vector_defined', () => {
  if (!content.includes('Anti-Code-Slop') || !content.includes('Abstraction Hygiene')) {
    throw new Error('Missing anti-code-slop and abstraction hygiene vector');
  }
});

// 4. DevEx and configuration contracts (Zero-Hardcode Rule 9)
check('devex_config_contracts_vector_defined', () => {
  if (!content.includes('Zero Hardcoded Configuration') || !content.includes('Rule 9')) {
    throw new Error('Missing Zero-Hardcode configuration contracts verification');
  }
});

// 5. 4-tier severity ledger
check('four_tier_severity_ledger_defined', () => {
  if (!content.includes('P0: Blocker') || !content.includes('P1: Architectural Defect') || !content.includes('P2: Reliability')) {
    throw new Error('Missing 4-tier severity ledger (P0/P1/P2/P3)');
  }
});

// 6. Skill.md integration
check('skill_md_links_thermonuclear_reference', () => {
  const skillPath = path.join(rootDir, 'skills', 'compliance-policy-as-code', 'SKILL.md');
  const skillContent = fs.readFileSync(skillPath, 'utf-8');
  if (!skillContent.includes('thermo-nuclear-code-quality-review.md')) {
    throw new Error('skills/compliance-policy-as-code/SKILL.md does not reference thermo-nuclear-code-quality-review.md');
  }
});

// 7. Stanislav card budget & reference
check('agent_stanislav_budget_and_reference', () => {
  const stanislavPath = path.join(rootDir, 'agents', 'stanislav.md');
  const stanislavContent = fs.readFileSync(stanislavPath, 'utf-8');
  const size = fs.statSync(stanislavPath).size;
  if (size > 5120) {
    throw new Error(`agents/stanislav.md size (${size} bytes) exceeds 5120 bytes budget ceiling`);
  }
  if (!stanislavContent.includes('thermo-nuclear-code-quality-review.md')) {
    throw new Error('agents/stanislav.md does not reference thermo-nuclear-code-quality-review.md');
  }
});

// 8. Viktor card budget & reference
check('agent_viktor_budget_and_reference', () => {
  const viktorPath = path.join(rootDir, 'agents', 'viktor.md');
  const viktorContent = fs.readFileSync(viktorPath, 'utf-8');
  const size = fs.statSync(viktorPath).size;
  if (size > 5120) {
    throw new Error(`agents/viktor.md size (${size} bytes) exceeds 5120 bytes budget ceiling`);
  }
  if (!viktorContent.includes('thermo-nuclear-code-quality-review.md')) {
    throw new Error('agents/viktor.md does not reference thermo-nuclear-code-quality-review.md');
  }
});

console.log(`\nTHERMO-NUCLEAR SUMMARY: ${passed}/${total} passed`);
if (passed !== total) process.exit(1);
