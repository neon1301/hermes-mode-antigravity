// hooks/doc-lint.test.mjs
// Dedicated doc-lint verification suite for Hermes Fleet skills.
// Executes all 15 skill verification scripts to assert pattern compliance,
// reference integrity, and mechanical budgets.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

const VERIFY_SCRIPTS = [
  'skills/ai-rag-engineering/scripts/verify-hybrid-rag-patterns.mjs',
  'skills/backend-architecture/scripts/verify-zero-alloc-patterns.mjs',
  'skills/c4-architecture-mermaid/scripts/verify-living-c4-patterns.mjs',
  'skills/code-refactoring-modernization/scripts/verify-ast-modernization-patterns.mjs',
  'skills/compliance-policy-as-code/scripts/verify-thermonuclear-review.mjs',
  'skills/frontend-design/scripts/verify-winforms-patterns.mjs',
  'skills/hardware-protocol-simulation/scripts/verify-fault-injection-patterns.mjs',
  'skills/high-load-db-tuning/scripts/verify-deadlock-killer-patterns.mjs',
  'skills/office-documents/scripts/verify-office-documents-patterns.mjs',
  'skills/procedural-3d-digital-twin/scripts/verify-vram-hygiene-patterns.mjs',
  'skills/product-ux-scouting/scripts/verify-nielsen-roast-patterns.mjs',
  'skills/qa-test-automation/scripts/verify-flaui-desktop-e2e.mjs',
  'skills/reverse-engineer-anything/scripts/verify-frame-disassembly-patterns.mjs',
  'skills/sap-enterprise-automation/scripts/verify-sap-nco-hygiene.mjs',
  'skills/socket-network-diagnostics/scripts/verify-pipeline-streaming-patterns.mjs'
];

let passed = 0;
let failed = 0;

for (const relPath of VERIFY_SCRIPTS) {
  const testName = path.basename(relPath, '.mjs').replace(/-/g, '_');
  const fullPath = path.join(rootDir, relPath);

  if (!fs.existsSync(fullPath)) {
    failed++;
    console.error(`FAIL ${testName}: missing script file ${relPath}`);
    continue;
  }

  const res = spawnSync('node', [fullPath], {
    cwd: rootDir,
    encoding: 'utf-8',
    env: { ...process.env }
  });

  if (res.status === 0) {
    passed++;
    console.log(`PASS ${testName}`);
  } else {
    failed++;
    console.error(`FAIL ${testName} (exit ${res.status}): ${res.stderr || res.stdout}`);
  }
}

const total = passed + failed;
console.log(`DOC-LINT SUMMARY: ${passed}/${total} passed`);

if (failed > 0) {
  process.exit(1);
}
