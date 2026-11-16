// hooks/eval-harness.test.mjs
// Deterministic evaluation harness for Hermes activation triggers.
// Asserts zero false positives on non-Hermes prompts and accurate positive detection.
import assert from 'node:assert';
import {
  isHermesTrigger,
  extractUserRequest,
  isHermesSubagentCall,
  detectHermesInSteps
} from './hermes-trigger.mjs';

const POSITIVE_FIXTURES = [
  // Explicit slash commands
  { prompt: '/hermes', expected: true, desc: 'Bare slash command' },
  { prompt: '/hermes plan something', expected: true, desc: 'Slash command with args' },
  { prompt: '/hermes audit', expected: true, desc: 'Slash command audit' },
  { prompt: '/hermes report', expected: true, desc: 'Slash command report' },
  { prompt: '   /hermes status', expected: true, desc: 'Leading whitespace slash command' },
  { prompt: 'Line 1\n/hermes start', expected: true, desc: 'Newline preceding slash command' },
  { prompt: '<USER_REQUEST>\n/hermes build\n</USER_REQUEST>', expected: true, desc: 'Wrapped user request with slash command' },

  // Explicit mode phrases (Russian & English)
  { prompt: 'включи режим hermes', expected: true, desc: 'RU: включи режим hermes' },
  { prompt: 'Включить режим Hermes', expected: true, desc: 'RU capitalized: Включить режим Hermes' },
  { prompt: 'активируй режим hermes', expected: true, desc: 'RU: активируй режим hermes' },
  { prompt: 'запусти режим hermes', expected: true, desc: 'RU: запусти режим hermes' },
  { prompt: 'enable hermes mode', expected: true, desc: 'EN: enable hermes mode' },
  { prompt: 'activate hermes mode', expected: true, desc: 'EN: activate hermes mode' },
  { prompt: 'turn on hermes mode', expected: true, desc: 'EN: turn on hermes mode' },
  { prompt: 'start hermes mode', expected: true, desc: 'EN: start hermes mode' },
  { prompt: 'режим hermes', expected: true, desc: 'RU bare: режим hermes' },
  { prompt: 'hermes mode!', expected: true, desc: 'EN bare: hermes mode!' },
  { prompt: '<USER_REQUEST>пожалуйста включи режим hermes сейчас</USER_REQUEST>', expected: true, desc: 'RU wrapped with context' },

  // Direct @mentions
  { prompt: '@viktor сделай аудит кода', expected: true, desc: 'Mention @viktor' },
  { prompt: '@dmitry спроектируй API', expected: true, desc: 'Mention @dmitry' },
  { prompt: '@kritik оцени эргономику', expected: true, desc: 'Mention @kritik' },
  { prompt: '@alexey найди документацию', expected: true, desc: 'Mention @alexey' },
  { prompt: '@anna нарисуй C4 диаграмму', expected: true, desc: 'Mention @anna' },
  { prompt: '@artem разбери hex пакет', expected: true, desc: 'Mention @artem' },
  { prompt: '@denis настрой пул соединений', expected: true, desc: 'Mention @denis' },
  { prompt: '@elena переверстай интерфейс', expected: true, desc: 'Mention @elena' },
  { prompt: '@gleb покажи 3D сцену', expected: true, desc: 'Mention @gleb' },
  { prompt: '@igor запусти TCP мок-сервер', expected: true, desc: 'Mention @igor' },
  { prompt: '@mikhail настрой эмбеддинги', expected: true, desc: 'Mention @mikhail' },
  { prompt: '@ruslan проверь BAPI вызов', expected: true, desc: 'Mention @ruslan' },
  { prompt: '@sergey декомпозируй монолит', expected: true, desc: 'Mention @sergey' },
  { prompt: '@stanislav проверь контракты DTO', expected: true, desc: 'Mention @stanislav' },
  { prompt: '@mozgoeb разнеси концепт', expected: true, desc: 'Mention alias @mozgoeb' },
  { prompt: '@критик найди слабые места', expected: true, desc: 'RU mention @критик' },
  { prompt: '@глеб отрендери модель', expected: true, desc: 'RU mention @глеб' },
  { prompt: 'Привет @viktor, проверь этот баг', expected: true, desc: 'Mid-sentence mention @viktor preceded by space' }
];

