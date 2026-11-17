import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { collectToolCalls } from './hermes-trigger.mjs';
import {
  BOUNDARY_POST,
  BOUNDARY_PRE,
  extractAskQuestionOptions,
  extractAuthenticAskAnswer,
  readGateModeConfig,
  readProtectedJsonlStrict,
  readProtectedJsonStrict,
  resolveSelectedOptionText
} from './consent-validator.mjs';

export const VALID_PLAN_GATE_MODES = new Set(['ask', 'off']);

export const PLAN_QUESTION_RE = /(?:план\s+v?\d*\s*подходит|подтверд(?:и(?:ть|те)?|ать)\s+план|утверд(?:и(?:ть|те)?|ать)\s+план|согласовать\s+план|убрать\s+лишнее|добавить\s+сво[её]|вот\s+что\s+я\s+понял|plan\s+gate|approve\s+(?:the\s+)?plan|confirm\s+(?:the\s+)?plan)/i;

const STEP0_MODEL_RE = /(?:модел|model|уровен|tier|medium|high|low)/i;
const COUNCIL_ONLY_RE = /(?:посоветоваться\s+с\s+(?:советом|работниками)|собрать\s+совет|совет\s+специалистов|собраться\s+за\s+столом|круглый\s+стол|council\s+gate|roundtable)/i;

export function isPlanAskArgs(argsStr) {
  const s = String(argsStr || '');
  if (!PLAN_QUESTION_RE.test(s)) return false;
  if (STEP0_MODEL_RE.test(s) && !/(?:убрать\s+лишнее|добавить\s+сво[её]|план\s+v?\d*\s*подходит|confirm\s+(?:the\s+)?plan|approve\s+(?:the\s+)?plan)/i.test(s)) {
    return false;
  }
  if (COUNCIL_ONLY_RE.test(s) && !/(?:убрать\s+лишнее|добавить\s+сво[её]|план\s+v?\d*\s*подходит|подтверд(?:и(?:ть|те)?|ать)\s+план|утверд(?:и(?:ть|те)?|ать)\s+план)/i.test(s)) {
    return false;
  }
  return true;
}

export function computeCanonicalPlanHash(mdText) {
  const normalized = String(mdText || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
  return crypto.createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

export function formatPlanDeny(code, whatBlockedRu, whyRu, howFixRu, enSummary, enNextStep) {
  return (
    `⛔ Hermes «Руль» (${code}): ${whatBlockedRu}\n` +
    `Почему: ${whyRu}\n` +
    `Как исправить: ${howFixRu}\n` +
    `[EN: Hermes Steering (${code}): ${enSummary} Next step: ${enNextStep}]`
  );
}

// --- EARS-lite Plan Linter (REQ-2) ---

const SECTION_PATTERNS = {
  understood: /вот\s+что\s+я\s+понял/i,
  additions: /вот\s+что\s+я\s+добавлю\s+сам/i,
  nonGoals: /чего\s+я\s+не\s+делаю/i,
  questions: /спрошу\s+только(?:\s+одно[-–—]два)?/i,
  sources: new RegExp(`${BOUNDARY_PRE}(?:источники|sources|ссылки)${BOUNDARY_POST}`, 'i')
};

const HONEST_EMPTY_ADDITIONS_RE = /^(?:ничего\s+(?:сверх[^.\r\n]*|не\s+добавляю[^.\r\n]*)|добавок\s+нет|без\s+добавок|нет\s+добавок|пусто|nothing\s+to\s+add|no\s+additions)[.\s!—–-]*$/i;
const PLACEHOLDER_ONLY_RE = /^(?:tbd|todo|n\/a|none|нет|позже|см\.\s*выше|\.\.\.|-+|—+|_+|\?+)[.\s!]*$/i;
const STUB_VERIFY_RE = /^(?:ок|ok|да|yes|вручную|manual|tbd|todo|позже|проверю|визуально|\.\.\.|-+|—+|none|нет|\?+)[.\s!]*$/i;

const CONVENTION_CLAIM_RE = new RegExp(
  `${BOUNDARY_PRE}(?:так\\s+принято|общепринято|по\\s+стандарту|стандартная\\s+практика|лучшая\\s+практика|индустриальный\\s+стандарт|канонично|всегда\\s+так\\s+делают|best\\s+practice|industry\\s+standard|by\\s+convention|de\\s+facto)${BOUNDARY_POST}`,
  'i'
);
const HONEST_CHOICE_MARKER_RE = /(?:мой\s+выбор[,\s—–-]+не\s+конвенция|my\s+choice[,\s—–-]+not\s+(?:a\s+)?convention)/i;
const VALID_HTTPS_URL_RE = /https:\/\/(?!(?:example\.com|localhost|127\.0\.0\.1)(?:[:/\s]|$))[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s)"'»]*)?/i;
const QUOTE_RE = /(?:«[^»\r\n]{6,}»|"[^"\r\n]{6,}"|'[^'\r\n]{6,}')/;
const DATE_RE = /(?:\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\.\d{2}\.\d{4}\b|\b\d{4}-\d{2}\b)/;
const LOCAL_PATH_LINE_RE = /(?<![:/\w])([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]{1,8}):(\d+)/g;

function hasExternalEvidenceTriple(text) {
  const s = String(text || '');
  return VALID_HTTPS_URL_RE.test(s) && QUOTE_RE.test(s) && DATE_RE.test(s);
}

function hasVerifiedLocalPathRef(text, workspaceDir) {
  if (!workspaceDir) return false;
  const s = String(text || '');
  LOCAL_PATH_LINE_RE.lastIndex = 0;
  let m;
  while ((m = LOCAL_PATH_LINE_RE.exec(s)) !== null) {
    const relPath = m[1];
    const resolved = path.resolve(workspaceDir, relPath);
    const relCheck = path.relative(path.resolve(workspaceDir), resolved);
    if (!relCheck.startsWith('..') && !path.isAbsolute(relCheck) && fs.existsSync(resolved)) {
      return true;
    }
  }
  return false;
}

function parsePlanSections(mdText) {
  const cleaned = String(mdText || '')
    .replace(/^\uFEFF/, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const lines = cleaned.split(/\r?\n/);

  const sections = {
    understood: null,
    additions: null,
    nonGoals: null,
    questions: null,
    sources: null
  };

  let inFence = false;
  let currentKey = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^```/.test(line)) {
      inFence = !inFence;
      if (currentKey) sections[currentKey].push(rawLine);
      continue;
    }
    if (!inFence) {
      const headingMatch = line.match(/^(?:#{1,4}\s+|\*\*|\*|_)(.+?)(?:\*\*|\*|_)?$/);
      const headingText = headingMatch ? headingMatch[1].replace(/[*_`~]/g, '').trim() : '';
      let matchedKey = null;
      if (headingText) {
        for (const [key, re] of Object.entries(SECTION_PATTERNS)) {
          if (re.test(headingText)) {
            matchedKey = key;
            break;
          }
        }
      }
      if (matchedKey) {
        currentKey = matchedKey;
        if (!sections[currentKey]) sections[currentKey] = [];
        continue;
      }
      // Any other top-level markdown heading ends the current tracked section
      if (/^#{1,4}\s+/.test(line)) {
        currentKey = null;
        continue;
      }
    }
    if (currentKey) {
      sections[currentKey].push(rawLine);
    }
  }

  return sections;
}

