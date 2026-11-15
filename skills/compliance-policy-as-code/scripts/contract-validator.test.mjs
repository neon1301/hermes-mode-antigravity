import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchema } from './contract-validator.mjs';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '../../..');
const schemasDir = path.join(rootDir, 'skills', 'compliance-policy-as-code', 'references', 'schemas');

const loadSchema = (name) => JSON.parse(fs.readFileSync(path.join(schemasDir, name), 'utf-8'));

let total = 0;
let failed = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

// 1. Contract Proposal Schema Tests
const proposalSchema = loadSchema('contract-proposal.schema.json');
test('valid_contract_proposal', () => {
  const valid = {
    proposalId: 'prop-101',
    sender: 'dmitry',
    recipient: 'elena',
    status: 'PROPOSED',
    endpoints: [
      { path: '/api/v1/telemetry', method: 'GET', responseDto: 'TelemetryDto' }
    ]
  };
  const res = validateSchema(valid, proposalSchema);
  if (!res.valid) throw new Error(`Expected valid, got errors: ${JSON.stringify(res.errors)}`);
});

test('invalid_contract_proposal_missing_endpoints', () => {
  const invalid = {
    proposalId: 'prop-101',
    sender: 'dmitry',
    recipient: 'elena',
    status: 'PROPOSED'
  };
  const res = validateSchema(invalid, proposalSchema);
  if (res.valid) throw new Error('Expected invalid due to missing endpoints');
});

test('invalid_contract_proposal_bad_enum_status', () => {
  const invalid = {
    proposalId: 'prop-101',
    sender: 'dmitry',
    recipient: 'elena',
    status: 'UNKNOWN_STATUS',
    endpoints: []
  };
  const res = validateSchema(invalid, proposalSchema);
  if (res.valid) throw new Error('Expected invalid due to bad enum');
});

// 2. Patch Blueprint Schema Tests
const blueprintSchema = loadSchema('patch-blueprint.schema.json');
test('valid_patch_blueprint', () => {
  const valid = {
    reqId: 'REQ-1',
    author: 'sergey',
    rootCause: 'Dead code in god-class',
    edits: [
      { path: 'src/Service.cs', startLine: 10, endLine: 25, target: 'old()', replacement: 'new()' }
    ]
  };
  const res = validateSchema(valid, blueprintSchema);
  if (!res.valid) throw new Error(`Expected valid, got errors: ${JSON.stringify(res.errors)}`);
});

test('invalid_patch_blueprint_missing_replacement', () => {
  const invalid = {
    reqId: 'REQ-1',
    author: 'sergey',
    edits: [
      { path: 'src/Service.cs', target: 'old()' }
    ]
  };
  const res = validateSchema(invalid, blueprintSchema);
  if (res.valid) throw new Error('Expected invalid due to missing replacement in edit');
});

// 3. Security Verdict Schema Tests
const secSchema = loadSchema('security-verdict.schema.json');
test('valid_security_verdict', () => {
  const valid = {
    status: 'PASS',
    ackToken: 'viktor-sec-review-v3.7.0',
    diffHash: 'a1b2c3d4e5f6',
    conversationId: 'conv-123',
    turnMarker: 1,
    reviewedAt: new Date().toISOString(),
    unresolvedHighCritical: 0
  };
  const res = validateSchema(valid, secSchema);
  if (!res.valid) throw new Error(`Expected valid, got errors: ${JSON.stringify(res.errors)}`);
});

test('invalid_security_verdict_non_zero_unresolved', () => {
  const invalid = {
    status: 'PASS',
    ackToken: 'viktor-sec-review-v3.7.0',
    diffHash: 'a1b2c3d4e5f6',
    conversationId: 'conv-123',
    reviewedAt: new Date().toISOString(),
    unresolvedHighCritical: 2
  };
  const res = validateSchema(invalid, secSchema);
  if (res.valid) throw new Error('Expected invalid due to unresolvedHighCritical > 0');
});

// 4. QA Verdict Schema Tests
const qaSchema = loadSchema('qa-verdict.schema.json');
test('valid_qa_verdict', () => {
  const valid = {
    status: 'PASS',
    agent: 'viktor',
    reqsVerified: ['REQ-1', 'REQ-2'],
    timestamp: new Date().toISOString()
  };
  const res = validateSchema(valid, qaSchema);
  if (!res.valid) throw new Error(`Expected valid, got errors: ${JSON.stringify(res.errors)}`);
});

test('invalid_qa_verdict_bad_status', () => {
  const invalid = {
    status: 'MAYBE',
    agent: 'viktor',
    reqsVerified: [],
    timestamp: new Date().toISOString()
  };
  const res = validateSchema(invalid, qaSchema);
  if (res.valid) throw new Error('Expected invalid due to non-PASS/REJECT status');
});

console.log(`CONTRACT-VALIDATOR SUMMARY: ${total - failed}/${total} passed`);
if (failed > 0) process.exit(1);
