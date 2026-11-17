import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const REPUTATION_POLICY = Object.freeze({
  minObservations: 3,
  priorScore: 0.5,
  maxDeltaPerObservation: 0.15,
  stepGain: 0.35,
  halfLifeDays: 30,
  minScore: 0.0,
  maxScore: 1.0
});

const AGENT_DEFAULT_DOMAIN = Object.freeze({
  dmitry: 'backend',
  elena: 'frontend',
  denis: 'database',
  viktor: 'qa',
  stanislav: 'architecture',
  kritik: 'product',
  ruslan: 'sap',
  alexey: 'hardware',
  artem: 'protocol',
  igor: 'simulation',
  mikhail: 'ai',
  gleb: '3d',
  sergey: 'refactoring',
  anna: 'docs'
});

const DOMAIN_KEYWORDS = [
  { domain: 'database', re: /(?<![а-яёa-z0-9_-])(?:sql|sqlite|postgres|postgresql|mssql|mysql|redis|mongo|duckdb|wal|mvcc|index|migration|бд|баз[аы]\s+данн)/i },
  { domain: 'security', re: /(?<![а-яёa-z0-9_-])(?:security|owasp|jwt|auth|xss|ssrf|cwe|crypto|secret|безопасност|уязвимост)/i },
  { domain: 'frontend', re: /(?<![а-яёa-z0-9_-])(?:ui|ux|css|html|react|vue|svelte|winforms|wpf|avalonia|layout|theme|интерфейс|вёрстк)/i },
  { domain: 'sap', re: /(?<![а-яёa-z0-9_-])(?:sap|bapi|rfc|idoc|odata|nco|abap)(?![а-яёa-z0-9_-])/i },
  { domain: 'protocol', re: /(?<![а-яёa-z0-9_-])(?:socket|tcp|udp|modbus|opc-?ua|packet|frame|binary|reverse|сокет|протокол|пакет)/i },
  { domain: 'ai', re: /(?<![а-яёa-z0-9_-])(?:rag|llm|vector|hnsw|embedding|lora|vllm|prompt|инференс|вектор)/i },
  { domain: '3d', re: /(?<![а-яёa-z0-9_-])(?:three\.?js|webgl|3d|digital\s+twin|mesh|shader)(?![а-яёa-z0-9_-])/i },
  { domain: 'architecture', re: /(?<![а-яёa-z0-9_-])(?:council|roundtable|gate|hook|orchestrat|adr|contract|архитектур|гейт|хук|совет|стол)/i },
  { domain: 'backend', re: /(?<![а-яёa-z0-9_-])(?:api|rest|grpc|websocket|backend|server|service|dotnet|c#|node|python|go|сервер|бэкенд)/i },
  { domain: 'qa', re: /(?<![а-яёa-z0-9_-])(?:qa|e2e|fuzz|mutation|coverage|тест|вериф|test)(?![а-яёa-z0-9_-])/i }
];

export function detectDomain(promptText = '', roster = []) {
  const text = String(promptText || '');
  for (const { domain, re } of DOMAIN_KEYWORDS) {
    if (re.test(text)) return domain;
  }
  if (Array.isArray(roster) && roster.length > 0) {
    const first = String(roster[0]?.name || roster[0] || '').toLowerCase();
    if (AGENT_DEFAULT_DOMAIN[first]) return AGENT_DEFAULT_DOMAIN[first];
  }
  return 'general';
}

export function pickLatestTimestamp(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (!isNaN(ta) && !isNaN(tb)) return tb >= ta ? b : a;
  return b;
}

/**
 * Inspects ONLY protected mechanical artifacts inside `.hermes/`:
 *   - test-summary.json
 *   - qa-verdict.json
 *   - security-verdict.json
 * Never reads MODEL prose. Never fabricates timestamps.
 */
export function detectMechanicalOutcome(hermesDir) {
  let currentOutcome = null;
  let outcomeSource = null;
  let currentDiffHash = null;
  let failTimestamp = null;
  let failSource = null;
  let passTimestamp = null;
  let passSource = null;
  let rawArtifactsContent = '';

  const pickWithSource = (curTs, curSrc, newTs, newSrc) => {
    if (!curTs) return { ts: newTs || null, src: newSrc };
    if (!newTs) return { ts: curTs, src: curSrc };
    const ta = new Date(curTs).getTime();
    const tb = new Date(newTs).getTime();
    if (!isNaN(ta) && !isNaN(tb)) {
      return tb >= ta ? { ts: newTs, src: newSrc } : { ts: curTs, src: curSrc };
    }
    return { ts: newTs, src: newSrc };
  };

  // 1. test-summary.json
  const summaryPath = path.join(hermesDir, 'test-summary.json');
  if (fs.existsSync(summaryPath)) {
    try {
      const raw = fs.readFileSync(summaryPath, 'utf-8');
      rawArtifactsContent += raw;
      const summary = JSON.parse(raw);
      const st = String(summary.status || '').toUpperCase();
      const isFailed = (st === 'COMPLETED' && (summary.failed > 0 || (summary.total - summary.passed) > 0)) ||
                       st === 'FAIL';
      const isPassed = st === 'PASS' && (!summary.failed || summary.failed === 0);
      const ts = summary.timestamp || summary.ts || null;
      if (isFailed) {
        currentOutcome = 'FAIL';
        const picked = pickWithSource(failTimestamp, failSource, ts, 'test-summary');
        failTimestamp = picked.ts;
        failSource = picked.src;
      } else if (isPassed) {
        currentOutcome = 'PASS';
        const picked = pickWithSource(passTimestamp, passSource, ts, 'test-summary');
        passTimestamp = picked.ts;
        passSource = picked.src;
      }
    } catch {}
  }

  // 2. qa-verdict.json
  const qaVerdictPath = path.join(hermesDir, 'qa-verdict.json');
  if (fs.existsSync(qaVerdictPath)) {
    try {
      const raw = fs.readFileSync(qaVerdictPath, 'utf-8');
      rawArtifactsContent += raw;
      const qav = JSON.parse(raw);
      if (qav.diffHash) currentDiffHash = qav.diffHash;
      const st = String(qav.status || '').toUpperCase();
      const ts = qav.timestamp || qav.ts || null;
      if (st === 'REJECT' || st === 'FAIL') {
        currentOutcome = 'FAIL';
        const picked = pickWithSource(failTimestamp, failSource, ts, 'qa-verdict');
        failTimestamp = picked.ts;
        failSource = picked.src;
      } else if (st === 'PASS' && currentOutcome !== 'FAIL') {
        currentOutcome = 'PASS';
        const picked = pickWithSource(passTimestamp, passSource, ts, 'qa-verdict');
        passTimestamp = picked.ts;
        passSource = picked.src;
      }
    } catch {}
  }

  // 3. security-verdict.json
  const secVerdictPath = path.join(hermesDir, 'security-verdict.json');
  if (fs.existsSync(secVerdictPath)) {
    try {
      const raw = fs.readFileSync(secVerdictPath, 'utf-8');
      rawArtifactsContent += raw;
      const sv = JSON.parse(raw);
      if (!currentDiffHash && sv.diffHash) currentDiffHash = sv.diffHash;
      const st = String(sv.status || '').toUpperCase();
      const ts = sv.timestamp || sv.ts || null;
      if (st === 'REJECT' || st === 'FAIL') {
        currentOutcome = 'FAIL';
        const picked = pickWithSource(failTimestamp, failSource, ts, 'security-verdict');
        failTimestamp = picked.ts;
        failSource = picked.src;
      } else if (st === 'PASS' && currentOutcome !== 'FAIL') {
        currentOutcome = 'PASS';
        const picked = pickWithSource(passTimestamp, passSource, ts, 'security-verdict');
        passTimestamp = picked.ts;
        passSource = picked.src;
      }
    } catch {}
  }

  const artifactTimestamp = currentOutcome === 'FAIL' ? failTimestamp : passTimestamp;
  outcomeSource = currentOutcome === 'FAIL' ? failSource : passSource;
  let attemptTs = artifactTimestamp;
  if (!attemptTs && rawArtifactsContent) {
    attemptTs = `hash:${crypto.createHash('sha256').update(rawArtifactsContent).digest('hex').slice(0, 16)}`;
  }

  return {
    outcome: currentOutcome,
    outcomeSource,
    diffHash: currentDiffHash,
    artifactTimestamp,
    attemptTs
  };
}

/**
 * Extracts Lead-declared accepted authors from `.hermes/decisions.md` (if present).
 * Always tags them `source: "lead_declared"`.
 */
export function extractDeclaredAuthors(hermesDir, validAgentsSet = null, aliases = {}, taskHash = null) {
  const decisionsPath = path.join(hermesDir, 'decisions.md');
  if (!fs.existsSync(decisionsPath)) return [];
  try {
    const fullText = fs.readFileSync(decisionsPath, 'utf-8');
    // Scope strictly to the matching taskHash section (or the latest top-level decision section)
    const rawSections = fullText
      .split(/(?=^#\s+|^---\s*$)/m)
      .map((s) => s.trim())
      .filter(Boolean);
    let scopedText = fullText;
    if (rawSections.length > 0) {
      if (taskHash) {
        const matched = rawSections.filter((sec) => sec.includes(taskHash));
        scopedText = matched.length > 0 ? matched[matched.length - 1] : rawSections[rawSections.length - 1];
      } else {
        scopedText = rawSections[rawSections.length - 1];
      }
    }

    const found = new Set();
    const lines = scopedText.split(/\r?\n/);
    let inAcceptedBlock = false;
    let inExcludedBlock = false;
    for (const line of lines) {
      if (/^\s*[-*]?\s*(?:принят(?:ые|ая)\s+иде[ия]|accepted\s+ideas?|declared\s*authors?)(?![а-яёa-z0-9_-])/i.test(line)) {
        inAcceptedBlock = true;
        inExcludedBlock = false;
      } else if (/^\s*[-*]?\s*(?:отклон[её]нн[а-яё]*|сохран[её]нн[а-яё]*|несогласи[а-яё]*|особое\s+мнение|rejected|dissent)(?![а-яёa-z0-9_-])/i.test(line)) {
        inAcceptedBlock = false;
        inExcludedBlock = true;
      } else if (/^\s*(?:#{1,6}\s+|---\s*$)/.test(line)) {
        inAcceptedBlock = false;
        inExcludedBlock = false;
      }

      const isExplicitDeclaredLine = /^\s*[-*]?\s*(?:declared\s*authors?|accepted\s*authors?)\s*[:=]/i.test(line);
      if (!inExcludedBlock && (inAcceptedBlock || isExplicitDeclaredLine)) {
        for (const m of line.matchAll(/@([a-z0-9_-]+)/gi)) {
          const lower = m[1].toLowerCase();
          const resolved = aliases[lower] || lower;
          if (!validAgentsSet || validAgentsSet.has(resolved)) {
            found.add(resolved);
          }
        }
      }
    }
    return [...found].map((name) => ({ name, source: 'lead_declared' }));
  } catch {
    return [];
  }
}

export function applyTimeDecay(score, lastTs, targetTs, policy = REPUTATION_POLICY) {
  if (!lastTs || !targetTs) return score;
  const tLast = new Date(lastTs).getTime();
  const tTarget = new Date(targetTs).getTime();
  if (isNaN(tLast) || isNaN(tTarget) || tTarget <= tLast) return score;
  const ageDays = (tTarget - tLast) / 86400000;
  const factor = Math.pow(0.5, ageDays / policy.halfLifeDays);
  return policy.priorScore + (score - policy.priorScore) * factor;
}

export function getEffectiveReputationScore(entry, nowIso = null, policy = REPUTATION_POLICY) {
  if (!entry || typeof entry.score !== 'number') return policy.priorScore;
  const target = nowIso || new Date().toISOString();
  const baseTs = entry.scoreAsOf || entry.lastTs;
  const decayed = applyTimeDecay(entry.score, baseTs, target, policy);
  return Number(Math.max(policy.minScore, Math.min(policy.maxScore, decayed)).toFixed(4));
}

/**
 * Deterministically recomputes specialist x domain reputation from council-outcomes.jsonl records.
 * Rules:
 * - mode === 'solo' -> NEVER accrues specialist reputation.
 * - roster entries with bindingConfidence === 'uncertain' or missing uuid -> NEVER accrue reputation.
 * - If declaredAuthors is non-empty, ONLY declared authors who are verified in eligible roster accrue reputation.
 *   If all declared authors are outside the roster, record accrues NO reputation (authorship rejected).
 * - Score bounded to [0, 1], single-observation delta capped at ±maxDeltaPerObservation (0.15), exponential decay (30d half-life).
 */
export function recomputeReputationFromOutcomes(records, nowIso = null, policy = REPUTATION_POLICY) {
  const reputation = {};

  for (const rec of records) {
    if (!rec || (rec.outcome !== 'PASS' && rec.outcome !== 'FAIL')) continue;
    if (rec.mode === 'solo') continue;

    const roster = Array.isArray(rec.roster) ? rec.roster : [];
    const eligibleByName = new Map();
    for (const member of roster) {
      if (!member || !member.name) continue;
      const name = String(member.name).toLowerCase();
      const hasUuid = Boolean(member.uuid && /^[0-9a-f-]{36}$/i.test(String(member.uuid)));
      const isCertain = member.bindingConfidence !== 'uncertain';
      if (hasUuid && isCertain) {
        eligibleByName.set(name, member);
      }
    }

    if (eligibleByName.size === 0) continue;

    let targetSpecialists = [];
    const declared = Array.isArray(rec.declaredAuthors) ? rec.declaredAuthors : [];
    if (declared.length > 0) {
      const verified = new Set();
      for (const item of declared) {
        const name = String(typeof item === 'string' ? item : (item?.name || '')).toLowerCase();
        if (name && eligibleByName.has(name)) {
          verified.add(name);
        }
      }
      // If Lead declared authors, ONLY verified roster authors receive reputation.
      // Unverified authors (not in roster) are strictly rejected.
      targetSpecialists = [...verified];
    } else {
      targetSpecialists = [...eligibleByName.keys()];
    }

    if (targetSpecialists.length === 0) continue;

    const domain = String(rec.domain || 'general').toLowerCase();
    const recTs = rec.ts || null;

    for (const specialist of targetSpecialists) {
      if (!reputation[specialist]) reputation[specialist] = {};
      if (!reputation[specialist][domain]) {
        reputation[specialist][domain] = {
          observations: 0,
          successes: 0,
          failures: 0,
          score: policy.priorScore,
          lastTs: null
        };
      }
      const st = reputation[specialist][domain];

      // Time decay from previous observation to current observation
      if (st.lastTs && recTs) {
        st.score = applyTimeDecay(st.score, st.lastTs, recTs, policy);
      }

      // Bounded single-observation delta
      const target = rec.outcome === 'PASS' ? 1.0 : 0.0;
      const rawDelta = (target - st.score) * policy.stepGain;
      const boundedDelta = Math.max(
        -policy.maxDeltaPerObservation,
        Math.min(policy.maxDeltaPerObservation, rawDelta)
      );
      st.score = Number(
        Math.max(policy.minScore, Math.min(policy.maxScore, st.score + boundedDelta)).toFixed(4)
      );

      st.observations += 1;
      if (rec.outcome === 'PASS') st.successes += 1;
      else st.failures += 1;
      if (recTs && !String(recTs).startsWith('hash:')) {
        st.lastTs = pickLatestTimestamp(st.lastTs, recTs);
      }
    }
  }

  // Apply decay relative to nowIso if provided, recording scoreAsOf to prevent double decay
  if (nowIso) {
    for (const specialist of Object.keys(reputation)) {
      for (const domain of Object.keys(reputation[specialist])) {
        const st = reputation[specialist][domain];
        if (st.lastTs) {
          st.score = getEffectiveReputationScore(st, nowIso, policy);
          st.scoreAsOf = nowIso;
        }
      }
    }
  }

  return reputation;
}

/**
 * Recommendation-only ranking helper (REQ-3).
 * Never alters requiredCount, missingNames, or gate allow/deny.
 * Activates ONLY when observations >= policy.minObservations (3).
 */
export function rankRecommendedSpecialists(candidates, domain, instinctsData, nowIso = null, policy = REPUTATION_POLICY) {
  const list = Array.isArray(candidates) ? [...candidates] : [];
  const repMap = instinctsData?.reputation || {};
  const dom = String(domain || 'general').toLowerCase();

  const decorated = list.map((rawName, idx) => {
    const name = String(rawName).replace(/^@/, '').toLowerCase();
    const entry = repMap?.[name]?.[dom] || null;
    const active = Boolean(entry && entry.observations >= policy.minObservations);
    const effectiveScore = active ? getEffectiveReputationScore(entry, nowIso, policy) : policy.priorScore;
    const observations = entry?.observations || 0;
    const label = active
      ? `@${name} (score ${effectiveScore.toFixed(2)}, n=${observations})`
      : `@${name}`;
    return { name, idx, active, effectiveScore, observations, label };
  });

  const anyActive = decorated.some((d) => d.active);
  if (!anyActive) {
    return decorated; // Cold start / <3 observations: neutral, unchanged order
  }

  return decorated.sort((a, b) => {
    if (b.effectiveScore !== a.effectiveScore) return b.effectiveScore - a.effectiveScore;
    return a.idx - b.idx;
  });
}

/**
 * Syncs mechanical outcomes into `.hermes/council-outcomes.jsonl` and recomputes `.hermes/instincts.json`.
 * Preserves any existing manual/project `instincts` array inside `.hermes/instincts.json`.
 */
export function syncCouncilOutcomeAndReputation({
  activeWorkspaceDir,
  taskHash,
  councilState = null,
  fallbackInfo = null,
  validAgentsSet = null,
  aliases = {},
  nowIso = null
}) {
  const hermesDir = path.join(activeWorkspaceDir, '.hermes');
  const outcomesPath = path.join(hermesDir, 'council-outcomes.jsonl');
  const instinctsPath = path.join(hermesDir, 'instincts.json');

  const mech = detectMechanicalOutcome(hermesDir);

  // Load existing outcomes
  const existingRecords = [];
  const existingKeys = new Set();
  const consumedArtifactKeys = new Set();
  if (fs.existsSync(outcomesPath)) {
    try {
      const lines = fs.readFileSync(outcomesPath, 'utf-8').split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const rec = JSON.parse(line);
          existingRecords.push(rec);
          const key = `${rec.taskHash}|${rec.outcome}|${rec.outcomeSource || ''}|${rec.diffHash || 'null'}|${rec.ts}`;
          existingKeys.add(key);
          const artKey = `${rec.outcomeSource || ''}|${rec.diffHash || 'null'}|${rec.ts}`;
          consumedArtifactKeys.add(artKey);
        } catch {}
      }
    } catch {}
  }

  let appended = false;
  const activeState = (councilState && councilState.taskHash === taskHash) ? councilState : fallbackInfo;

  if (mech.outcome && mech.attemptTs && activeState) {
    const key = `${taskHash}|${mech.outcome}|${mech.outcomeSource || ''}|${mech.diffHash || 'null'}|${mech.attemptTs}`;
    const artKey = `${mech.outcomeSource || ''}|${mech.diffHash || 'null'}|${mech.attemptTs}`;
    if (!existingKeys.has(key) && !consumedArtifactKeys.has(artKey)) {
      const roster = Array.isArray(activeState.roster) ? activeState.roster : [];
      const rosterNames = new Set(
        roster
          .filter((r) => r && r.name && r.uuid && r.bindingConfidence !== 'uncertain')
          .map((r) => String(r.name).toLowerCase())
      );

      const rawDeclared = Array.isArray(activeState.declaredAuthors) && activeState.declaredAuthors.length > 0
        ? activeState.declaredAuthors.map((a) => (typeof a === 'string' ? { name: a, source: 'lead_declared' } : { name: String(a.name || ''), source: 'lead_declared' }))
        : extractDeclaredAuthors(hermesDir, validAgentsSet, aliases, taskHash);

      const declaredAuthors = rawDeclared
        .filter((a) => a.name)
        .map((a) => ({
          name: a.name.toLowerCase(),
          source: 'lead_declared',
          verifiedInRoster: rosterNames.has(a.name.toLowerCase())
        }));

      const domain = activeState.domain || detectDomain(activeState.task || '', roster);
      const record = {
        taskHash,
        domain,
        mode: activeState.mode || 'parallel',
        earlyStop: Boolean(activeState.earlyStop),
        rounds: Number(activeState.roundsCompleted ?? activeState.requiredRounds ?? 0),
        roster,
        declaredAuthors,
        outcome: mech.outcome,
        outcomeSource: mech.outcomeSource,
        diffHash: mech.diffHash || null,
        ts: mech.attemptTs
      };

      try {
        if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
        fs.appendFileSync(outcomesPath, JSON.stringify(record) + '\n', 'utf-8');
        existingRecords.push(record);
        existingKeys.add(key);
        appended = true;
      } catch {}
    }
  }

  // Recompute mechanical reputation whenever outcomes were appended or instincts.json is missing while outcomes exist
  if (appended || (existingRecords.length > 0 && !fs.existsSync(instinctsPath))) {
    const reputation = recomputeReputationFromOutcomes(existingRecords, nowIso || new Date().toISOString());
    let preservedInstincts = [];
    if (fs.existsSync(instinctsPath)) {
      try {
        const cur = JSON.parse(fs.readFileSync(instinctsPath, 'utf-8'));
        if (Array.isArray(cur)) preservedInstincts = cur;
        else if (Array.isArray(cur?.instincts)) preservedInstincts = cur.instincts;
      } catch {}
    }
    const payload = {
      version: 1,
      updatedAt: nowIso || new Date().toISOString(),
      policy: {
        minObservations: REPUTATION_POLICY.minObservations,
        priorScore: REPUTATION_POLICY.priorScore,
        maxDeltaPerObservation: REPUTATION_POLICY.maxDeltaPerObservation,
        halfLifeDays: REPUTATION_POLICY.halfLifeDays
      },
      instincts: preservedInstincts,
      reputation
    };
    try {
      if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
      fs.writeFileSync(instinctsPath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {}
  }

  return { appended, outcomesCount: existingRecords.length, mech };
}

/**
 * Extracts normalized criteria text and SHA-256 hash from `.hermes/council-roundtable.md`
 * or `.hermes/decisions.md` for REQ-4 anti metric-shopping freeze.
 */
export function extractCriteriaSnapshotFromText(content, source = 'inline') {
  if (!content || typeof content !== 'string') return null;
  const headingRe = /(?:^|\r?\n)(#{1,4})\s*(?:критерии(?:\s+оценки)?|evaluation\s+criteria|criteria)(?![а-яёa-z0-9_-])[^\r\n]*/i;
  const m = headingRe.exec(content);
  if (m) {
    const level = m[1].length;
    const startIdx = m.index + (m[0].startsWith('\n') || m[0].startsWith('\r') ? (m[0].startsWith('\r\n') ? 2 : 1) : 0);
    const rest = content.slice(startIdx);
    const nextHeadingRe = new RegExp(`\\r?\\n#{1,${level}}\\s+`);
    const nextMatch = nextHeadingRe.exec(rest.slice(m[0].length));
    const sectionText = nextMatch ? rest.slice(0, m[0].length + nextMatch.index) : rest;
    const normalized = sectionText.replace(/\r\n/g, '\n').trim();
    if (normalized.length > 0) {
      const criteriaHash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
      return { criteriaHash, source, text: normalized };
    }
  }
  const inlineMatch = content.match(/(?:^|\r?\n)((?:критерии(?:\s+оценки)?|criteria)\s*:[^\r\n]+(?:\r?\n[ \t]*[-*]\s+[^\r\n]+)*)/i);
  if (inlineMatch) {
    const normalized = inlineMatch[1].replace(/\r\n/g, '\n').trim();
    const criteriaHash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
    return { criteriaHash, source, text: normalized };
  }
  return null;
}

export function extractCriteriaSnapshot(activeWorkspaceDir) {
  const hermesDir = path.join(activeWorkspaceDir, '.hermes');
  const candidates = [
    { file: 'council-roundtable.md', fullPath: path.join(hermesDir, 'council-roundtable.md') },
    { file: 'decisions.md', fullPath: path.join(hermesDir, 'decisions.md') }
  ];

  for (const cand of candidates) {
    if (!fs.existsSync(cand.fullPath)) continue;
    try {
      const content = fs.readFileSync(cand.fullPath, 'utf-8');
      const snap = extractCriteriaSnapshotFromText(content, cand.file);
      if (snap) return snap;
    } catch {}
  }
  return null;
}

/**
 * REQ-4: Freezes criteria hash at end of Stage 2 and verifies immutability before Stage 3 acceptance
 * (and on any subsequent edit to `.hermes/council-roundtable.md` or `.hermes/decisions.md`).
 * Returns { ok: true, frozen } or { ok: false, frozenHash, currentHash }.
 */
export function freezeOrVerifyCriteria({ activeWorkspaceDir, taskHash, projectedSnapshot = undefined, nowIso = null }) {
  const hermesDir = path.join(activeWorkspaceDir, '.hermes');
  const criteriaFile = path.join(hermesDir, 'council-criteria.json');
  const diskSnapshot = extractCriteriaSnapshot(activeWorkspaceDir);

  let frozen = null;
  if (fs.existsSync(criteriaFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(criteriaFile, 'utf-8'));
      if (parsed && parsed.taskHash === taskHash && parsed.criteriaHash) {
        frozen = parsed;
      }
    } catch {}
  }

  if (!frozen && diskSnapshot) {
    // Freeze the pre-edit on-disk criteria snapshot now!
    const record = {
      taskHash,
      criteriaHash: diskSnapshot.criteriaHash,
      source: diskSnapshot.source,
      ts: nowIso || new Date().toISOString()
    };
    try {
      if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
      fs.writeFileSync(criteriaFile, JSON.stringify(record, null, 2), 'utf-8');
    } catch {}
    frozen = record;
  }

  if (frozen) {
    const effectiveSnap = projectedSnapshot !== undefined
      ? projectedSnapshot
      : diskSnapshot;
    if (!effectiveSnap || effectiveSnap.criteriaHash !== frozen.criteriaHash) {
      return {
        ok: false,
        frozenHash: frozen.criteriaHash,
        currentHash: effectiveSnap ? effectiveSnap.criteriaHash : 'MISSING'
      };
    }
    return { ok: true, frozen };
  }

  return { ok: true, frozen: null };
}
