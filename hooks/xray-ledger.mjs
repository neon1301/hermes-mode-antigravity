import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson, readGateModeConfig } from './consent-validator.mjs';

export const VALID_XRAY_MODES = Object.freeze(new Set(['advisory', 'off'])); // NO 'enforce' in v4.7.2 (REQ-6)
export const VALID_DEBT_STATUSES = Object.freeze(new Set(['open', 'debt', 'accepted', 'fixed']));

export const XRAY_IMPACT_RANK = Object.freeze({
  lies_to_user: 0,
  brick_risk: 1,
  resource_waste: 2,
  cosmetic: 3
});

export const XRAY_BUCKET_LABELS_RU = Object.freeze({
  dead: 'Мусор (можно удалить, доказано)',
  stub: 'Недоделка (риск для тебя)',
  fragile: 'Костыль (работает, но хрупко)'
});

/**
 * Reads X-ray mode strictly via shared readGateModeConfig.
 * Only 'advisory' (default) and 'off' are accepted — 'enforce' is intentionally rejected (falls back to 'advisory').
 */
export function readXrayConfig(workspaceDir) {
  return readGateModeConfig(workspaceDir, {
    key: 'xray',
    envVar: 'HERMES_XRAY',
    validModes: VALID_XRAY_MODES,
    defaultMode: 'advisory'
  });
}

export function normalizeXrayRelPath(filePath, workspaceDir = '') {
  let rel = String(filePath || '').trim();
  if (!rel) return '';
  if (workspaceDir && path.isAbsolute(rel)) {
    const computed = path.relative(path.resolve(workspaceDir), path.resolve(rel));
    if (computed && !computed.startsWith('..') && !path.isAbsolute(computed)) {
      rel = computed;
    }
  }
  return rel.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '');
}

/**
 * Deterministic stable finding ID: sha256(rule + normalizedPath + symbol).slice(0, 16).
 * Survives line shifts so repeated scans never create duplicates.
 */
export function computeFindingId({ rule, path: relPath, symbol }) {
  const normRule = String(rule || '').trim().toLowerCase();
  const normPath = normalizeXrayRelPath(relPath).toLowerCase();
  const normSymbol = String(symbol || '').trim();
  return crypto
    .createHash('sha256')
    .update(`${normRule}\0${normPath}\0${normSymbol}`, 'utf-8')
    .digest('hex')
    .slice(0, 16);
}

/**
 * Fail-open reader for `.hermes/xray-report.json`.
 * NEVER throws CorruptArtifactError (REQ-6: advisory reads must never deadlock Stop or normal writes).
 */
export function readXrayReportSafe(workspaceDir) {
  if (!workspaceDir) return { data: null, error: null };
  const reportPath = path.join(workspaceDir, '.hermes', 'xray-report.json');
  if (!fs.existsSync(reportPath)) return { data: null, error: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { data: null, error: 'xray-report.json root is not a JSON object' };
    }
    return { data: parsed, error: null };
  } catch (err) {
    return { data: null, error: err?.message || 'failed to parse xray-report.json' };
  }
}

/**
 * Fail-open reader for `.hermes/debt-ledger.jsonl`.
 * Skips malformed lines without throwing (REQ-6).
 */
export function readDebtLedgerSafe(workspaceDir) {
  if (!workspaceDir) return { records: [], error: null };
  const ledgerPath = path.join(workspaceDir, '.hermes', 'debt-ledger.jsonl');
  if (!fs.existsSync(ledgerPath)) return { records: [], error: null };
  try {
    const raw = fs.readFileSync(ledgerPath, 'utf-8');
    const records = [];
    let parseErrors = 0;
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed);
        if (rec && typeof rec === 'object' && !Array.isArray(rec) && typeof rec.id === 'string' && rec.id.trim()) {
          records.push(rec);
        } else {
          parseErrors++;
        }
      } catch {
        parseErrors++;
      }
    }
    return {
      records,
      error: parseErrors > 0 ? `skipped ${parseErrors} malformed line(s) in debt-ledger.jsonl` : null
    };
  } catch (err) {
    return { records: [], error: err?.message || 'failed to read debt-ledger.jsonl' };
  }
}

export function foldDebtLedgerState(records = []) {
  const stateById = new Map();
  for (const rec of records) {
    if (!rec || typeof rec.id !== 'string' || !VALID_DEBT_STATUSES.has(rec.status)) continue;
    const prev = stateById.get(rec.id) || {};
    stateById.set(rec.id, {
      ...prev,
      ...rec
    });
  }
  return stateById;
}