function extractSectionItems(sectionLines, { allowHonestEmpty = false } = {}) {
  if (!Array.isArray(sectionLines)) return [];
  const items = [];
  let inFence = false;

  for (const rawLine of sectionLines) {
    const trimmed = rawLine.trim();
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !trimmed || /^[-*_]{3,}$/.test(trimmed)) continue;

    const bulletMatch = trimmed.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
    const body = bulletMatch ? bulletMatch[1].trim() : trimmed;
    const bareBody = body.replace(/^[*_`~\s]+|[*_`~\s]+$/g, '').trim();
    if (!bareBody) continue;
    if (allowHonestEmpty && HONEST_EMPTY_ADDITIONS_RE.test(bareBody)) continue;
    items.push(body);
  }
  return items;
}

function checkConventionEvidence(cleanText, label, sourcesMap, workspaceDir, errors) {
  if (!CONVENTION_CLAIM_RE.test(cleanText)) return;
  const hasHonestChoice = HONEST_CHOICE_MARKER_RE.test(cleanText);
  const hasInlineTriple = hasExternalEvidenceTriple(cleanText);
  const hasLocalRef = hasVerifiedLocalPathRef(cleanText, workspaceDir);
  let hasFootnoteTriple = false;
  for (const fm of cleanText.matchAll(/\[\^?(\d+)\]/g)) {
    const srcEntry = sourcesMap.get(fm[1]);
    if (srcEntry && hasExternalEvidenceTriple(srcEntry)) {
      hasFootnoteTriple = true;
      break;
    }
  }
  if (!hasHonestChoice && !hasInlineTriple && !hasFootnoteTriple && !hasLocalRef) {
    errors.push(
      `Пункт (${label}) содержит претензию «так принято» без источника: укажите URL + дословную цитату + дату (inline или в «Источники: [n]»), локальный path:line, либо честную пометку «мой выбор, не конвенция».`
    );
  }
}

function parseSourcesMap(sourceLines) {
  const map = new Map();
  if (!Array.isArray(sourceLines)) return map;
  for (const rawLine of sourceLines) {
    const trimmed = rawLine.trim();
    const m = trimmed.match(/^(?:[-*+]\s+)?\[\^?(\d+)\][:.\s]+(.+)$/);
    if (m) {
      map.set(m[1], m[2].trim());
    }
  }
  return map;
}

