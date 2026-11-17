import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const RULE_HINTS = Object.freeze({
  qa_reject: 'QA-гейт (Stop) вернул REJECT — прогоните канонический qa-runner.mjs и убедитесь, что все тесты и REQ-N зелёные.',
  security_reject: 'L2 Security Diff-Review вернул REJECT — устраните High/Critical замечания до финализации.',
  rewrite_parity_reject: 'Rewrite Parity REJECT — восстановите потерянные функции (silentlyLost === 0) или согласуйте удаление через ask_question.',
  stall_breaker: 'Сработал предохранитель (≥3 провала подряд) — соберите круглый стол или остановитесь и пересмотрите корневую причину.',
  plan_missing: 'Не начинайте запись кода до создания .hermes/plan.md и подтверждения плана пользователем.',
  plan_unconfirmed: 'Дождитесь явного подтверждения плана пользователем ([Делай]) через ask_question перед записью кода.',
  plan_revision_pending: 'Пользователь запросил ревизию плана («Убрать лишнее» / «Добавить своё») — обновите .hermes/plan.md (v2) и переподтвердите.',
  plan_negated_consent: 'Отрицание плана («не надо план» / «не подтверждаю») не является согласием — дождитесь явного подтверждения или используйте Fast-Path.',
  plan_lint_failed: 'План .hermes/plan.md не прошёл EARS-lite проверку — заполните 4 секции, КОГДА/ДОЛЖНА/Проверка и источники для «так принято».',
  plan_tampered: 'Файл .hermes/plan.md изменён после подтверждения — оформите ревизию v2 и получите новое подтверждение пользователя.',
  plan_stale: 'Файл .hermes/plan.md изменён после вопроса подтверждения — отправьте обновлённый план на повторное подтверждение.',
  rule8_clean_edits: 'Запрещены патч-скрипты и shell-мутации исходников (Rule 8) — используйте edit_file / write_file напрямую.',
  rule9_hardcode: 'Обнаружен хардкод (Rule 9) — выносите IP/пути/секреты/таймауты в конфиг/env или используйте точечный // hermes-hardcode-ignore: <причина> (±1 строка).',
  tamper_protected: 'Прямая правка защищённых артефактов .hermes/* запрещена — ими управляют только хуки/раннер или пользователь.',
  sec_l1_pattern: 'Сработал Layer 1 Security паттерн (pickle/eval/innerHTML/interlock) — устраните небезопасный вызов.',
  council_gate: 'Перед первой записью задачи завершите Council Gate через ask_question и дождитесь доставок специалистов.',
  rule12_tier_mismatch: 'Соблюдайте выбранный в Шаге 0 уровень модели субагента (Rule 12).'
});

