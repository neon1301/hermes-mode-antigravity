import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateSessionReport } from './session-report.mjs';

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

test('session_report_generates_markdown_with_freshness_and_zero_token_fabrication', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-report-test-'));
  const hermesDir = path.join(tmpDir, '.hermes');
  fs.mkdirSync(hermesDir, { recursive: true });

  const gateLog = path.join(hermesDir, 'gate-log.jsonl');
  fs.writeFileSync(gateLog, [
    JSON.stringify({ timestamp: new Date().toISOString(), decision: 'allow', reason: 'pass' }),
    JSON.stringify({ timestamp: new Date().toISOString(), decision: 'continue', reason: 'qa missing' })
  ].join('\n') + '\n', 'utf-8');

  const costLog = path.join(hermesDir, 'cost-log.jsonl');
  fs.writeFileSync(costLog, [
    JSON.stringify({ editedFilesCount: 2, toolCallsCount: 5, event: 'Stop' })
  ].join('\n') + '\n', 'utf-8');

  const report = generateSessionReport(tmpDir);

  if (!report.includes('# 📊 Отчёт о сессии Hermes Fleet Enterprise (/hermes report)')) {
    throw new Error('Report header missing');
  }
  if (!report.includes('Дата формирования (Rule 14)')) {
    throw new Error('Freshness header missing (Rule 14 violation)');
  }
  if (!report.includes('нет данных (хост Antigravity не предоставляет счётчики токенов)')) {
    throw new Error('Rule 13 violation: fabricated token counters found');
  }
  if (!report.includes('| **Всего проверок гейта** | 2 |')) {
    throw new Error('Gate statistics mismatch');
  }
  if (!report.includes('| **Разрешено (allow)** | 1 |')) {
    throw new Error('Gate allow count mismatch');
  }
  if (!report.includes('| **Возвратов на доработку (continue)** | 1 |')) {
    throw new Error('Gate continue count mismatch');
  }
});

test('session_report_flags_stale_data_warning_when_last_event_older_than_24h', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-report-stale-test-'));
  const hermesDir = path.join(tmpDir, '.hermes');
  fs.mkdirSync(hermesDir, { recursive: true });

  const gateLog = path.join(hermesDir, 'gate-log.jsonl');
  const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  fs.writeFileSync(gateLog, JSON.stringify({ timestamp: staleDate, decision: 'allow' }) + '\n', 'utf-8');

  const report = generateSessionReport(tmpDir);
  if (!report.includes('[!WARNING]')) {
    throw new Error('Expected stale data warning banner (Rule 14)');
  }
});

console.log(`SESSION-REPORT SUMMARY: ${total - failed}/${total} passed`);
if (failed > 0) process.exit(1);