function appendDebtLedgerEntries(activeWorkspaceDir, entries) {
  if (!entries || entries.length === 0) return;
  const hermesDir = path.join(activeWorkspaceDir, '.hermes');
  if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
  const ledgerPath = path.join(hermesDir, 'debt-ledger.jsonl');
  const payload = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.appendFileSync(ledgerPath, payload, 'utf-8');
}

/**
 * Writes `.hermes/xray-report.json` atomically and synchronizes `.hermes/debt-ledger.jsonl`:
 * - New finding IDs -> appended as `status: 'open'` (no duplicates on repeat scans).
 * - Previously `fixed` finding IDs that reappear -> reopened as `status: 'open'`.
 * - Existing `open` or `debt` finding IDs missing from the new scan -> mechanically closed as `status: 'fixed'`,
 *   ONLY when `!report.truncated` OR the finding's file was actually scanned in this pass OR no longer exists on disk.
 * - `accepted` entries stay `accepted` while still present (never re-opened / never nagged).
 */
export function persistXrayReportAndSyncDebt({
  activeWorkspaceDir,
  report,
  scannedPaths = null
} = {}) {
  const reportPath = path.join(activeWorkspaceDir, '.hermes', 'xray-report.json');
  atomicWriteJson(reportPath, report);

  const { records } = readDebtLedgerSafe(activeWorkspaceDir);
  const latestById = foldDebtLedgerState(records);
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const currentIds = new Set();
  const toAppend = [];
  const now = new Date().toISOString();

  for (const f of findings) {
    if (!f || !f.id) continue;
    currentIds.add(f.id);
    const prev = latestById.get(f.id);
    if (!prev || prev.status === 'fixed') {
      toAppend.push({
        id: f.id,
        status: 'open',
        reason: prev?.status === 'fixed' ? 'reappeared_on_rescan' : 'detected_by_xray',
        source: 'mechanical:xray-scan',
        ts: now,
        path: f.path,
        line: f.line,
        symbol: f.symbol,
        rule: f.rule,
        category: f.category,
        impact: f.impact,
        class: f.class,
        evidence: f.evidence
      });
    }
  }

  const isTruncated = Boolean(report?.truncated);
  for (const [id, entry] of latestById.entries()) {
    if (currentIds.has(id)) continue;
    if (entry.status !== 'open' && entry.status !== 'debt') continue;
    const entryPath = normalizeXrayRelPath(entry.path || '');
    const fileWasScanned = Boolean(scannedPaths && entryPath && scannedPaths.has(entryPath));
    const fileRemoved = Boolean(entryPath && !fs.existsSync(path.resolve(activeWorkspaceDir, entryPath)));
    if (!isTruncated || fileWasScanned || fileRemoved) {
      toAppend.push({
        id,
        status: 'fixed',
        reason: fileRemoved ? 'file_removed_on_rescan' : 'disappeared_on_rescan',
        source: 'mechanical:xray-rescan',
        ts: now,
        path: entryPath || undefined,
        symbol: entry.symbol || undefined,
        rule: entry.rule || undefined
      });
    }
  }

  appendDebtLedgerEntries(activeWorkspaceDir, toAppend);
  return {
    appendedCount: toAppend.length,
    openedCount: toAppend.filter((e) => e.status === 'open').length,
    fixedCount: toAppend.filter((e) => e.status === 'fixed').length
  };
}

/**
 * Records validated user decision (`debt` or `accepted`) into protected `.hermes/debt-ledger.jsonl`.
 * Hook-only (never writable by agents directly).
 */
export function recordXrayUserDecision({
  activeWorkspaceDir,
  findingIds = [],
  status,
  reason = '',
  source = 'user_ask_question:xray'
} = {}) {
  if (!activeWorkspaceDir || !VALID_DEBT_STATUSES.has(status)) return 0;
  if (status !== 'debt' && status !== 'accepted') return 0;

  const { data: report } = readXrayReportSafe(activeWorkspaceDir);
  const { records } = readDebtLedgerSafe(activeWorkspaceDir);
  const latestById = foldDebtLedgerState(records);

  const reportById = new Map();
  for (const f of Array.isArray(report?.findings) ? report.findings : []) {
    if (f?.id) reportById.set(f.id, f);
  }

  const targetIds = findingIds.length > 0
    ? findingIds
    : [...reportById.keys()].filter((id) => {
        const st = latestById.get(id)?.status;
        return st !== 'accepted' && st !== 'fixed';
      });

  const now = new Date().toISOString();
  const toAppend = [];
  for (const id of targetIds) {
    const prev = latestById.get(id);
    if (prev && prev.status === status) continue;
    const f = reportById.get(id) || prev || {};
    toAppend.push({
      id,
      status,
      reason: String(reason || (status === 'accepted' ? 'user_accepted_risk' : 'user_deferred_to_debt')).slice(0, 240),
      source,
      ts: now,
      path: f.path || undefined,
      line: f.line || undefined,
      symbol: f.symbol || undefined,
      rule: f.rule || undefined,
      category: f.category || undefined,
      impact: f.impact || undefined,
      class: f.class || undefined,
      evidence: f.evidence || undefined
    });
  }

  appendDebtLedgerEntries(activeWorkspaceDir, toAppend);
  return toAppend.length;
}

