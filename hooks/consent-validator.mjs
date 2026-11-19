import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  collectToolCalls,
  isHermesTrigger,
  isRealUserStep
} from './hermes-trigger.mjs';

export const BOUNDARY_PRE = '(?<![а-яёa-z0-9_-])';
export const BOUNDARY_POST = '(?![а-яёa-z0-9_-])';

/**
 * Shared secret detection patterns (Rule 9 & REQ-10 log redaction — single source of truth).
 */
export const KNOWN_SECRET_PREFIX_RE = /(["'`])(?:eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|sk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{16,}|gh[po]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[0-9A-Za-z-]{15,})[^"'`\n]*\1/;
export const SECRET_ASSIGN_RE = /\b(?:password|passwd|pwd|api[_-]?key|secret[_-]?key|access[_-]?token|token|secret|credential)\b(?:\s*\{[^}]*\})?(?:\s*:\s*[A-Za-z_][\w.<>\[\]| ?]{0,40})?\s*(?::=|=|:)\s*(["'`])([^"'`\n]{6,})\1/gi;
export const CONN_SECRET_RE = /(["'`])[^"'`\n]*\b(?:Password|Pwd)\s*=\s*(?!\$\{|<|\{|env\.|process\.env|changeme|example|placeholder)[^;"'`\n\s]{6,}(?:;[^"'`\n]*)?\1/i;

/**
 * Single source of truth for all 21 immutable built-in protected paths (v4.7.2).
 * Config/env `protectedVerdictPaths` can only EXTEND (union) this list, never weaken it.
 */
export const DEFAULT_PROTECTED_VERDICT_PATHS = Object.freeze([
  '.hermes/qa-verdict.json',
  '.hermes/security-verdict.json',
  '.hermes/mutation-report.json',
  '.hermes/test-summary.json',
  '.hermes/council-state.json',
  '.hermes/progress-journal.jsonl',
  '.hermes/council-cost.jsonl',
  '.hermes/council-outcomes.jsonl',
  '.hermes/instincts.json',
  '.hermes/council-criteria.json',
  '.hermes/config.json',
  '.hermes/plan-state.json',
  '.hermes/plan-ledger.jsonl',
  '.hermes/lessons.jsonl',
  '.hermes/rubric.json',
  '.hermes/grade-report.json',
  '.hermes/grade-ledger.jsonl',
  '.hermes/team-stop.json',
  '.hermes/eval-results.jsonl',
  '.hermes/xray-report.json',
  '.hermes/debt-ledger.jsonl'
]);

/**
 * Dynamically builds the shell-tamper RegExp from DEFAULT_PROTECTED_VERDICT_PATHS (+ plan.md)
 * so file-write protection and shell tamper protection never drift.
 */
export function buildProtectedShellRegex(extraPaths = []) {
  const allPaths = [...new Set([...DEFAULT_PROTECTED_VERDICT_PATHS, '.hermes/plan.md', ...extraPaths])];
  const escapedNames = allPaths
    .map((p) => String(p).replace(/^\.?[\\/]*\.hermes[\\/]/i, ''))
    .filter(Boolean)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const fileGroup = `(?:${escapedNames.join('|')})`;
  const pattern =
    `(?:^|[;&|\\n]\\s*|(?:pwsh|powershell)(?:\\.exe)?\\s+[^\\n]*|cmd(?:\\.exe)?\\s+\\/[ck]\\s+|\\s["'])` +
    `(?:set-content|out-file|add-content|clear-content|new-item|ni|remove-item|rm|del|erase|unlink|truncate|mv|cp|move|copy|move-item|copy-item|rename-item|rni|ri|mi|cpi|sc|ac|clc|rd|rmdir|tee(?:-object)?)\\b` +
    `(?:[^"'|\\n;&]|"[^"\\n]*"|'[^'\\n]*')*\\.hermes[\\\\/]${fileGroup}\\.?(?=$|[\\s"'|;&])|` +
    `(?:^|[^<>])>{1,2}\\s*(?:"[^"\\n]*\\.hermes[\\\\/](?:[^"\\n]*\\.(?:json|jsonl)|plan\\.md)"|'[^'\\n]*\\.hermes[\\\\/](?:[^'\\n]*\\.(?:json|jsonl)|plan\\.md)'|[^\\s"'|;&>]*\\.hermes[\\\\/](?:[^\\s"'|;&>]*\\.(?:json|jsonl)|plan\\.md))(?=$|[\\s"'|;&])|` +
    `\\[(?:system\\.)?io\\.(?:file|streamwriter|filestream)\\](?:::(?:writeall(?:text|lines|bytes)|appendall(?:text|lines)|delete|move|copy|replace|create|openwrite)\\b|::new\\b)[^\\n]*\\.hermes[\\\\/]`;
  return new RegExp(pattern, 'i');
}

export function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const content = JSON.stringify(data, null, 2);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

export class CorruptArtifactError extends Error {
  constructor(artifactName, detail) {
    super(`Corrupt protected artifact ${artifactName}: ${detail}`);
    this.name = 'CorruptArtifactError';
    this.artifactName = artifactName;
    this.detail = detail;
  }
}

export function readProtectedJsonStrict(filePath, artifactName) {
  if (!fs.existsSync(filePath)) return null;
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new CorruptArtifactError(artifactName, err?.message || 'unreadable');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CorruptArtifactError(artifactName, err?.message || 'invalid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CorruptArtifactError(artifactName, 'expected JSON object');
  }
  return { raw, data: parsed };
}

export function readProtectedJsonlStrict(filePath, artifactName) {
  if (!fs.existsSync(filePath)) return [];
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new CorruptArtifactError(artifactName, err?.message || 'unreadable');
  }
  const records = [];
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (let i = 0; i < lines.length; i++) {
    try {
      const rec = JSON.parse(lines[i]);
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
        throw new Error(`line ${i + 1}: expected JSON object`);
      }
      records.push(rec);
    } catch (err) {
      throw new CorruptArtifactError(artifactName, `line ${i + 1}: ${err?.message || 'invalid JSON'}`);
    }
  }
  return records;
}

export function readGateModeConfig(workspaceDir, { key, envVar, validModes, defaultMode = 'ask' }) {
  let mode = defaultMode;
  let source = 'default';
  let invalidReason = null;

  const cfgPath = path.join(workspaceDir, '.hermes', 'config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const rawCfg = fs.readFileSync(cfgPath, 'utf-8');
      const cfg = JSON.parse(rawCfg);
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
        invalidReason = '.hermes/config.json root is not a JSON object';
      } else if (cfg[key] !== undefined) {
        const candidate = typeof cfg[key] === 'string' ? cfg[key].trim().toLowerCase() : '';
        if (validModes.has(candidate)) {
          mode = candidate;
          source = 'config:.hermes/config.json';
        } else {
          invalidReason = `invalid ${key} value in .hermes/config.json`;
        }
      }
    } catch (err) {
      invalidReason = `failed to parse .hermes/config.json: ${err?.message || 'invalid JSON'}`;
    }
  }

  if (envVar && process.env[envVar]) {
    const envVal = String(process.env[envVar]).trim().toLowerCase();
    if (validModes.has(envVal)) {
      mode = envVal;
      source = `env:${envVar}`;
      invalidReason = null;
    } else {
      mode = defaultMode;
      source = 'default:invalid_env_fallback';
      invalidReason = `invalid ${envVar} env value`;
    }
  } else if (invalidReason) {
    mode = defaultMode;
    source = 'default:invalid_config_fallback';
  }

  return { mode, source, invalidReason };
}