export function lintPlanEarsLite(mdText, { workspaceDir = '' } = {}) {
  const errors = [];
  const text = String(mdText || '').trim();
  if (text.length < 40) {
    return {
      ok: false,
      errors: ['Файл .hermes/plan.md слишком короткий или пустой.'],
      reqIds: [],
      itemCount: 0
    };
  }

  const sections = parsePlanSections(text);
  const sourcesMap = parseSourcesMap(sections.sources);

  if (!sections.understood) errors.push('Отсутствует обязательная секция «ВОТ ЧТО Я ПОНЯЛ».');
  if (!sections.additions) errors.push('Отсутствует обязательная секция «ВОТ ЧТО Я ДОБАВЛЮ САМ».');
  if (!sections.nonGoals) errors.push('Отсутствует обязательная секция «ЧЕГО Я НЕ ДЕЛАЮ».');
  if (!sections.questions) errors.push('Отсутствует обязательная секция «СПРОШУ ТОЛЬКО ОДНО-ДВА».');

  // Verify nonGoals and questions have real non-placeholder content and no uncited convention claims
  if (sections.nonGoals) {
    const nonGoalLines = sections.nonGoals
      .map((l) => l.trim().replace(/^[-*+]\s+/, '').trim())
      .filter((l) => l.length > 0 && !/^[-*_]{3,}$/.test(l) && !PLACEHOLDER_ONLY_RE.test(l));
    if (nonGoalLines.length === 0) {
      errors.push('Секция «ЧЕГО Я НЕ ДЕЛАЮ» пуста или содержит заглушку (TBD/TODO).');
    } else {
      nonGoalLines.forEach((line, i) =>
        checkConventionEvidence(line.replace(/\*\*/g, '').trim(), `Чего не делаю #${i + 1}`, sourcesMap, workspaceDir, errors)
      );
    }
  }

  if (sections.questions) {
    const questionLines = sections.questions
      .map((l) => l.trim().replace(/^[-*+]\s+/, '').trim())
      .filter((l) => l.length > 0 && !/^[-*_]{3,}$/.test(l) && !PLACEHOLDER_ONLY_RE.test(l));
    if (questionLines.length === 0) {
      errors.push('Секция «СПРОШУ ТОЛЬКО ОДНО-ДВА» пуста или содержит заглушку (укажите 1–2 вопроса либо «Вопросов нет.»).');
    } else {
      questionLines.forEach((line, i) =>
        checkConventionEvidence(line.replace(/\*\*/g, '').trim(), `Вопросы #${i + 1}`, sourcesMap, workspaceDir, errors)
      );
    }
  }

  const understoodItems = extractSectionItems(sections.understood, { allowHonestEmpty: false });
  const additionItems = extractSectionItems(sections.additions, { allowHonestEmpty: true });

  if (sections.understood && understoodItems.length === 0) {
    errors.push('Секция «ВОТ ЧТО Я ПОНЯЛ» должна содержать минимум 1 пункт в формате EARS-lite.');
  }

  // Validate additions: either honest empty / blank, OR valid EARS-lite items
  const allEarsItems = [
    ...understoodItems.map((item, idx) => ({ section: 'Понял', idx: idx + 1, text: item })),
    ...additionItems.map((item, idx) => ({ section: 'Добавлю сам', idx: idx + 1, text: item }))
  ];

  const EARS_ITEM_RE = /(?:КОГДА|ЕСЛИ|WHEN|IF)\s+(.+?)\s*[—–-]+\s*(?:СИСТЕМА\s+)?(?:ДОЛЖН[АЫО]|ОБЯЗАН[АЫО]?|SHALL|MUST)\s+(.+?)(?:\.\s*|\s+)(?:Проверка|Верификация|Verify|Verification)\s*:\s*(.+)$/i;

  for (const entry of allEarsItems) {
    const cleanItem = entry.text.replace(/\*\*/g, '').trim();
    const label = `${entry.section} #${entry.idx}`;

    if (PLACEHOLDER_ONLY_RE.test(cleanItem)) {
      errors.push(`Пункт (${label}) содержит пустую заглушку.`);
      continue;
    }

    const m = cleanItem.match(EARS_ITEM_RE);
    if (!m) {
      errors.push(`Пункт (${label}) не соответствует формату EARS-lite: «КОГДА <условие> — СИСТЕМА ДОЛЖНА <поведение>. Проверка: <тест или артефакт>».`);
      continue;
    }

    const cond = m[1].trim();
    const beh = m[2].trim();
    const verify = m[3].trim();

    if (cond.length < 3 || PLACEHOLDER_ONLY_RE.test(cond)) {
      errors.push(`Пункт (${label}): условие после КОГДА пустое или заглушка.`);
    }
    if (beh.length < 3 || PLACEHOLDER_ONLY_RE.test(beh)) {
      errors.push(`Пункт (${label}): поведение после ДОЛЖНА пустое или заглушка.`);
    }
    if (verify.length < 4 || STUB_VERIFY_RE.test(verify)) {
      errors.push(`Пункт (${label}): поле «Проверка:» пустое или содержит отписку («ок»/«вручную»/«TBD»).`);
    }

    // Convention-claim evidence check («так принято»)
    checkConventionEvidence(cleanItem, label, sourcesMap, workspaceDir, errors);
  }

  const reqIds = [...new Set([...text.matchAll(/\b(REQ-\d+)\b/gi)].map((m) => m[1].toUpperCase()))];

  return {
    ok: errors.length === 0,
    errors,
    reqIds,
    itemCount: allEarsItems.length
  };
}

// --- 5-Step Hardened Consent Classifier (REQ-1, REQ-5) ---

const PLAN_SKIP_NEGATION_RE = new RegExp(
  `(?:${BOUNDARY_PRE}(?:не\\s+надо|не\\s+нужн[оаы]?|не\\s+нужен|никакого|без|пропусти(?:ть)?|отмена|нафиг|к\\s+ч[её]рту|no|skip|without|don'?t\\s+need)${BOUNDARY_POST}[^\\r\\n]{0,25}${BOUNDARY_PRE}(?:план[ауеоми]?|plan|подтверждени[яею]|согласовани[яею])${BOUNDARY_POST})|` +
  `(?:${BOUNDARY_PRE}(?:план[ауеоми]?|plan)${BOUNDARY_POST}[^\\r\\n]{0,25}${BOUNDARY_PRE}(?:не\\s+надо|не\\s+нужен|нафиг|к\\s+ч[её]рту|пропусти(?:ть)?|отмена|skip)${BOUNDARY_POST})`,
  'i'
);

