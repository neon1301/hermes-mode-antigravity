import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Universal workspace directory resolution for all Hermes Fleet hooks and utilities.
 * Precedence:
 * 1. payload.workspacePaths[0] (converts file:// URI to native OS path if needed)
 * 2. payload.cwd (if non-empty string)
 * 3. fallbackCwd (defaults to process.cwd())
 *
 * @param {object} [payload] - The hook input payload passed on stdin
 * @param {string} [fallbackCwd=process.cwd()] - Fallback directory when neither is present
 * @returns {string} - Absolute filesystem path to the workspace root
 */
export function resolveWorkspaceDir(payload, fallbackCwd = process.cwd()) {
  let rawDir = null;

  if (Array.isArray(payload?.workspacePaths) && payload.workspacePaths.length > 0) {
    const first = payload.workspacePaths[0];
    if (typeof first === 'string' && first.trim().length > 0) {
      rawDir = first.trim();
    }
  }

  if (!rawDir && payload?.cwd && typeof payload.cwd === 'string' && payload.cwd.trim().length > 0) {
    rawDir = payload.cwd.trim();
  }

  if (!rawDir) {
    return fallbackCwd;
  }

  if (rawDir.startsWith('file://')) {
    try {
      return fileURLToPath(rawDir);
    } catch {
      return fallbackCwd;
    }
  }

  return rawDir;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves the installed Hermes Fleet plugin root directory so scripts and references
 * work identically from any foreign repository (e.g., tailscale-webos).
 * Precedence:
 * 1. process.env.HERMES_PLUGIN_ROOT (only if it is an existing directory containing plugin.json)
 * 2. Parent directory of this hooks/ module (import.meta.url -> ..)
 * 3. fallbackDir (if provided)
 *
 * @param {string|null} [fallbackDir=null]
 * @returns {string} - Absolute path to the plugin root directory
 */
export function resolvePluginRoot(fallbackDir = null) {
  const envRoot = String(process.env.HERMES_PLUGIN_ROOT || '').trim();
  if (envRoot) {
    const absEnv = path.resolve(envRoot);
    if (fs.existsSync(path.join(absEnv, 'plugin.json'))) {
      return absEnv;
    }
  }
  const moduleRoot = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(moduleRoot, 'plugin.json'))) {
    return moduleRoot;
  }
  if (fallbackDir) {
    return path.resolve(fallbackDir);
  }
  return moduleRoot;
}

/**
 * Resolves a script inside the installed Hermes Fleet plugin root safely
 * (rejecting path traversal or escapes outside pluginRoot).
 *
 * @param {string} relScriptPath - e.g. 'scripts/xray-scan.mjs' or 'scripts/export-logs.mjs'
 * @param {{ pluginRoot?: string }} [options]
 * @returns {string} - Absolute path to the plugin script
 */
export function resolvePluginScript(relScriptPath, { pluginRoot = resolvePluginRoot() } = {}) {
  const raw = String(relScriptPath || '').trim();
  if (!raw) {
    throw new Error('Plugin script path must be non-empty');
  }
  const normalized = raw.replace(/\\/g, '/').replace(/^\.?\//, '');
  if (path.isAbsolute(raw) || /(?:^|\/)\.\.(?:\/|$)/.test(normalized)) {
    throw new Error(`Invalid plugin script relative path: '${relScriptPath}'`);
  }
  const absRoot = path.resolve(pluginRoot);
  const candidate = path.resolve(absRoot, normalized);
  const relCheck = path.relative(absRoot, candidate);
  if (!relCheck || relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
    throw new Error(`Plugin script path escapes plugin root: '${relScriptPath}'`);
  }
  return candidate;
}
