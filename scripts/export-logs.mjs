#!/usr/bin/env node
/**
 * scripts/export-logs.mjs — Hermes Fleet «Чёрный ящик» (REQ-10, v4.7.1)
 * Pure Node.js stdlib ESM mechanical exporter of protected/mechanical run artifacts
 * into logs/<version>/<UTC-timestamp>-<taskHash>/ with strictly .json/.jsonl/.log/.txt extensions.
 *
 * Security & Honesty Guarantees:
 * - Copies ONLY mechanical/protected sources verbatim after redacting secrets & user paths.
 * - NEVER exports .hermes/config.json in full (user settings / custom paths stay private).
 * - NEVER fabricates missing files: absent sources are recorded as { status: "absent" } in manifest.json (Rule 13).
 * - Reuses KNOWN_SECRET_PREFIX_RE / SECRET_ASSIGN_RE / CONN_SECRET_RE from hooks/consent-validator.mjs.
 * - Redacts user home paths (Windows & Unix) to %USER% before writing.
 * - Enforces a strict 2 MiB per-file cap with honest truncated flag + originalSize + originalSha256.
 * - Exports transcript-shape.jsonl (metadata only, ZERO content text) by default;
 *   full redacted transcript is exported ONLY when explicit --include-transcript flag is passed.
 */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONN_SECRET_RE,
  KNOWN_SECRET_PREFIX_RE,
  SECRET_ASSIGN_RE
} from '../hooks/consent-validator.mjs';
import { collectToolCalls, parseJsonl } from '../hooks/hermes-trigger.mjs';

export const MAX_EXPORT_BYTES = 2 * 1024 * 1024; // 2 MiB per-file cap

export const PROTECTED_HERMES_EXPORT_SOURCES = Object.freeze([
  { src: 'test-summary.json', dst: 'test-summary.json' },
  { src: 'gate-log.jsonl', dst: 'gate-log.jsonl' },
  { src: 'council-state.json', dst: 'council-state.json' },
  { src: 'council-outcomes.jsonl', dst: 'council-outcomes.jsonl' },
  { src: 'council-cost.jsonl', dst: 'council-cost.jsonl' },
  { src: 'progress-journal.jsonl', dst: 'progress-journal.jsonl' },
  { src: 'lessons.jsonl', dst: 'lessons.jsonl' },
  { src: 'qa-verdict.json', dst: 'qa-verdict.json' },
  { src: 'security-verdict.json', dst: 'security-verdict.json' },
  { src: 'plan-state.json', dst: 'plan-state.json' },
  { src: 'plan-ledger.jsonl', dst: 'plan-ledger.jsonl' },
  { src: 'rubric.json', dst: 'rubric.json' },
  { src: 'grade-report.json', dst: 'grade-report.json' },
  { src: 'grade-ledger.jsonl', dst: 'grade-ledger.jsonl' },
  { src: 'team-stop.json', dst: 'team-stop.json' },
  { src: 'eval-results.jsonl', dst: 'eval-results.jsonl' },
  // Text mirrors (.txt — strictly NO .md files under logs/)
  { src: 'plan.md', dst: 'plan.md.txt' },
  { src: 'decisions.md', dst: 'decisions.md.txt' }
]);

const ALLOWED_EXT_RE = /\.(?:json|jsonl|log|txt)$/i;

