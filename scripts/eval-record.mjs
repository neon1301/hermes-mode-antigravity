#!/usr/bin/env node
/**
 * Hermes Fleet Enterprise — Mechanical Eval Result Recorder (REQ-7, v4.7.1)
 * Pure Node.js stdlib CLI & library.
 * Appends to protected `.hermes/eval-results.jsonl` STRICTLY from an authentic
 * protected `.hermes/grade-report.json` + validated `cardId` in `docs/evals/`.
 * Missing/corrupt/forged grade-report or unknown cardId -> hard fail (non-zero exit), zero writes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProtectedJsonlStrict, readProtectedJsonStrict } from '../hooks/consent-validator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRepoRoot = path.resolve(__dirname, '..');

const CARD_ID_RE = /^eval-\d{3}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_OVERALL = new Set(['PASS', 'REWORK', 'NEEDS_HUMAN']);
const VALID_VERDICTS = new Set(['FULFILLED', 'NOT_FULFILLED', 'UNKNOWN']);

export function recordEvalResult({
  workspaceDir = process.cwd(),
  cardId = '',
  evalsDir = path.join(defaultRepoRoot, 'docs', 'evals')
} = {}) {
  const cleanCardId = String(cardId || '').trim();
  if (!CARD_ID_RE.test(cleanCardId)) {
    throw new Error(`Invalid cardId '${cleanCardId}': expected format eval-NNN (e.g. eval-001)`);
  }

  const cardPath = path.join(evalsDir, `${cleanCardId}.json`);
  if (!fs.existsSync(cardPath)) {
    throw new Error(`Eval card not found: ${cardPath}`);
  }

  let card;
  try {
    card = JSON.parse(fs.readFileSync(cardPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Corrupt eval card ${cleanCardId}.json: ${err?.message || 'invalid JSON'}`);
  }
  if (!card || card.id !== cleanCardId) {
    throw new Error(`Eval card id mismatch in ${cleanCardId}.json (got '${card?.id}')`);
  }

  const reportPath = path.join(workspaceDir, '.hermes', 'grade-report.json');
  const reportRes = readProtectedJsonStrict(reportPath, '.hermes/grade-report.json');
  if (!reportRes || !reportRes.data) {
    throw new Error('Missing protected .hermes/grade-report.json — cannot fabricate eval result without authentic grade report');
  }

  const rep = reportRes.data;
  if (rep.source !== 'mechanical') {
    throw new Error(`Untrusted grade-report.json source '${rep.source}': expected 'mechanical'`);
  }
  if (!rep.taskHash || typeof rep.taskHash !== 'string' || rep.taskHash.length < 8) {
    throw new Error('Invalid or missing taskHash in .hermes/grade-report.json');
  }
  if (!rep.planHash || typeof rep.planHash !== 'string' || rep.planHash.length < 16) {
    throw new Error('Invalid or missing planHash in .hermes/grade-report.json');
  }
  if (!rep.rubricHash || typeof rep.rubricHash !== 'string' || rep.rubricHash.length < 16) {
    throw new Error('Invalid or missing rubricHash in .hermes/grade-report.json');
  }
  if (!rep.graderUuid || !UUID_RE.test(String(rep.graderUuid))) {
    throw new Error('Invalid or missing graderUuid in .hermes/grade-report.json');
  }
  if (!VALID_OVERALL.has(rep.overall)) {
    throw new Error(`Invalid overall '${rep.overall}' in .hermes/grade-report.json`);
  }
  if (!Array.isArray(rep.items) || rep.items.length === 0) {
    throw new Error('Empty or missing items[] in .hermes/grade-report.json');
  }
  for (const it of rep.items) {
    if (!it?.reqId || !VALID_VERDICTS.has(it?.verdict)) {
      throw new Error(`Invalid item in .hermes/grade-report.json: ${JSON.stringify(it)}`);
    }
  }
  if (!rep.ts || Number.isNaN(Date.parse(rep.ts))) {
    throw new Error('Invalid or missing ISO-8601 ts in .hermes/grade-report.json');
  }

  // Re-verify overall consistency (anti-tamper defense-in-depth)
  const hasUnknown = rep.items.some((i) => i.verdict === 'UNKNOWN');
  const hasNotFulfilled = rep.items.some((i) => i.verdict === 'NOT_FULFILLED');
  const computedOverall = hasUnknown ? 'NEEDS_HUMAN' : (hasNotFulfilled ? 'REWORK' : 'PASS');
  if (rep.overall !== computedOverall) {
    throw new Error(`Tampered grade-report.json: overall='${rep.overall}' contradicts items (computed '${computedOverall}')`);
  }

  const fulfilledCount = rep.items.filter((i) => i.verdict === 'FULFILLED').length;
  const resultsPath = path.join(workspaceDir, '.hermes', 'eval-results.jsonl');
  const existing = readProtectedJsonlStrict(resultsPath, '.hermes/eval-results.jsonl');

  const dedupKey = `${cleanCardId}|${rep.taskHash}|${rep.planHash}|${rep.rubricHash}|${rep.overall}`;
  const duplicate = existing.find((r) => r.dedupKey === dedupKey);
  if (duplicate) {
    return { recorded: false, duplicate: true, entry: duplicate, resultsPath };
  }

  const entry = {
    ts: new Date().toISOString(),
    cardId: cleanCardId,
    dedupKey,
    taskHash: rep.taskHash,
    planHash: rep.planHash,
    rubricHash: rep.rubricHash,
    graderUuid: rep.graderUuid,
    graderAgent: rep.graderAgent || 'unknown',
    overall: rep.overall,
    fulfilledCount,
    totalItems: rep.items.length,
    reportTs: rep.ts,
    source: 'mechanical'
  };

  const hermesDir = path.join(workspaceDir, '.hermes');
  if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
  fs.appendFileSync(resultsPath, JSON.stringify(entry) + '\n', 'utf-8');
  return { recorded: true, duplicate: false, entry, resultsPath };
}

function parseCliArgs(argv) {
  const opts = { workspaceDir: process.cwd(), cardId: '', evalsDir: path.join(defaultRepoRoot, 'docs', 'evals') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--card=')) opts.cardId = a.slice('--card='.length);
    else if (a === '--card' && argv[i + 1]) opts.cardId = argv[++i];
    else if (a.startsWith('--workspace=')) opts.workspaceDir = path.resolve(a.slice('--workspace='.length));
    else if (a === '--workspace' && argv[i + 1]) opts.workspaceDir = path.resolve(argv[++i]);
    else if (a.startsWith('--evals-dir=')) opts.evalsDir = path.resolve(a.slice('--evals-dir='.length));
    else if (a === '--evals-dir' && argv[i + 1]) opts.evalsDir = path.resolve(argv[++i]);
    else if (/^--(?:status|overall|score|pass|verdict)/i.test(a)) {
      throw new Error(`Forbidden manual override flag '${a}': eval results are derived strictly from protected .hermes/grade-report.json`);
    }
  }
  return opts;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  try {
    const opts = parseCliArgs(process.argv.slice(2));
    const res = recordEvalResult(opts);
    process.stdout.write(JSON.stringify(res, null, 2) + '\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`EVAL-RECORD ERROR: ${err?.message || String(err)}\n`);
    process.exit(1);
  }
}
