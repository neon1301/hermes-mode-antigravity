#!/usr/bin/env node
/**
 * verify-office-documents-patterns.mjs
 * Mechanical verification script for Office Documents (.xlsx & .docx) skill.
 * Tests documentation integrity, formula-first invariants, keep_with_next heading rules, and security checks.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');

const skillPath = resolve(rootDir, 'skills/office-documents/SKILL.md');
const xlsxRefPath = resolve(rootDir, 'skills/office-documents/references/xlsx-standards.md');
const docxRefPath = resolve(rootDir, 'skills/office-documents/references/docx-standards.md');
const validatorPath = resolve(rootDir, 'skills/office-documents/scripts/office-validator.py');

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

console.log('--- Office Documents (.xlsx & .docx) Skill Verification ---');

// 1. Files existence
assert(existsSync(skillPath), 'SKILL.md exists');
assert(existsSync(xlsxRefPath), 'xlsx-standards.md exists');
assert(existsSync(docxRefPath), 'docx-standards.md exists');
assert(existsSync(validatorPath), 'office-validator.py exists');

// 2. SKILL.md content & size
const skillContent = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
assert(skillContent.includes('name: office-documents'), 'SKILL.md has correct name in frontmatter');
assert(skillContent.includes('openpyxl') && skillContent.includes('python-docx'), 'SKILL.md documents core tool stack');

// 3. Excel invariants
const xlsxContent = existsSync(xlsxRefPath) ? readFileSync(xlsxRefPath, 'utf8') : '';
assert(xlsxContent.includes('=SUM('), 'xlsx-standards.md documents formula-first requirement');
assert(xlsxContent.includes('sanitize_cell_value'), 'xlsx-standards.md documents formula injection defense');

// 4. Word invariants
const docxContent = existsSync(docxRefPath) ? readFileSync(docxRefPath, 'utf8') : '';
assert(docxContent.includes('keep_with_next'), 'docx-standards.md documents keep_with_next heading invariant');
assert(docxContent.includes('tblHeader'), 'docx-standards.md documents table header repetition');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log(`Office Documents Verification PASS: ${passedTests}/${totalTests} checks passed.`);
}
