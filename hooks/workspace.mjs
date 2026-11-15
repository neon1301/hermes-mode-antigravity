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
