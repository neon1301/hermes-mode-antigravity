#!/usr/bin/env node
/**
 * verify-vram-hygiene-patterns.mjs
 * Mechanical verification script for Gleb's Three.js VRAM Hygiene & Digital Twin Architecture skill.
 * Tests documentation integrity, WebGL disposal patterns, InstancedMesh scalability, and agent alignment.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');

const manualPath = resolve(rootDir, 'skills/procedural-3d-digital-twin/references/threejs-vram-hygiene-twin.md');
const skillPath = resolve(rootDir, 'skills/procedural-3d-digital-twin/SKILL.md');
const agentPath = resolve(rootDir, 'agents/gleb.md');

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

console.log('--- Gleb Three.js VRAM Hygiene Skill Verification ---');

// 1. Manual file exists and is non-empty
assert(existsSync(manualPath), 'threejs-vram-hygiene-twin.md reference manual exists');
const manualContent = existsSync(manualPath) ? readFileSync(manualPath, 'utf8') : '';
assert(manualContent.length > 1000, 'Manual contains comprehensive content (>1000 chars)');

// 2. Geometry disposal loop
assert(manualContent.includes('object.geometry.dispose()') && manualContent.includes('scene.traverse'), 'Recursive scene traverse and geometry dispose documented');

// 3. Texture and material disposal
assert(manualContent.includes('textureKeys') && manualContent.includes('mat.dispose()'), 'Texture maps and material disposal documented');

// 4. WebGL context loss cleanup
assert(manualContent.includes('forceContextLoss') || manualContent.includes('WEBGL_lose_context'), 'WebGL forceContextLoss cleanup documented');

// 5. Visibility change loop throttling
assert(manualContent.includes('visibilitychange') && manualContent.includes('cancelAnimationFrame'), 'Page Visibility API loop throttling documented');

// 6. InstancedMesh for factory sensors
assert(manualContent.includes('THREE.InstancedMesh') && manualContent.includes('setColorAt'), 'InstancedMesh factory sensor fleet pattern documented');

// 7. Skill manifest references the playbook
const skillContent = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
assert(skillContent.includes('threejs-vram-hygiene-twin.md'), 'SKILL.md references threejs-vram-hygiene-twin.md');

// 8. Agent card alignment
const agentContent = existsSync(agentPath) ? readFileSync(agentPath, 'utf8') : '';
assert(agentContent.includes('threejs-vram-hygiene-twin') || agentContent.includes('VRAM'), 'Gleb agent card aligns with VRAM hygiene skill');

console.log(`\nResult: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
