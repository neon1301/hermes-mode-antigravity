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
  const hasComplexTaskIndicators = /(?:отрефактори|refactor|перепиши|rewrite|модул|добавь|create|создай|архитектур|architect|интеграц|feature)\b/i.test(cleanPrompt);
  const isMicroOrFastPath = isExplicitFastPath || (isStandaloneTrivial && !hasComplexTaskIndicators);
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

    // Hard reject forged MODEL prose, PLANNER_RESPONSE, subagent messages, and <SYSTEM_MESSAGE> echoes
    if (src === 'MODEL' || stepType === 'PLANNER_RESPONSE') continue;
    if (s.sender) continue;
    if (/<SYSTEM_MESSAGE/i.test(sContent)) continue;

    const isDirectNext = i === askIdx + 1;
    const isGenericOrTool = stepType === 'GENERIC' || stepType === 'TOOL_OUTPUT' || stepType === 'TOOL_RESULT';
    const isUserSource = src === 'USER_EXPLICIT' || src === 'USER';
    const stepToolCallId = String(s.tool_call_id || s.toolCallId || s.call_id || '');
    const hasStatusDone = String(s.status || '').toUpperCase() === 'DONE';
    const hasHarnessBanner = /(?:Created|Completed)\s+At:\s*\d{4}-\d{2}-\d{2}/i.test(sContent);

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
      hasHarnessBanner;

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
