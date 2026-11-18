#!/usr/bin/env node
/**
 * scripts/xray-scan.mjs — Hermes Fleet v4.7.2 «Рентген» (REQ-1, REQ-2, REQ-3, REQ-6)
 * Pure Node.js stdlib ESM deterministic static scanner (zero network, zero external deps).
 *
 * Adapters:
 * - JS / ES5 / ESM (.js, .mjs, .cjs, .jsx, .ts, .tsx)
 * - HTML / CSS (.html, .htm, .css)
 * - Generic text/source (.py, .go, .sh, .ps1, .rb, .java, .php)
 * - C# / XAML (.cs, .xaml): explicitly NOT covered in v4.7.2 (counted honestly in filesSkippedUnsupported)
 *
 * Budgets: <= 2000 files, <= 2 MiB per file, 10s timebox (CLI) / residual budget (Stop hook).
 * Truncation sets `truncated: true` with honest counters and NEVER fabricates quality scores or percentages.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEvidenceRef } from '../hooks/grade-gate.mjs';
import { CONN_SECRET_RE, KNOWN_SECRET_PREFIX_RE } from '../hooks/consent-validator.mjs';
import {
  computeFindingId,
  normalizeXrayRelPath,
  persistXrayReportAndSyncDebt,
  XRAY_IMPACT_RANK
} from '../hooks/xray-ledger.mjs';

export const SCAN_VERSION = '4.7.2';

export const XRAY_BUDGET_DEFAULTS = Object.freeze({
  maxFiles: 2000,
  maxFileBytes: 2 * 1024 * 1024,
  timeboxMs: 10000
});

export const VALID_FINDING_CLASSES = Object.freeze(new Set(['fact', 'hypothesis']));
export const VALID_FINDING_CATEGORIES = Object.freeze(new Set(['dead', 'stub', 'fragile']));

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.hermes',
  'logs',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'out',
  'bin',
  'obj',
  '__pycache__',
  '.venv',
  'venv'
]);

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svgz',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar', '.ipk',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.pyc', '.class', '.jar',
  '.pdf', '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
  '.sqlite', '.db', '.wasm'
]);

const JS_EXTS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);
const HTML_EXTS = new Set(['.html', '.htm']);
const CSS_EXTS = new Set(['.css']);
const UNSUPPORTED_CSHARP_XAML_EXTS = new Set(['.cs', '.xaml']);
const GENERIC_SOURCE_EXTS = new Set(['.py', '.go', '.sh', '.ps1', '.rb', '.java', '.php']);
const REF_ONLY_EXTS = new Set(['.json', '.md', '.txt', '.yml', '.yaml', '.toml', '.xml', '.ini', '.conf', '.cfg', '.env']);

const JS_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
  'return', 'try', 'catch', 'finally', 'throw', 'new', 'delete', 'typeof', 'instanceof',
  'void', 'in', 'of', 'function', 'var', 'let', 'const', 'class', 'extends', 'super',
  'this', 'import', 'export', 'from', 'as', 'async', 'await', 'yield', 'true', 'false',
  'null', 'undefined', 'NaN', 'Infinity', 'constructor', 'get', 'set', 'static', 'main'
]);

const ENTRYPOINT_BASENAMES = new Set([
  'index.html', 'index.htm', 'index.js', 'index.mjs', 'index.cjs', 'index.ts',
  'main.js', 'main.mjs', 'main.cjs', 'main.ts', 'app.js', 'app.mjs', 'app.ts',
  'server.js', 'server.mjs', 'cli.js', 'cli.mjs', 'service.js', 'service.mjs',
  'package.json', 'plugin.json', 'hooks.json', 'appinfo.json', 'services.json',
  'install.ps1', 'install.sh', 'verify.ps1', 'verify.sh', 'makefile', 'control'
]);

const TEST_PATH_RE = /(?:^|\/)(?:__tests__|tests?|specs?|fixtures|mocks)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/i;

function isBinaryBuffer(buf) {
  const sampleLen = Math.min(buf.length, 8192);
  for (let i = 0; i < sampleLen; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function isMinifiedText(text) {
  if (!text) return false;
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return false;
  const avgLen = text.length / lines.length;
  if (avgLen > 1000 && text.length > 4096) return true;
  return false;
}

/**
 * State-machine JS comment stripper that preserves exact line numbers and keeps strings intact.
 * Avoids false stripping of `http://` inside strings.
 */
function stripJsCommentsPreserveLines(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  let state = 'code'; // code | sq | dq | tpl | line_comment | block_comment
  while (i < n) {
    const ch = code[i];
    const next = i + 1 < n ? code[i + 1] : '';
    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'line_comment';
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'block_comment';
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === "'") { state = 'sq'; out += ch; i++; continue; }
      if (ch === '"') { state = 'dq'; out += ch; i++; continue; }
      if (ch === '`') { state = 'tpl'; out += ch; i++; continue; }
      out += ch;
      i++;
    } else if (state === 'line_comment') {
      if (ch === '\n') { state = 'code'; out += '\n'; }
      else { out += ' '; }
      i++;
    } else if (state === 'block_comment') {
      if (ch === '*' && next === '/') {
        state = 'code';
        out += '  ';
        i += 2;
        continue;
      }
      out += ch === '\n' ? '\n' : ' ';
      i++;
    } else if (state === 'sq') {
      out += ch;
      if (ch === '\\' && i + 1 < n) { out += next; i += 2; continue; }
      if (ch === "'" || ch === '\n') state = 'code';
      i++;
    } else if (state === 'dq') {
      out += ch;
      if (ch === '\\' && i + 1 < n) { out += next; i += 2; continue; }
      if (ch === '"' || ch === '\n') state = 'code';
      i++;
    } else if (state === 'tpl') {
      out += ch;
      if (ch === '\\' && i + 1 < n) { out += next; i += 2; continue; }
      if (ch === '`') state = 'code';
      i++;
    }
  }
  return out;
}