function sanitizeText(str) {
  return String(str || '')
    .replace(/<\/?SYSTEM_MESSAGE[^>]*>/gi, '')
    .replace(/<\/?USER_REQUEST[^>]*>/gi, '')
    .replace(/<!--\s*HERMES_[^>]*-->/gi, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

export function computeReasonHash(reason) {
  const norm = sanitizeText(reason).toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(norm || 'unknown').digest('hex').slice(0, 16);
}

function getDenyCounterFile(workspaceDir, taskHash) {
  const stateDir = process.env.HERMES_LESSONS_STATE_DIR || os.tmpdir();
  const key = crypto
    .createHash('sha256')
    .update(`${path.resolve(workspaceDir || process.cwd())}|${taskHash || 'unknown'}`)
    .digest('hex')
    .slice(0, 16);
  return path.join(stateDir, `hermes-deny-counts-${key}.json`);
}

function readTailUtf8(filePath, maxBytes = 64 * 1024) {
  const stat = fs.statSync(filePath);
  if (stat.size <= maxBytes) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  const fd = fs.openSync(filePath, 'r');
  try {
    const startOffset = stat.size - maxBytes;
    const buf = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, startOffset);
    let text = buf.toString('utf-8', 0, bytesRead);
    const nl = text.indexOf('\n');
    if (nl >= 0) {
      const rem = text.slice(nl + 1);
      if (rem.trim().length > 0) text = rem;
    }
    return text;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Appends a mechanical lesson record to `.hermes/lessons.jsonl`.
 * Schema strictly per REQ-4: { ts, taskHash, rule, reasonHash, count, source: "mechanical" }.
 * Deduplicates identical (taskHash, rule, reasonHash, count) in recent tail. Fail-open on I/O errors.
 */
export function recordMechanicalLesson({ activeWorkspaceDir, taskHash, rule, reason, count = 1 } = {}) {
  if (!activeWorkspaceDir || !rule) return false;
  try {
    const hermesDir = path.join(activeWorkspaceDir, '.hermes');
    if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
    const lessonsPath = path.join(hermesDir, 'lessons.jsonl');

    const safeRule = sanitizeText(rule).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64) || 'gate_event';
    const safeTaskHash = String(taskHash || 'unknown').slice(0, 32);
    const reasonHash = computeReasonHash(reason || safeRule);
    const safeCount = Number.isInteger(count) && count >= 1 ? count : 1;

    // Dedup against recent tail to avoid repeated Stop/PreToolUse flooding
    if (fs.existsSync(lessonsPath)) {
      try {
        const tail = readTailUtf8(lessonsPath, 32 * 1024);
        const lines = tail.split(/\r?\n/).filter((l) => l.trim().length > 0);
        for (let i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
          try {
            const rec = JSON.parse(lines[i]);
            if (
              rec &&
              rec.source === 'mechanical' &&
              rec.taskHash === safeTaskHash &&
              rec.rule === safeRule &&
              rec.reasonHash === reasonHash &&
              Number(rec.count || 1) >= safeCount
            ) {
              return false;
            }
          } catch {}
        }
      } catch {}
    }

    const record = {
      ts: new Date().toISOString(),
      taskHash: safeTaskHash,
      rule: safeRule,
      reasonHash,
      count: safeCount,
      source: 'mechanical'
    };
    fs.appendFileSync(lessonsPath, JSON.stringify(record) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Tracks repeated denies per (workspace, taskHash, rule) in an isolated temp counter (no extra workspace file).
 * Records a mechanical lesson into `.hermes/lessons.jsonl` once count >= 2 in the same task.
 */
export function trackDenyAndMaybeRecordLesson({ activeWorkspaceDir, taskHash, rule, reason } = {}) {
  if (!activeWorkspaceDir || !rule) return { count: 0, recorded: false };
  const safeRule = sanitizeText(rule).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);
  if (!safeRule) return { count: 0, recorded: false };

  const counterFile = getDenyCounterFile(activeWorkspaceDir, taskHash || 'unknown');
  let counts = {};
  try {
    if (fs.existsSync(counterFile)) {
      const parsed = JSON.parse(fs.readFileSync(counterFile, 'utf-8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        counts = parsed;
      }
    }
  } catch {}

  const nextCount = (Number.isInteger(counts[safeRule]) ? counts[safeRule] : 0) + 1;
  counts[safeRule] = nextCount;
  try {
    fs.writeFileSync(counterFile, JSON.stringify(counts), 'utf-8');
  } catch {}

  if (nextCount >= 2) {
    const recorded = recordMechanicalLesson({
      activeWorkspaceDir,
      taskHash: taskHash || 'unknown',
      rule: safeRule,
      reason,
      count: nextCount
    });
    return { count: nextCount, recorded };
  }
  return { count: nextCount, recorded: false };
}

/**
 * Loads the last <= maxEntries (5) unique mechanical lessons from `.hermes/lessons.jsonl`
 * strictly within maxBytes (2048 UTF-8 bytes) for `context-injector.mjs`.
 * Rejects any record whose `source !== "mechanical"` (never ingests MODEL prose).
 */
export function loadLessonsForInjection(workspaceDir, { maxEntries = 5, maxBytes = 2048 } = {}) {
  if (!workspaceDir) return '';
  const lessonsPath = path.join(workspaceDir, '.hermes', 'lessons.jsonl');
  if (!fs.existsSync(lessonsPath)) return '';

  let raw;
  try {
    raw = readTailUtf8(lessonsPath, 64 * 1024);
  } catch {
    return '';
  }

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const byKey = new Map();

  for (const line of lines) {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue; // Fail-open for context-injector on malformed lines
    }
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
    if (rec.source !== 'mechanical') continue;
    if (typeof rec.rule !== 'string' || !rec.rule.trim()) continue;

    const rule = sanitizeText(rec.rule).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);
    const reasonHash = typeof rec.reasonHash === 'string' ? sanitizeText(rec.reasonHash).slice(0, 32) : '';
    const key = `${rule}|${reasonHash}`;
    const count = Number.isInteger(rec.count) && rec.count > 0 ? rec.count : 1;
    const ts = typeof rec.ts === 'string' ? sanitizeText(rec.ts).slice(0, 32) : '';

    // Delete & re-insert so Map iteration order tracks most-recent unique occurrence
    if (byKey.has(key)) {
      const prev = byKey.get(key);
      byKey.delete(key);
      byKey.set(key, {
        rule,
        reasonHash,
        count: Math.max(prev.count, count),
        ts: ts || prev.ts
      });
    } else {
      byKey.set(key, { rule, reasonHash, count, ts });
    }
  }

  if (byKey.size === 0) return '';

  // Most recent unique entries first, capped at maxEntries
  const recentUnique = [...byKey.values()].reverse().slice(0, maxEntries);
  const header = '\n\n---\n## 🧯 Память ошибок проекта (.hermes/lessons.jsonl — механический журнал, advisory)\n';
  let result = header;
  let added = 0;

  for (const item of recentUnique) {
    const hint = RULE_HINTS[item.rule] || `Повторное нарушение правила \`${item.rule}\` — проверьте ограничения гейта до записи.`;
    const tsPart = item.ts ? `, ${item.ts.slice(0, 10)}` : '';
    const row = `- **[\`${item.rule}\`]** ${hint} *(повторов: ${item.count}${tsPart})*\n`;
    if (Buffer.byteLength(result + row, 'utf-8') > maxBytes) {
      break;
    }
    result += row;
    added++;
  }

  return added > 0 ? result.trimEnd() : '';
}
