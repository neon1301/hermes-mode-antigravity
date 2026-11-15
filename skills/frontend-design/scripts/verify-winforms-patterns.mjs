// skills/frontend-design/scripts/verify-winforms-patterns.mjs
// Automated verification test for winforms-modern-dark-controls skill reference.
// Validates presence, architectural patterns, C# code validity, and agent integration.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '../../..');

console.log('🎨 [VERIFY WINFORMS PATTERNS] Testing winforms-modern-dark-controls skill...');

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
const refPath = path.join(rootDir, 'skills', 'frontend-design', 'references', 'winforms-modern-dark-controls.md');
check('ref_file_exists', () => {
  if (!fs.existsSync(refPath)) throw new Error('winforms-modern-dark-controls.md is missing');
});

const content = fs.existsSync(refPath) ? fs.readFileSync(refPath, 'utf-8') : '';

// 2. DWM Dark mode interop pattern
check('dwm_dark_title_bar_pattern', () => {
  if (!content.includes('DWMWA_USE_IMMERSIVE_DARK_MODE') || !content.includes('DwmSetWindowAttribute')) {
    throw new Error('Missing DWM dark title bar P/Invoke pattern');
  }
});

// 3. Anti-flicker double buffering & WS_EX_COMPOSITED
check('anti_flicker_double_buffer_pattern', () => {
  if (!content.includes('OptimizedDoubleBuffer') || !content.includes('0x02000000')) {
    throw new Error('Missing DoubleBuffered and WS_EX_COMPOSITED compositing pattern');
  }
});

// 4. TextRenderer typography and zero GDI leak rule
check('text_renderer_and_zero_gdi_leak', () => {
  if (!content.includes('TextRenderer.DrawText') || !content.includes('Zero GDI+ Leak')) {
    throw new Error('Missing TextRenderer.DrawText or Zero GDI leak invariant');
  }
});

// 5. DarkDeviceTreeView and custom chevrons
check('dark_device_treeview_component', () => {
  if (!content.includes('DarkDeviceTreeView') || !content.includes('TreeViewDrawMode.OwnerDrawAll')) {
    throw new Error('Missing DarkDeviceTreeView owner-draw component specification');
  }
});

// 6. Thread-safe telemetry dispatch without UI freeze
check('thread_safe_telemetry_dispatch', () => {
  if (!content.includes('ConcurrentQueue') || !content.includes('Interval = 100')) {
    throw new Error('Missing batched telemetry throttling pattern');
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
check('skill_md_links_winforms_reference', () => {
  const skillPath = path.join(rootDir, 'skills', 'frontend-design', 'SKILL.md');
  const skillContent = fs.readFileSync(skillPath, 'utf-8');
  if (!skillContent.includes('winforms-modern-dark-controls.md')) {
    throw new Error('skills/frontend-design/SKILL.md does not reference winforms-modern-dark-controls.md');
  }
});

// 9. Agent Elena card budget & reference
check('agent_elena_budget_and_reference', () => {
  const elenaPath = path.join(rootDir, 'agents', 'elena.md');
  const elenaContent = fs.readFileSync(elenaPath, 'utf-8');
  const size = fs.statSync(elenaPath).size;
  if (size > 5120) {
    throw new Error(`agents/elena.md size (${size} bytes) exceeds 5120 bytes budget ceiling`);
  }
  if (!elenaContent.includes('winforms-modern-dark-controls.md')) {
    throw new Error('agents/elena.md does not reference winforms-modern-dark-controls.md');
  }
});

console.log(`\nWINFORMS PATTERNS SUMMARY: ${passed}/${total} passed`);
if (passed !== total) process.exit(1);
