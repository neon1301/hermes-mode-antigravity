import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERMES_AGENTS } from './hermes-trigger.mjs';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

let totalTests = 0;
let failed = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

// 1. Validate agents count (14)
await test('agents_count_14', () => {
  const agentsDir = path.join(rootDir, 'agents');
  const agents = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
  if (agents.length !== 14) throw new Error(`Expected 14 agents, found ${agents.length}`);
});

// 2. Validate skills count (20)
await test('skills_count_20', () => {
  const skillsDir = path.join(rootDir, 'skills');
  const skills = fs.readdirSync(skillsDir).filter((f) => fs.existsSync(path.join(skillsDir, f, 'SKILL.md')));
  if (skills.length !== 20) throw new Error(`Expected 20 skills, found ${skills.length}`);
});

// 3. Verify no outdated counters in documentation
await test('no_stale_counters_in_docs', () => {
  const filesToCheck = [
    'README.md',
    'skills/hermes/scripts/monitor.mjs',
    'skills/hermes/references/compliance-audit-standards.md'
  ];
  for (const rel of filesToCheck) {
    const p = path.join(rootDir, rel);
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf-8');
    if (/\b19\s+(?:specialist\s+skills|скилл)/i.test(content)) {
      throw new Error(`Found outdated counter '19 skills' in ${rel}`);
    }
    if (/Lead\s*\+\s*13\b/i.test(content)) {
      throw new Error(`Found outdated counter 'Lead + 13' in ${rel}`);
    }
  }
});

// 4. Verify all agents in agents/*.md are registered in HERMES_AGENTS in hermes-trigger.mjs
await test('all_agents_registered_in_trigger', () => {
  const agentsDir = path.join(rootDir, 'agents');
  const agentNames = fs.readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, '').toLowerCase());

  for (const name of agentNames) {
    if (!HERMES_AGENTS.has(name)) {
      throw new Error(`Agent '${name}.md' is missing from HERMES_AGENTS in hermes-trigger.mjs`);
    }
  }
});

// 5. Verify plugin.json, package.json version alignment
await test('version_alignment', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(rootDir, 'plugin.json'), 'utf-8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  if (plugin.version !== pkg.version) {
    throw new Error(`plugin.json version (${plugin.version}) does not match package.json (${pkg.version})`);
  }
});

// 6. Verify license alignment across LICENSE and package.json
await test('license_alignment', () => {
  const licensePath = path.join(rootDir, 'LICENSE');
  if (!fs.existsSync(licensePath)) throw new Error('LICENSE file missing');
  const licenseText = fs.readFileSync(licensePath, 'utf-8');
  if (!/MIT License/i.test(licenseText)) throw new Error('LICENSE is not MIT');
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  if (pkg.license !== 'MIT') throw new Error(`package.json license (${pkg.license}) must be MIT`);
});

console.log(`CONSISTENCY SUMMARY: ${totalTests - failed}/${totalTests} passed`);
if (failed > 0) process.exit(1);