function sha256Buf(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Redact known secret patterns (reusing consent-validator.mjs single source of truth)
 * and absolute user home directory paths -> %USER%.
 */
export function redactExportText(rawText, { homeDir = os.homedir() } = {}) {
  let text = String(rawText ?? '');

  // 1. Secret prefixes (JWT, OpenAI sk-, GitHub ghp_/github_pat_, AWS AKIA, Google AIza, Slack xox*)
  const globalPrefixRe = new RegExp(KNOWN_SECRET_PREFIX_RE.source, 'g');
  text = text.replace(globalPrefixRe, (match, quote) => `${quote}[REDACTED_SECRET]${quote}`);

  // Also redact bare (unquoted) known secret prefixes in logs/plain text
  text = text.replace(
    /\b(?:eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}|sk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{16,}|gh[po]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[0-9A-Za-z-]{15,})\b/g,
    '[REDACTED_SECRET]'
  );

  // 2. Connection string passwords (CONN_SECRET_RE)
  const globalConnRe = new RegExp(CONN_SECRET_RE.source, 'gi');
  text = text.replace(globalConnRe, (match) =>
    match.replace(/(\b(?:Password|Pwd)\s*=\s*)[^;"'`\n\s]{6,}/gi, '$1[REDACTED_SECRET]')
  );

  // 3. Assigned secrets (SECRET_ASSIGN_RE) — skip placeholders/simple words
  const globalAssignRe = new RegExp(SECRET_ASSIGN_RE.source, 'gi');
  text = text.replace(globalAssignRe, (match, quote, val) => {
    const trimmed = String(val || '').trim();
    if (!trimmed || /^(?:<[^>]+>|\$\{|\{\{|env\.|process\.env|changeme|example|placeholder|\[REDACTED_SECRET\])/i.test(trimmed)) {
      return match;
    }
    if (/^[A-Za-z][A-Za-z ]*$/.test(trimmed)) return match;
    return match.replace(`${quote}${val}${quote}`, `${quote}[REDACTED_SECRET]${quote}`);
  });

  // 4. User home directory paths -> %USER% (both current host homedir and generic Windows/macOS/Linux user roots)
  if (homeDir && homeDir.length >= 4) {
    const winHome = homeDir.replace(/\//g, '\\');
    const posixHome = homeDir.replace(/\\/g, '/');
    const jsonEscapedHome = winHome.replace(/\\/g, '\\\\');
    for (const variant of [jsonEscapedHome, winHome, posixHome]) {
      if (variant) {
        text = text.replace(new RegExp(escapeRegExp(variant), 'gi'), '%USER%');
      }
    }
  }
  // Generic Windows/Unix user paths (handles JSON-escaped backslashes too)
  text = text.replace(/[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)[^\\/\s"'`<>|]+/gi, '%USER%');
  text = text.replace(/(?:^|(?<=[\s"'`(=:]))\/(?:Users|home)\/[^/\s"'`<>|]+/g, '%USER%');

  return text;
}

/**
 * Truncate redacted text to maxBytes while honestly reporting truncation metadata.
 */
function capAndEncode(redactedText, maxBytes = MAX_EXPORT_BYTES) {
  const fullBuf = Buffer.from(redactedText, 'utf-8');
  const originalSize = fullBuf.length;
  const originalSha256 = sha256Buf(fullBuf);
  if (originalSize <= maxBytes) {
    return {
      buf: fullBuf,
      size: originalSize,
      sha256: originalSha256,
      truncated: false,
      originalSize,
      originalSha256
    };
  }
  const notice = `\n[TRUNCATED: originalSize=${originalSize} bytes, originalSha256=${originalSha256}]\n`;
  const noticeBytes = Buffer.byteLength(notice, 'utf-8');
  const sliceLen = Math.max(0, maxBytes - noticeBytes);
  // Decode truncated slice cleanly without splitting a multi-byte UTF-8 rune
  const headText = fullBuf.subarray(0, sliceLen).toString('utf-8').replace(/\uFFFD$/, '');
  const finalBuf = Buffer.from(headText + notice, 'utf-8');
  return {
    buf: finalBuf,
    size: finalBuf.length,
    sha256: sha256Buf(finalBuf),
    truncated: true,
    originalSize,
    originalSha256
  };
}

function runGit(cwd, args) {
  const res = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (res.status !== 0) return null;
  return String(res.stdout || '').trim();
}

function collectGitState(workspaceDir) {
  const branch = runGit(workspaceDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = runGit(workspaceDir, ['rev-parse', 'HEAD']);
  const tree = runGit(workspaceDir, ['rev-parse', 'HEAD^{tree}']);
  const statusPorcelain = runGit(workspaceDir, ['status', '--porcelain']);
  const diffStat = runGit(workspaceDir, ['diff', '--stat']);
  return {
    branch: branch || null,
    commit: commit || null,
    tree: tree || null,
    statusPorcelain: statusPorcelain ?? null,
    diffStat: diffStat ?? null
  };
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Build metadata-only transcript-shape.jsonl (ZERO step content text!).
 */
export function buildTranscriptShapeJsonl(rawJsonlText) {
  const steps = parseJsonl(rawJsonlText);
  const lines = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i] || {};
    const contentRaw = typeof s.content === 'string'
      ? s.content
      : (s.content != null ? JSON.stringify(s.content) : '');
    const hasHarnessBanner =
      /Created At:\s*\d{4}-\d{2}-\d{2}/i.test(contentRaw) ||
      /Completed At:\s*\d{4}-\d{2}-\d{2}/i.test(contentRaw) ||
      /\[Message\]\s+[^\r\n]*?sender=/i.test(contentRaw);
    const toolCalls = collectToolCalls(s);
    const toolCallNames = toolCalls
      .map((tc) => String(tc?.name || '').trim())
      .filter(Boolean);
    const senderMatch = contentRaw.match(/sender=["']?([0-9a-f-]{36})["']?/i);
    const sender = s.sender ? String(s.sender) : (senderMatch ? senderMatch[1].toLowerCase() : null);

    lines.push(JSON.stringify({
      step_index: Number.isInteger(s.step_index) ? s.step_index : i,
      source: s.source ?? null,
      type: s.type ?? null,
      status: s.status ?? null,
      hasHarnessBanner,
      tool_call_names: toolCallNames,
      sender,
      contentLength: contentRaw.length
    }));
  }
  return lines.join('\n') + (lines.length > 0 ? '\n' : '');
}

function formatUtcSlug(date = new Date()) {
  // 2026-11-18T11-30-00Z (filesystem-safe on Windows & POSIX)
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

export function exportRunLogs({
  workspaceDir = process.cwd(),
  version = null,
  taskHash = null,
  timestamp = null,
  npmTestLogPath = null,
  verifyLogPath = null,
  installLogPath = null,
  transcriptPath = null,
  includeTranscript = false,
  maxFileBytes = MAX_EXPORT_BYTES,
  homeDir = os.homedir()
} = {}) {
  const absWs = path.resolve(workspaceDir);
  const hermesDir = path.join(absWs, '.hermes');

  // Resolve plugin version from plugin.json if not explicitly supplied
  const pluginMeta = readJsonSafe(path.join(absWs, 'plugin.json'));
  const resolvedVersion = String(version || pluginMeta?.version || '0.0.0').replace(/[^a-zA-Z0-9._-]/g, '_');

  // Resolve taskHash from protected plan-state.json / council-state.json if not explicitly supplied
  const planState = readJsonSafe(path.join(hermesDir, 'plan-state.json'));
  const councilState = readJsonSafe(path.join(hermesDir, 'council-state.json'));
  const resolvedTaskHash = String(taskHash || planState?.taskHash || councilState?.taskHash || 'unknown')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 32) || 'unknown';

  const qaVerdict = readJsonSafe(path.join(hermesDir, 'qa-verdict.json'));
  const secVerdict = readJsonSafe(path.join(hermesDir, 'security-verdict.json'));
  const verdictDiffHash = qaVerdict?.diffHash || secVerdict?.diffHash || null;

  const exportedAtDate = timestamp ? new Date(timestamp) : new Date();
  const utcSlug = formatUtcSlug(exportedAtDate);
  const runDirName = `${utcSlug}-${resolvedTaskHash}`;
  const outDir = path.join(absWs, 'logs', resolvedVersion, runDirName);
  fs.mkdirSync(outDir, { recursive: true });

  const manifestFiles = {};

  const writeManagedFile = (dstName, rawText, sourceLabel) => {
    if (!ALLOWED_EXT_RE.test(dstName)) {
      throw new Error(`Disallowed export extension for "${dstName}" (strictly .json/.jsonl/.log/.txt)`);
    }
    const redacted = redactExportText(rawText, { homeDir });
    const encoded = capAndEncode(redacted, maxFileBytes);
    const dstPath = path.join(outDir, dstName);
    fs.writeFileSync(dstPath, encoded.buf);
    const entry = {
      status: 'present',
      source: sourceLabel,
      size: encoded.size,
      sha256: encoded.sha256
    };
    if (encoded.truncated) {
      entry.truncated = true;
      entry.originalSize = encoded.originalSize;
      entry.originalSha256 = encoded.originalSha256;
    }
    manifestFiles[dstName] = entry;
  };

  // 1. Export all protected/mechanical .hermes artifacts (verbatim + redacted; absent -> "absent")
  for (const spec of PROTECTED_HERMES_EXPORT_SOURCES) {
    const srcPath = path.join(hermesDir, spec.src);
    if (!fs.existsSync(srcPath)) {
      manifestFiles[spec.dst] = { status: 'absent', source: `.hermes/${spec.src}` };
      continue;
    }
    const raw = fs.readFileSync(srcPath, 'utf-8');
    writeManagedFile(spec.dst, raw, `.hermes/${spec.src}`);
  }

  // 2. Export optional mechanical command logs (npm-test.log, verify.log, install.log)
  const commandLogs = [
    { dst: 'npm-test.log', srcPath: npmTestLogPath, label: 'cli:npm-test' },
    { dst: 'verify.log', srcPath: verifyLogPath, label: 'cli:verify' },
    { dst: 'install.log', srcPath: installLogPath, label: 'cli:install' }
  ];
  for (const cl of commandLogs) {
    if (cl.srcPath && fs.existsSync(cl.srcPath)) {
      const raw = fs.readFileSync(cl.srcPath, 'utf-8');
      writeManagedFile(cl.dst, raw, cl.label);
    } else {
      manifestFiles[cl.dst] = { status: 'absent', source: cl.label };
    }
  }

  // 3. Export transcript-shape.jsonl (default metadata-only, ZERO content text)
  if (transcriptPath && fs.existsSync(transcriptPath)) {
    const rawTranscript = fs.readFileSync(transcriptPath, 'utf-8');
    const shapeJsonl = buildTranscriptShapeJsonl(rawTranscript);
    writeManagedFile('transcript-shape.jsonl', shapeJsonl, 'transcript:shape_only');
    if (includeTranscript) {
      writeManagedFile('transcript-full.jsonl.txt', rawTranscript, 'transcript:full_explicit_flag');
    }
  } else {
    manifestFiles['transcript-shape.jsonl'] = { status: 'absent', source: 'transcript:shape_only' };
  }

  // 4. Write git-state.json
  const gitState = collectGitState(absWs);
  writeManagedFile('git-state.json', JSON.stringify(gitState, null, 2) + '\n', 'mechanical:git');

  // 5. Write manifest.json last (summarizing all exported & absent files)
  const manifest = {
    schemaVersion: 1,
    version: resolvedVersion,
    exportedAt: exportedAtDate.toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    taskHash: resolvedTaskHash,
    releaseCommitHash: gitState.commit,
    releaseTreeHash: gitState.tree,
    verdictDiffHash,
    includeTranscript: Boolean(includeTranscript),
    maxFileBytes,
    files: manifestFiles
  };
  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  return {
    outDir,
    relOutDir: path.relative(absWs, outDir).replace(/\\/g, '/'),
    manifestPath,
    manifest
  };
}

function parseCliArgs(argv) {
  const opts = {
    workspaceDir: process.cwd(),
    version: null,
    taskHash: null,
    npmTestLogPath: null,
    verifyLogPath: null,
    installLogPath: null,
    transcriptPath: null,
    includeTranscript: false
  };
  for (const arg of argv) {
    if (arg === '--include-transcript') {
      opts.includeTranscript = true;
    } else if (arg.startsWith('--workspace=')) {
      opts.workspaceDir = arg.slice('--workspace='.length);
    } else if (arg.startsWith('--version=')) {
      opts.version = arg.slice('--version='.length);
    } else if (arg.startsWith('--task-hash=')) {
      opts.taskHash = arg.slice('--task-hash='.length);
    } else if (arg.startsWith('--npm-test-log=')) {
      opts.npmTestLogPath = arg.slice('--npm-test-log='.length);
    } else if (arg.startsWith('--verify-log=')) {
      opts.verifyLogPath = arg.slice('--verify-log='.length);
    } else if (arg.startsWith('--install-log=')) {
      opts.installLogPath = arg.slice('--install-log='.length);
    } else if (arg.startsWith('--transcript=')) {
      opts.transcriptPath = arg.slice('--transcript='.length);
    }
  }
  return opts;
}

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  try {
    const opts = parseCliArgs(process.argv.slice(2));
    const result = exportRunLogs(opts);
    process.stdout.write(JSON.stringify({
      ok: true,
      outDir: result.relOutDir,
      releaseCommitHash: result.manifest.releaseCommitHash,
      releaseTreeHash: result.manifest.releaseTreeHash,
      verdictDiffHash: result.manifest.verdictDiffHash,
      presentCount: Object.values(result.manifest.files).filter((f) => f.status === 'present').length,
      absentCount: Object.values(result.manifest.files).filter((f) => f.status === 'absent').length
    }, null, 2) + '\n');
  } catch (err) {
    process.stderr.write(`export-logs error: ${err.message}\n`);
    process.exit(1);
  }
}