export function stripPromptWrappers(promptText) {
  return String(promptText || '')
    .replace(/<USER_REQUEST>|<\/USER_REQUEST>/gi, '')
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, '')
    .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/gi, '')
    .trim();
}

export function resolveTaskContext({ combinedSteps = [], payload = {} } = {}) {
  let taskStartIdx = -1;
  for (let i = 0; i < combinedSteps.length; i++) {
    const s = combinedSteps[i];
    if (isRealUserStep(s)) {
      const text = typeof s.content === 'string' ? s.content : (s.content?.text || '');
      if (isHermesTrigger(text, { includeMentions: false })) {
        taskStartIdx = i;
      }
    }
  }
  if (taskStartIdx < 0) {
    for (let i = 0; i < combinedSteps.length; i++) {
      const s = combinedSteps[i];
      if (isRealUserStep(s)) {
        const text = typeof s.content === 'string' ? s.content : (s.content?.text || '');
        if (isHermesTrigger(text, { includeMentions: true })) {
          taskStartIdx = i;
        }
      }
    }
  }
  if (taskStartIdx < 0) {
    for (let i = 0; i < combinedSteps.length; i++) {
      if (isRealUserStep(combinedSteps[i])) taskStartIdx = i;
    }
  }
  if (taskStartIdx < 0) taskStartIdx = 0;

  const taskStartStep = combinedSteps[taskStartIdx];
  const userPrompt = taskStartStep
    ? (typeof taskStartStep.content === 'string' ? taskStartStep.content : (taskStartStep.content?.text || ''))
    : String(payload?.lastUserInput || '');

  const cleanPrompt = stripPromptWrappers(userPrompt);
  const directSpecMatch = cleanPrompt.match(/^\s*(?:\/hermes\s+)?@([a-z0-9_-]+)/i);
  const isFixWarnings = /\bfix-warnings\b/i.test(cleanPrompt);
  const isExplicitFastPath = /(?:--fast-path|--quick|\/hermes\s+(?:fast-?path|quick))\b/i.test(cleanPrompt);
  const isStandaloneTrivial = /^\s*(?:\/hermes\s+)?(?:fix\s+typo|исправь\s+опечатку|поправь\s+опечатку|typo\s+fix|syntax\s+error)\s*$/i.test(cleanPrompt.trim());
  const hasComplexTaskIndicators = new RegExp(
    `${BOUNDARY_PRE}(?:отрефактори[а-яё]*|refactor[a-z]*|перепиши[а-яё]*|переписат[ье]|rewrite|модул[а-яё]*|добав[ьит][а-яё]*|create|создай[а-яё]*|реализуй[а-яё]*|implement[a-z]*|релиз[а-яё]*|release|архитектур[а-яё]*|architect[a-z]*|интеграц[а-яё]*|feature|миграц[а-яё]*|migration|переделай[а-яё]*|безопасност[а-яё]*|security|req-\\d+|task-\\d+|finding-\\d+)${BOUNDARY_POST}`,
    'i'
  ).test(cleanPrompt);
  // FINDING-7: --fast-path is a task-classification flag (must be truthful, never disables gates on complex tasks).
  // Human policy override belongs strictly in .hermes/config.json / env (councilGate/planGate: "off").
  const isMicroOrFastPath = (isExplicitFastPath || isStandaloneTrivial) && !hasComplexTaskIndicators;
  const rejectedFastPathComplex = isExplicitFastPath && hasComplexTaskIndicators;
  const isLoop = /(?:--loop|\/hermes\s+(?:loop|fix-warnings\s+--loop))\b/i.test(cleanPrompt);

  let bypassKind = null;
  let bypassSource = null;
  if (directSpecMatch) {
    bypassKind = 'direct_specialist';
    bypassSource = 'user_prompt:direct_specialist';
  } else if (isFixWarnings) {
    bypassKind = 'fix_warnings';
    bypassSource = 'user_prompt:fix_warnings';
  } else if (isMicroOrFastPath) {
    bypassKind = isExplicitFastPath ? 'explicit_fast_path' : 'micro_trivial';
    bypassSource = isExplicitFastPath ? 'user_prompt:explicit_fast_path' : 'user_prompt:micro_trivial';
  }

  const taskHash = crypto.createHash('sha256').update(cleanPrompt).digest('hex').slice(0, 16);
  const convId = String(payload?.conversationId || payload?.transcriptPath || '');
  const turnMarker = taskStartStep?.step_index ?? taskStartIdx;

  return {
    taskStartIdx,
    taskStartStep,
    userPrompt,
    cleanPrompt,
    directSpecMatch,
    isFixWarnings,
    isExplicitFastPath,
    isStandaloneTrivial,
    hasComplexTaskIndicators,
    isMicroOrFastPath,
    rejectedFastPathComplex,
    bypassKind,
    bypassSource,
    isLoop,
    taskHash,
    convId,
    turnMarker
  };
}

export function extractAskQuestionOptions(askStep) {
  const options = [];
  let questionText = '';
  if (!askStep) return { options, questionText };
  if (Array.isArray(askStep.questions) && askStep.questions.length > 0) {
    questionText = String(askStep.questions[0]?.question || '');
    if (Array.isArray(askStep.questions[0]?.options)) {
      for (const opt of askStep.questions[0].options) {
        options.push(String(opt || ''));
      }
    }
    return { options, questionText };
  }
  for (const tc of collectToolCalls(askStep)) {
    if (String(tc?.name || '').toLowerCase() === 'ask_question') {
      const qList = tc?.args?.questions;
      if (Array.isArray(qList) && qList.length > 0) {
        questionText = String(qList[0]?.question || '');
        if (Array.isArray(qList[0]?.options)) {
          for (const opt of qList[0].options) {
            options.push(String(opt || ''));
          }
        }
      }
    }
  }
  return { options, questionText };
}

/**
 * Hardened single-answer extractor for ask_question responses:
 * - Strictly rejects MODEL prose, PLANNER_RESPONSE, subagent messages (sender), and <SYSTEM_MESSAGE> echoes.
 * - Accepts ONLY:
 *   1) USER_EXPLICIT / USER (non-MODEL)
 *   2) SYSTEM / SYSTEM_SDK with exact tool_call_id match, generic/tool type, no sender, no <SYSTEM_MESSAGE>
 *   3) Direct-next authentic harness output: GENERIC/TOOL_OUTPUT/TOOL_RESULT + status: DONE + Created/Completed At banner + tool_call_id bound (or unbound if ask has no id)
 * - Breaks immediately on first authentic answer (never accumulates later steps).
 */