const COLLOQUIAL_APPROVAL_IDIOMS_RE = new RegExp(
  `${BOUNDARY_PRE}(?:без\\s+(?:проблем|вопросов|замечаний|правок|изменений|лишних\\s+слов|сомнений)|нет\\s+(?:возражений|вопросов|замечаний|правок)|не\\s+(?:против|вопрос))${BOUNDARY_POST}`,
  'gi'
);

const NEG_WORDS = `(?:не|не\\s+хочу|не\\s+надо|не\\s+нужно|не\\s+нужен|нельзя|никакого|отмена|стоп|don'?t|do\\s+not|not|never|no|reject|cancel)`;
const APPROVE_VERBS = `(?:подтверждаю|утверждаю|одобряю|согласен|делай|поехали|запускай|approve|approved|confirm|confirmed|proceed|go\\s+ahead)`;

const PLAN_APPROVAL_NEGATION_RE = new RegExp(
  `(?:${BOUNDARY_PRE}${NEG_WORDS}${BOUNDARY_POST}[^\\r\\n]{0,40}${BOUNDARY_PRE}${APPROVE_VERBS}${BOUNDARY_POST})|` +
  `(?:${BOUNDARY_PRE}${APPROVE_VERBS}${BOUNDARY_POST}[^\\r\\n]{0,40}${BOUNDARY_PRE}${NEG_WORDS}${BOUNDARY_POST})`,
  'i'
);

const EDIT_DOMINANCE_RE = new RegExp(
  `${BOUNDARY_PRE}(?:убрать\\s+лишнее|добавить\\s+сво[её]|убрать|убери|вычеркни|исключи|удали|добавить|добавь|допиши|поменяй|измени|переделай|доработай|вместо|кроме|(?:только|но)\\s+без|без\\s+(?:п|д)\\d+|revise|trim|remove|add\\s+my\\s+own|change\\s+plan|edit\\s+plan)${BOUNDARY_POST}`,
  'i'
);

const PLAN_APPROVE_RE = new RegExp(
  `${BOUNDARY_PRE}(?:делай|подтверждаю|утверждаю|одобряю|согласен|поехали|запускай|подходит|ок[,\\s]+поехали|approve|approved|confirm|confirmed|proceed|go\\s+ahead)${BOUNDARY_POST}`,
  'i'
);

export function classifyPlanConsent(answerText, options = []) {
  const raw = String(answerText || '').trim();
  if (!raw) {
    return { decision: 'unconfirmed', code: 'plan_unconfirmed', selectedOptionText: '' };
  }

  // Step 1: Option-order binding (never assume "1" == approve when options are reordered or absent)
  const { selectedOptionText, isNumericSelection, strippedAnswer } = resolveSelectedOptionText(raw, options);
  if (isNumericSelection && !selectedOptionText) {
    return { decision: 'unconfirmed', code: 'plan_unconfirmed', selectedOptionText: '' };
  }

  // Step 2: Explicit plan-skip negations («не надо план, делай сразу», «никакого плана»)
  if (PLAN_SKIP_NEGATION_RE.test(raw) || PLAN_SKIP_NEGATION_RE.test(selectedOptionText)) {
    return { decision: 'negated', code: 'plan_negated_consent', selectedOptionText };
  }

  // Step 3: Strip colloquial approval idioms ONLY before negation/edit checks («Делай, без проблем» -> allow)
  const cleanedRaw = strippedAnswer.replace(COLLOQUIAL_APPROVAL_IDIOMS_RE, ' ').replace(/\s+/g, ' ').trim();
  const cleanedOpt = selectedOptionText.replace(COLLOQUIAL_APPROVAL_IDIOMS_RE, ' ').replace(/\s+/g, ' ').trim();

  if (PLAN_APPROVAL_NEGATION_RE.test(cleanedRaw) || PLAN_APPROVAL_NEGATION_RE.test(cleanedOpt)) {
    return { decision: 'negated', code: 'plan_negated_consent', selectedOptionText };
  }

  // Step 4: Edit-Dominance («Убрать лишнее», «Добавить своё», «Делай, но убери Д2» -> revision, NEVER approve)
  if (EDIT_DOMINANCE_RE.test(cleanedOpt) || EDIT_DOMINANCE_RE.test(cleanedRaw)) {
    return { decision: 'revise', code: 'plan_revision_pending', selectedOptionText };
  }

  // Step 5: Positive approval bound strictly to selectedOptionText for numeric choices
  const targetForApprove = isNumericSelection ? cleanedOpt : `${cleanedOpt} ${cleanedRaw}`;
  if (PLAN_APPROVE_RE.test(targetForApprove)) {
    return { decision: 'approved', code: 'plan_approved', selectedOptionText };
  }

  return { decision: 'unconfirmed', code: 'plan_unconfirmed', selectedOptionText };
}

