// skills/backend-architecture/scripts/verify-zero-alloc-patterns.mjs
// Automated verification test for csharp-zero-alloc-performance skill reference.
// Validates presence, 5 zero-alloc pillars, C# syntax sanity, and agent integration.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '../../..');

console.log('🚀 [VERIFY ZERO-ALLOC] Testing csharp-zero-alloc-performance skill...');

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
const refPath = path.join(rootDir, 'skills', 'backend-architecture', 'references', 'csharp-zero-alloc-performance.md');
check('ref_file_exists', () => {
  if (!fs.existsSync(refPath)) throw new Error('csharp-zero-alloc-performance.md is missing');
});

const content = fs.existsSync(refPath) ? fs.readFileSync(refPath, 'utf-8') : '';

// 2. Span zero-copy parsing pattern
check('span_zero_copy_parsing_defined', () => {
  if (!content.includes('ReadOnlySpan<byte>') || !content.includes('Utf8Parser.TryParse')) {
    throw new Error('Missing ReadOnlySpan<byte> and Utf8Parser parsing pattern');
  }
});

// 3. ArrayPool buffer renting and return in finally
check('arraypool_hygiene_defined', () => {
  if (!content.includes('ArrayPool<byte>.Shared.Rent') || !content.includes('ArrayPool<byte>.Shared.Return')) {
    throw new Error('Missing ArrayPool buffer pooling pattern with Return in finally');
  }
});

// 4. ValueTask hot-path allocation avoidance
check('valuetask_hot_path_defined', () => {
  if (!content.includes('ValueTask<ReadOnlyMemory<byte>>') || !content.includes('new ValueTask')) {
    throw new Error('Missing ValueTask hot-path allocation avoidance pattern');
  }
});

// 5. Backpressured bounded channels
check('bounded_channels_defined', () => {
  if (!content.includes('Channel.CreateBounded') || !content.includes('BoundedChannelFullMode.Wait')) {
    throw new Error('Missing BoundedChannel backpressure configuration');
  }
});

// 6. BenchmarkDotNet memory diagnoser
check('benchmark_memory_diagnoser_defined', () => {
  if (!content.includes('[MemoryDiagnoser]') || !content.includes('[Benchmark]')) {
    throw new Error('Missing BenchmarkDotNet MemoryDiagnoser pattern');
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
  if (blockCount < 5) throw new Error(`Expected at least 5 C# code blocks, found ${blockCount}`);
});

// 8. Skill.md integration
check('skill_md_links_zero_alloc_reference', () => {
  const skillPath = path.join(rootDir, 'skills', 'backend-architecture', 'SKILL.md');
  const skillContent = fs.readFileSync(skillPath, 'utf-8');
  if (!skillContent.includes('csharp-zero-alloc-performance.md')) {
    throw new Error('skills/backend-architecture/SKILL.md does not reference csharp-zero-alloc-performance.md');
  }
});

// 9. Agent Dmitry card budget & reference
check('agent_dmitry_budget_and_reference', () => {
  const dmitryPath = path.join(rootDir, 'agents', 'dmitry.md');
  const dmitryContent = fs.readFileSync(dmitryPath, 'utf-8');
  const size = fs.statSync(dmitryPath).size;
  if (size > 5120) {
    throw new Error(`agents/dmitry.md size (${size} bytes) exceeds 5120 bytes budget ceiling`);
  }
  if (!dmitryContent.includes('csharp-zero-alloc-performance.md')) {
    throw new Error('agents/dmitry.md does not reference csharp-zero-alloc-performance.md');
  }
});

console.log(`\nZERO-ALLOC PATTERNS SUMMARY: ${passed}/${total} passed`);
if (passed !== total) process.exit(1);
