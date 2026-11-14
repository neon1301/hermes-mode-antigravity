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

// 5. Verify plugin.json, package.json version alignment & docs
await test('version_alignment', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(rootDir, 'plugin.json'), 'utf-8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  if (plugin.version !== pkg.version) {
    throw new Error(`plugin.json version (${plugin.version}) does not match package.json (${pkg.version})`);
  }
  const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf-8');
  if (!readme.includes(`(v${plugin.version})`)) {
    throw new Error(`README.md header does not contain current version (v${plugin.version})`);
  }
  if (!plugin.description.includes(`(v${plugin.version})`)) {
    throw new Error(`plugin.json description does not contain current version (v${plugin.version})`);
  }
  const fleetProtocol = fs.readFileSync(path.join(rootDir, 'skills', 'hermes', 'references', 'fleet-protocol.md'), 'utf-8');
  if (!fleetProtocol.includes(`Protocol v${plugin.version}`)) {
    throw new Error(`fleet-protocol.md header does not contain current version (Protocol v${plugin.version})`);
  }
  const hermesSkill = fs.readFileSync(path.join(rootDir, 'skills', 'hermes', 'SKILL.md'), 'utf-8');
  if (!hermesSkill.includes(`(v${plugin.version})`)) {
    throw new Error(`skills/hermes/SKILL.md header does not contain current version (v${plugin.version})`);
  }
  const installPs1Path = path.join(rootDir, 'install.ps1');
  if (fs.existsSync(installPs1Path)) {
    const installPs1 = fs.readFileSync(installPs1Path, 'utf-8');
    if (!installPs1.includes(`(v${plugin.version})`)) {
      throw new Error(`install.ps1 header does not contain current version (v${plugin.version})`);
    }
  }
  const installShPath = path.join(rootDir, 'install.sh');
  if (fs.existsSync(installShPath)) {
    const installSh = fs.readFileSync(installShPath, 'utf-8');
    if (!installSh.includes(`(v${plugin.version})`)) {
      throw new Error(`install.sh header does not contain current version (v${plugin.version})`);
    }
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

// 7. Verify agent frontmatter schema and name uniqueness
await test('agent_frontmatter_and_unique_names', () => {
  const agentsDir = path.join(rootDir, 'agents');
  const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
  const seenNames = new Set();
  for (const f of agentFiles) {
    const raw = fs.readFileSync(path.join(agentsDir, f), 'utf-8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) throw new Error(`Missing YAML frontmatter in agents/${f}`);
    const nameMatch = m[1].match(/^name:\s*([^\r\n]+)$/m);
    if (!nameMatch) throw new Error(`Missing 'name' field in frontmatter of agents/${f}`);
    const name = nameMatch[1].trim().toLowerCase();
    const expectedName = f.replace(/\.md$/, '').toLowerCase();
    if (name !== expectedName) {
      throw new Error(`Frontmatter name '${name}' does not match filename agents/${f}`);
    }
    if (seenNames.has(name)) throw new Error(`Duplicate agent name '${name}' in agents/${f}`);
    seenNames.add(name);
  }
});

// 8. Verify skill frontmatter schema and name uniqueness
await test('skill_frontmatter_and_unique_names', () => {
  const skillsDir = path.join(rootDir, 'skills');
  const skillFolders = fs.readdirSync(skillsDir).filter((f) => fs.existsSync(path.join(skillsDir, f, 'SKILL.md')));
  const seenNames = new Set();
  for (const f of skillFolders) {
    const raw = fs.readFileSync(path.join(skillsDir, f, 'SKILL.md'), 'utf-8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) throw new Error(`Missing YAML frontmatter in skills/${f}/SKILL.md`);
    const nameMatch = m[1].match(/^name:\s*([^\r\n]+)$/m);
    if (!nameMatch) throw new Error(`Missing 'name' field in frontmatter of skills/${f}/SKILL.md`);
    const name = nameMatch[1].trim();
    if (seenNames.has(name)) throw new Error(`Duplicate skill name '${name}' in skills/${f}`);
    seenNames.add(name);
  }
});

// 9. Verify markdown reference links integrity
await test('markdown_reference_links_integrity', () => {
  const refFiles = [
    path.join(rootDir, 'skills', 'hermes', 'SKILL.md'),
    ...fs.readdirSync(path.join(rootDir, 'skills', 'hermes', 'references'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(rootDir, 'skills', 'hermes', 'references', f))
  ];

  for (const filePath of refFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const dir = path.dirname(filePath);
    const regex = /\[.*?\]\((?!https?:\/\/|#|mailto:)(.*?)\)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const target = match[1].split('#')[0].trim();
      if (!target) continue;
      const resolved = path.resolve(dir, target);
      if (!fs.existsSync(resolved)) {
        throw new Error(`Broken link '${target}' in ${path.relative(rootDir, filePath)}`);
      }
    }
  }
});

console.log(`CONSISTENCY SUMMARY: ${totalTests - failed}/${totalTests} passed`);
if (failed > 0) process.exit(1);
