// skills/qa-test-automation/scripts/verify-flaui-desktop-e2e.mjs
// Automated verification test for flaui-desktop-e2e skill reference.
// Validates presence, 5 FlaUI automation pillars, C# syntax sanity, and agent integration.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '../../..');

console.log('🤖 [VERIFY FLAUI] Testing flaui-desktop-e2e skill...');

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
const refPath = path.join(rootDir, 'skills', 'qa-test-automation', 'references', 'flaui-desktop-e2e.md');
check('ref_file_exists', () => {
  if (!fs.existsSync(refPath)) throw new Error('flaui-desktop-e2e.md is missing');
});

const content = fs.existsSync(refPath) ? fs.readFileSync(refPath, 'utf-8') : '';

// 2. Automation engine UIA2 vs UIA3
check('automation_engine_selection_defined', () => {
  if (!content.includes('UIA2Automation') || !content.includes('UIA3Automation')) {
    throw new Error('Missing UIA2Automation and UIA3Automation engine selection');
  }
});

// 3. Process lifecycle and teardown
check('process_lifecycle_and_teardown_defined', () => {
  if (!content.includes('Application.Launch') || (!content.includes('Automation.Dispose()') && !content.includes('Automation?.Dispose()'))) {
    throw new Error('Missing Application.Launch and deterministic teardown pattern');
  }
});

// 4. Locators hierarchy
check('locators_hierarchy_defined', () => {
  if (!content.includes('ByAutomationId') || !content.includes('Ban Absolute Pixel Clicking')) {
    throw new Error('Missing ByAutomationId and ban on absolute pixel clicking');
  }
});

// 5. Non-flaky retry polling without sleep
check('retry_polling_without_sleep_defined', () => {
  if (!content.includes('Retry.WhileNull') || !content.includes('Strictly Ban `Thread.Sleep(2000)`')) {
    throw new Error('Missing Retry.WhileNull asynchronous polling pattern');
  }
});

// 6. E2E Dialog automation example
check('e2e_dialog_automation_example_defined', () => {
  if (!content.includes('ServerSettingsDialog') || !content.includes('.Expand()')) {
    throw new Error('Missing ServerSettingsDialog E2E test with TreeView expansion');
  }
});

// 7. C# Code blocks balanced braces check
check('csharp_code_blocks_syntax_sanity', () => {
  const codeBlockRegex = /```csharp([\s\S]*?)```/g;
  let match;
  let blockCount = 0;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    blockCount++;
    const code = match[1];
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      throw new Error(`Code block #${blockCount} has unbalanced braces (open=${openBraces}, close=${closeBraces})`);
    }
  }
  if (blockCount < 4) throw new Error(`Expected at least 4 C# code blocks, found ${blockCount}`);
});

// 8. Skill.md integration
check('skill_md_links_flaui_reference', () => {
  const skillPath = path.join(rootDir, 'skills', 'qa-test-automation', 'SKILL.md');
  const skillContent = fs.readFileSync(skillPath, 'utf-8');
  if (!skillContent.includes('flaui-desktop-e2e.md')) {
    throw new Error('skills/qa-test-automation/SKILL.md does not reference flaui-desktop-e2e.md');
  }
});

// 9. Agent Viktor card budget & reference
check('agent_viktor_budget_and_reference', () => {
  const viktorPath = path.join(rootDir, 'agents', 'viktor.md');
  const viktorContent = fs.readFileSync(viktorPath, 'utf-8');
  const size = fs.statSync(viktorPath).size;
  if (size > 5120) {
    throw new Error(`agents/viktor.md size (${size} bytes) exceeds 5120 bytes budget ceiling`);
  }
  if (!viktorContent.includes('flaui-desktop-e2e.md')) {
    throw new Error('agents/viktor.md does not reference flaui-desktop-e2e.md');
  }
});

console.log(`\nFLAUI SUMMARY: ${passed}/${total} passed`);
if (passed !== total) process.exit(1);