/**
 * Selects up to `maxItems` (<=5) active findings for the plain-Russian advisory window.
 * Strictly filters out `accepted` and `fixed` items so user-accepted risks stop nagging,
 * while remaining visible in `.hermes/xray-report.json` + `.hermes/debt-ledger.jsonl`.
 */
export function buildXrayAdvisoryWindow(workspaceDir, { maxItems = 5 } = {}) {
  const { data: report } = readXrayReportSafe(workspaceDir);
  if (!report || !Array.isArray(report.findings) || report.findings.length === 0) {
    return { shouldShow: false, shown: [], remainingCount: 0, acceptedCount: 0, questionText: '' };
  }

  const { records } = readDebtLedgerSafe(workspaceDir);
  const latestById = foldDebtLedgerState(records);

  let acceptedCount = 0;
  const active = [];
  for (const f of report.findings) {
    const st = latestById.get(f.id)?.status;
    if (st === 'accepted') {
      acceptedCount++;
      continue;
    }
    if (st === 'fixed') continue;
    active.push(f);
  }

  if (active.length === 0) {
    return { shouldShow: false, shown: [], remainingCount: 0, acceptedCount, questionText: '' };
  }

  active.sort((a, b) => {
    const ia = XRAY_IMPACT_RANK[a.impact] ?? 99;
    const ib = XRAY_IMPACT_RANK[b.impact] ?? 99;
    if (ia !== ib) return ia - ib;
    const ca = a.class === 'fact' ? 0 : 1;
    const cb = b.class === 'fact' ? 0 : 1;
    if (ca !== cb) return ca - cb;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return (a.line || 0) - (b.line || 0);
  });

  const cap = Math.min(5, Math.max(1, Number(maxItems) || 5));
  const shown = active.slice(0, cap);
  const remainingCount = Math.max(0, active.length - shown.length);

  const buckets = {
    dead: [],
    stub: [],
    fragile: []
  };

  let idx = 1;
  for (const f of shown) {
    const isProvenDead = f.category === 'dead' && f.class === 'fact' && f.refs?.safeToDelete === true;
    const bucketKey = isProvenDead ? 'dead' : (f.category === 'stub' ? 'stub' : 'fragile');
    const felt = describeUserImpactRu(f);
    const what = describeFindingRu(f);
    buckets[bucketKey].push(`${idx}. ${what} — что ты почувствуешь: ${felt} (${f.evidence || `${f.path}:${f.line}`})`);
    idx++;
  }

  const parts = ['Рентген нашёл скрытые проблемы в проекте. Что делаем?'];
  for (const key of ['stub', 'dead', 'fragile']) {
    if (buckets[key].length > 0) {
      parts.push(`\n${XRAY_BUCKET_LABELS_RU[key]}:`);
      parts.push(...buckets[key]);
    }
  }
  if (remainingCount > 0) {
    parts.push(`\nещё ${remainingCount} в отчёте`);
  }

  return {
    shouldShow: true,
    shown,
    remainingCount,
    acceptedCount,
    questionText: parts.join('\n')
  };
}