function appendPlanLedger(activeWorkspaceDir, entry) {
  try {
    const hermesDir = path.join(activeWorkspaceDir, '.hermes');
    if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
    const ledgerPath = path.join(hermesDir, 'plan-ledger.jsonl');
    fs.appendFileSync(ledgerPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf-8');
  } catch {}
}

function findLastPlanWriteStepIdx(combinedSteps, startIdx, fileWriteToolsSet) {
  let lastIdx = -1;
  for (let i = startIdx; i < combinedSteps.length; i++) {
    for (const tc of collectToolCalls(combinedSteps[i])) {
      const name = String(tc?.name || '').toLowerCase();
      if (!fileWriteToolsSet.has(name)) continue;
      const p = String(tc?.args?.Path || tc?.args?.TargetFile || tc?.args?.AbsolutePath || tc?.args?.path || '')
        .replace(/\\/g, '/')
        .replace(/[. ]+$/g, '')
        .toLowerCase();
      if (/(?:^|\/)\.hermes\/plan\.md$/.test(p)) {
        lastIdx = i;
      }
    }
  }
  return lastIdx;
}

function findLatestPlanAsk(combinedSteps, startIdx) {
  let planAskIdx = -1;
  let planAskToolCallId = '';
  for (let i = startIdx; i < combinedSteps.length; i++) {
    const s = combinedSteps[i];
    for (const tc of collectToolCalls(s)) {
      if (String(tc?.name || '').toLowerCase() !== 'ask_question') continue;
      const qText = JSON.stringify(tc?.args || '');
      if (isPlanAskArgs(qText)) {
        planAskIdx = i;
        planAskToolCallId = String(tc?.id || tc?.tool_call_id || tc?.call_id || '');
      }
    }
  }
  return { planAskIdx, planAskToolCallId };
}

/**
 * Verifies Plan Gate for Lead write attempts (REQ-1, REQ-2, REQ-5).
 * Runs strictly AFTER verifyCouncilGate and independently of council mode.
 */
export function verifyPlanGate({
  toolName,
  args,
  payload,
  activeWorkspaceDir,
  taskContext,
  combinedSteps,
  fileWriteToolsSet,
  isMetaOrArtifactPath,
  extractSubagentSpecs,
  logGateDecision,
  deny
}) {
  const isFileWrite = fileWriteToolsSet.has(toolName);
  const writeTargetPath = isFileWrite ? String(args.Path || args.TargetFile || args.AbsolutePath || args.path || '') : '';
  const isSelfSubagentSpawn =
    toolName === 'invoke_subagent' &&
    extractSubagentSpecs(args).some((s) => String(s?.TypeName || s?.typeName || '').toLowerCase() === 'self');

  const isWriteAttempt =
    (isFileWrite && !isMetaOrArtifactPath(writeTargetPath)) ||
    (toolName === 'define_subagent' && (args.EnableWriteTools === true || args.enableWriteTools === true)) ||
    toolName === 'swarm' ||
    isSelfSubagentSpawn;

  if (!isWriteAttempt) return;

  // Fail-closed config check (orthogonal to councilGate!)
  const cfgRes = readGateModeConfig(activeWorkspaceDir, {
    key: 'planGate',
    envVar: 'HERMES_PLAN_GATE',
    validModes: VALID_PLAN_GATE_MODES,
    defaultMode: 'ask'
  });
  if (cfgRes.invalidReason) {
    logGateDecision({
      toolName,
      decision: 'warn',
      reason: `Plan Gate config invalid (${cfgRes.invalidReason}) — fail-closed to strict mode (planGate="ask")`,
      source: cfgRes.source
    });
  }
  if (cfgRes.mode === 'off') {
    logGateDecision({
      toolName,
      decision: 'allow',
      reason: `Plan Gate bypassed: planGate="off" (source: ${cfgRes.source})`,
      source: cfgRes.source
    });
    return;
  }

  // Fail-open for simple unit tests without transcripts (consistent with Council Gate)
  const transcriptPath = payload?.transcriptPath;
  if (!transcriptPath || !Array.isArray(combinedSteps) || combinedSteps.length === 0) {
    return;
  }

  // Unified task scope bypasses (Micro/Fast-Path, direct @specialist, fix-warnings)
  if (taskContext?.bypassKind) {
    logGateDecision({
      toolName,
      decision: 'allow',
      reason: `Plan Gate bypassed: ${taskContext.bypassKind} (source: ${taskContext.bypassSource})`,
      source: taskContext.bypassSource
    });
    return;
  }

  const hermesDir = path.join(activeWorkspaceDir, '.hermes');
  const planMdPath = path.join(hermesDir, 'plan.md');
  const planStatePath = path.join(hermesDir, 'plan-state.json');
  const planLedgerPath = path.join(hermesDir, 'plan-ledger.jsonl');

  // Strict fail-closed validation on existing protected plan artifacts
  const existingState = readProtectedJsonStrict(planStatePath, '.hermes/plan-state.json')?.data || null;
  const ledgerRecords = readProtectedJsonlStrict(planLedgerPath, '.hermes/plan-ledger.jsonl');

  if (!fs.existsSync(planMdPath)) {
    deny(
      formatPlanDeny(
        'plan_missing',
        `Запись кода (${toolName}) заблокирована без плана.`,
        'Файл .hermes/plan.md не создан для текущей задачи.',
        'Создайте .hermes/plan.md (4 секции + EARS-lite) и подтвердите план у пользователя через ask_question ([Делай] / [Убрать лишнее] / [Добавить своё]).',
        `Write (${toolName}) blocked: .hermes/plan.md is missing.`,
        'Create .hermes/plan.md (4 sections + EARS-lite) and confirm with user via ask_question.'
      ),
      { toolName, rule: 'plan_missing', taskHash: taskContext.taskHash }
    );
    process.exit(0);
  }

  const planMdText = fs.readFileSync(planMdPath, 'utf-8');
  const currentPlanHash = computeCanonicalPlanHash(planMdText);
  const lastPlanWriteIdx = findLastPlanWriteStepIdx(combinedSteps, taskContext.taskStartIdx, fileWriteToolsSet);

  const stateMatchesTask =
    existingState &&
    existingState.status === 'confirmed' &&
    existingState.taskHash === taskContext.taskHash &&
    (!taskContext.convId || !existingState.conversationId || existingState.conversationId === taskContext.convId);

  // Case A: Active confirmed plan exists for this taskHash
  if (stateMatchesTask) {
    if (existingState.planHash === currentPlanHash) {
      logGateDecision({
        toolName,
        decision: 'allow',
        reason: `Plan Gate approved: confirmed plan v${existingState.version || 1} hash verified`
      });
      return;
    }

    // Hash mismatch! Plan was edited after confirmation -> require fresh v(N+1) confirmation
    const prevAskIdx = Number.isInteger(existingState.confirmedAskStepIdx) ? existingState.confirmedAskStepIdx : -1;
    const minNextAskIdx = Math.max(taskContext.taskStartIdx, prevAskIdx + 1);
    const { planAskIdx, planAskToolCallId } = findLatestPlanAsk(combinedSteps, minNextAskIdx);

    const hasFreshAsk =
      planAskIdx >= minNextAskIdx &&
      planAskIdx > lastPlanWriteIdx &&
      (!existingState.confirmedAskToolCallId || !planAskToolCallId || planAskToolCallId !== existingState.confirmedAskToolCallId);

    if (hasFreshAsk) {
      const { options } = extractAskQuestionOptions(combinedSteps[planAskIdx]);
      const answer = extractAuthenticAskAnswer(combinedSteps, planAskIdx, planAskToolCallId);
      const consent = classifyPlanConsent(answer, options);
      if (consent.decision === 'approved') {
        const lint = lintPlanEarsLite(planMdText, { workspaceDir: activeWorkspaceDir });
        if (!lint.ok) {
          appendPlanLedger(activeWorkspaceDir, {
            event: 'PLAN_LINT_FAILED',
            taskHash: taskContext.taskHash,
            version: (existingState.version || 1) + 1,
            planHash: currentPlanHash,
            errors: lint.errors
          });
          deny(
            formatPlanDeny(
              'plan_lint_failed',
              `Ревизия плана v${(existingState.version || 1) + 1} не прошла проверку EARS-lite.`,
              lint.errors.slice(0, 3).join(' '),
              'Исправьте указанные пункты в .hermes/plan.md и запросите подтверждение заново.',
              `Plan revision v${(existingState.version || 1) + 1} failed EARS-lite lint: ${lint.errors.join('; ')}`,
              'Fix .hermes/plan.md and request user confirmation again.'
            ),
            { toolName, rule: 'plan_lint_failed', taskHash: taskContext.taskHash }
          );
          process.exit(0);
        }

        const nextVersion = (Number(existingState.version) || 1) + 1;
        const now = new Date().toISOString();
        const nextState = {
          taskHash: taskContext.taskHash,
          conversationId: taskContext.convId,
          planHash: currentPlanHash,
          previousPlanHash: existingState.planHash,
          status: 'confirmed',
          confirmedAt: now,
          version: nextVersion,
          confirmedAskStepIdx: planAskIdx,
          confirmedAskToolCallId: planAskToolCallId || null,
          reqIds: lint.reqIds
        };
        fs.writeFileSync(planStatePath, JSON.stringify(nextState, null, 2), 'utf-8');
        appendPlanLedger(activeWorkspaceDir, {
          event: 'PLAN_REVISED',
          taskHash: taskContext.taskHash,
          version: nextVersion,
          planHash: currentPlanHash,
          previousPlanHash: existingState.planHash,
          reason: `reconfirmed_v${nextVersion}`
        });
        logGateDecision({
          toolName,
          decision: 'allow',
          reason: `Plan Gate approved: revised plan v${nextVersion} reconfirmed`
        });
        return;
      }
    }

    // Record drift event once per distinct tampered hash
    const alreadyLoggedDrift = ledgerRecords.some(
      (r) => r.event === 'PLAN_DRIFT_DENY' && r.taskHash === taskContext.taskHash && r.actualHash === currentPlanHash
    );
    if (!alreadyLoggedDrift) {
      appendPlanLedger(activeWorkspaceDir, {
        event: 'PLAN_DRIFT_DENY',
        taskHash: taskContext.taskHash,
        version: existingState.version || 1,
        expectedHash: existingState.planHash,
        actualHash: currentPlanHash,
        reason: 'plan_modified_after_confirmation'
      });
    }

    deny(
      formatPlanDeny(
        'plan_tampered',
        `Запись кода (${toolName}) заблокирована: .hermes/plan.md изменён после подтверждения v${existingState.version || 1}.`,
        `Ожидаемый SHA-256: ${String(existingState.planHash).slice(0, 12)}, текущий: ${currentPlanHash.slice(0, 12)}.`,
        `Оформите ревизию плана v${(existingState.version || 1) + 1} с причиной изменений и получите новое подтверждение [Делай] через ask_question.`,
        `Write (${toolName}) blocked: .hermes/plan.md hash mismatch after v${existingState.version || 1} confirmation.`,
        `Re-confirm plan v${(existingState.version || 1) + 1} with user via ask_question.`
      ),
      { toolName, rule: 'plan_tampered', taskHash: taskContext.taskHash }
    );
    process.exit(0);
  }

  // Case B: Initial confirmation for current taskHash
  const { planAskIdx, planAskToolCallId } = findLatestPlanAsk(combinedSteps, taskContext.taskStartIdx);
  if (planAskIdx < 0) {
    deny(
      formatPlanDeny(
        'plan_unconfirmed',
        `Запись кода (${toolName}) заблокирована: план не отправлен на подтверждение.`,
        'Файл .hermes/plan.md существует, но окно подтверждения плана через ask_question не найдено.',
        'Покажите план в чате и вызовите ask_question с опциями [Делай], [Убрать лишнее], [Добавить своё].',
        `Write (${toolName}) blocked: .hermes/plan.md has not been sent for user confirmation via ask_question.`,
        'Send plan confirmation prompt via ask_question.'
      ),
      { toolName, rule: 'plan_unconfirmed', taskHash: taskContext.taskHash }
    );
    process.exit(0);
  }

  // Pre-persistent TOCTOU guard: plan.md edited AFTER ask_question
  if (lastPlanWriteIdx > planAskIdx) {
    deny(
      formatPlanDeny(
        'plan_stale',
        `Запись кода (${toolName}) заблокирована: .hermes/plan.md изменён после отправки вопроса подтверждения.`,
        `Последняя правка плана (шаг ${lastPlanWriteIdx}) позже окна подтверждения (шаг ${planAskIdx}).`,
        'Отправьте актуальный .hermes/plan.md на повторное подтверждение через ask_question.',
        `Write (${toolName}) blocked: .hermes/plan.md was modified after confirmation prompt (TOCTOU).`,
        'Re-send ask_question for the updated plan.'
      ),
      { toolName, rule: 'plan_stale', taskHash: taskContext.taskHash }
    );
    process.exit(0);
  }

  const { options } = extractAskQuestionOptions(combinedSteps[planAskIdx]);
  const answer = extractAuthenticAskAnswer(combinedSteps, planAskIdx, planAskToolCallId);
  if (!answer.trim()) {
    deny(
      formatPlanDeny(
        'plan_unconfirmed',
        `Запись кода (${toolName}) заблокирована: нет подлинного ответа пользователя на план.`,
        'Ответ пользователя ещё не получен (проза MODEL и эхо <SYSTEM_MESSAGE> не принимаются).',
        'Дождитесь ответа пользователя в окне ask_question перед записью кода.',
        `Write (${toolName}) blocked: authentic user confirmation for plan is missing (MODEL prose and SYSTEM echoes are rejected).`,
        'Await authentic user response to plan ask_question.'
      ),
      { toolName, rule: 'plan_unconfirmed', taskHash: taskContext.taskHash }
    );
    process.exit(0);
  }

  const consent = classifyPlanConsent(answer, options);
  if (consent.decision === 'negated') {
    deny(
      formatPlanDeny(
        'plan_negated_consent',
        `Запись кода (${toolName}) заблокирована: план не подтверждён (зафиксировано отрицание).`,
        'Фразы вроде «не надо план, делай сразу», «план не подтверждаю» или «никакого плана» не считаются согласием.',
        'Получите явное подтверждение [Делай] или переведите мелкую задачу на Fast-Path / пользовательский planGate="off".',
        `Write (${toolName}) blocked: negated plan consent detected.`,
        'Obtain explicit [Делай] confirmation or use Fast-Path.'
      ),
      { toolName, rule: 'plan_negated_consent', taskHash: taskContext.taskHash }
    );
    process.exit(0);
  }

  if (consent.decision === 'revise') {
    appendPlanLedger(activeWorkspaceDir, {
      event: 'PLAN_REVISION_REQUESTED',
      taskHash: taskContext.taskHash,
      version: 1,
      planHash: currentPlanHash,
      reason: consent.selectedOptionText || 'user_requested_revision'
    });
    deny(
      formatPlanDeny(
        'plan_revision_pending',
        `Запись кода (${toolName}) заблокирована: пользователь запросил правку плана.`,
        'Выбрано «Убрать лишнее» / «Добавить своё» или указана правка — это путь ревизии v2, а не согласие.',
        'Обновите .hermes/plan.md (v2) с учётом правок и снова подтвердите план через ask_question.',
        `Write (${toolName}) blocked: user requested plan revision (not approval).`,
        'Update .hermes/plan.md to v2 and re-confirm via ask_question.'
      ),
      { toolName, rule: 'plan_revision_pending', taskHash: taskContext.taskHash }
    );
    process.exit(0);
  }

  if (consent.decision !== 'approved') {
    deny(
      formatPlanDeny(
        'plan_unconfirmed',
        `Запись кода (${toolName}) заблокирована: ответ пользователя не содержит явного одобрения плана.`,
        'Для старта записи требуется выбор опции «Делай» (проверяется по тексту опции, не по номеру).',
        'Уточните у пользователя и получите явное подтверждение [Делай] через ask_question.',
        `Write (${toolName}) blocked: user answer did not match explicit plan approval.`,
        'Obtain explicit [Делай] confirmation via ask_question.'
      ),
      { toolName, rule: 'plan_unconfirmed', taskHash: taskContext.taskHash }
    );
    process.exit(0);
  }

  // Mechanical EARS-lite lint at freeze time (REQ-2)
  const lint = lintPlanEarsLite(planMdText, { workspaceDir: activeWorkspaceDir });
  if (!lint.ok) {
    appendPlanLedger(activeWorkspaceDir, {
      event: 'PLAN_LINT_FAILED',
      taskHash: taskContext.taskHash,
      version: 1,
      planHash: currentPlanHash,
      errors: lint.errors
    });
    deny(
      formatPlanDeny(
        'plan_lint_failed',
        `План .hermes/plan.md не прошёл механический EARS-lite lint при заморозке.`,
        lint.errors.slice(0, 3).join(' '),
        'Исправьте структуру/пункты в .hermes/plan.md и запросите подтверждение пользователя повторно.',
        `Plan .hermes/plan.md failed EARS-lite lint: ${lint.errors.join('; ')}`,
        'Fix .hermes/plan.md sections/EARS-lite items and re-confirm.'
      ),
      { toolName, rule: 'plan_lint_failed', taskHash: taskContext.taskHash }
    );
    process.exit(0);
  }

  // Freeze confirmed plan v1 mechanically!
  if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
  const now = new Date().toISOString();
  const stateRecord = {
    taskHash: taskContext.taskHash,
    conversationId: taskContext.convId,
    planHash: currentPlanHash,
    status: 'confirmed',
    confirmedAt: now,
    version: 1,
    confirmedAskStepIdx: planAskIdx,
    confirmedAskToolCallId: planAskToolCallId || null,
    reqIds: lint.reqIds
  };
  fs.writeFileSync(planStatePath, JSON.stringify(stateRecord, null, 2), 'utf-8');
  appendPlanLedger(activeWorkspaceDir, {
    event: 'PLAN_FROZEN',
    taskHash: taskContext.taskHash,
    version: 1,
    planHash: currentPlanHash,
    reason: 'initial_confirmation'
  });
  logGateDecision({
    toolName,
    decision: 'allow',
    reason: `Plan Gate approved: plan v1 frozen (${lint.itemCount} EARS-lite items)`
  });
}

/**
 * Conditional live plan integrity check for write subagents (R3 refinement):
 * Does not break direct @specialist / fast-path / clean worktree when no plan artifacts exist,
 * while preventing mid-execution plan tampering or unconfirmed plan.md writes by subagents.
 */
export function verifySubagentPlanIntegrity({
  toolName,
  args,
  activeWorkspaceDir,
  fileWriteToolsSet,
  isMetaOrArtifactPath,
  deny
}) {
  if (!fileWriteToolsSet.has(toolName)) return;
  const targetPath = String(args.Path || args.TargetFile || args.AbsolutePath || args.path || '');
  if (isMetaOrArtifactPath(targetPath)) return;

  const cfgRes = readGateModeConfig(activeWorkspaceDir, {
    key: 'planGate',
    envVar: 'HERMES_PLAN_GATE',
    validModes: VALID_PLAN_GATE_MODES,
    defaultMode: 'ask'
  });
  if (cfgRes.mode === 'off') return;

  const planMdPath = path.join(activeWorkspaceDir, '.hermes', 'plan.md');
  const planStatePath = path.join(activeWorkspaceDir, '.hermes', 'plan-state.json');
  const hasState = fs.existsSync(planStatePath);
  const hasPlanMd = fs.existsSync(planMdPath);
  if (!hasState && !hasPlanMd) return;

  const state = readProtectedJsonStrict(planStatePath, '.hermes/plan-state.json')?.data || null;
  if (!state || state.status !== 'confirmed' || !hasPlanMd) {
    deny(
      formatPlanDeny(
        'plan_unconfirmed',
        `Субагент заблокирован от записи (${toolName}): план в workspace не подтверждён.`,
        'Обнаружен .hermes/plan.md или .hermes/plan-state.json без валидного статуса confirmed.',
        'Подтвердите план на уровне Lead перед запуском пишущего воркера.',
        `Subagent write (${toolName}) blocked: workspace plan is not confirmed.`,
        'Confirm plan at Lead level before running write worker.'
      ),
      { toolName, rule: 'plan_unconfirmed' }
    );
    process.exit(0);
  }

  const liveHash = computeCanonicalPlanHash(fs.readFileSync(planMdPath, 'utf-8'));
  if (liveHash !== state.planHash) {
    deny(
      formatPlanDeny(
        'plan_tampered',
        `Субагент заблокирован от записи (${toolName}): .hermes/plan.md изменён после подтверждения.`,
        `Ожидаемый SHA-256: ${String(state.planHash).slice(0, 12)}, текущий: ${liveHash.slice(0, 12)}.`,
        'Оформите ревизию плана и получите новое подтверждение на уровне Lead.',
        `Subagent write (${toolName}) blocked: .hermes/plan.md hash mismatch.`,
        'Re-confirm plan revision at Lead level.'
      ),
      { toolName, rule: 'plan_tampered' }
    );
    process.exit(0);
  }
}
