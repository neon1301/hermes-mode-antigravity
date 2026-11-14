import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

// 1. Validate agents count (14)
test('agents_count_14', () => {
  const agentsDir = path.join(rootDir, 'agents');
  const agents = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
  if (agents.length !== 14) throw new Error(`Expected 14 agents, found ${agents.length}`);
});

// 2. Validate skills count (20)
test('skills_count_20', () => {
  const skillsDir = path.join(rootDir, 'skills');
  const skills = fs.readdirSync(skillsDir).filter((f) => fs.existsSync(path.join(skillsDir, f, 'SKILL.md')));
  if (skills.length !== 20) throw new Error(`Expected 20 skills, found ${skills.length}`);
});

// 3. Verify no outdated counters in documentation
test('no_stale_counters_in_docs', () => {
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
test('all_agents_registered_in_trigger', async () => {
  const { HERMES_AGENTS } = await import('./hermes-trigger.mjs');
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
test('version_alignment', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(rootDir, 'plugin.json'), 'utf-8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  if (plugin.version !== pkg.version) {
    throw new Error(`plugin.json version (${plugin.version}) does not match package.json (${pkg.version})`);
  }
});

console.log(`CONSISTENCY SUMMARY: ${5 - failed}/5 passed`);
if (failed > 0) process.exit(1);
