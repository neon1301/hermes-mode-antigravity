import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseSimpleYamlFrontmatter,
  loadRules,
  evaluateCondition,
  evaluateRules,
  formatRulesSummary
} from './rule-engine.mjs';

const testDir = path.join(os.tmpdir(), `hermes-rule-engine-test-${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });

function cleanup() {
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {}
}

let passed = 0;
let failed = 0;

function assert(cond, name) {
  if (cond) {
    console.log(`PASS ${name}`);
    passed++;
  } else {
    console.error(`FAIL ${name}`);
    failed++;
  }
}

try {
  // Test 1: parseSimpleYamlFrontmatter
  const sample = `---
name: test-rule
enabled: true
event: PreToolUse
action: block
conditions:
  - field: CommandLine
    operator: contains
    pattern: rm -rf
---
Do not run rm -rf!`;

  const parsed = parseSimpleYamlFrontmatter(sample);
  assert(parsed && parsed.frontmatter.name === 'test-rule', 'parseSimpleYamlFrontmatter name');
  assert(parsed.frontmatter.action === 'block', 'parseSimpleYamlFrontmatter action');
  assert(parsed.frontmatter.conditions.length === 1, 'parseSimpleYamlFrontmatter conditions length');
  assert(parsed.frontmatter.conditions[0].operator === 'contains', 'parseSimpleYamlFrontmatter operator');
  assert(parsed.body === 'Do not run rm -rf!', 'parseSimpleYamlFrontmatter body');

  // Test 2: evaluateCondition with all 6 operators
  assert(evaluateCondition({ field: 'text', operator: 'regex_match', pattern: '^abc\\d+' }, { text: 'abc1234' }), 'condition regex_match');
  assert(evaluateCondition({ field: 'text', operator: 'contains', pattern: 'world' }, { text: 'hello world!' }), 'condition contains');
  assert(evaluateCondition({ field: 'text', operator: 'not_contains', pattern: 'secret' }, { text: 'public info' }), 'condition not_contains');
  assert(evaluateCondition({ field: 'text', operator: 'equals', pattern: 'exact' }, { text: 'exact' }), 'condition equals');
  assert(evaluateCondition({ field: 'text', operator: 'starts_with', pattern: 'prefix' }, { text: 'prefix_file.txt' }), 'condition starts_with');
  assert(evaluateCondition({ field: 'text', operator: 'ends_with', pattern: '.cs' }, { text: 'Service.cs' }), 'condition ends_with');

  // Test 3: fail-open on malformed YAML or bad regex
  assert(evaluateCondition({ field: 'text', operator: 'regex_match', pattern: '[unclosed' }, { text: 'test' }) === false, 'fail-open on bad regex');
  assert(parseSimpleYamlFrontmatter('not valid yaml') === null, 'fail-open on bad yaml');

  // Test 4: loadRules and evaluateRules
  const rule1 = `---
name: block-dangerous-cmd
enabled: true
event: PreToolUse
action: block
conditions:
  - field: CommandLine
    operator: contains
    pattern: drop database
---
Forbidden to drop database!`;
  fs.writeFileSync(path.join(testDir, 'rule1.md'), rule1, 'utf-8');

  const rule2 = `---
name: warn-todo
enabled: true
event: PreToolUse
action: warn
conditions:
  - field: Content
    operator: contains
    pattern: TODO_HACK
---
Please clean up TODO_HACK`;
  fs.writeFileSync(path.join(testDir, 'rule2.md'), rule2, 'utf-8');

  // Disabled rule
  const rule3 = `---
name: disabled-rule
enabled: false
event: PreToolUse
action: block
conditions:
  - field: CommandLine
    operator: contains
    pattern: format c:
---
Disabled`;
  fs.writeFileSync(path.join(testDir, 'rule3.md'), rule3, 'utf-8');

  const rules = loadRules(testDir);
  assert(rules.length === 2, 'loadRules ignores disabled');

  const resBlock = evaluateRules({
    event: 'PreToolUse',
    context: { CommandLine: 'sudo drop database prod;' },
    rulesDir: testDir
  });
  assert(resBlock.blocked === true, 'evaluateRules blocks on matching rule');
  assert(resBlock.blockingRules[0].name === 'block-dangerous-cmd', 'evaluateRules identifies blocking rule');

  const resWarn = evaluateRules({
    event: 'PreToolUse',
    context: { Content: 'var x = 1; // TODO_HACK' },
    rulesDir: testDir
  });
  assert(resWarn.blocked === false, 'evaluateRules does not block on warn-only');
  assert(resWarn.warningRules.length === 1, 'evaluateRules identifies warning rule');

  const resIgnoreEvent = evaluateRules({
    event: 'Stop',
    context: { CommandLine: 'sudo drop database prod;' },
    rulesDir: testDir
  });
  assert(resIgnoreEvent.blocked === false, 'evaluateRules filters by event');

  const summary = formatRulesSummary(testDir);
  assert(summary.includes('block-dangerous-cmd') && summary.includes('warn-todo'), 'formatRulesSummary outputs rule table');
} finally {
  cleanup();
}

console.log(`RULE-ENGINE SUMMARY: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