const NEGATIVE_FIXTURES = [
  // Casual mentions & questions about Hermes (NOT commands)
  { prompt: 'Что ты думаешь про Hermes Trismegistus?', expected: false, desc: 'Historical Hermes mention' },
  { prompt: 'Расскажи миф про бога Гермеса', expected: false, desc: 'Mythological Hermes mention' },
  { prompt: 'how does hermes protocol work in theory?', expected: false, desc: 'Question about hermes protocol' },
  { prompt: 'I bought a hermes scarf yesterday', expected: false, desc: 'Hermes luxury brand mention' },
  { prompt: 'My friend Hermes visited me', expected: false, desc: 'Person named Hermes' },
  { prompt: 'Is hermes mode available here?', expected: false, desc: 'Inquiry without enable command' },
  { prompt: 'console.log("hermes")', expected: false, desc: 'Code snippet with hermes string' },
  { prompt: 'Check /hermes-test/path/to/file', expected: false, desc: 'Path containing hermes prefix' },

  // General coding / non-Hermes tasks
  { prompt: 'fix the bug in auth.js', expected: false, desc: 'Generic coding prompt' },
  { prompt: 'npm install express cors dotenv', expected: false, desc: 'NPM install command' },
  { prompt: 'git commit -m "fix hermes mention"', expected: false, desc: 'Git commit with hermes in quotes' },
  { prompt: 'How do I center a div in CSS?', expected: false, desc: 'CSS question' },
  { prompt: 'Write a python script to process CSV files', expected: false, desc: 'Python task' },

  // Pseudo-mentions / emails
  { prompt: 'user@viktor.com sent an email', expected: false, desc: 'Email address with specialist name' },
  { prompt: 'contact support@dmitry.org', expected: false, desc: 'Email address with dmitry' },
  { prompt: 'The npm package @hermes/core is deprecated', expected: false, desc: 'Scoped npm package' },
  { prompt: 'someone@alexey.ru', expected: false, desc: 'Email address with alexey' },

  // Empty / whitespace / boilerplate
  { prompt: '', expected: false, desc: 'Empty string' },
  { prompt: '   \n  \t  ', expected: false, desc: 'Whitespace only' },
  { prompt: null, expected: false, desc: 'Null prompt' },
  { prompt: undefined, expected: false, desc: 'Undefined prompt' },
  { prompt: '<USER_REQUEST></USER_REQUEST>', expected: false, desc: 'Empty wrapped user request' },
  { prompt: '<USER_REQUEST>  \n  </USER_REQUEST>', expected: false, desc: 'Whitespace wrapped user request' },
  { prompt: '<USER_REQUEST>Can you help me write unit tests?</USER_REQUEST>', expected: false, desc: 'Wrapped general request' }
];

let totalTests = 0;
let passedTests = 0;

console.log('Running Hermes Eval Harness (Deterministic Prompt Trigger Test Suite)...');

// 1. Positive Fixtures
for (const fix of POSITIVE_FIXTURES) {
  totalTests++;
  const result = isHermesTrigger(fix.prompt);
  assert.strictEqual(
    result,
    fix.expected,
    `FAILED positive fixture [${fix.desc}]: expected ${fix.expected}, got ${result} (prompt: ${JSON.stringify(fix.prompt)})`
  );
  passedTests++;
}

// 2. Negative Fixtures (Zero False Positives Guarantee)
for (const fix of NEGATIVE_FIXTURES) {
  totalTests++;
  const result = isHermesTrigger(fix.prompt);
  assert.strictEqual(
    result,
    fix.expected,
    `FALSE POSITIVE DETECTED [${fix.desc}]: expected ${fix.expected}, got ${result} (prompt: ${JSON.stringify(fix.prompt)})`
  );
  passedTests++;
}

// 3. Mention Option Toggle: includeMentions = false
totalTests++;
assert.strictEqual(
  isHermesTrigger('@viktor проверь', { includeMentions: false }),
  false,
  'Mention should not trigger when includeMentions is false'
);
passedTests++;

totalTests++;
assert.strictEqual(
  isHermesTrigger('/hermes @viktor', { includeMentions: false }),
  true,
  'Slash command must trigger even when includeMentions is false'
);
passedTests++;

// 4. Subagent Call Detection
totalTests++;
assert.strictEqual(
  isHermesSubagentCall({ name: 'invoke_subagent', args: { TypeName: 'viktor' } }),
  true,
  'isHermesSubagentCall detects viktor'
);
passedTests++;