function addTokenRef(map, token, loc) {
  if (!token || token.length < 2) return;
  let entry = map.get(token);
  if (!entry) {
    entry = { count: 0, locations: new Set() };
    map.set(token, entry);
  }
  entry.count++;
  if (entry.locations.size < 12) {
    entry.locations.add(loc);
  }
}

function collectPackagedAndEntrypointFiles(files, workspaceDir) {
  const protectedFiles = new Map(); // normRelLower -> Set<reason>
  const mark = (relPath, reason) => {
    const norm = normalizeXrayRelPath(relPath, workspaceDir).toLowerCase();
    if (!norm) return;
    if (!protectedFiles.has(norm)) protectedFiles.set(norm, new Set());
    protectedFiles.get(norm).add(reason);
  };

  for (const f of files) {
    const baseLower = path.basename(f.relPath).toLowerCase();
    if (ENTRYPOINT_BASENAMES.has(baseLower)) {
      mark(f.relPath, 'entrypoint');
    }
    if (TEST_PATH_RE.test(f.relPath)) {
      mark(f.relPath, 'test_file');
    }
    if (/^scripts\/[^/]+\.(?:m?js|cjs|sh|ps1)$/i.test(f.relPath) && /^#!/.test(f.text)) {
      mark(f.relPath, 'entrypoint');
    }
    if (/^hooks\/[^/]+\.mjs$/i.test(f.relPath)) {
      // Hooks may be executed directly or imported
      if (baseLower === 'test-runner.mjs' || baseLower === 'qa-runner.mjs') {
        mark(f.relPath, 'entrypoint');
      }
    }

    // Parse package.json / plugin.json / hooks.json / appinfo.json / services.json for packaged paths
    if (baseLower === 'package.json') {
      try {
        const pkg = JSON.parse(f.text);
        const dir = path.posix.dirname(f.relPath);
        const joinRel = (p) => (dir === '.' ? p : `${dir}/${p}`);
        if (typeof pkg.main === 'string') mark(joinRel(pkg.main), 'packaged_file');
        if (typeof pkg.module === 'string') mark(joinRel(pkg.module), 'packaged_file');
        if (typeof pkg.bin === 'string') mark(joinRel(pkg.bin), 'packaged_file');
        if (pkg.bin && typeof pkg.bin === 'object') {
          for (const v of Object.values(pkg.bin)) if (typeof v === 'string') mark(joinRel(v), 'packaged_file');
        }
        if (Array.isArray(pkg.files)) {
          for (const item of pkg.files) {
            if (typeof item === 'string') mark(joinRel(item), 'packaged_file');
          }
        }
        if (pkg.scripts && typeof pkg.scripts === 'object') {
          for (const cmd of Object.values(pkg.scripts)) {
            for (const m of String(cmd).matchAll(/([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]+)/g)) {
              mark(joinRel(m[1]), 'packaged_file');
            }
          }
        }
      } catch {}
    } else if (baseLower === 'hooks.json' || baseLower === 'appinfo.json' || baseLower === 'services.json' || baseLower === 'plugin.json') {
      const dir = path.posix.dirname(f.relPath);
      const joinRel = (p) => (dir === '.' ? p : `${dir}/${p}`);
      for (const m of f.text.matchAll(/["'](?:\.\/)?([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.[A-Za-z0-9]{1,8})["']/g)) {
        mark(joinRel(m[1]), 'packaged_file');
      }
      // Also capture command strings like "node ./hooks/qa-gate.mjs"
      for (const m of f.text.matchAll(/node\s+(?:\.\/)?([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]+)/g)) {
        mark(joinRel(m[1]), 'packaged_file');
      }
    } else if (baseLower === 'install.ps1' || baseLower === 'install.sh' || baseLower === 'makefile' || baseLower === 'control' || /\.ipk/i.test(f.text) || /ares-package/i.test(f.text)) {
      for (const m of f.text.matchAll(/["']([A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)*)["']/g)) {
        const candidate = m[1].replace(/\\/g, '/');
        if (candidate.includes('.') || candidate.includes('/')) {
          mark(candidate, 'packaged_file');
        } else if (candidate.length >= 2) {
          // Directory copied into installer/IPK payload (e.g. "hooks", "scripts", "assets")
          for (const other of files) {
            if (other.relPath.toLowerCase().startsWith(candidate.toLowerCase() + '/')) {
              mark(other.relPath, 'packaged_file');
            }
          }
        }
      }
    }
  }

  return protectedFiles;
}

function buildReferenceIndex(files) {
  const identifierRefs = new Map();
  const stringRefs = new Map();
  const htmlIds = new Set();
  const dynamicDispatchedSymbols = new Set();
  const literalLocations = new Map(); // string literal -> Array<{ relPath, line }>

  for (const f of files) {
    const ext = path.extname(f.relPath).toLowerCase();
    const isTest = TEST_PATH_RE.test(f.relPath);
    const lines = f.text.split(/\r?\n/);

    for (let idx = 0; idx < lines.length; idx++) {
      const lineText = lines[idx];
      if (lineText.length > 4096) continue;
      const lineNum = idx + 1;
      const loc = `${f.relPath}:${lineNum}`;

      // Extract identifiers
      for (const m of lineText.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$-]{1,80})\b/g)) {
        const tok = m[1];
        if (!JS_KEYWORDS.has(tok)) {
          addTokenRef(identifierRefs, tok, loc);
        }
      }

      // Extract string literals (single, double, backtick without interpolation)
      for (const m of lineText.matchAll(/(["'`])([^"'`\r\n]{2,120})\1/g)) {
        const val = m[2].trim();
        if (!val) continue;
        addTokenRef(stringRefs, val, loc);
        // Strip leading # or . for CSS/querySelector lookups
        if ((val.startsWith('#') || val.startsWith('.')) && val.length > 2) {
          addTokenRef(stringRefs, val.slice(1), loc);
        }
        // Extract basename/stem from relative path strings
        if (val.includes('/') || val.includes('\\')) {
          const b = path.basename(val.replace(/\\/g, '/'));
          if (b && b.length >= 3) {
            addTokenRef(stringRefs, b, loc);
            const stem = b.replace(/\.[^.]+$/, '');
            if (stem && stem.length >= 3) addTokenRef(stringRefs, stem, loc);
          }
        }
        // Track duplicate string literals in non-test source files (for fragile.duplicate_literal)
        if (
          !isTest &&
          (JS_EXTS.has(ext) || GENERIC_SOURCE_EXTS.has(ext)) &&
          val.length >= 8 &&
          !KNOWN_SECRET_PREFIX_RE.test(m[0]) &&
          !CONN_SECRET_RE.test(m[0]) &&
          !/^(?:use strict|utf-?8|node:[a-z0-9_/-]+|\.\.?\/|application\/|text\/|https?:\/\/(?:example|localhost)|[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)+)$/i.test(val) &&
          !/^\s*[-=+*#─═|]+\s*$/.test(val) &&
          !/^\s*(?:import|from|require)\b/.test(lineText)
        ) {
          if (!literalLocations.has(val)) literalLocations.set(val, []);
          const arr = literalLocations.get(val);
          if (arr.length < 10) arr.push({ relPath: f.relPath, line: lineNum });
        }
      }

      // Detect dynamic string dispatch / cross-process RPC registration
      for (const m of lineText.matchAll(/(?:service\.register|registerMethod|dispatch|ipcMain\.handle|ipcRenderer\.invoke|window|globalThis|handlers|actions)\s*(?:\(|\[)\s*["'`]([A-Za-z_$][A-Za-z0-9_$-]{1,80})["'`]/g)) {
        dynamicDispatchedSymbols.add(m[1]);
        addTokenRef(stringRefs, m[1], loc);
      }
      for (const m of lineText.matchAll(/getElementById\s*\(\s*["'`]([^"'`]+)["'`]\s*\)|querySelector(?:All)?\s*\(\s*["'`]#([^"'`\s.,:>[\]]+)/g)) {
        const idVal = m[1] || m[2];
        if (idVal) {
          dynamicDispatchedSymbols.add(idVal);
          addTokenRef(stringRefs, idVal, loc);
        }
      }

      // Collect HTML id="..."
      if (HTML_EXTS.has(ext)) {
        for (const m of lineText.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
          htmlIds.add(m[1].trim());
        }
      }
    }
  }

  return { identifierRefs, stringRefs, htmlIds, dynamicDispatchedSymbols, literalLocations };
}

function countExternalRefs(symbol, declLoc, { identifierRefs, stringRefs }, { countDeclarationInIdentifiers = true } = {}) {
  const idEntry = identifierRefs.get(symbol);
  const strEntry = stringRefs.get(symbol);
  const allLocs = new Set();
  if (idEntry) {
    for (const loc of idEntry.locations) {
      if (loc !== declLoc) allLocs.add(loc);
    }
  }
  if (strEntry) {
    for (const loc of strEntry.locations) {
      if (loc !== declLoc) allLocs.add(loc);
    }
  }
  const capped = (idEntry && idEntry.locations.size >= 12) || (strEntry && strEntry.locations.size >= 12);
  const rawCount = (idEntry ? idEntry.count : 0) + (strEntry ? strEntry.count : 0);
  const externalCount = capped
    ? Math.max(allLocs.size, Math.max(0, rawCount - (countDeclarationInIdentifiers ? 1 : 0)))
    : allLocs.size;
  return {
    count: externalCount,
    sample: [...allLocs].slice(0, 5)
  };
}

function scanJsFile(file, idxCtx, { truncated, protectedFiles }) {
  const findings = [];
  if (TEST_PATH_RE.test(file.relPath)) return findings;

  const rawLines = file.text.split(/\r?\n/);
  const stripped = stripJsCommentsPreserveLines(file.text);
  const codeLines = stripped.split(/\r?\n/);
  const hasClearInterval = /\bclearInterval\s*\(/.test(stripped);

  const pushFinding = ({ rule, category, cls, line, symbol, impact, refs }) => {
    findings.push({
      rule,
      category,
      class: cls,
      path: file.relPath,
      line,
      symbol,
      evidence: `${file.relPath}:${line}`,
      impact,
      refs
    });
  };

  // 1. Top-level / named function declarations -> dead.unused_symbol & stub.always_true_return
  for (let i = 0; i < codeLines.length; i++) {
    const lineText = codeLines[i];
    if (lineText.length > 4096) continue;
    const lineNum = i + 1;
    const declLoc = `${file.relPath}:${lineNum}`;

    // Skip exported functions (public API)
    const isExported = /^\s*export\b/.test(lineText);
    const fnMatch = lineText.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)/);
    if (fnMatch) {
      const sym = fnMatch[1];
      if (!JS_KEYWORDS.has(sym) && sym.length >= 2) {
        const refInfo = countExternalRefs(sym, declLoc, idxCtx);
        const protectedBy = [];
        if (isExported) protectedBy.push('public_api');
        if (idxCtx.dynamicDispatchedSymbols.has(sym)) protectedBy.push('cross_process_string');
        if (protectedFiles.has(file.relPath.toLowerCase())) {
          // Exported or entrypoint symbols in packaged files get extra caution only if exported/dispatched
        }
        if (truncated) protectedBy.push('truncated_scan');

        if (refInfo.count === 0 && !isExported && !idxCtx.dynamicDispatchedSymbols.has(sym)) {
          const safeToDelete = !truncated && protectedBy.length === 0;
          pushFinding({
            rule: 'dead.unused_symbol',
            category: 'dead',
            cls: safeToDelete ? 'fact' : 'hypothesis',
            line: lineNum,
            symbol: sym,
            impact: 'resource_waste',
            refs: {
              count: 0,
              checkedScopes: ['code', 'strings', 'css', 'config', 'manifest', 'docs', 'tests'],
              sample: [],
              protectedBy,
              safeToDelete
            }
          });
        }

        // Check stub.always_true_return: function whose ENTIRE body (starting right after `)`) is solely a constant return
        const fnHeaderOffset = lineText.indexOf(fnMatch[0]) + fnMatch[0].length;
        const bodySlice = lineText.slice(fnHeaderOffset) + '\n' + codeLines.slice(i + 1, Math.min(codeLines.length, i + 6)).join('\n');
        const bodyMatch = bodySlice.match(/^\s*\{([^{}]*)\}/);
        if (bodyMatch) {
          const inner = bodyMatch[1].trim();
          if (/^return\s+(?:true|false|\{\s*returnValue\s*:\s*true\s*\}|\{\s*ok\s*:\s*true\s*\})\s*;?$/i.test(inner)) {
            pushFinding({
              rule: 'stub.always_true_return',
              category: 'stub',
              cls: 'fact',
              line: lineNum,
              symbol: sym,
              impact: 'lies_to_user',
              refs: {
                count: refInfo.count,
                checkedScopes: ['code', 'strings', 'tests'],
                sample: refInfo.sample,
                protectedBy: [],
                safeToDelete: false
              }
            });
          }
        }
      }
    }

    // 2. Unassigned element/variable declaration: `var el;` or `let el;` never assigned anywhere in file
    const uninitMatch = lineText.match(/^\s*(?:var|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;\s*$/);
    if (uninitMatch) {
      const varName = uninitMatch[1];
      const assignRe = new RegExp(`\\b${varName}\\s*(?:=(?!=)|\\+=|-=|\\+\\+|--)`);
      if (!assignRe.test(stripped)) {
        const refInfo = countExternalRefs(varName, declLoc, idxCtx);
        pushFinding({
          rule: 'dead.element_never_assigned',
          category: 'dead',
          cls: truncated ? 'hypothesis' : 'fact',
          line: lineNum,
          symbol: varName,
          impact: 'lies_to_user',
          refs: {
            count: refInfo.count,
            checkedScopes: ['code', 'strings', 'docs', 'tests'],
            sample: refInfo.sample,
            protectedBy: truncated ? ['truncated_scan'] : [],
            safeToDelete: !truncated && refInfo.count === 0
          }
        });
      }
    }

    // 3. stub.empty_catch: `catch { }` or `catch (e) { }` with empty body
    if (/\bcatch\b/.test(lineText)) {
      const catchSlice = codeLines.slice(i, Math.min(codeLines.length, i + 4)).join('\n');
      if (/\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(catchSlice)) {
        pushFinding({
          rule: 'stub.empty_catch',
          category: 'stub',
          cls: 'fact',
          line: lineNum,
          symbol: `catch@${lineNum}`,
          impact: 'brick_risk',
          refs: { count: 0, checkedScopes: ['code'], sample: [], protectedBy: [], safeToDelete: false }
        });
      } else {
        // Check fragile.retry_sleep_mask: catch block masks error with setTimeout/sleep/retry without throwing
        const catchBlock = codeLines.slice(i, Math.min(codeLines.length, i + 8)).join('\n');
        const cbMatch = catchBlock.match(/\bcatch\s*(?:\([^)]*\))?\s*\{([^{}]*)\}/);
        if (cbMatch && /(?:setTimeout|sleep|retry)\s*\(/i.test(cbMatch[1]) && !/\bthrow\b/.test(cbMatch[1])) {
          pushFinding({
            rule: 'fragile.retry_sleep_mask',
            category: 'fragile',
            cls: 'hypothesis',
            line: lineNum,
            symbol: `catch_retry@${lineNum}`,
            impact: 'lies_to_user',
            refs: { count: 0, checkedScopes: ['code'], sample: [], protectedBy: [], safeToDelete: false }
          });
        }
        // Check stub.always_true_return inside catch block (e.g. catch { return { returnValue: true }; })
        if (cbMatch && /\breturn\s+(?:true|\{\s*returnValue\s*:\s*true\s*\})/i.test(cbMatch[1])) {
          pushFinding({
            rule: 'stub.always_true_return',
            category: 'stub',
            cls: 'fact',
            line: lineNum,
            symbol: `catch_return_true@${lineNum}`,
            impact: 'lies_to_user',
            refs: { count: 0, checkedScopes: ['code'], sample: [], protectedBy: [], safeToDelete: false }
          });
        }
      }
    }

    // 4. stub.unreachable_branch: `if (false)` or code immediately after `return ...;` inside same block
    if (/\bif\s*\(\s*false\s*\)/.test(lineText)) {
      pushFinding({
        rule: 'stub.unreachable_branch',
        category: 'stub',
        cls: 'fact',
        line: lineNum,
        symbol: `if_false@${lineNum}`,
        impact: 'resource_waste',
        refs: { count: 0, checkedScopes: ['code'], sample: [], protectedBy: [], safeToDelete: false }
      });
    } else if (/^\s*(?:return\b[^;{]*;|throw\b[^;{]*;)\s*$/.test(lineText) && i + 1 < codeLines.length) {
      const nextTrim = codeLines[i + 1].trim();
      const curIndent = (lineText.match(/^(\s*)/) || ['', ''])[1].length;
      const nextIndent = (codeLines[i + 1].match(/^(\s*)/) || ['', ''])[1].length;
      if (
        nextTrim &&
        nextIndent === curIndent &&
        !/^(?:\}|case\b|default\b|catch\b|finally\b|else\b|function\b|export\b|\/\*|\/\/)/.test(nextTrim)
      ) {
        pushFinding({
          rule: 'stub.unreachable_branch',
          category: 'stub',
          cls: 'fact',
          line: lineNum + 1,
          symbol: `unreachable@${lineNum + 1}`,
          impact: 'resource_waste',
          refs: { count: 0, checkedScopes: ['code'], sample: [], protectedBy: [], safeToDelete: false }
        });
      }
    }

    // 5. fragile.unstopped_timer & fragile.poll_side_effect
    if (/\bsetInterval\s*\(/.test(lineText)) {
      if (!hasClearInterval) {
        pushFinding({
          rule: 'fragile.unstopped_timer',
          category: 'fragile',
          cls: 'fact',
          line: lineNum,
          symbol: `setInterval@${lineNum}`,
          impact: 'resource_waste',
          refs: { count: 0, checkedScopes: ['code'], sample: [], protectedBy: [], safeToDelete: false }
        });
      }
      const intervalWindow = codeLines.slice(i, Math.min(codeLines.length, i + 10)).join('\n');
      if (/(?:exec(?:Sync|File)?|spawn(?:Sync)?|--reset|\bfetch\s*\([^)]*(?:POST|PUT|DELETE)|writeFile)/i.test(intervalWindow)) {
        pushFinding({
          rule: 'fragile.poll_side_effect',
          category: 'fragile',
          cls: 'hypothesis',
          line: lineNum,
          symbol: `poll_side_effect@${lineNum}`,
          impact: 'brick_risk',
          refs: { count: 0, checkedScopes: ['code'], sample: [], protectedBy: [], safeToDelete: false }
        });
      }
    }

    // 6. fragile.duplicate_listener: addEventListener inside loop/interval/update without removeEventListener or once:true
    if (/\.addEventListener\s*\(/.test(lineText) && !/once\s*:\s*true/.test(lineText) && !/removeEventListener/.test(stripped)) {
      const prevCtx = codeLines.slice(Math.max(0, i - 5), i + 1).join('\n');
      if (/\b(?:for|while|setInterval|forEach|render|update|refresh|onShow)\b/i.test(prevCtx)) {
        pushFinding({
          rule: 'fragile.duplicate_listener',
          category: 'fragile',
          cls: 'hypothesis',
          line: lineNum,
          symbol: `addEventListener@${lineNum}`,
          impact: 'resource_waste',
          refs: { count: 0, checkedScopes: ['code'], sample: [], protectedBy: [], safeToDelete: false }
        });
      }
    }

    // 7. stub.todo_fixme in raw comments (ignore scanner/rule/docs patterns mentioning TODO as regex)
    const rawLine = rawLines[i] || '';
    if (/(?:\/\/|\/\*)\s*(?:TODO|FIXME|XXX)\b/.test(rawLine)) {
      pushFinding({
        rule: 'stub.todo_fixme',
        category: 'stub',
        cls: 'fact',
        line: lineNum,
        symbol: `todo@${lineNum}`,
        impact: 'cosmetic',
        refs: { count: 0, checkedScopes: ['code'], sample: [], protectedBy: [], safeToDelete: false }
      });
    }
  }

  return findings;
}

function scanHtmlCssFile(file, idxCtx, { workspaceDir, truncated }) {
  const findings = [];
  if (TEST_PATH_RE.test(file.relPath)) return findings;
  const ext = path.extname(file.relPath).toLowerCase();
  const lines = file.text.split(/\r?\n/);

  if (HTML_EXTS.has(ext)) {
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      if (lineText.length > 4096) continue;
      const lineNum = i + 1;
      const declLoc = `${file.relPath}:${lineNum}`;

      // Check dead.unreferenced_element on HTML elements with id="..."
      for (const m of lineText.matchAll(/<(button|input|a|div|span|section|form)\b([^>]*)\bid\s*=\s*["']([^"']+)["']([^>]*)>/gi)) {
        const tag = m[1].toLowerCase();
        const attrs = `${m[2]} ${m[4]}`;
        const elId = m[3].trim();
        if (!elId || /\bonclick\s*=|\bonsubmit\s*=|\bhref\s*=/i.test(attrs)) continue;
        const refInfo = countExternalRefs(elId, declLoc, idxCtx, { countDeclarationInIdentifiers: true });
        if (refInfo.count === 0) {
          const safeToDelete = !truncated;
          findings.push({
            rule: 'dead.unreferenced_element',
            category: 'dead',
            class: safeToDelete ? 'fact' : 'hypothesis',
            path: file.relPath,
            line: lineNum,
            symbol: `#${elId}`,
            evidence: `${file.relPath}:${lineNum}`,
            impact: (tag === 'button' || tag === 'input' || tag === 'a') ? 'lies_to_user' : 'resource_waste',
            refs: {
              count: 0,
              checkedScopes: ['code', 'strings', 'css', 'config', 'manifest', 'docs', 'tests'],
              sample: [],
              protectedBy: truncated ? ['truncated_scan'] : [],
              safeToDelete
            }
          });
        }
      }

      // Check dead.broken_asset_ref on local <script src> / <link href> (clamped strictly inside workspaceDir)
      for (const m of lineText.matchAll(/<(?:script[^>]+src|link[^>]+href)\s*=\s*["']([^"']+)["']/gi)) {
        const asset = m[1].trim();
        if (!asset || /^(?:https?:|data:|mailto:|#|\/\/)/i.test(asset)) continue;
        const cleanAsset = asset.split(/[?#]/)[0];
        const htmlDir = path.dirname(path.resolve(workspaceDir, file.relPath));
        const resolved = cleanAsset.startsWith('/')
          ? path.resolve(workspaceDir, cleanAsset.slice(1))
          : path.resolve(htmlDir, cleanAsset);
        const relCheck = path.relative(path.resolve(workspaceDir), resolved);
        if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) continue;
        if (!fs.existsSync(resolved)) {
          findings.push({
            rule: 'dead.broken_asset_ref',
            category: 'dead',
            class: 'fact',
            path: file.relPath,
            line: lineNum,
            symbol: cleanAsset,
            evidence: `${file.relPath}:${lineNum}`,
            impact: 'brick_risk',
            refs: { count: 0, checkedScopes: ['code'], sample: [], protectedBy: [], safeToDelete: false }
          });
        }
      }
    }
  } else if (CSS_EXTS.has(ext)) {
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      if (lineText.length > 4096) continue;
      const lineNum = i + 1;
      const declLoc = `${file.relPath}:${lineNum}`;
      for (const m of lineText.matchAll(/#([A-Za-z_][A-Za-z0-9_-]{2,60})\s*(?:[,{:\s]|$)/g)) {
        const idName = m[1];
        // Ignore hex colors (#fff, #1a2b3c)
        if (/^[0-9a-f]{3,8}$/i.test(idName)) continue;
        if (!idxCtx.htmlIds.has(idName)) {
          const refInfo = countExternalRefs(idName, declLoc, idxCtx);
          if (refInfo.count === 0) {
            const safeToDelete = !truncated;
            findings.push({
              rule: 'dead.unused_css_selector',
              category: 'dead',
              class: safeToDelete ? 'fact' : 'hypothesis',
              path: file.relPath,
              line: lineNum,
              symbol: `#${idName}`,
              evidence: `${file.relPath}:${lineNum}`,
              impact: 'resource_waste',
              refs: {
                count: 0,
                checkedScopes: ['code', 'strings', 'css', 'docs', 'tests'],
                sample: [],
                protectedBy: truncated ? ['truncated_scan'] : [],
                safeToDelete
              }
            });
          }
        }
      }
    }
  }

  return findings;
}

function scanGenericFile(file) {
  const findings = [];
  if (TEST_PATH_RE.test(file.relPath)) return findings;
  const lines = file.text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    if (lineText.length > 4096) continue;
    const lineNum = i + 1;
    if (/(?:#|\/\/)\s*(?:TODO|FIXME|XXX)\b/.test(lineText)) {
      findings.push({
        rule: 'stub.todo_fixme',
        category: 'stub',
        class: 'fact',
        path: file.relPath,
        line: lineNum,
        symbol: `todo@${lineNum}`,
        impact: 'cosmetic',
        evidence: `${file.relPath}:${lineNum}`,
        refs: { count: 0, checkedScopes: ['code'], sample: [], protectedBy: [], safeToDelete: false }
      });
    }
    if (/^\s*except(?:\s+[^:]+)?\s*:\s*pass\s*$/.test(lineText)) {
      findings.push({
        rule: 'stub.empty_catch',
        category: 'stub',
        class: 'fact',
        path: file.relPath,
        line: lineNum,
        symbol: `except_pass@${lineNum}`,
        impact: 'brick_risk',
        evidence: `${file.relPath}:${lineNum}`,
        refs: { count: 0, checkedScopes: ['code'], sample: [], protectedBy: [], safeToDelete: false }
      });
    }
  }
  return findings;
}

/**
 * Fast live reference check used by `clean-edits-guard` surgical deletion lock (REQ-2).
 */
export function quickLiveHasRefs(workspaceDir, symbolOrFile, excludeRelPath = '') {
  const token = String(symbolOrFile || '').trim();
  if (!token || token.length < 2) return true;
  const absWs = path.resolve(workspaceDir);
  const exclNorm = normalizeXrayRelPath(excludeRelPath, absWs).toLowerCase();
  const deadline = Date.now() + 1500;
  const queue = [absWs];
  let checked = 0;

  while (queue.length > 0 && checked < 500 && Date.now() < deadline) {
    const dir = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) queue.push(path.join(dir, ent.name));
        continue;
      }
      if (!ent.isFile()) continue;
      const full = path.join(dir, ent.name);
      const rel = normalizeXrayRelPath(path.relative(absWs, full));
      if (rel.toLowerCase() === exclNorm) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (BINARY_EXTS.has(ext)) continue;
      try {
        const st = fs.statSync(full);
        if (st.size > 512 * 1024) continue;
        const text = fs.readFileSync(full, 'utf-8');
        checked++;
        if (text.includes(token)) return true;
      } catch {}
    }
  }
  return false;
}

export function runXrayScan(workspaceDir = process.cwd(), {
  maxFiles = XRAY_BUDGET_DEFAULTS.maxFiles,
  maxFileBytes = XRAY_BUDGET_DEFAULTS.maxFileBytes,
  timeboxMs = XRAY_BUDGET_DEFAULTS.timeboxMs,
  writeArtifacts = true,
  taskHash = 'unknown'
} = {}) {
  const startMs = Date.now();
  const absWs = path.resolve(workspaceDir);
  const effectiveMaxFiles = Math.max(1, Number(maxFiles) || XRAY_BUDGET_DEFAULTS.maxFiles);
  const effectiveMaxBytes = Math.max(1024, Number(maxFileBytes) || XRAY_BUDGET_DEFAULTS.maxFileBytes);
  const effectiveTimeboxMs = Math.max(50, Number(timeboxMs) || XRAY_BUDGET_DEFAULTS.timeboxMs);

  const files = [];
  const scannedPaths = new Set();
  let truncated = false;
  let truncatedReason = null;
  let filesSkippedBinary = 0;
  let filesSkippedTooLarge = 0;
  let filesSkippedUnsupported = 0;
  let filesSkippedMinified = 0;

  // Pass 1: Deterministic BFS walk within budget
  const walkQueue = [absWs];
  while (walkQueue.length > 0) {
    if (Date.now() - startMs >= effectiveTimeboxMs) {
      truncated = true;
      truncatedReason = 'timebox';
      break;
    }
    const dir = walkQueue.shift();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const ent of entries) {
      if (Date.now() - startMs >= effectiveTimeboxMs) {
        truncated = true;
        truncatedReason = 'timebox';
        break;
      }
      if (ent.isSymbolicLink()) continue;
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) {
          walkQueue.push(fullPath);
        }
        continue;
      }
      if (!ent.isFile()) continue;

      if (files.length >= effectiveMaxFiles) {
        truncated = true;
        truncatedReason = 'max_files';
        break;
      }

      const ext = path.extname(ent.name).toLowerCase();
      if (BINARY_EXTS.has(ext)) {
        filesSkippedBinary++;
        continue;
      }
      if (UNSUPPORTED_CSHARP_XAML_EXTS.has(ext)) {
        filesSkippedUnsupported++;
        continue;
      }
      if (!JS_EXTS.has(ext) && !HTML_EXTS.has(ext) && !CSS_EXTS.has(ext) && !GENERIC_SOURCE_EXTS.has(ext) && !REF_ONLY_EXTS.has(ext)) {
        continue;
      }

      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.size > effectiveMaxBytes) {
        filesSkippedTooLarge++;
        continue;
      }

      let buf;
      try {
        buf = fs.readFileSync(fullPath);
      } catch {
        continue;
      }
      if (isBinaryBuffer(buf)) {
        filesSkippedBinary++;
        continue;
      }
      const text = buf.toString('utf-8');
      if ((JS_EXTS.has(ext) || CSS_EXTS.has(ext)) && isMinifiedText(text)) {
        filesSkippedMinified++;
        continue;
      }

      const relPath = normalizeXrayRelPath(path.relative(absWs, fullPath));
      files.push({ relPath, fullPath, ext, text });
      scannedPaths.add(relPath);
    }
    if (truncated) break;
  }

  const protectedFiles = collectPackagedAndEntrypointFiles(files, absWs);
  const idxCtx = buildReferenceIndex(files);

  // Pass 2: Run adapters
  const rawFindings = [];
  for (const f of files) {
    if (Date.now() - startMs >= effectiveTimeboxMs) {
      truncated = true;
      truncatedReason = truncatedReason || 'timebox';
      break;
    }
    if (JS_EXTS.has(f.ext)) {
      rawFindings.push(...scanJsFile(f, idxCtx, { truncated, protectedFiles }));
    } else if (HTML_EXTS.has(f.ext) || CSS_EXTS.has(f.ext)) {
      rawFindings.push(...scanHtmlCssFile(f, idxCtx, { workspaceDir: absWs, truncated }));
    } else if (GENERIC_SOURCE_EXTS.has(f.ext)) {
      rawFindings.push(...scanGenericFile(f));
    }

    // Check dead.unused_file for non-test, non-protected JS/HTML/CSS files
    if ((JS_EXTS.has(f.ext) || HTML_EXTS.has(f.ext) || CSS_EXTS.has(f.ext)) && !TEST_PATH_RE.test(f.relPath)) {
      const protReasons = protectedFiles.get(f.relPath.toLowerCase());
      const baseName = path.basename(f.relPath);
      const stem = baseName.replace(/\.[^.]+$/, '');
      const baseRefs = idxCtx.stringRefs.get(baseName);
      const stemRefs = idxCtx.stringRefs.get(stem);
      const idStemRefs = idxCtx.identifierRefs.get(stem);

      const externalFileLocs = new Set();
      for (const entry of [baseRefs, stemRefs, idStemRefs]) {
        if (!entry) continue;
        for (const loc of entry.locations) {
          if (!loc.startsWith(f.relPath + ':')) externalFileLocs.add(loc);
        }
      }
      if (externalFileLocs.size === 0 && (!protReasons || protReasons.size === 0)) {
        const safeToDelete = !truncated;
        rawFindings.push({
          rule: 'dead.unused_file',
          category: 'dead',
          class: safeToDelete ? 'fact' : 'hypothesis',
          path: f.relPath,
          line: 1,
          symbol: baseName,
          evidence: `${f.relPath}:1`,
          impact: 'resource_waste',
          refs: {
            count: 0,
            checkedScopes: ['code', 'strings', 'css', 'config', 'manifest', 'docs', 'tests'],
            sample: [],
            protectedBy: truncated ? ['truncated_scan'] : [],
            safeToDelete
          }
        });
      }
    }
  }

  // Pass 2b: fragile.duplicate_literal (same non-trivial literal in >= 3 places across source files)
  for (const [literal, locs] of idxCtx.literalLocations.entries()) {
    if (locs.length >= 3) {
      const first = locs[0];
      rawFindings.push({
        rule: 'fragile.duplicate_literal',
        category: 'fragile',
        class: 'fact',
        path: first.relPath,
        line: first.line,
        symbol: literal.slice(0, 48),
        evidence: `${first.relPath}:${first.line}`,
        impact: 'cosmetic',
        refs: {
          count: locs.length,
          checkedScopes: ['code', 'strings'],
          sample: locs.slice(0, 5).map((l) => `${l.relPath}:${l.line}`),
          protectedBy: [],
          safeToDelete: false
        }
      });
    }
  }

  // Validate evidence via shared validateEvidenceRef (grade-gate.mjs) & assign stable IDs (dedup)
  const lineCountCache = new Map();
  const seenIds = new Set();
  const findings = [];

  for (const rf of rawFindings) {
    const ev = validateEvidenceRef(rf.evidence, absWs, lineCountCache);
    if (!ev.ok) continue;
    const normPath = normalizeXrayRelPath(rf.path, absWs);
    const id = computeFindingId({ rule: rf.rule, path: normPath, symbol: rf.symbol });
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    findings.push({
      id,
      rule: rf.rule,
      class: VALID_FINDING_CLASSES.has(rf.class) ? rf.class : 'hypothesis',
      category: VALID_FINDING_CATEGORIES.has(rf.category) ? rf.category : 'fragile',
      path: normPath,
      line: ev.startLine,
      symbol: rf.symbol,
      evidence: ev.normalized,
      impact: rf.impact,
      refs: rf.refs
    });
  }

  // Deterministic total sort (no localeCompare)
  findings.sort((a, b) => {
    const ia = XRAY_IMPACT_RANK[a.impact] ?? 99;
    const ib = XRAY_IMPACT_RANK[b.impact] ?? 99;
    if (ia !== ib) return ia - ib;
    const ca = a.class === 'fact' ? 0 : 1;
    const cb = b.class === 'fact' ? 0 : 1;
    if (ca !== cb) return ca - cb;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const byCategory = { dead: 0, stub: 0, fragile: 0 };
  const byClass = { fact: 0, hypothesis: 0 };
  const byImpact = { lies_to_user: 0, brick_risk: 0, resource_waste: 0, cosmetic: 0 };
  for (const f of findings) {
    if (byCategory[f.category] !== undefined) byCategory[f.category]++;
    if (byClass[f.class] !== undefined) byClass[f.class]++;
    if (byImpact[f.impact] !== undefined) byImpact[f.impact]++;
  }

  // Strict Rule 13: ONLY factual counters & evidence, ZERO fabricated percentages or quality scores
  const report = {
    taskHash: String(taskHash || 'unknown'),
    scanVersion: SCAN_VERSION,
    adapters: ['js-es5', 'html-css', 'generic'],
    unsupportedStacks: ['csharp-xaml'],
    findings,
    protectedFiles: [...protectedFiles.keys()].sort(),
    counts: {
      filesScanned: files.length,
      filesSkippedBinary,
      filesSkippedTooLarge,
      filesSkippedUnsupported,
      filesSkippedMinified,
      totalFindings: findings.length,
      byCategory,
      byClass,
      byImpact,
      durationMs: Date.now() - startMs
    },
    truncated,
    truncatedReason,
    ts: new Date().toISOString()
  };

  let ledgerStats = { appendedCount: 0, openedCount: 0, fixedCount: 0 };
  if (writeArtifacts) {
    ledgerStats = persistXrayReportAndSyncDebt({
      activeWorkspaceDir: absWs,
      report,
      scannedPaths
    });
  }

  return { report, ledgerStats, scannedPaths };
}

export function parseXrayCliArgs(argv) {
  const opts = {
    workspaceDir: process.cwd(),
    maxFiles: XRAY_BUDGET_DEFAULTS.maxFiles,
    maxFileBytes: XRAY_BUDGET_DEFAULTS.maxFileBytes,
    timeboxMs: XRAY_BUDGET_DEFAULTS.timeboxMs,
    writeArtifacts: true,
    taskHash: 'cli',
    json: false
  };
  for (const arg of argv) {
    if (arg === '--no-write') opts.writeArtifacts = false;
    else if (arg === '--json') opts.json = true;
    else if (arg.startsWith('--workspace=')) opts.workspaceDir = arg.slice('--workspace='.length);
    else if (arg.startsWith('--max-files=')) opts.maxFiles = Number.parseInt(arg.slice('--max-files='.length), 10);
    else if (arg.startsWith('--max-file-bytes=')) opts.maxFileBytes = Number.parseInt(arg.slice('--max-file-bytes='.length), 10);
    else if (arg.startsWith('--timebox-ms=')) opts.timeboxMs = Number.parseInt(arg.slice('--timebox-ms='.length), 10);
    else if (arg.startsWith('--task-hash=')) opts.taskHash = arg.slice('--task-hash='.length);
  }
  return opts;
}

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  try {
    const opts = parseXrayCliArgs(process.argv.slice(2));
    const { report, ledgerStats } = runXrayScan(opts.workspaceDir, opts);
    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      process.stdout.write(JSON.stringify({
        ok: true,
        scanVersion: report.scanVersion,
        counts: report.counts,
        truncated: report.truncated,
        truncatedReason: report.truncatedReason,
        ledgerStats
      }, null, 2) + '\n');
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`xray-scan error: ${err.message}\n`);
    process.exit(1);
  }
}
