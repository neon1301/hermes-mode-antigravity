#!/usr/bin/env node
/**
 * verify-fault-injection-patterns.mjs
 * Mechanical verification script for Igor's Industrial Fault Injection & Protocol Fuzzing skill.
 * Tests documentation integrity, C# socket chaos patterns, CRC-16 fuzzing, and agent alignment.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');

const manualPath = resolve(rootDir, 'skills/hardware-protocol-simulation/references/industrial-fault-injection.md');
const skillPath = resolve(rootDir, 'skills/hardware-protocol-simulation/SKILL.md');
const agentPath = resolve(rootDir, 'agents/igor.md');

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

console.log('--- Igor Industrial Fault Injection Skill Verification ---');

// 1. Manual file exists and is non-empty
assert(existsSync(manualPath), 'industrial-fault-injection.md reference manual exists');
const manualContent = existsSync(manualPath) ? readFileSync(manualPath, 'utf8') : '';
assert(manualContent.length > 1000, 'Manual contains comprehensive content (>1000 chars)');

// 2. RST drop LingerOption pattern
assert(manualContent.includes('LingerOption(enable: true, seconds: 0)') || manualContent.includes('socket.LingerState'), 'RST drop with LingerOption documented');

// 3. Drip byte fragmentation
assert(manualContent.includes('SendDripFragmentedAsync') || manualContent.includes('chunkSize'), 'Drip byte fragmentation loop documented');

// 4. Latency jitter injection
assert(manualContent.includes('InjectLatencyJitterAsync') || manualContent.includes('minJitterMs'), 'Latency jitter injection documented');

// 5. CRC-16 Modbus polynomial
assert(manualContent.includes('0xA001') && manualContent.includes('ComputeCrc16'), 'Industrial CRC-16 computation documented');

// 6. Smart mutated frame generator
assert(manualContent.includes('CreateSmartMutatedFrame') && manualContent.includes('corruptCrc'), 'Smart mutated frame generator documented');

// 7. Blackhole simulator
assert(manualContent.includes('RunBlackholeLoopAsync') || manualContent.includes('discardBuffer'), 'Blackhole simulator documented');

// 8. Skill manifest references the playbook
const skillContent = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
assert(skillContent.includes('industrial-fault-injection.md'), 'SKILL.md references industrial-fault-injection.md');

// 9. Agent card alignment
const agentContent = existsSync(agentPath) ? readFileSync(agentPath, 'utf8') : '';
assert(agentContent.includes('industrial-fault-injection') || agentContent.includes('fault-injection'), 'Igor agent card aligns with fault injection skill');

console.log(`\nResult: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
