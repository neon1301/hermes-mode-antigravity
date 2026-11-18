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

// 2. Validate skills count (22)
await test('skills_count_22', () => {
  const skillsDir = path.join(rootDir, 'skills');
  const skills = fs.readdirSync(skillsDir).filter((f) => fs.existsSync(path.join(skillsDir, f, 'SKILL.md')));
  if (skills.length !== 22) throw new Error(`Expected 22 skills, found ${skills.length}`);
});

// 3. Verify no outdated counters in documentation
await test('no_stale_counters_in_docs', () => {
  const filesToCheck = [
    'README.md',
    'README.ru.md',
    'plugin.json',
    'skills/hermes/SKILL.md',
    'skills/hermes/scripts/monitor.mjs',
    'skills/hermes/references/fleet-protocol.md',
    'skills/hermes/references/compliance-audit-standards.md',
    'skills/compliance-policy-as-code/SKILL.md',
    'agents/stanislav.md'
  ];
  for (const rel of filesToCheck) {
    const p = path.join(rootDir, rel);
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf-8');
    if (/\b(?:19|20|21)\s+(?:specialist\s+skills|скилл)/i.test(content)) {
      throw new Error(`Found outdated counter in ${rel}`);
    }
    if (/Lead\s*\+\s*13\b/i.test(content)) {
      throw new Error(`Found outdated counter 'Lead + 13' in ${rel}`);
    }
    if (/\b12\s+(?:правил|rules)\b/i.test(content)) {
      throw new Error(`Found outdated counter '12 правил / 12 rules' in ${rel}`);
    }
  }

  const fleetProto = fs.readFileSync(path.join(rootDir, 'skills', 'hermes', 'references', 'fleet-protocol.md'), 'utf-8');
  if (!fleetProto.includes('15 правил флота Hermes') && !fleetProto.includes('Правило 15')) {
    throw new Error('fleet-protocol.md must declare 15 rules of Hermes Fleet');
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
  if (plugin.description.length < 120 || plugin.description.length > 160) {
    throw new Error(`plugin.json description length (${plugin.description.length}) must be between 120 and 160 characters`);
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
  const plugin = JSON.parse(fs.readFileSync(path.join(rootDir, 'plugin.json'), 'utf-8'));
  if (plugin.license !== 'MIT') throw new Error(`plugin.json license (${plugin.license}) must be MIT`);
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
    path.join(rootDir, 'README.md'),
    path.join(rootDir, 'README.ru.md'),
    path.join(rootDir, 'TROUBLESHOOTING.md'),
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

// 10. Verify third party notices and open source attribution
await test('third_party_notices_attribution', () => {
  const noticesPath = path.join(rootDir, 'THIRD_PARTY_NOTICES.md');
  if (!fs.existsSync(noticesPath)) throw new Error('THIRD_PARTY_NOTICES.md is missing');
  const content = fs.readFileSync(noticesPath, 'utf-8');
  if (!content.includes('Apache License, Version 2.0')) {
    throw new Error('THIRD_PARTY_NOTICES.md missing Apache-2.0 reference');
  }
  const requiredMechanics = [
    'Three-Layer Security Architecture',
    'Declarative Rule Engine',
    '7-Phase Feature Development Protocol',
    'Specialized PR Reviewers',
    'Self-Referential Convergence Loops',
    'Industrial Data Honesty',
    'Session Metrics & Usage Accounting'
  ];
  for (const m of requiredMechanics) {
    if (!content.includes(m)) {
      throw new Error(`THIRD_PARTY_NOTICES.md missing ported mechanic section: '${m}'`);
    }
  }
});

// 11. Verify Wave 2 references and ADR existence
await test('wave2_artifacts_and_adr_integrity', () => {
  const featProto = path.join(rootDir, 'skills', 'hermes', 'references', 'feature-dev-protocol.md');
  if (!fs.existsSync(featProto)) throw new Error('feature-dev-protocol.md missing');
  const featContent = fs.readFileSync(featProto, 'utf-8');
  if (!featContent.includes('Fast-Path') || !featContent.includes('7-Phase')) {
    throw new Error('feature-dev-protocol.md missing Fast-Path or 7-Phase references');
  }

  const prMethod = path.join(rootDir, 'skills', 'hermes', 'references', 'pr-review-methodologies.md');
  if (!fs.existsSync(prMethod)) throw new Error('pr-review-methodologies.md missing');
  const prContent = fs.readFileSync(prMethod, 'utf-8');
  if (!prContent.includes('PR Test Analyzer') || !prContent.includes('Type Design') || !prContent.includes('Comment Freshness')) {
    throw new Error('pr-review-methodologies.md missing review methodology sections');
  }

  const adrFile = path.join(rootDir, 'docs', 'adr', '0001-l2-diff-review-and-anti-self-signing.md');
  if (!fs.existsSync(adrFile)) throw new Error('ADR 0001 file missing');
  const adrContent = fs.readFileSync(adrFile, 'utf-8');
  if (/крипто/i.test(adrContent)) {
    throw new Error('ADR 0001 must not use the term "крипто"');
  }
});

// 12. Verify specialized agent cards size budget (<= 5 KB across all 14 agents)
await test('specialized_agent_cards_size_budget', () => {
  const agentFiles = fs.readdirSync(path.join(rootDir, 'agents')).filter((f) => f.endsWith('.md'));
  if (agentFiles.length !== 14) {
    throw new Error(`Expected 14 agent cards, found ${agentFiles.length}`);
  }
  for (const file of agentFiles) {
    const p = path.join(rootDir, 'agents', file);
    const size = fs.statSync(p).size;
    if (size > 5120) {
      throw new Error(`Agent card agents/${file} (${size} bytes) exceeds 5 KB budget`);
    }
  }
});

// 13. Verify Wave 3 integration ladders, schemas, validator, session reporter & eval harness
await test('wave3_artifacts_and_contracts_integrity', () => {
  const ladders = [
    path.join(rootDir, 'skills', 'industrial-equipment-research', 'references', 'integration-ladder.md'),
    path.join(rootDir, 'skills', 'sap-enterprise-automation', 'references', 'integration-ladder.md')
  ];
  for (const p of ladders) {
    if (!fs.existsSync(p)) throw new Error(`Missing integration ladder: ${path.relative(rootDir, p)}`);
    const txt = fs.readFileSync(p, 'utf-8');
    if (!txt.includes('Vendor MCP') || !txt.includes('Scheduled CSV/JSON Export')) {
      throw new Error(`Integration ladder incomplete in ${path.relative(rootDir, p)}`);
    }
  }

  const schemas = [
    'contract-proposal.schema.json',
    'patch-blueprint.schema.json',
    'security-verdict.schema.json',
    'qa-verdict.schema.json'
  ];
  const schemaDir = path.join(rootDir, 'skills', 'compliance-policy-as-code', 'references', 'schemas');
  for (const s of schemas) {
    const p = path.join(schemaDir, s);
    if (!fs.existsSync(p)) throw new Error(`Missing schema: ${s}`);
    try {
      JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (e) {
      throw new Error(`Invalid JSON in schema ${s}: ${e.message}`);
    }
  }

  const validatorPath = path.join(rootDir, 'skills', 'compliance-policy-as-code', 'scripts', 'contract-validator.mjs');
  if (!fs.existsSync(validatorPath)) throw new Error('Missing contract-validator.mjs');

  const reportPath = path.join(rootDir, 'hooks', 'session-report.mjs');
  if (!fs.existsSync(reportPath)) throw new Error('Missing session-report.mjs');

  const evalPath = path.join(rootDir, 'hooks', 'eval-harness.test.mjs');
  if (!fs.existsSync(evalPath)) throw new Error('Missing eval-harness.test.mjs');

  const runnerPath = path.join(rootDir, 'hooks', 'test-runner.mjs');
  if (!fs.existsSync(runnerPath)) throw new Error('Missing test-runner.mjs');

  // Verify test-summary.json consistency (Rule 13 - Mechanical Grounding)
  const summaryPath = path.join(rootDir, '.hermes', 'test-summary.json');
  if (!fs.existsSync(summaryPath)) {
    throw new Error('.hermes/test-summary.json missing! Run npm test or verify.ps1/sh to generate.');
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  if (!Array.isArray(summary.suites) || summary.suites.length !== 11) {
    throw new Error(`Expected 11 suites in .hermes/test-summary.json, found ${summary.suites?.length}`);
  }
  const expectedBreakdown = {
    'consistency': 22,
    'context-injector': 19,
    'clean-edits-guard': 290,
    'qa-gate': 126,
    'rule-engine': 20,
    'session-report': 6,
    'eval-harness': 71,
    'contract-validator': 9,
    'doc-lint': 15,
    'refinery': 9,
    'journal': 5
  };
  const expectedTotalSum = Object.values(expectedBreakdown).reduce((a, b) => a + b, 0);

  for (const [suiteName, expTotal] of Object.entries(expectedBreakdown)) {
    const s = summary.suites.find(x => x.name === suiteName);
    if (!s) throw new Error(`Missing suite '${suiteName}' in test-summary.json`);
    if (suiteName === 'consistency' && summary.status === 'RUNNING') {
      // During active run, consistency has not concluded yet — must be RUNNING or PENDING (Rule 13)
      if (s.status !== 'RUNNING' && s.status !== 'PENDING') {
        throw new Error(`Suite 'consistency' in active summary must be RUNNING or PENDING, got ${s.status}`);
      }
      if (s.passed !== null) {
        throw new Error(`Suite 'consistency' in active summary must not have premature passed count`);
      }
    } else {
      if (s.total !== expTotal || s.passed !== expTotal || s.status !== 'PASS') {
        throw new Error(`Suite '${suiteName}' expected ${expTotal}/${expTotal} PASS, got ${s.passed}/${s.total} [${s.status}]`);
      }
    }
  }

  if (summary.status === 'PASS') {
    if (summary.total !== expectedTotalSum || summary.passed !== expectedTotalSum) {
      throw new Error(`test-summary.json expected total=${expectedTotalSum}, passed=${expectedTotalSum}, got total=${summary.total}, passed=${summary.passed}`);
    }
    const sumTotal = summary.suites.reduce((acc, s) => acc + s.total, 0);
    const sumPassed = summary.suites.reduce((acc, s) => acc + s.passed, 0);
    if (sumTotal !== summary.total || sumPassed !== summary.passed) {
      throw new Error('Sum of suite totals does not match summary total/passed');
    }
  } else if (summary.status === 'RUNNING') {
    if (summary.passed !== null) {
      throw new Error(`Rule 13 violation: In-progress test-summary.json cannot declare non-null passed count before completion (got ${summary.passed})`);
    }
  } else {
    throw new Error(`test-summary.json unexpected status: '${summary.status}'`);
  }
});

// 14. Verify HERMES-COGNITION skill and trigger registration
await test('cognitive_skill_registered', async () => {
  const skillPath = path.join(rootDir, 'skills', 'cognitive-discipline', 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    throw new Error('skills/cognitive-discipline/SKILL.md is missing');
  }
  const content = fs.readFileSync(skillPath, 'utf-8');
  if (!content.includes('HERMES-COGNITION') || !content.includes('протокол трезвости')) {
    throw new Error('skills/cognitive-discipline/SKILL.md content mismatch');
  }
  const triggerModule = await import('./hermes-trigger.mjs');
  if (typeof triggerModule.isCognitiveTrigger !== 'function') {
    throw new Error('isCognitiveTrigger function is not exported from hermes-trigger.mjs');
  }
  const sampleTriggers = ['план', 'аудит', 'архитектура', 'релиз', 'диагноз', 'пре-мортем'];
  for (const t of sampleTriggers) {
    if (!triggerModule.isCognitiveTrigger(`сделай ${t}`)) {
      throw new Error(`isCognitiveTrigger failed to trigger on '${t}'`);
    }
  }
  if (triggerModule.isCognitiveTrigger('hello world')) {
    throw new Error('isCognitiveTrigger falsely matched unrelated text');
  }
});

// 15. Verify all skill verification scripts pass (doc-lint suite)
await test('doc_lint_verify_scripts_pass', async () => {
  const { spawnSync } = await import('node:child_process');
  const verifyScripts = [
    'skills/ai-rag-engineering/scripts/verify-hybrid-rag-patterns.mjs',
    'skills/backend-architecture/scripts/verify-zero-alloc-patterns.mjs',
    'skills/c4-architecture-mermaid/scripts/verify-living-c4-patterns.mjs',
    'skills/code-refactoring-modernization/scripts/verify-ast-modernization-patterns.mjs',
    'skills/compliance-policy-as-code/scripts/verify-thermonuclear-review.mjs',
    'skills/frontend-design/scripts/verify-winforms-patterns.mjs',
    'skills/hardware-protocol-simulation/scripts/verify-fault-injection-patterns.mjs',
    'skills/high-load-db-tuning/scripts/verify-deadlock-killer-patterns.mjs',
    'skills/procedural-3d-digital-twin/scripts/verify-vram-hygiene-patterns.mjs',
    'skills/product-ux-scouting/scripts/verify-nielsen-roast-patterns.mjs',
    'skills/qa-test-automation/scripts/verify-flaui-desktop-e2e.mjs',
    'skills/reverse-engineer-anything/scripts/verify-frame-disassembly-patterns.mjs',
    'skills/sap-enterprise-automation/scripts/verify-sap-nco-hygiene.mjs',
    'skills/socket-network-diagnostics/scripts/verify-pipeline-streaming-patterns.mjs',
    'skills/office-documents/scripts/verify-office-documents-patterns.mjs'
  ];
  for (const s of verifyScripts) {
    const fullPath = path.join(rootDir, s);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing verify script: ${s}`);
    }
    const res = spawnSync('node', [fullPath], { encoding: 'utf-8', cwd: rootDir });
    if (res.status !== 0) {
      throw new Error(`Verify script failed: ${s} (exit ${res.status}): ${res.stderr || res.stdout}`);
    }
  }

  // Also enforce skill size <= 7KB and when-clauses
  const skillsDir = path.join(rootDir, 'skills');
  for (const s of fs.readdirSync(skillsDir)) {
    const p = path.join(skillsDir, s, 'SKILL.md');
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      if (s !== 'hermes' && stat.size > 7168) {
        throw new Error(`Skill '${s}' SKILL.md exceeds 7KB budget (${stat.size} > 7168 bytes)`);
      }
      const content = fs.readFileSync(p, 'utf-8');
      const m = content.match(/description:\s*([^\n]+(?:\n\s+[^\n]+)*)/);
      const desc = m ? m[1].replace(/\s+/g, ' ').trim() : '';
      if (!/\b(?:when|use when|activate when)\b/i.test(desc)) {
        throw new Error(`Skill '${s}' description lacks a 'when' trigger clause`);
      }
    }
  }
});

// 16. Verify donor skill references, attribution, and zero hallucinated tools
await test('donor_skills_references_and_attribution_integrity', () => {
  const expectedReferences = [
    'skills/hermes/references/systematic-debugging.md',
    'skills/hermes/references/verification-before-completion.md',
    'skills/hermes/references/writing-skills.md',
    'skills/office-documents/references/xlsx-standards.md',
    'skills/office-documents/references/docx-standards.md',
    'skills/frontend-design/references/platform-design-systems.md',
    'skills/qa-test-automation/references/playwright-e2e-patterns.md',
    'skills/hardware-protocol-simulation/references/pairwise-fault-matrices.md',
    'skills/compliance-policy-as-code/references/skill-trigger-verification.md',
    'skills/procedural-3d-digital-twin/references/modern-threejs-patterns.md',
    'skills/product-ux-scouting/references/ru-text-typography.md',
    'skills/agent-context-memory-engineering/references/context-compaction-patterns.md'
  ];
  for (const rel of expectedReferences) {
    const full = path.join(rootDir, rel);
    if (!fs.existsSync(full)) {
      throw new Error(`Missing expected donor reference file: ${rel}`);
    }
  }

  const noticesPath = path.join(rootDir, 'THIRD_PARTY_NOTICES.md');
  const noticesContent = fs.readFileSync(noticesPath, 'utf-8');
  if (!noticesContent.includes('obra/superpowers') || !noticesContent.includes('anthropics/skills')) {
    throw new Error('THIRD_PARTY_NOTICES.md missing obra/superpowers or anthropics/skills attribution');
  }

  const backlogPath = path.join(rootDir, 'docs', 'backlog.md');
  const backlogContent = fs.readFileSync(backlogPath, 'utf-8');
  if (!backlogContent.includes('TASK-002') || !backlogContent.includes('Deferred Skill Candidates Registry')) {
    throw new Error('docs/backlog.md missing TASK-002 Deferred Skill Candidates Registry');
  }
});

// 17. Verify v3.9.0 modular protocol core budget (<= 12 KB), orchestrator references & attribution
await test('fleet_core_protocol_size_and_orchestrator_references_integrity', () => {
  const coreProtoPath = path.join(rootDir, 'skills', 'hermes', 'references', 'fleet-protocol.md');
  const coreStat = fs.statSync(coreProtoPath);
  if (coreStat.size > 12288) {
    throw new Error(`fleet-protocol.md (${coreStat.size} bytes) exceeds 12 KB budget (12288 bytes)`);
  }

  // REQ-5: Verify canonical QA runner pipeline flags in SKILL.md and fleet-protocol.md
  const skillMdPath = path.join(rootDir, 'skills', 'hermes', 'SKILL.md');
  const skillMdContent = fs.readFileSync(skillMdPath, 'utf-8');
  const coreProtoContent = fs.readFileSync(coreProtoPath, 'utf-8');
  const requiredFlags = ['--viktorUuid', '--reqLedger', '--conversationId', '--turnMarker'];
  for (const flag of requiredFlags) {
    if (!coreProtoContent.includes(flag)) {
      throw new Error(`fleet-protocol.md missing canonical QA runner flag: ${flag}`);
    }
    if (!skillMdContent.includes(flag)) {
      throw new Error(`skills/hermes/SKILL.md missing canonical QA runner flag: ${flag}`);
    }
  }

  const newRefs = [
    'skills/hermes/references/specialist-dispatch-matrix.md',
    'skills/hermes/references/orchestrator-planning.md',
    'skills/hermes/references/orchestrator-parallel.md',
    'skills/hermes/references/spec-driven-templates.md',
    'skills/hermes/references/skill-index.md',
    'skills/hermes/scripts/journal.mjs',
    'docs/adr/ADR-0002-refinery-merge-queue.md',
    'docs/adr/ADR-0004-enterprise-sandboxing-and-durable-journal.md',
    'scripts/refinery.mjs'
  ];
  for (const rel of newRefs) {
    const full = path.join(rootDir, rel);
    if (!fs.existsSync(full)) {
      throw new Error(`Missing expected modular reference file: ${rel}`);
    }
  }

  const noticesContent = fs.readFileSync(path.join(rootDir, 'THIRD_PARTY_NOTICES.md'), 'utf-8');
  if (!noticesContent.includes('BMAD-METHOD') || !noticesContent.includes('gastownhall/gastown') || !noticesContent.includes('github/spec-kit')) {
    throw new Error('THIRD_PARTY_NOTICES.md missing BMAD-METHOD, gastownhall/gastown, or github/spec-kit attribution');
  }

  const backlogContent = fs.readFileSync(path.join(rootDir, 'docs', 'backlog.md'), 'utf-8');
  if (!backlogContent.includes('TASK-001') || !backlogContent.includes('COMPLETED in v3.9.0')) {
    throw new Error('docs/backlog.md missing TASK-001 completion status');
  }
  if (!backlogContent.includes('TASK-003') || !backlogContent.includes('TASK-004') || !backlogContent.includes('TASK-005')) {
    throw new Error('docs/backlog.md missing TASK-003, TASK-004, or TASK-005 entries');
  }
});

// 18. Anti-drift locks: CHANGELOG top version, README versions, and dynamic skill roster & counters
await test('anti_drift_changelog_readme_and_dynamic_skills_locks', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(rootDir, 'plugin.json'), 'utf-8'));

  // (a) Top entry of CHANGELOG.md == plugin.json.version
  const changelogPath = path.join(rootDir, 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) throw new Error('CHANGELOG.md missing');
  const changelog = fs.readFileSync(changelogPath, 'utf-8');
  const topMatch = changelog.match(/^##\s*\[(\d+\.\d+\.\d+)\]/m);
  if (!topMatch) throw new Error('Failed to parse top release version from CHANGELOG.md');
  const topChangelogVer = topMatch[1];
  if (topChangelogVer !== plugin.version) {
    throw new Error(`CHANGELOG.md top entry [${topChangelogVer}] does not match plugin.json version (${plugin.version})`);
  }

  // (b) Version in README.md (and README.ru.md) header == manifest
  const readmeEnPath = path.join(rootDir, 'README.md');
  const readmeRuPath = path.join(rootDir, 'README.ru.md');
  if (!fs.existsSync(readmeEnPath)) throw new Error('README.md missing');
  if (!fs.existsSync(readmeRuPath)) throw new Error('README.ru.md missing');

  const readmeEn = fs.readFileSync(readmeEnPath, 'utf-8');
  const readmeRu = fs.readFileSync(readmeRuPath, 'utf-8');

  const enTitleMatch = readmeEn.match(/^#\s+[^\r\n]+\(v(\d+\.\d+\.\d+)\)/m);
  if (!enTitleMatch || enTitleMatch[1] !== plugin.version) {
    throw new Error(`README.md title version (${enTitleMatch ? enTitleMatch[1] : 'null'}) does not match plugin.json (${plugin.version})`);
  }
  const ruTitleMatch = readmeRu.match(/^#\s+[^\r\n]+\(v(\d+\.\d+\.\d+)\)/m);
  if (!ruTitleMatch || ruTitleMatch[1] !== plugin.version) {
    throw new Error(`README.ru.md title version (${ruTitleMatch ? ruTitleMatch[1] : 'null'}) does not match plugin.json (${plugin.version})`);
  }

  // (c) Counter and list of skills in README.md & README.ru.md == actual disk count and names (dynamic calculation, zero new hardcoded strings)
  const skillsDir = path.join(rootDir, 'skills');
  const actualSkills = fs.readdirSync(skillsDir)
    .filter((f) => fs.existsSync(path.join(skillsDir, f, 'SKILL.md')))
    .sort();
  const actualSkillsCount = actualSkills.length;

  for (const [docName, docContent] of [['README.md', readmeEn], ['README.ru.md', readmeRu]]) {
    const countPattern = new RegExp(`\\b${actualSkillsCount}\\s+(?:industrial|professional|промышленных|профессиональных)\\s+(?:skills?|скилл(?:ов|а)?)`, 'i');
    if (!countPattern.test(docContent)) {
      throw new Error(`${docName} does not declare the current dynamic skill count (${actualSkillsCount})`);
    }

    for (const skillName of actualSkills) {
      const skillPattern = new RegExp(`skills/${skillName}/SKILL\\.md|\\\`\\[?${skillName}\\]?\\\``);
      if (!skillPattern.test(docContent)) {
        throw new Error(`${docName} missing reference/link to actual disk skill '${skillName}'`);
      }
    }
  }
});

// 19. REQ-6 (v4.7.1): Council Stage 2 artifact-first clause & independent-grading-protocol presence
await test('council_critic_artifact_first_clause_present', () => {
  const councilProtoPath = path.join(rootDir, 'skills', 'hermes', 'references', 'specialist-council-protocol.md');
  if (!fs.existsSync(councilProtoPath)) throw new Error('specialist-council-protocol.md missing');
  const txt = fs.readFileSync(councilProtoPath, 'utf-8');
  if (!/git diff/i.test(txt) || !/test-summary\.json/i.test(txt) || !/Artifact-First|самостоятельно читать/i.test(txt)) {
    throw new Error('specialist-council-protocol.md missing Stage 2 artifact-first clause requiring critic to read git diff & .hermes/test-summary.json directly');
  }
  const gradingProtoPath = path.join(rootDir, 'skills', 'hermes', 'references', 'independent-grading-protocol.md');
  if (!fs.existsSync(gradingProtoPath)) {
    throw new Error('skills/hermes/references/independent-grading-protocol.md is missing');
  }
});

// 20. REQ-7 (v4.7.1): Eval suite cards (eval-001..005) schema & anti-contamination validation
await test('eval_cards_schema_valid', () => {
  const evalsDir = path.join(rootDir, 'docs', 'evals');
  const readmePath = path.join(evalsDir, 'README.md');
  if (!fs.existsSync(readmePath)) throw new Error('docs/evals/README.md missing');
  const readmeTxt = fs.readFileSync(readmePath, 'utf-8');
  if (!/answer_key/i.test(readmeTxt) || !/eval-record\.mjs/i.test(readmeTxt)) {
    throw new Error('docs/evals/README.md missing answer_key isolation or eval-record.mjs documentation');
  }
  const recordScript = path.join(rootDir, 'scripts', 'eval-record.mjs');
  if (!fs.existsSync(recordScript)) throw new Error('scripts/eval-record.mjs missing');

  const requiredIds = ['eval-001', 'eval-002', 'eval-003', 'eval-004', 'eval-005'];
  for (const id of requiredIds) {
    const p = path.join(evalsDir, `${id}.json`);
    if (!fs.existsSync(p)) throw new Error(`Missing eval card: docs/evals/${id}.json`);
    const card = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (card.id !== id) throw new Error(`${id}.json id mismatch: ${card.id}`);
    for (const field of ['source_incident', 'prompt', 'rubric', 'answer_key', 'pass_threshold', 'run_protocol']) {
      if (card[field] === undefined || card[field] === null) {
        throw new Error(`${id}.json missing required field '${field}'`);
      }
    }
    if (typeof card.source_incident !== 'string' || card.source_incident.trim().length < 10) {
      throw new Error(`${id}.json source_incident must reference a real incident/commit/task`);
    }
    if (typeof card.prompt !== 'string' || card.prompt.trim().length < 10) {
      throw new Error(`${id}.json prompt must be non-empty`);
    }
    if (!Array.isArray(card.rubric) || card.rubric.length < 1) {
      throw new Error(`${id}.json rubric must be a non-empty array`);
    }
    const stripped = card.run_protocol?.stripped_fields;
    if (!Array.isArray(stripped) || !stripped.includes('answer_key')) {
      throw new Error(`${id}.json run_protocol.stripped_fields must include 'answer_key'`);
    }
  }
  // Verify eval-001 specifically references tailscale-webos 2f600cf
  const e1 = JSON.parse(fs.readFileSync(path.join(evalsDir, 'eval-001.json'), 'utf-8'));
  if (!/2f600cf/i.test(e1.source_incident) || !/1055/.test(JSON.stringify(e1))) {
    throw new Error('eval-001.json must reference tailscale-webos@2f600cf and port 1055 invariant');
  }
});

// 21. REQ-9 (v4.7.1): No A2A in README Roadmaps, A2A rejected in backlog/boundaries, 19 protected paths
await test('no_a2a_in_roadmap', async () => {
  for (const doc of ['README.md', 'README.ru.md']) {
    const content = fs.readFileSync(path.join(rootDir, doc), 'utf-8');
    const roadmapMatch = content.match(/##\s+🗺️[^\n]*\r?\n([\s\S]*?)(?:\r?\n---|\r?\n##\s+|$)/);
    if (!roadmapMatch) throw new Error(`Could not locate Roadmap section in ${doc}`);
    if (/\bA2A\b/i.test(roadmapMatch[1])) {
      throw new Error(`${doc} Roadmap still mentions A2A (must be removed; A2A is rejected per Worse Together 2026-11-11)`);
    }
  }
  const backlog = fs.readFileSync(path.join(rootDir, 'docs', 'backlog.md'), 'utf-8');
  if (!/A2A/i.test(backlog) || !/Worse Together/i.test(backlog) || !/HOLD|REJECTED/i.test(backlog)) {
    throw new Error('docs/backlog.md must record A2A as HOLD/REJECTED citing Worse Together');
  }
  const boundaries = fs.readFileSync(path.join(rootDir, 'docs', 'known-boundaries.md'), 'utf-8');
  if (!/Worse Together/i.test(boundaries) || !/19/.test(boundaries)) {
    throw new Error('docs/known-boundaries.md must document A2A rejection (Worse Together) and 19 protected paths');
  }
  const cv = await import('./consent-validator.mjs');
  if (!Array.isArray(cv.DEFAULT_PROTECTED_VERDICT_PATHS) || cv.DEFAULT_PROTECTED_VERDICT_PATHS.length !== 19) {
    throw new Error(`Expected 19 protected paths in DEFAULT_PROTECTED_VERDICT_PATHS, got ${cv.DEFAULT_PROTECTED_VERDICT_PATHS?.length}`);
  }
});

// 22. FINDING-8 (v4.7.1): Running guard + qa-gate test suites MUST NOT mutate or delete live cwd/.hermes/
await test('test_run_does_not_mutate_live_hermes_dir', async () => {
  const os = await import('node:os');
  const crypto = await import('node:crypto');
  const { spawnSync } = await import('node:child_process');
  const seededWs = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-finding8-live-'));
  try {
    const hermesDir = path.join(seededWs, '.hermes');
    fs.mkdirSync(hermesDir, { recursive: true });
    fs.writeFileSync(path.join(hermesDir, 'council-state.json'), JSON.stringify({ status: 'APPROVED', taskHash: 'live000011112222', mode: 'roundtable' }, null, 2), 'utf-8');
    fs.writeFileSync(path.join(hermesDir, 'plan-state.json'), JSON.stringify({ status: 'confirmed', taskHash: 'live000011112222', version: 1 }, null, 2), 'utf-8');
    fs.writeFileSync(path.join(hermesDir, 'rubric.json'), JSON.stringify({ taskHash: 'live000011112222', items: [] }, null, 2), 'utf-8');
    fs.writeFileSync(path.join(hermesDir, 'gate-log.jsonl'), '{"decision":"allow","live":true}\n', 'utf-8');

    const snapshotDir = (dir) => {
      const entries = fs.readdirSync(dir).sort();
      return entries.map((name) => {
        const bytes = fs.readFileSync(path.join(dir, name));
        return `${name}:${bytes.length}:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
      }).join('|');
    };
    const before = snapshotDir(hermesDir);

    for (const suite of ['hooks/clean-edits-guard.test.mjs', 'hooks/qa-gate.test.mjs']) {
      const res = spawnSync('node', [path.join(rootDir, suite)], {
        cwd: seededWs,
        encoding: 'utf-8',
        env: { ...process.env }
      });
      if (res.status !== 0) {
        throw new Error(`Suite ${suite} failed under seeded live cwd (exit ${res.status}): ${(res.stderr || res.stdout || '').slice(-400)}`);
      }
    }

    const after = snapshotDir(hermesDir);
    if (before !== after) {
      throw new Error(`FINDING-8 regression: live cwd/.hermes/ was mutated during test run!\nBEFORE: ${before}\nAFTER:  ${after}`);
    }
  } finally {
    fs.rmSync(seededWs, { recursive: true, force: true });
  }
});

console.log(`CONSISTENCY SUMMARY: ${totalTests - failed}/${totalTests} passed`);
if (failed > 0) process.exit(1);