function describeFindingRu(f) {
  const sym = f.symbol ? `«${f.symbol}»` : 'участок кода';
  const r = String(f.rule || '');
  if (r === 'dead.unused_symbol') return `Неиспользуемая функция ${sym} без единой ссылки в проекте`;
  if (r === 'dead.unused_file') return `Неиспользуемый файл ${sym} без ссылок в проекте`;
  if (r === 'dead.unreferenced_element' || r === 'dead.element_never_assigned') return `Элемент разметки или переменная ${sym} нигде не используется`;
  if (r === 'dead.unused_css_selector') return `Стиль для элемента ${sym}, которого нет в разметке`;
  if (r === 'dead.broken_asset_ref') return `Ссылка на отсутствующий файл ${sym}`;
  if (r === 'stub.empty_catch') return `Пустой перехват ошибки в ${sym}`;
  if (r === 'stub.always_true_return') return `Функция ${sym} всегда возвращает постоянный ответ`;
  if (r === 'stub.todo_fixme') return `Незавершённая пометка в коде (${sym})`;
  if (r === 'stub.unreachable_branch') return `Недостижимая ветка кода в ${sym}`;
  if (r === 'fragile.unstopped_timer') return `Таймер повторения ${sym} запускается без остановки`;
  if (r === 'fragile.duplicate_listener') return `Обработчик событий ${sym} может навешиваться повторно`;
  if (r === 'fragile.poll_side_effect') return `Периодический опрос ${sym} вызывает изменение состояния`;
  if (r === 'fragile.retry_sleep_mask') return `Ошибка в ${sym} скрывается паузой или повтором`;
  if (r === 'fragile.duplicate_literal') return `Одно и то же значение ${sym} продублировано в нескольких местах`;
  return `Проблемный участок ${sym}`;
}

function describeUserImpactRu(f) {
  if (f.impact === 'lies_to_user') return 'программа может показать успех или нерабочую кнопку при реальном сбое';
  if (f.impact === 'brick_risk') return 'при сбое приложение может зависнуть или тихо потерять состояние';
  if (f.impact === 'resource_waste') return 'лишняя нагрузка на память и процессор или мёртвый балласт в проекте';
  return 'при правках легко забыть одно из мест и получить расхождение';
}

/**
 * Loads up to `maxEntries` (<=3) open/debt findings within `maxBytes` (<=1024 UTF-8 bytes)
 * for `hooks/context-injector.mjs`, strictly separate from `.hermes/lessons.jsonl`.
 * NEVER shows `accepted` or `fixed` items. Strictly fail-open.
 */
export function loadDebtForInjection(workspaceDir, { userPrompt = '', touchedFiles = [], maxEntries = 3, maxBytes = 1024 } = {}) {
  if (!workspaceDir) return '';
  try {
    const { records } = readDebtLedgerSafe(workspaceDir);
    if (!records || records.length === 0) return '';
    const latestById = foldDebtLedgerState(records);

    const { data: report } = readXrayReportSafe(workspaceDir);
    const reportById = new Map();
    for (const f of Array.isArray(report?.findings) ? report.findings : []) {
      if (f?.id) reportById.set(f.id, f);
    }

    const active = [];
    for (const entry of latestById.values()) {
      if (entry.status !== 'open' && entry.status !== 'debt') continue;
      const merged = { ...(reportById.get(entry.id) || {}), ...entry };
      if (!merged.path) continue;
      active.push(merged);
    }
    if (active.length === 0) return '';

    const promptLower = String(userPrompt || '').toLowerCase();
    const touchedNorm = (Array.isArray(touchedFiles) ? touchedFiles : [])
      .map((p) => normalizeXrayRelPath(p, workspaceDir).toLowerCase())
      .filter(Boolean);

    const relevanceScore = (item) => {
      const pLower = String(item.path || '').toLowerCase();
      const base = path.basename(pLower);
      const sym = String(item.symbol || '').toLowerCase();
      if (touchedNorm.some((t) => t === pLower || t.endsWith('/' + base))) return 3;
      if (promptLower && (promptLower.includes(pLower) || (base.length >= 4 && promptLower.includes(base)))) return 2;
      if (promptLower && sym.length >= 4 && promptLower.includes(sym)) return 1;
      return 0;
    };

    active.sort((a, b) => {
      const ra = relevanceScore(a);
      const rb = relevanceScore(b);
      if (ra !== rb) return rb - ra;
      const ia = XRAY_IMPACT_RANK[a.impact] ?? 99;
      const ib = XRAY_IMPACT_RANK[b.impact] ?? 99;
      if (ia !== ib) return ia - ib;
      return String(a.path).localeCompare(String(b.path));
    });

    const header = '\n\n---\n## 🩺 Открытый долг продукта (.hermes/debt-ledger.jsonl — advisory)\n';
    let result = header;
    let added = 0;
    const cap = Math.min(3, Math.max(1, Number(maxEntries) || 3));

    for (const item of active) {
      if (added >= cap) break;
      const loc = item.evidence || `${item.path}:${item.line || 1}`;
      const desc = describeFindingRu(item);
      const row = `- [${item.status}] ${desc} (${loc})\n`;
      if (Buffer.byteLength(result + row, 'utf-8') > maxBytes) break;
      result += row;
      added++;
    }

    return added > 0 ? result.trimEnd() : '';
  } catch {
    return '';
  }
}

