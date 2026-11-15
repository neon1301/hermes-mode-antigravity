#!/usr/bin/env node
/**
 * verify-pipeline-streaming-patterns.mjs
 * Mechanical verification script for Alexey's Socket Pipeline Streaming skill.
 * Tests documentation integrity, C# System.IO.Pipelines patterns, zero-copy decoders, and agent alignment.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');

const manualPath = resolve(rootDir, 'skills/socket-network-diagnostics/references/socket-pipeline-streaming.md');
const skillPath = resolve(rootDir, 'skills/socket-network-diagnostics/SKILL.md');
const agentPath = resolve(rootDir, 'agents/alexey.md');

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

console.log('--- Alexey Socket Pipeline Streaming Skill Verification ---');

// 1. Manual file exists and is non-empty
assert(existsSync(manualPath), 'socket-pipeline-streaming.md reference manual exists');
const manualContent = existsSync(manualPath) ? readFileSync(manualPath, 'utf8') : '';
assert(manualContent.length > 1000, 'Manual contains comprehensive content (>1000 chars)');

// 2. PipeReader ReadAsync loop
assert(manualContent.includes('reader.ReadAsync') && manualContent.includes('ReadOnlySequence<byte>'), 'PipeReader ReadAsync loop documented');

// 3. PipeReader AdvanceTo pattern
assert(manualContent.includes('reader.AdvanceTo(buffer.Start, buffer.End)'), 'reader.AdvanceTo(buffer.Start, buffer.End) documented');

// 4. Length-prefixed SequenceReader decoder
assert(manualContent.includes('SequenceReader<byte>') && manualContent.includes('TryReadBigEndian'), 'SequenceReader big-endian length decoder documented');

// 5. Delimiter frame decoder
assert(manualContent.includes('TryReadTo') || manualContent.includes('Delimiter'), 'Delimiter frame decoder documented');

// 6. MemoryPool Shared and PipeReader options
assert(manualContent.includes('MemoryPool<byte>.Shared') && manualContent.includes('StreamPipeReaderOptions'), 'MemoryPool.Shared & StreamPipeReaderOptions documented');

// 7. MaxFrameSize OOM defense
assert(manualContent.includes('MaxFrameSize') || manualContent.includes('MaxAllowedPayload'), 'Max frame size OOM defense documented');

// 8. Skill manifest references the playbook
const skillContent = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
assert(skillContent.includes('socket-pipeline-streaming.md'), 'SKILL.md references socket-pipeline-streaming.md');

// 9. Agent card alignment
const agentContent = existsSync(agentPath) ? readFileSync(agentPath, 'utf8') : '';
assert(agentContent.includes('socket-pipeline-streaming') || agentContent.includes('Pipelines'), 'Alexey agent card aligns with socket pipeline streaming skill');

console.log(`\nResult: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
