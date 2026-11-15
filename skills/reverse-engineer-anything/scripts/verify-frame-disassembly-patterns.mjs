#!/usr/bin/env node
/**
 * verify-frame-disassembly-patterns.mjs
 * Mechanical verification script for Artem's Binary Protocol Frame Disassembly & MSIL Reversing skill.
 * Tests documentation integrity, C# BinaryPrimitives patterns, MSIL opcode tables, and agent alignment.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');

const manualPath = resolve(rootDir, 'skills/reverse-engineer-anything/references/binary-frame-disassembly.md');
const skillPath = resolve(rootDir, 'skills/reverse-engineer-anything/SKILL.md');
const agentPath = resolve(rootDir, 'agents/artem.md');

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

console.log('--- Artem Binary Frame Disassembly Skill Verification ---');

// 1. Manual file exists and is non-empty
assert(existsSync(manualPath), 'binary-frame-disassembly.md reference manual exists');
const manualContent = existsSync(manualPath) ? readFileSync(manualPath, 'utf8') : '';
assert(manualContent.length > 1000, 'Manual contains comprehensive content (>1000 chars)');

// 2. BinaryPrimitives and Sync Word
assert(manualContent.includes('BinaryPrimitives.ReadUInt16BigEndian') && manualContent.includes('0xAA55'), 'BinaryPrimitives and sync word 0xAA55 documented');

// 3. Bitfield flags decoder
assert(manualContent.includes('[Flags]') && manualContent.includes('MachineAlarmFlags'), 'Bitfield enum and status register decoder documented');

// 4. CIL / MSIL opcode table
assert(manualContent.includes('ldarg.0') && manualContent.includes('callvirt'), 'CIL/MSIL opcodes and control flow reconstruction documented');

// 5. Checksum and CRC validation
assert(manualContent.includes('CRC-16') && manualContent.includes('Fletcher-16'), 'Checksum and CRC validation documented');

// 6. Skill manifest references the playbook
const skillContent = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
assert(skillContent.includes('binary-frame-disassembly.md'), 'SKILL.md references binary-frame-disassembly.md');

// 7. Agent card alignment
const agentContent = existsSync(agentPath) ? readFileSync(agentPath, 'utf8') : '';
assert(agentContent.includes('binary-frame-disassembly') || agentContent.includes('disassembly'), 'Artem agent card aligns with binary frame disassembly skill');

console.log(`\nResult: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