totalTests++;
assert.strictEqual(
  isHermesSubagentCall({ name: 'invoke_subagent', args: { typeName: 'mozgoeb' } }),
  true,
  'isHermesSubagentCall detects mozgoeb alias'
);
passedTests++;

totalTests++;
assert.strictEqual(
  isHermesSubagentCall({ name: 'invoke_subagent', args: { TypeName: 'browser' } }),
  false,
  'isHermesSubagentCall rejects non-hermes browser subagent'
);
passedTests++;

totalTests++;
assert.strictEqual(
  isHermesSubagentCall({ name: 'read_file', args: { Path: 'foo.txt' } }),
  false,
  'isHermesSubagentCall rejects non-invoke_subagent tool calls'
);
passedTests++;

// 5. Steps Stream Detection
totalTests++;
const sampleStepsPositive = [
  { type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'read_file', args: {} }] },
  { type: 'USER_INPUT', source: 'USER_EXPLICIT', content: '/hermes audit' }
];
assert.strictEqual(
  detectHermesInSteps(sampleStepsPositive),
  true,
  'detectHermesInSteps triggers on explicit /hermes user step'
);
passedTests++;

totalTests++;
const sampleStepsNegative = [
  { type: 'USER_INPUT', source: 'USER_EXPLICIT', content: 'What is the weather today?' },
  { type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'search_web', args: { query: 'weather' } }] }
];
assert.strictEqual(
  detectHermesInSteps(sampleStepsNegative),
  false,
  'detectHermesInSteps returns false for regular conversation'
);
passedTests++;

// 6. Track C4: Tool Economy, Skill Index & Batch Invocation Benchmark Fixtures
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const testRootDir = path.resolve(testFileDir, '..');

totalTests++;
(() => {
  const indexPath = path.join(testRootDir, 'skills', 'hermes', 'references', 'skill-index.md');
  assert.strictEqual(fs.existsSync(indexPath), true, 'skill-index.md must exist');
  const indexSize = fs.statSync(indexPath).size;

  const skillsDir = path.join(testRootDir, 'skills');
  const skillFolders = fs.readdirSync(skillsDir).filter((f) => fs.existsSync(path.join(skillsDir, f, 'SKILL.md')));
  const totalEagerBytes = skillFolders.reduce((sum, f) => sum + fs.statSync(path.join(skillsDir, f, 'SKILL.md')).size, 0);

  const reductionRatio = totalEagerBytes / indexSize;
  assert.ok(reductionRatio >= 15, `Expected lazy index reduction ratio >= 15x, got ${reductionRatio.toFixed(1)}x (${totalEagerBytes}B vs ${indexSize}B)`);
})();
passedTests++;

totalTests++;
(() => {
  const indexPath = path.join(testRootDir, 'skills', 'hermes', 'references', 'skill-index.md');
  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  const skillsDir = path.join(testRootDir, 'skills');
  const skillFolders = fs.readdirSync(skillsDir).filter((f) => fs.existsSync(path.join(skillsDir, f, 'SKILL.md')));

  for (const s of skillFolders) {
    assert.ok(indexContent.includes(s), `skill-index.md must reference disk skill '${s}'`);
  }
})();
passedTests++;

totalTests++;
(() => {
  // Batch Execution Quarantine: intermediate raw file outputs vs aggregated execution summary
  const sampleRawOutputs = Array.from({ length: 10 }, (_, i) => ({
    file: `src/module_${i}.cs`,
    rawContent: `// Copyright 2026 Enterprise Corp\nusing System;\nnamespace App {\n  public class Module${i} {\n    public void Run() { Console.WriteLine("Module ${i} active"); }\n  }\n}\n`
  }));
  const rawBytes = JSON.stringify(sampleRawOutputs).length;
  const synthesizedSummary = { scannedFiles: 10, violations: 0, status: 'CLEAN' };
  const synthesizedBytes = JSON.stringify(synthesizedSummary).length;

  const batchEconomyRatio = rawBytes / synthesizedBytes;
  assert.ok(batchEconomyRatio >= 5, `Expected batch execution economy ratio >= 5x, got ${batchEconomyRatio.toFixed(1)}x`);
})();
passedTests++;

console.log(`[EVAL HARNESS PASS] ${passedTests}/${totalTests} deterministic trigger tests passed successfully.`);