export function extractAuthenticAskAnswer(combinedSteps, askIdx, askToolCallId = '') {
  if (!Array.isArray(combinedSteps) || askIdx < 0) return '';
  for (let i = askIdx + 1; i < combinedSteps.length; i++) {
    const s = combinedSteps[i];
    if (!s || typeof s !== 'object') continue;
    const src = String(s.source || '').toUpperCase();
    const stepType = String(s.type || '').toUpperCase();
    const sContent = typeof s.content === 'string' ? s.content : (s.content?.text || '');

    // Hard reject forged PLANNER_RESPONSE, subagent messages, and <SYSTEM_MESSAGE> echoes.
    // Note: Live Antigravity runtime emits authentic ask_question tool results as
    // { source: "MODEL", type: "GENERIC", status: "DONE", content: "Created At: ...\nCompleted At: ...\nA1: ..." }.
    // Forged MODEL steps without BOTH Created At + Completed At + structured A1: answer line remain strictly rejected.
    if (stepType === 'PLANNER_RESPONSE') continue;
    if (s.sender) continue;
    if (/<SYSTEM_MESSAGE/i.test(sContent)) continue;

    const isDirectNext = i === askIdx + 1;
    const isGenericOrTool = stepType === 'GENERIC' || stepType === 'TOOL_OUTPUT' || stepType === 'TOOL_RESULT';
    const isUserSource = src === 'USER_EXPLICIT' || src === 'USER';
    const stepToolCallId = String(s.tool_call_id || s.toolCallId || s.call_id || '');
    const hasStatusDone = String(s.status || '').toUpperCase() === 'DONE';
    const hasCreatedAt = /Created\s+At:\s*\d{4}-\d{2}-\d{2}/i.test(sContent);
    const hasCompletedAt = /Completed\s+At:\s*\d{4}-\d{2}-\d{2}/i.test(sContent);
    const hasHarnessBanner = hasCreatedAt || hasCompletedAt;
    // MEDIUM-5: Reject outputs of non-ask tools (e.g. run_command("echo A1: Делай")) that mimic Antigravity GENERIC format
    const isNonAskToolOutput = /(?:^|\r?\n)\s*(?:Command exited with code|Command output:|Showing lines\s+\d+|Partial read\s*\(|Created the following subagent:|Made \d+ replacement)/i.test(sContent);
    const askStepToolCalls = collectToolCalls(combinedSteps[askIdx]);
    const isPureAskStep = askStepToolCalls.length > 0 && askStepToolCalls.every((tc) => String(tc?.name || '').toLowerCase() === 'ask_question');
    const hasFullAntigravityAskOutput =
      hasCreatedAt &&
      hasCompletedAt &&
      !isNonAskToolOutput &&
      (Boolean(askToolCallId) || isPureAskStep) &&
      /(?:^|\r?\n)\s*A\d+:\s*\S/.test(sContent);

    const isBoundByToolId = Boolean(askToolCallId && stepToolCallId && stepToolCallId === askToolCallId);

    const isSystemToolOutput =
      (src === 'SYSTEM' || src === 'SYSTEM_SDK') &&
      isBoundByToolId &&
      isGenericOrTool;

    const isBoundOrUnboundDirectNext = askToolCallId
      ? isBoundByToolId
      : (isDirectNext && !stepToolCallId);

    const isAuthenticHarnessOutput =
      isDirectNext &&
      isGenericOrTool &&
      hasStatusDone &&
      isBoundOrUnboundDirectNext &&
      (src === 'MODEL' ? hasFullAntigravityAskOutput : hasHarnessBanner);

    if (isUserSource || isSystemToolOutput || isAuthenticHarnessOutput) {
      return sContent;
    }
  }
  return '';
}

/**
 * Resolves a numeric answer (e.g. "1", "A1: 2", "Вариант 3", "Option 1") strictly against ask_question options[].
 * Never assumes option 1 is approve when options are reordered or absent.
 */
export function resolveSelectedOptionText(answerText, options = []) {
  const trimmed = String(answerText || '').trim();
  // Strip harness timestamps/metadata lines if present so A1: line is extracted cleanly
  const contentLines = trimmed
    .split(/\r?\n/)
    .filter((l) => !/^\s*(?:Created|Completed)\s+At:\s*\d{4}-\d{2}-\d{2}/i.test(l));
  const body = contentLines.join('\n').trim() || trimmed;
  const strippedAnswer = body.replace(/^A\d+[:.)]\s*/i, '').trim();

  const numMatch = strippedAnswer.match(/^(?:(?:option|вариант)\s*)?(\d+)(?:[:.)]\s*|\s*$)/i);
  if (numMatch) {
    const idx = Number.parseInt(numMatch[1], 10);
    // Only treat as pure numeric selection if there is no trailing descriptive text after the number
    const remainder = strippedAnswer.slice(numMatch[0].length).trim();
    if (!remainder) {
      const optText = (Array.isArray(options) && idx >= 1 && idx <= options.length)
        ? String(options[idx - 1] || '').trim()
        : '';
      return {
        selectedOptionText: optText,
        selectedIndex: idx,
        isNumericSelection: true,
        strippedAnswer
      };
    }
  }

  return {
    selectedOptionText: strippedAnswer || body,
    selectedIndex: null,
    isNumericSelection: false,
    strippedAnswer
  };
}

/**
 * Strict segment-and-suffix test file detector (REQ-3 TDD pre-implementation).
 * Normalizes against workspaceDir so temp folders like "hermes-guard-test-xxx/src/app.ts"
 * and production identifiers like "src/ContestService.ts" or "src/Inspector.ts" are NOT treated as test files.
 */
const STRICT_TEST_DIR_RE = /(?:^|\/)(?:__tests__|tests?|specs?|e2e|unit[-_]?tests?|integration[-_]?tests?|__mocks__|mocks|fixtures)\//i;
const STRICT_TEST_FILE_RE = /(?:\.(?:test|spec|e2e|integration)\.[cm]?[jt]sx?$|(?:^|\/)(?:test_[^/]+\.py|[^/]+_test\.py|conftest\.py)$|_test\.go$|(?:Tests?|Spec|Should)\.(?:cs|java|kt|rs)$|(?:^|\/)Test[A-Z][^/]*\.(?:cs|java|kt)$|(?:_test|_unittest|_spec)\.(?:c|cc|cpp|cxx|h|hpp)$)/i;