/**
 * Surgical 4-condition deletion safety check (`xray_delete_without_zero_ref_proof_deny`, REQ-2):
 * Denies deleting a file or symbol flagged by X-ray WITHOUT zero-ref proof (`safeToDelete !== true`),
 * EXCEPT when explicitly authorized in a confirmed `.hermes/plan.md`.
 * Strictly fail-open if `.hermes/xray-report.json` is absent or malformed (REQ-6).
 */
export function checkXrayDeleteZeroRefProof({
  activeWorkspaceDir,
  targetPath = '',
  removedSymbols = [],
  isFileDelete = false,
  planMdText = '',
  planConfirmed = false,
  liveRefChecker = null
} = {}) {
  const { data: report } = readXrayReportSafe(activeWorkspaceDir);
  if (!report) return { allowed: true };

  const normTarget = normalizeXrayRelPath(targetPath, activeWorkspaceDir);
  const normTargetLower = normTarget.toLowerCase();
  const targetBaseLower = normTarget ? path.basename(normTargetLower) : '';
  const planLower = planConfirmed ? String(planMdText || '').toLowerCase() : '';

  const isAuthorizedByPlan = (name) => {
    if (!planConfirmed || !planLower) return false;
    const token = String(name || '').trim().toLowerCase();
    return token.length >= 3 && planLower.includes(token);
  };

  // 1. File deletion check: packaged/protected files or files with non-zero/unproven refs in report
  if (isFileDelete && normTarget) {
    const protectedFiles = Array.isArray(report.protectedFiles) ? report.protectedFiles : [];
    const isProtectedFile = protectedFiles.some((pf) => normalizeXrayRelPath(pf, activeWorkspaceDir).toLowerCase() === normTargetLower);
    if (isProtectedFile && !isAuthorizedByPlan(normTarget) && !isAuthorizedByPlan(targetBaseLower)) {
      return {
        allowed: false,
        code: 'xray_delete_without_zero_ref_proof_deny',
        reason: `Файл «${normTarget}» входит в защищённый список точек входа/упаковки — удаление без явного плана и доказательства нулевых ссылок запрещено.`
      };
    }

    const fileFindings = (Array.isArray(report.findings) ? report.findings : []).filter(
      (f) => normalizeXrayRelPath(f.path, activeWorkspaceDir).toLowerCase() === normTargetLower
    );
    const hasProvenFileDelete = fileFindings.some(
      (f) => f.rule === 'dead.unused_file' && f.class === 'fact' && f.refs?.safeToDelete === true && !report.truncated
    );
    const hasUnprovenDeadFile = fileFindings.some(
      (f) => (f.category === 'dead' || f.rule === 'dead.unused_file') && f.refs?.safeToDelete !== true
    );
    if (hasUnprovenDeadFile && !hasProvenFileDelete && !isAuthorizedByPlan(normTarget) && !isAuthorizedByPlan(targetBaseLower)) {
      const liveRefs = typeof liveRefChecker === 'function' ? liveRefChecker(targetBaseLower, normTarget) : true;
      if (liveRefs || report.truncated) {
        return {
          allowed: false,
          code: 'xray_delete_without_zero_ref_proof_deny',
          reason: `Файл «${normTarget}» не имеет доказательства refs=0 (ссылки ещё есть или скан усечён) — удаление запрещено.`
        };
      }
    }
  }

  // 2. Symbol deletion check inside edit_file/replace_file_content
  if (Array.isArray(removedSymbols) && removedSymbols.length > 0 && Array.isArray(report.findings)) {
    for (const sym of removedSymbols) {
      const match = report.findings.find(
        (f) =>
          f.symbol === sym &&
          (!normTargetLower || normalizeXrayRelPath(f.path, activeWorkspaceDir).toLowerCase() === normTargetLower)
      );
      if (!match) continue;
      if (match.refs?.safeToDelete === true && match.class === 'fact' && !report.truncated) continue;
      if (isAuthorizedByPlan(sym)) continue;
      const hasLive = typeof liveRefChecker === 'function' ? liveRefChecker(sym, normTarget) : true;
      if (hasLive || report.truncated || (match.refs?.protectedBy?.length || 0) > 0) {
        return {
          allowed: false,
          code: 'xray_delete_without_zero_ref_proof_deny',
          reason: `Символ «${sym}» (${normTarget}) не имеет доказательства нулевых ссылок (refs=${match.refs?.count ?? 'unknown'}, protectedBy=[${(match.refs?.protectedBy || []).join(', ')}]) — удаление запрещено.`
        };
      }
    }
  }

  return { allowed: true };
}
