/**
 * Hermes Fleet Enterprise - Session Activity & Metrics Reporter (REQ-10)
 * Aggregates gate logs, cost logs, and git history into a transparent session report.
 * Strictly adheres to Rule 13 (Data Honesty) & Rule 14 (Report Freshness).
 * Zero token fabrication (host does not provide token metrics).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { resolveWorkspaceDir } from './workspace.mjs';

export function generateSessionReport(dirOrPayload = null) {
  let cwd;
  if (typeof dirOrPayload === 'string') {
    cwd = dirOrPayload;
  } else if (dirOrPayload && typeof dirOrPayload === 'object') {
    cwd = resolveWorkspaceDir(dirOrPayload, process.cwd());
  } else {
    cwd = resolveWorkspaceDir(null, process.cwd());
  }
  const generatedAt = new Date().toISOString();
  const hermesDir = path.join(cwd, '.hermes');
  const gateLogPath = path.join(hermesDir, 'gate-log.jsonl');
  const costLogPath = path.join(hermesDir, 'cost-log.jsonl');

  // 1. Gate Metrics
  let gateStats = { total: 0, allow: 0, continue: 0, deny: 0, lastEvent: 'нет данных' };
  if (fs.existsSync(gateLogPath)) {
    try {
      const lines = fs.readFileSync(gateLogPath, 'utf-8').trim().split('\n').filter(Boolean);
      gateStats.total = lines.length;
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const decision = (entry.decision || '').toLowerCase();
          if (decision === 'allow') gateStats.allow++;
          else if (decision === 'continue') gateStats.continue++;
          else if (decision === 'deny') gateStats.deny++;
          if (entry.timestamp) gateStats.lastEvent = entry.timestamp;
        } catch {}
      }
    } catch {}
  }

  // 2. Cost / Activity Metrics
  let costStats = { totalEntries: 0, totalFilesEdited: 0, totalToolCalls: 0 };
  if (fs.existsSync(costLogPath)) {
    try {
      const lines = fs.readFileSync(costLogPath, 'utf-8').trim().split('\n').filter(Boolean);
      costStats.totalEntries = lines.length;
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          costStats.totalFilesEdited += Number(entry.editedFilesCount || 0);
          costStats.totalToolCalls += Number(entry.toolCallsCount || 0);
        } catch {}
      }
    } catch {}
  }

  // 3. Git Recent Commits & Diff Stats
  let gitRecentCommits = [];
  let gitDiffStat = 'нет данных';
  try {
    const rawLog = execSync('git log -n 5 --pretty=format:"%h | %an | %ad | %s" --date=short', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (rawLog) {
      gitRecentCommits = rawLog.split('\n');
    }
  } catch {}

  try {
    const rawDiff = execSync('git diff --stat HEAD~1 HEAD', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (rawDiff) {
      gitDiffStat = rawDiff;
    }
  } catch {
    try {
      const localDiff = execSync('git diff --stat', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      gitDiffStat = localDiff || 'нет изменений в рабочей копии';
    } catch {}
  }

  // 4. Test Suite Summary (Rule 13 - Machine-verified from .hermes/test-summary.json)
  let testSummary = null;
  const testSummaryPath = path.join(hermesDir, 'test-summary.json');
  if (fs.existsSync(testSummaryPath)) {
    try {
      testSummary = JSON.parse(fs.readFileSync(testSummaryPath, 'utf-8'));
    } catch {}
  }

  // 5. Findings & Resolved Rate (Track B7 - Rule 13)
  let findingsStats = { total: 0, resolved: 0, hasData: false, rateStr: 'нет данных' };
  const qaVerdictPath = path.join(hermesDir, 'qa-verdict.json');
  const findingsPath = path.join(hermesDir, 'findings.json');

  if (fs.existsSync(findingsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(findingsPath, 'utf-8'));
      const list = Array.isArray(data?.findings) ? data.findings : (Array.isArray(data) ? data : []);
      if (list.length > 0) {
        findingsStats.hasData = true;
        findingsStats.total = list.length;
        findingsStats.resolved = list.filter(f => f.status === 'resolved' || f.resolved === true).length;
      }
    } catch {}
  } else if (fs.existsSync(qaVerdictPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(qaVerdictPath, 'utf-8'));
      if (Number.isInteger(data?.totalFindings) && data.totalFindings > 0) {
        findingsStats.hasData = true;
        findingsStats.total = data.totalFindings;
        findingsStats.resolved = Number.isInteger(data?.resolvedFindings) ? data.resolvedFindings : 0;
      } else if (Array.isArray(data?.findings) && data.findings.length > 0) {
        findingsStats.hasData = true;
        findingsStats.total = data.findings.length;
        findingsStats.resolved = data.findings.filter(f => f.status === 'resolved' || f.resolved === true).length;
      }
    } catch {}
  }

  if (findingsStats.hasData && findingsStats.total > 0) {
    const pct = ((findingsStats.resolved / findingsStats.total) * 100).toFixed(1);
    findingsStats.rateStr = `${findingsStats.resolved}/${findingsStats.total} (${pct}%)`;
  }

  // 6. OpenTelemetry GenAI Telemetry (Track B8 - Rule 13)
  let otelStats = {
    hasData: false,
    inputTokens: 0,
    outputTokens: 0,
    operationsCount: 0
  };

  const logsToScan = [gateLogPath, costLogPath, path.join(hermesDir, 'journal.jsonl')];
  for (const p of logsToScan) {
    if (fs.existsSync(p)) {
      try {
        const lines = fs.readFileSync(p, 'utf-8').trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            const inTok = entry['gen_ai.usage.input_tokens'];
            const outTok = entry['gen_ai.usage.output_tokens'];
            if (typeof inTok === 'number' || typeof outTok === 'number') {
              otelStats.hasData = true;
              if (typeof inTok === 'number') otelStats.inputTokens += inTok;
              if (typeof outTok === 'number') otelStats.outputTokens += outTok;
              otelStats.operationsCount++;
            }
          } catch {}
        }
      } catch {}
    }
  }

  // 5. Stale Data Warning (Rule 14)
  let staleWarning = '';
  if (gateStats.lastEvent !== 'нет данных') {
    const lastEventMs = Date.parse(gateStats.lastEvent);
    if (!isNaN(lastEventMs) && Date.now() - lastEventMs > 24 * 60 * 60 * 1000) {
      staleWarning = '> [!WARNING]\n> Последнее зафиксированное событие в `.hermes/gate-log.jsonl` старше 24 часов. Данные могут быть устаревшими.\n\n';
    }
  }

  const testSummaryRows = testSummary && Array.isArray(testSummary.suites)
    ? testSummary.suites.map(s => `| **${s.name}** | ${s.passed} | ${s.total} | ${s.passed === s.total ? '✅ PASS' : '❌ FAIL'} |`).join('\n')
    : '| *нет данных* | - | - | Запустите npm test или verify.ps1/sh |';

  const testSummaryTotalRow = testSummary
    ? `| **ИТОГО** | **${testSummary.passed}** | **${testSummary.total}** | **${testSummary.passed === testSummary.total ? '✅ ALL PASS' : '❌ FAIL'}** |`
    : '| **ИТОГО** | *нет данных* | *нет данных* | - |';

  const report = [
    `# 📊 Отчёт о сессии Hermes Fleet Enterprise (/hermes report)`,
    ``,
    `- **Дата формирования (Rule 14):** \`${generatedAt}\``,
    `- **Рабочая директория:** \`${cwd}\``,
    ``,
    staleWarning ? staleWarning : '',
    `## 🛡️ Статистика гейтов безопасности и комплаенса`,
    ``,
    `| Метрика | Значение | Источник (Rule 13) |`,
    `| :--- | :--- | :--- |`,
    `| **Всего проверок гейта** | ${gateStats.total} | \`.hermes/gate-log.jsonl\` |`,
    `| **Разрешено (allow)** | ${gateStats.allow} | \`.hermes/gate-log.jsonl\` |`,
    `| **Возвратов на доработку (continue)** | ${gateStats.continue} | \`.hermes/gate-log.jsonl\` |`,
    `| **Заблокировано политиками (deny)** | ${gateStats.deny} | \`.hermes/gate-log.jsonl\` |`,
    `| **Последнее событие гейта** | \`${gateStats.lastEvent}\` | \`.hermes/gate-log.jsonl\` |`,
    ``,
    `## 🧪 Результаты выполнения тест-сьютов (Rule 13)`,
    ``,
    `| Сьют | Пройдено | Всего | Статус |`,
    `| :--- | :--- | :--- | :--- |`,
    testSummaryRows,
    testSummaryTotalRow,
    ``,
    `- **Источник метрик (Rule 13):** \`.hermes/test-summary.json\``,
    `- **Время прогона тестов (Rule 14):** \`${testSummary?.timestamp || 'нет данных'}\``,
    ``,
    `## 📈 Активность инструментов и правки файлов`,
    ``,
    `| Метрика | Значение | Источник (Rule 13) |`,
    `| :--- | :--- | :--- |`,
    `| **Снимков активности (Stop)** | ${costStats.totalEntries} | \`.hermes/cost-log.jsonl\` |`,
    `| **Суммарно правок файлов (Stop)** | ${costStats.totalFilesEdited} | \`.hermes/cost-log.jsonl\` |`,
    `| **Суммарно вызовов инструментов** | ${costStats.totalToolCalls} | \`.hermes/cost-log.jsonl\` |`,
    `| **Расход токенов хоста** | *нет данных (хост Antigravity не предоставляет счётчики токенов)* | Rule 13 (Data Honesty) |`,
    ``,
    `## 🎯 Эффективность устранения замечаний (Resolved Rate, Track B7)`,
    ``,
    `| Метрика | Значение | Источник (Rule 13) |`,
    `| :--- | :--- | :--- |`,
    `| **Всего замечаний QA/UX** | ${findingsStats.hasData ? findingsStats.total : 'нет данных'} | \`.hermes/qa-verdict.json\` / \`.hermes/findings.json\` |`,
    `| **Реально исправлено** | ${findingsStats.hasData ? findingsStats.resolved : 'нет данных'} | \`.hermes/qa-verdict.json\` / \`.hermes/findings.json\` |`,
    `| **Resolved Rate (%)** | ${findingsStats.rateStr} | Rule 13 (Data Honesty) |`,
    ``,
    `## 🛰️ OpenTelemetry GenAI Telemetry (Track B8)`,
    ``,
    `| Метрика OTel | Значение | Источник (Rule 13) |`,
    `| :--- | :--- | :--- |`,
    `| **gen_ai.usage.input_tokens** | ${otelStats.hasData ? otelStats.inputTokens : '*нет данных (хост Antigravity не передал OTel gen_ai.usage.*)*'} | \`.hermes/*.jsonl\` |`,
    `| **gen_ai.usage.output_tokens** | ${otelStats.hasData ? otelStats.outputTokens : '*нет данных (хост Antigravity не передал OTel gen_ai.usage.*)*'} | \`.hermes/*.jsonl\` |`,
    `| **Зафиксировано OTel-операций** | ${otelStats.hasData ? otelStats.operationsCount : 0} | \`.hermes/*.jsonl\` |`,
    ``,
    `## 📜 Недавние коммиты Git`,
    ``,
    gitRecentCommits.length > 0
      ? gitRecentCommits.map((c) => `- \`${c}\``).join('\n')
      : `*нет данных о коммитах в текущем репозитории*`,
    ``,
    `## 🔍 Дифф активности (git diff --stat)`,
    `\`\`\`text`,
    gitDiffStat,
    `\`\`\``,
    ``,
    `---`,
    `*Отчёт сформирован автономно в соответствии с Правилом 13 (Data Honesty) и Правилом 14 (Report Freshness).*`
  ].filter(Boolean).join('\n');

  return report;
}

if (process.argv[1] && process.argv[1].endsWith('session-report.mjs')) {
  console.log(generateSessionReport());
}