export function isStrictTestPath(filePath, workspaceDir = '') {
  if (!filePath) return false;
  let rel = String(filePath);
  if (workspaceDir) {
    const absTarget = path.isAbsolute(rel) ? rel : path.resolve(workspaceDir, rel);
    const computedRel = path.relative(path.resolve(workspaceDir), absTarget);
    if (computedRel && !computedRel.startsWith('..') && !path.isAbsolute(computedRel)) {
      rel = computedRel;
    }
  }
  const norm = rel.replace(/\\/g, '/').replace(/^\.?\//, '');
  return STRICT_TEST_DIR_RE.test(norm) || STRICT_TEST_FILE_RE.test(norm);
}

// --- Team Stop Unblock Consent Classifier (REQ-4, v4.7.1) ---

export const TEAM_STOP_UNBLOCK_QUESTION_RE = /(?:разблокироват[ье]\s+команд|снять\s+(?:остановку|блокировку)\s+команд|team[-_\s]?stop|остановка\s+команды|unblock\s+team)/i;

const TEAM_STOP_NEG_WORDS = `(?:не|не\\s+надо|не\\s+нужно|нельзя|никакого|отмена|оставить|оставь|don'?t|do\\s+not|not|never|no|keep\\s+(?:stopped|blocked|active)|reject|cancel)`;
const TEAM_STOP_UNBLOCK_VERBS = `(?:разблокир(?:овать|уй|овка)|снять\\s+(?:блокировку|остановку|стоп)|сними\\s+(?:блокировку|остановку|стоп)|unblock|resume\\s+team|clear\\s+stop)`;

const TEAM_STOP_NEGATION_RE = new RegExp(
  `(?:${BOUNDARY_PRE}${TEAM_STOP_NEG_WORDS}${BOUNDARY_POST}[^\\r\\n]{0,40}${BOUNDARY_PRE}${TEAM_STOP_UNBLOCK_VERBS}${BOUNDARY_POST})|` +
  `(?:${BOUNDARY_PRE}${TEAM_STOP_UNBLOCK_VERBS}${BOUNDARY_POST}[^\\r\\n]{0,40}${BOUNDARY_PRE}${TEAM_STOP_NEG_WORDS}${BOUNDARY_POST})|` +
  `${BOUNDARY_PRE}(?:оставить\\s+(?:остановку|стоп|блокировку)|keep\\s+(?:stopped|active|blocked))${BOUNDARY_POST}`,
  'i'
);

const TEAM_STOP_UNBLOCK_APPROVE_RE = new RegExp(
  `${BOUNDARY_PRE}(?:разблокировать\\s+команду|разблокировать|разблокируй|снять\\s+(?:блокировку|остановку|стоп)|сними\\s+(?:блокировку|остановку|стоп)|unblock\\s+team|unblock|clear\\s+team[-\\s]?stop)${BOUNDARY_POST}`,
  'i'
);

export function isTeamStopUnblockAskArgs(argsStr) {
  return TEAM_STOP_UNBLOCK_QUESTION_RE.test(String(argsStr || ''));
}

export function classifyTeamStopUnblockConsent(answerText, options = []) {
  const raw = String(answerText || '').trim();
  if (!raw) return { decision: 'unconfirmed', selectedOptionText: '', reason: '' };

  const { selectedOptionText, isNumericSelection, strippedAnswer } = resolveSelectedOptionText(raw, options);
  if (isNumericSelection && !selectedOptionText) {
    return { decision: 'unconfirmed', selectedOptionText: '', reason: '' };
  }

  if (TEAM_STOP_NEGATION_RE.test(strippedAnswer) || TEAM_STOP_NEGATION_RE.test(selectedOptionText)) {
    return { decision: 'negated', selectedOptionText, reason: strippedAnswer };
  }

  const target = isNumericSelection ? selectedOptionText : `${selectedOptionText} ${strippedAnswer}`;
  if (TEAM_STOP_UNBLOCK_APPROVE_RE.test(target)) {
    return { decision: 'unblock', selectedOptionText, reason: strippedAnswer };
  }

  return { decision: 'unconfirmed', selectedOptionText, reason: strippedAnswer };
}

// --- Grade Gate Human Override Consent Classifier (REQ-3, v4.7.1) ---

export const GRADE_OVERRIDE_QUESTION_RE = /(?:принять\s+(?:как\s+есть|риск)|грейдер|rubric|rework|needs_human|не\s+смог\s+проверить|потолок\s+(?:доработок|rework)|accept\s+as\s+is|accept\s+risk)/i;

const GRADE_NEG_WORDS = `(?:не|не\\s+надо|не\\s+нужно|нельзя|никакого|отмена|отклоняю|don'?t|do\\s+not|not|never|no|reject|refuse)`;
const GRADE_ACCEPT_VERBS = `(?:принять\\s+(?:как\\s+есть|риск)|принимат[ье]\\s+(?:как\\s+есть|риск)|принима[юй]\\s+(?:как\\s+есть|риск)|прими\\s+(?:как\\s+есть|риск)|accept\\s+(?:as\\s+is|risk)|override\\s+grade)`;

const GRADE_ACCEPT_NEGATION_RE = new RegExp(
  `(?:${BOUNDARY_PRE}${GRADE_NEG_WORDS}${BOUNDARY_POST}[^\\r\\n]{0,40}${BOUNDARY_PRE}${GRADE_ACCEPT_VERBS}${BOUNDARY_POST})|` +
  `(?:${BOUNDARY_PRE}${GRADE_ACCEPT_VERBS}${BOUNDARY_POST}[^\\r\\n]{0,40}${BOUNDARY_PRE}${GRADE_NEG_WORDS}${BOUNDARY_POST})`,
  'i'
);

const GRADE_ACCEPT_RE = new RegExp(
  `${BOUNDARY_PRE}(?:принять\\s+как\\s+есть|принимаю\\s+как\\s+есть|принять\\s+риск|принимаю\\s+риск|accept\\s+as\\s+is|accept\\s+risk)${BOUNDARY_POST}`,
  'i'
);

const GRADE_CONTINUE_RE = new RegExp(
  `${BOUNDARY_PRE}(?:продолжить|доработать|переделать|дать\\s+улику|уточнить|continue|rework|fix\\s+item|provide\\s+evidence)${BOUNDARY_POST}`,
  'i'
);

const GRADE_STOP_RE = new RegExp(
  `${BOUNDARY_PRE}(?:остановить\\s+задачу|остановить|прервать|stop\\s+task|abort)${BOUNDARY_POST}`,
  'i'
);

export function isGradeOverrideAskArgs(argsStr) {
  return GRADE_OVERRIDE_QUESTION_RE.test(String(argsStr || ''));
}

export function classifyGradeOverrideConsent(answerText, options = []) {
  const raw = String(answerText || '').trim();
  if (!raw) return { decision: 'unconfirmed', selectedOptionText: '', reason: '' };

  const { selectedOptionText, isNumericSelection, strippedAnswer } = resolveSelectedOptionText(raw, options);
  if (isNumericSelection && !selectedOptionText) {
    return { decision: 'unconfirmed', selectedOptionText: '', reason: '' };
  }

  if (GRADE_ACCEPT_NEGATION_RE.test(strippedAnswer) || GRADE_ACCEPT_NEGATION_RE.test(selectedOptionText)) {
    return { decision: 'negated', selectedOptionText, reason: strippedAnswer };
  }

  const target = isNumericSelection ? selectedOptionText : `${selectedOptionText} ${strippedAnswer}`;
  if (GRADE_ACCEPT_RE.test(target)) {
    return { decision: 'accept_as_is', selectedOptionText, reason: strippedAnswer };
  }
  if (GRADE_STOP_RE.test(target)) {
    return { decision: 'stop_task', selectedOptionText, reason: strippedAnswer };
  }
  if (GRADE_CONTINUE_RE.test(target)) {
    return { decision: 'continue_rework', selectedOptionText, reason: strippedAnswer };
  }

  return { decision: 'unconfirmed', selectedOptionText, reason: strippedAnswer };
}

// --- X-Ray Advisory Window Lint & Consent Classifier (REQ-4, v4.7.2) ---

export const XRAY_WINDOW_QUESTION_RE = /(?:рентген|мусор\s*\(можно\s+удалить|недоделк[аи]\s*\(риск\s+для\s+тебя|костыл[ьи]\s*\(работает,\s*но\s+хрупко|почини\s+сейчас|запиши\s+в\s+долг|не\s+трогай|x-?ray\s+(?:наш[её]л|отч[её]т|findings|advisory))/i;

export const XRAY_INTERNAL_CODES_RE = /\b(?:REQ-\d+|FINDING-\d+|HIGH-\d+|MEDIUM-\d+|LOW-\d+|TASK-\d+|EVAL-\d+|XRAY-\d+|XR-\d+|CWE-\d+|RULE[-_ ]?\d+|(?:dead|stub|fragile)[._][a-z0-9_]+|lies_to_user|brick_risk|resource_waste|xray_[a-z0-9_]+|rule9_hardcode|doc_drift|orphan_file)\b/i;

export const XRAY_FABRICATED_SCORE_RE = /(?:\b\d{1,3}\s*%|\b\d+(?:\.\d+)?\s*\/\s*(?:10|100)\b|здоровь[ея]\s+кода|качество\s*:\s*[A-F]\b|\b(?:quality|health|code)\s*score\b)/i;

const XRAY_NEG_WORDS = `(?:не|не\\s+надо|не\\s+нужно|нельзя|никогда|ничего\\s+не|отмена|отклоняю|don'?t|do\\s+not|not|never|no|reject|cancel)`;
const XRAY_FIX_VERBS = `(?:почини(?:ть)?\\s+сейчас|чини(?:ть)?\\s+сейчас|почини(?:ть)?|исправ(?:ь|ить)|прав(?:ь|ить)|удаля(?:й|ть)|удали(?:ть)?|fix\\s+now|fix\\s+it|apply\\s+fix)`;

const XRAY_FIX_NEGATION_RE = new RegExp(
  `(?:${BOUNDARY_PRE}${XRAY_NEG_WORDS}${BOUNDARY_POST}[^\\r\\n]{0,40}${BOUNDARY_PRE}${XRAY_FIX_VERBS}${BOUNDARY_POST})|` +
  `(?:${BOUNDARY_PRE}${XRAY_FIX_VERBS}${BOUNDARY_POST}[^\\r\\n]{0,40}${BOUNDARY_PRE}${XRAY_NEG_WORDS}${BOUNDARY_POST})`,
  'i'
);

const XRAY_FIX_NOW_RE = new RegExp(
  `${BOUNDARY_PRE}(?:почини(?:ть)?\\s+сейчас|исправ(?:ь|ить)\\s+сейчас|бер[её]м\\s+в\\s+работу|взять\\s+в\\s+работу|fix\\s+now)${BOUNDARY_POST}`,
  'i'
);

const XRAY_DEFER_DEBT_RE = new RegExp(
  `${BOUNDARY_PRE}(?:запиши\\s+в\\s+долг|записать\\s+в\\s+долг|в\\s+долг|отложить\\s+в\\s+долг|record\\s+debt|defer\\s+to\\s+debt|add\\s+to\\s+debt)${BOUNDARY_POST}`,
  'i'
);

const XRAY_ACCEPT_RISK_RE = new RegExp(
  `${BOUNDARY_PRE}(?:не\\s+трогай|не\\s+трогать|оставь\\s+как\\s+есть|принять\\s+как\\s+норму|leave\\s+alone|do\\s+not\\s+touch|don'?t\\s+touch|accept\\s+risk)${BOUNDARY_POST}`,
  'i'
);

export function isXrayWindowAskArgs(argsStr) {
  const s = String(argsStr || '');
  if (!XRAY_WINDOW_QUESTION_RE.test(s)) return false;
  // Never collide with Step 0, Council Gate, Plan Gate, or Grade Override windows
  if (/(?:какую\s+модел|уровень\s+ума|посоветоваться\s+с\s+(?:советом|работниками)|собраться\s+за\s+столом|убрать\s+лишнее|добавить\s+сво[её]|план\s+[^\r\n]{0,40}подходит)/i.test(s)) {
    return false;
  }
  const hasXrayOption = /(?:почини\s+сейчас|запиши\s+в\s+долг|не\s+трогай|fix\s+now|record\s+debt|leave\s+alone)/i.test(s);
  const hasXrayBucket = /(?:мусор\s*\(можно\s+удалить|недоделк[аи]\s*\(риск\s+для\s+тебя|костыл[ьи]\s*\(работает,\s*но\s+хрупко)/i.test(s);
  return hasXrayOption || hasXrayBucket;
}

export function lintXrayWindowText(questionText, { maxItems = 5 } = {}) {
  const text = String(questionText || '').trim();
  const errors = [];

  const codeMatch = text.match(XRAY_INTERNAL_CODES_RE);
  if (codeMatch) {
    errors.push(`Внутренний код «${codeMatch[0]}» запрещён в окне Рентгена — описывайте находки простым русским языком.`);
  }

  const scoreMatch = text.match(XRAY_FABRICATED_SCORE_RE);
  if (scoreMatch) {
    errors.push(`Выдуманная оценка/процент качества «${scoreMatch[0]}» запрещена (Rule 13) — показывайте только факты и счётчики.`);
  }

  // Count finding bullet/numbered items (excluding overflow line "ещё N в отчёте")
  const lines = text.split(/\r?\n/);
  let itemCount = 0;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (/^(?:ещ[её]\s+\d+\s+в\s+отч[её]те|and\s+\d+\s+more\s+in\s+report)/i.test(trimmed)) continue;
    if (/^(?:\d+[.)]\s+|[-*•]\s+)/.test(trimmed)) {
      itemCount++;
    }
  }
  if (itemCount > maxItems) {
    errors.push(`В окне Рентгена показано ${itemCount} пунктов (лимит <= ${maxItems}). Остальное оставьте в отчёте со строкой «ещё N в отчёте».`);
  }

  return { ok: errors.length === 0, errors, itemCount };
}

export function classifyXrayWindowConsent(answerText, options = []) {
  const raw = String(answerText || '').trim();
  if (!raw) {
    return { decision: 'unconfirmed', selectedOptionText: '', reason: '', partialItems: [] };
  }

  const { selectedOptionText, isNumericSelection, strippedAnswer } = resolveSelectedOptionText(raw, options);
  if (isNumericSelection && !selectedOptionText) {
    return { decision: 'unconfirmed', selectedOptionText: '', reason: '', partialItems: [] };
  }

  // Extract explicit partial item selection if present (e.g. "почини только #1, #2 не трогай")
  const partialItems = [];
  for (const m of strippedAnswer.matchAll(/#(\d+)/g)) {
    const num = Number.parseInt(m[1], 10);
    if (Number.isInteger(num) && num >= 1) partialItems.push(num);
  }

  // Check explicit option text first for non-fix options ("Не трогай" contains "не", so match it before generic negation)
  const target = isNumericSelection ? selectedOptionText : `${selectedOptionText} ${strippedAnswer}`;
  const isPureAcceptOption =
    XRAY_ACCEPT_RISK_RE.test(selectedOptionText) &&
    !XRAY_FIX_NOW_RE.test(strippedAnswer) &&
    !XRAY_DEFER_DEBT_RE.test(strippedAnswer);
  if (isPureAcceptOption) {
    return { decision: 'accept_risk', selectedOptionText, reason: strippedAnswer || selectedOptionText, partialItems };
  }

  const isPureDeferOption =
    XRAY_DEFER_DEBT_RE.test(target) &&
    !XRAY_FIX_NOW_RE.test(strippedAnswer);
  if (isPureDeferOption) {
    return { decision: 'defer_debt', selectedOptionText, reason: strippedAnswer || selectedOptionText, partialItems };
  }

  // Negation guard: "не чини сейчас", "ничего не удаляй", "не надо править" NEVER mean fix_now
  if (XRAY_FIX_NEGATION_RE.test(strippedAnswer) || XRAY_FIX_NEGATION_RE.test(selectedOptionText)) {
    return { decision: 'negated', selectedOptionText, reason: strippedAnswer, partialItems };
  }

  if (XRAY_ACCEPT_RISK_RE.test(target) && !XRAY_FIX_NOW_RE.test(target)) {
    return { decision: 'accept_risk', selectedOptionText, reason: strippedAnswer || selectedOptionText, partialItems };
  }

  if (XRAY_FIX_NOW_RE.test(target)) {
    return { decision: 'fix_now', selectedOptionText, reason: strippedAnswer || selectedOptionText, partialItems };
  }

  return { decision: 'unconfirmed', selectedOptionText, reason: strippedAnswer, partialItems };
}

// --- REQ-1 & FIX-A: Canonical domain routing rules (single source of truth) ---
export const UI_SOURCE_FILE_RE = /\.(?:tsx|jsx|xaml|razor|vue|svelte|css|scss|sass|less|html|htm)$|(?:^|[\\/])[^\\/]*(?:Form|Window|Dialog|Control|View|Panel|Modal|Popup|Flyout|Theme|Style|Widget|Screen|Page|Layout|ScrollBar|Menu|Toolbar)[^\\/]*\.(?:cs|ts|js|py|cpp|vb)$|\.Designer\.(?:cs|vb)$/i;

export const DOMAIN_ROUTING_RULES = Object.freeze([
  {
    domain: 'ui',
    agents: ['@elena (дизайн/окна)', '@kritik (пост-проверка UX)'],
    keys: ['elena', 'kritik'],
    re: /\.(?:tsx|jsx|xaml|razor|vue|svelte|css|scss|sass|less|html|htm)$|(?:Form|Window|Dialog|Control|View|Panel|Modal|Popup|Flyout|Theme|Style|ScrollBar|DataGridView|DoubleBuffered|MouseLeave|Deactivate)/i
  },
  {
    domain: 'database',
    agents: ['@denis (БД/индексы/WAL)'],
    keys: ['denis'],
    re: /(?:Database|DbContext|Repository|Migration|Sqlite|Postgres|Mssql|SqlConnection|SqliteConnection|PRAGMA\s+journal_mode|BEGIN\s+IMMEDIATE|SELECT\s+.+\s+FROM|\.sql\b|\.db\b|\.sqlite\b)/i
  },
  {
    domain: 'protocols',
    agents: ['@alexey (протоколы/сокеты)', '@igor (эмуляция/стресс-тест)'],
    keys: ['alexey', 'igor'],
    re: /(?:Socket|TcpClient|UdpClient|NetworkStream|ReadExactly|Modbus|OpcUa|Profinet|SerialPort|Plc)/i
  },
  {
    domain: 'sap',
    agents: ['@ruslan (SAP/BAPI/COM)'],
    keys: ['ruslan'],
    re: /(?:RfcDestination|IRfcFunction|BAPI_|IDoc|FinalReleaseComObject|SapGui)/i
  },
  {
    domain: 'ai',
    agents: ['@mikhail (AI/RAG/LLM)'],
    keys: ['mikhail'],
    re: /(?:Embedding|Qdrant|PgVector|CrossEncoder|Langfuse|vLLM|Whisper|Docling|Promptfoo)/i
  },
  {
    domain: 'reverse',
    agents: ['@artem (реверс/бинарные фреймы)'],
    keys: ['artem'],
    re: /(?:BinaryPrimitives|Crc16|Crc32|Endian|Disasm|EvidenceLedger)/i
  },
  {
    domain: 'digital_twin',
    agents: ['@gleb (3D/Digital Twin/WebGL)'],
    keys: ['gleb'],
    re: /(?:\bThree(?:\.js)?\b|WebGL|DigitalTwin|WebView2|InstancedMesh|OrbitControls)/i
  },
  {
    domain: 'backend',
    agents: ['@dmitry (Backend/API/Конфиг)', '@elena (проверить, нужно ли вывести новые настройки/статусы в окно)'],
    keys: ['dmitry', 'elena'],
    re: /(?:Controller|Endpoint|Outbox|Idempotency|ProblemDetails|appsettings|IOptions|Channel<)/i
  }
]);

export function computeRecommendedSpecialists(touchedSnapshotsOrDiff = [], {
  invokedSpecialists = new Set(),
  editedSourceFiles = new Set(),
  editedUiFiles = new Set()
} = {}) {
  const combinedText = Array.isArray(touchedSnapshotsOrDiff)
    ? touchedSnapshotsOrDiff.join('\n')
    : String(touchedSnapshotsOrDiff || '');

  const recommendedKeys = new Set();
  const recommendedLabels = new Set();
  const matchedDomains = new Set();

  for (const rule of DOMAIN_ROUTING_RULES) {
    if (rule.re.test(combinedText)) {
      if (rule.domain) matchedDomains.add(rule.domain);
      const missingKey = rule.keys.some((k) => !invokedSpecialists.has(k));
      if (missingKey) {
        for (const k of rule.keys) {
          if (!invokedSpecialists.has(k)) recommendedKeys.add(k);
        }
        for (const label of rule.agents) recommendedLabels.add(label);
      }
    }
  }

  const uiRule = DOMAIN_ROUTING_RULES.find((r) => r.domain === 'ui');
  const dbRule = DOMAIN_ROUTING_RULES.find((r) => r.domain === 'database');
  const isUiTouched = Boolean((uiRule && uiRule.re.test(combinedText)) || (editedUiFiles && editedUiFiles.size > 0));
  const isDbTouched = Boolean(dbRule && dbRule.re.test(combinedText));

  if (isUiTouched) {
    if (!invokedSpecialists.has('elena')) {
      recommendedKeys.add('elena');
      recommendedLabels.add('@elena (дизайн/окна)');
    }
    if (!invokedSpecialists.has('kritik')) {
      recommendedKeys.add('kritik');
      recommendedLabels.add('@kritik (пост-проверка UX)');
    }
  }
  if (isDbTouched && !invokedSpecialists.has('denis')) {
    recommendedKeys.add('denis');
    recommendedLabels.add('@denis (БД/индексы/WAL)');
  }

  const mandatorySpecialists = new Set();
  if (isUiTouched && isDbTouched) {
    if (!invokedSpecialists.has('elena')) mandatorySpecialists.add('elena');
    if (!invokedSpecialists.has('denis')) mandatorySpecialists.add('denis');
  }

  return {
    recommendedKeys: [...recommendedKeys],
    recommendedLabels: [...recommendedLabels],
    matchedDomains: [...matchedDomains],
    isUiTouched,
    isDbTouched,
    mandatorySpecialists: [...mandatorySpecialists],
    uiAndDbSimultaneous: isUiTouched && isDbTouched
  };
}

// --- FIX-A & FIX-B: Post-verification token economy window validation ---
export const POST_EDIT_ASK_QUESTION_RE = /(?:запустить\s+(?:сотрудников|специалистов|проверку|проверк[уае])|завершить\s+без\s+проверки|проверка\s+после\s+доработки|закончил\s+доработку|экономия\s+токенов|finish\s+without\s+verification|run\s+verification)/i;
export const SKIP_OPTION_RE = /(?:без\s+проверки|skip\b|пропустить\s+проверк[уае]?|завершить\s+без\s+проверки)/i;
export const RECOMMENDED_BADGE_RE = /(?:\(recommended\)|\(рекомендуется\)|\(рекомендовано\)|\(по\s+умолчанию\)|\(default\)|\[recommended\]|\[рекомендуется\]|\[рекомендовано\]|\brecommended\b|\bрекомендуется\b)/i;

export const FORBIDDEN_SKIP_RECOMMENDED_RE = new RegExp(
  `(?:${RECOMMENDED_BADGE_RE.source}[\\s\\S]{0,50}${SKIP_OPTION_RE.source})|(?:${SKIP_OPTION_RE.source}[\\s\\S]{0,50}${RECOMMENDED_BADGE_RE.source})`,
  'i'
);

export function isPostEditAskArgs(argsStr) {
  const s = String(argsStr || '');
  if (!POST_EDIT_ASK_QUESTION_RE.test(s)) return false;
  if (/(?:согласны\s+ли\s+вы\s+с\s+планом|подтверд(?:и(?:ть|те)?|ать)\s+план|утверд(?:и(?:ть|те)?|ать)\s+план|план\s+v?\d*\s*подходит|approve\s+(?:the\s+)?plan|confirm\s+(?:the\s+)?plan)/i.test(s)) {
    return false;
  }
  if (isXrayWindowAskArgs(s) || isTeamStopUnblockAskArgs(s) || isGradeOverrideAskArgs(s)) {
    return false;
  }
  return true;
}

export function lintPostEditAskWindow(questionText, options = [], context = {}) {
  const errors = [];
  const fullText = `${questionText}\n${(Array.isArray(options) ? options : []).join('\n')}`;
  const {
    workspaceDir = process.cwd(),
    touchedSnapshots = [],
    invokedSpecialists = new Set(),
    editedSourceFiles = new Set(),
    editedUiFiles = new Set(),
    currentDiffHash = ''
  } = context;

  const routing = computeRecommendedSpecialists(touchedSnapshots, {
    invokedSpecialists,
    editedSourceFiles,
    editedUiFiles
  });

  // FIX-A (P0): Check mandatory UI+DB lock and domain specialists
  if (routing.uiAndDbSimultaneous) {
    const hasElena = /(?:@?elena|елена|дизайн|окна)/i.test(fullText);
    const hasDenis = /(?:@?denis|денис|бд|баз[аы]|индекс|миграц)/i.test(fullText);
    if (!hasElena) {
      errors.push('Замок UI+БД (FIX-A): затронуты и интерфейс, и база данных — окно ОБЯЗАНО предлагать профильного специалиста @elena.');
    }
    if (!hasDenis) {
      errors.push('Замок UI+БД (FIX-A): затронуты и интерфейс, и база данных — окно ОБЯЗАНО предлагать профильного специалиста @denis.');
    }
  }

  // FIX-A: Domain-level coverage
  for (const domain of routing.matchedDomains) {
    if (domain === 'ui' && !routing.uiAndDbSimultaneous) {
      const hasUi = /(?:@?elena|@?kritik|елена|критик|дизайн|окна|ux)/i.test(fullText);
      if (!hasUi) {
        errors.push('Замок маршрутизации (FIX-A): затронут UI — окно ОБЯЗАНО предлагать профильного специалиста (@elena или @kritik).');
      }
    } else if (domain === 'database' && !routing.uiAndDbSimultaneous) {
      const hasDb = /(?:@?denis|денис|бд|баз[аы]|индекс|миграц)/i.test(fullText);
      if (!hasDb) {
        errors.push('Замок маршрутизации (FIX-A): затронута база данных — окно ОБЯЗАНО предлагать профильного специалиста @denis.');
      }
    } else if (domain === 'protocols') {
      const hasProtocols = /(?:@?alexey|@?igor|алексей|игорь|сокет|протокол)/i.test(fullText);
      if (!hasProtocols) {
        errors.push('Замок маршрутизации (FIX-A): затронуты сетевые протоколы — окно ОБЯЗАНО предлагать профильного специалиста (@alexey или @igor).');
      }
    } else if (domain === 'sap') {
      const hasSap = /(?:@?ruslan|руслан|sap|bapi)/i.test(fullText);
      if (!hasSap) {
        errors.push('Замок маршрутизации (FIX-A): затронут контур SAP — окно ОБЯЗАНО предлагать профильного специалиста @ruslan.');
      }
    } else if (domain === 'ai') {
      const hasAi = /(?:@?mikhail|михаил|rag|эмбед|llm)/i.test(fullText);
      if (!hasAi) {
        errors.push('Замок маршрутизации (FIX-A): затронут контур AI/RAG — окно ОБЯЗАНО предлагать профильного специалиста @mikhail.');
      }
    } else if (domain === 'reverse') {
      const hasReverse = /(?:@?artem|артем|артём|реверс|дизасм)/i.test(fullText);
      if (!hasReverse) {
        errors.push('Замок маршрутизации (FIX-A): затронут контур реверса/бинарных протоколов — окно ОБЯЗАНО предлагать профильного специалиста @artem.');
      }
    } else if (domain === 'digital_twin') {
      const has3d = /(?:@?gleb|глеб|3d|three\.js|webgl)/i.test(fullText);
      if (!has3d) {
        errors.push('Замок маршрутизации (FIX-A): затронут контур 3D/Digital Twin — окно ОБЯЗАНО предлагать профильного специалиста @gleb.');
      }
    } else if (domain === 'backend') {
      const hasBackend = /(?:@?dmitry|дмитрий|backend|бэкенд|api)/i.test(fullText);
      if (!hasBackend) {
        errors.push('Замок маршрутизации (FIX-A): затронут Backend/API — окно ОБЯЗАНО предлагать профильного специалиста @dmitry.');
      }
    }
  }

  // FIX-B (P0): Anti-nudge restriction on skip option when source files are modified
  const hasModifiedSources = (editedSourceFiles && editedSourceFiles.size > 0) || (context.hasModifiedSources === true);
  if (hasModifiedSources && Array.isArray(options)) {
    for (const opt of options) {
      const optStr = String(opt || '');
      if (FORBIDDEN_SKIP_RECOMMENDED_RE.test(optStr) || (SKIP_OPTION_RE.test(optStr) && RECOMMENDED_BADGE_RE.test(optStr))) {
        errors.push('Замок FIX-B: Запрещено ставить метку (Recommended) / (Рекомендуется) на вариант завершения без проверки при изменённых исходниках! Рекомендуйте проверку сотрудниками.');
      }
    }
  }

  // FIX-D (P1): Mechanical artifact verification before prose verdict claims
  const claimsQaPass = /(?:\[QA\s+PASS\]|\bqa\s+pass\b|тесты\s+(?:успешно\s+)?пройдены|проверка\s+пройдена)/i.test(fullText);
  if (claimsQaPass) {
    const qaPath = path.join(workspaceDir, '.hermes', 'qa-verdict.json');
    let valid = false;
    try {
      if (fs.existsSync(qaPath)) {
        const v = JSON.parse(fs.readFileSync(qaPath, 'utf-8'));
        const matchesHash = !currentDiffHash || v?.diffHash === currentDiffHash;
        if (v?.runner === 'mechanical' && v?.status === 'PASS' && matchesHash) {
          valid = true;
        }
      }
    } catch {}
    if (!valid) {
      errors.push('Замок FIX-D: В окне пост-проверки заявлен [QA PASS], но валидный механический артефакт .hermes/qa-verdict.json отсутствует или diffHash не совпадает.');
    }
  }

  const claimsSecPass = /(?:\[SECURITY\s+PASS\]|\bsecurity\s+pass\b)/i.test(fullText);
  if (claimsSecPass) {
    const secPath = path.join(workspaceDir, '.hermes', 'security-verdict.json');
    let valid = false;
    try {
      if (fs.existsSync(secPath)) {
        const v = JSON.parse(fs.readFileSync(secPath, 'utf-8'));
        const matchesHash = !currentDiffHash || v?.diffHash === currentDiffHash;
        if (v?.status === 'PASS' && v?.unresolvedHighCritical === 0 && matchesHash) {
          valid = true;
        }
      }
    } catch {}
    if (!valid) {
      errors.push('Замок FIX-D: В окне пост-проверки заявлен [SECURITY PASS], но валидный механический артефакт .hermes/security-verdict.json отсутствует или diffHash не совпадает.');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    routing
  };
}

// --- FIX-C: Live user database mutation safety gate ---
export const SQL_DESTRUCTIVE_DDL_RE = /\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA|VIEW|INDEX)|TRUNCATE(?:\s+TABLE)?|ALTER\s+TABLE)\b/i;
export const SQL_MUTATING_DML_RE = /\b(?:DELETE\s+FROM|UPDATE\s+[\w`"\[\]]+\s+SET)\b/i;
export const CLI_MIGRATION_CMD_RE = /\b(?:dotnet\s+ef\s+database\s+(?:update|drop)|prisma\s+(?:db\s+push|migrate\s+(?:deploy|reset))|alembic\s+(?:upgrade|downgrade)|flyway\s+(?:migrate|clean)|liquibase\s+update)\b/i;
export const DB_CLI_CLIENT_RE = /\b(?:sqlite3?|psql|mysql|sqlcmd|mariadb)\b/i;
export const LIVE_DB_FILE_DELETE_RE = /\b(?:rm|del|erase|remove-item|ri|mv|move|move-item)\b[^\n;&|]+\.(?:db|sqlite|sqlite3|mdf|ldf|ibd|db3)\b/i;

export const LIVE_DB_MUTATION_CMD_RE = new RegExp(
  `${SQL_DESTRUCTIVE_DDL_RE.source}|${SQL_MUTATING_DML_RE.source}|${CLI_MIGRATION_CMD_RE.source}|${LIVE_DB_FILE_DELETE_RE.source}`,
  'i'
);

export function isWhitelistedTestCommand(cmdLine = '') {
  const s = String(cmdLine || '');
  if (/(?:dotnet\s+test|npm\s+test|pytest|go\s+test|cargo\s+test|vitest|jest)\b/i.test(s)) return true;
  if (/node\s+(?:hooks|scripts)[\\/]test-runner/i.test(s)) return true;
  if (/node\s+hooks[\\/][\w.-]+\.test\.mjs/i.test(s)) return true;
  if (/:\s*memory\s*:/i.test(s)) return true;
  if (/(?:^|[\\/\s"'])(?:tests?|__tests__|fixtures|temp|tmp|\.tmp)[\\/]/i.test(s) && !/(?:production|live|warehouse)\.(?:db|sqlite)/i.test(s)) {
    if (/\.(?:test|mock|sample|fixture)\.(?:db|sqlite)\b/i.test(s) || /(?:tests?|temp|tmp)[\\/][\w.-]+\.(?:db|sqlite)/i.test(s)) {
      return true;
    }
  }
  return false;
}

export function isLiveDataMutationCommand(cmdLine = '', workspaceDir = '') {
  const s = String(cmdLine || '').trim();
  if (!s) return false;
  if (isWhitelistedTestCommand(s)) return false;

  // 1. Direct CLI migrations against production
  if (CLI_MIGRATION_CMD_RE.test(s)) return true;

  // 2. Shell file delete of working DB
  if (LIVE_DB_FILE_DELETE_RE.test(s)) {
    if (/(?:tests?|fixtures|temp|tmp|\.tmp)[\\/]/i.test(s)) return false;
    return true;
  }

  // 3. Destructive SQL via DB CLI
  const isDbCli = DB_CLI_CLIENT_RE.test(s);
  const hasDestructiveSql = SQL_DESTRUCTIVE_DDL_RE.test(s) || SQL_MUTATING_DML_RE.test(s);
  if (isDbCli && hasDestructiveSql) {
    if (/(?:tests?|fixtures|temp|tmp|\.tmp)[\\/]/i.test(s) || /:\s*memory\s*:/i.test(s)) return false;
    return true;
  }

  // 4. Raw destructive DDL/DML targeting db file
  if (hasDestructiveSql && /\.(?:db|sqlite|sqlite3|mdf|ldf)\b/i.test(s)) {
    if (/(?:tests?|fixtures|temp|tmp|\.tmp)[\\/]/i.test(s)) return false;
    return true;
  }

  return false;
}

export const DB_MUTATION_ASK_RE = /(?:мутаци[яие]|мутиру(?:ет|ют)|изменени[яие]\s+(?:живых\s+)?данных|удалени[яие]\s+данных\s+из\s+бд|миграци[яие]\s+(?:живой\s+)?бд|live\s+database\s+mutation|удалить\s+таблиц[уе]|truncate\s+table|drop\s+table|удалени[яие]\s+базы\s+данных)/i;

export function isDbMutationAskArgs(argsStr) {
  return DB_MUTATION_ASK_RE.test(String(argsStr || ''));
}

export function classifyDbMutationConsent(answerText, options = []) {
  const raw = String(answerText || '').trim();
  if (!raw) return { decision: 'unconfirmed', selectedOptionText: '', reason: '' };
  const { selectedOptionText, strippedAnswer } = resolveSelectedOptionText(raw, options);
  const target = `${selectedOptionText} ${strippedAnswer}`;
  const NEGATION_RE = /(?:не\s+(?:надо|нужно|трогай|удаляй|применяй|делай)|отмена|отклонить|don'?t|cancel|abort|no\b)/i;
  const CONFIRM_RE = /(?:подтверждаю|разрешить|применить|да\b|согласен|confirm|apply|yes\b|approve)/i;
  if (NEGATION_RE.test(target)) return { decision: 'negated', selectedOptionText, reason: strippedAnswer };
  if (CONFIRM_RE.test(target)) return { decision: 'confirmed', selectedOptionText, reason: strippedAnswer };
  return { decision: 'unconfirmed', selectedOptionText, reason: strippedAnswer };
}
