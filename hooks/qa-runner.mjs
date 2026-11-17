/**
 * Hermes Fleet Enterprise - Mechanical QA Runner (REQ-1, REQ-2, REQ-3 / B2)
 * Detects project stack (dotnet/pytest/npm/go), executes project test runner,
 * captures real process exit codes, runs mutation testing MVP (advisory-first),
 * and deterministically writes .hermes/qa-verdict.json & .hermes/mutation-report.json.
 *
 * Adheres strictly to:
 * - Rule 8: Clean edits & deterministic file generation
 * - Rule 9: Dynamic configuration (env & .hermes/config.json)
 * - Rule 13: Data Honesty (zero fabricated metrics, unavailable toolchain reported honestly)
 * - Rule 14: Report Freshness (ISO-8601 timestamps)
 */

import { execFileSync, execSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchema } from '../skills/compliance-policy-as-code/scripts/contract-validator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Reads project configuration from .hermes/config.json with environment fallbacks.
 */
export function getHermesConfig(workspaceDir = process.cwd()) {
  const configPath = path.join(workspaceDir, '.hermes', 'config.json');
  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        config = parsed;
      }
    }
  } catch {}

  const envExclude = process.env.HERMES_EXCLUDE_PATHS
    ? process.env.HERMES_EXCLUDE_PATHS.split(',').map(s => s.trim()).filter(Boolean)
    : null;

  const envRequireReqLedger = process.env.HERMES_REQUIRE_REQ_LEDGER !== undefined
    ? (process.env.HERMES_REQUIRE_REQ_LEDGER !== '0' && process.env.HERMES_REQUIRE_REQ_LEDGER !== 'false')
    : null;

  const rawQaMode = process.env.HERMES_QA_VERDICT_MODE || config.qaVerdictMode || 'artifact';
  const qaVerdictMode = (rawQaMode === 'artifact' || rawQaMode === 'legacy') ? rawQaMode : 'artifact';

  return {
    qaVerdictMode,
    mutationMode: process.env.HERMES_MUTATION_MODE || config.mutationMode || 'advisory',
    mutationThreshold: Number(process.env.HERMES_MUTATION_THRESHOLD || config.mutationThreshold || 0.70),
    mutationBudget: Number(process.env.HERMES_MUTATION_BUDGET || config.mutationBudget || 20),
    testTimeoutMs: Number(process.env.HERMES_TEST_TIMEOUT_MS || config.testTimeoutMs || 180000),
    qaVerdictTtlMs: Number(process.env.HERMES_QA_VERDICT_TTL_MS || config.qaVerdictTtlMs || 300000),
    baseRef: process.env.HERMES_BASE_REF || config.baseRef || null,
    excludePaths: envExclude || config.excludePaths || ['.hermes'],
    requireReqLedger: envRequireReqLedger !== null ? envRequireReqLedger : (typeof config.requireReqLedger === 'boolean' ? config.requireReqLedger : true)
  };
}

/**
 * Resolves the base commit for reviewing changes.
 * Priority:
 * 1. options.baseRef
 * 2. process.env.HERMES_BASE_REF
 * 3. .hermes/config.json -> baseRef
 * 4. git merge-base HEAD @{u} (upstream tracking branch)
 * 5. git merge-base HEAD with candidate branches: origin/main, origin/master, main, master
 * 6. null (no upstream or candidate branch found)
 */
export function resolveBaseRef(workspaceDir = process.cwd(), options = {}) {
  const explicit = options.baseRef || process.env.HERMES_BASE_REF;
  if (explicit) {
    try {
      execFileSync('git', ['rev-parse', '--verify', `${explicit}^{commit}`], {
        cwd: workspaceDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      return explicit;
    } catch {
      return null;
    }
  }

  const cfg = getHermesConfig(workspaceDir);
  if (cfg.baseRef) {
    try {
      execFileSync('git', ['rev-parse', '--verify', `${cfg.baseRef}^{commit}`], {
        cwd: workspaceDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      return cfg.baseRef;
    } catch {
      return null;
    }
  }

  // 1. Upstream tracking branch
  try {
    const upstreamMb = execFileSync('git', ['merge-base', 'HEAD', '@{u}'], {
      cwd: workspaceDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (upstreamMb) return upstreamMb;
  } catch {}

  // 2. Current branch name
  let currentBranch = '';
  try {
    currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: workspaceDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {}

  // 3. Candidate remote and local branches
  const candidates = ['origin/main', 'origin/master'];
  if (currentBranch !== 'main') candidates.push('main');
  if (currentBranch !== 'master') candidates.push('master');

  for (const candidate of candidates) {
    try {
      execFileSync('git', ['rev-parse', '--verify', `${candidate}^{commit}`], {
        cwd: workspaceDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      const mb = execFileSync('git', ['merge-base', 'HEAD', candidate], {
        cwd: workspaceDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      if (mb) return mb;
    } catch {}
  }

  return null;
}

/**
 * Helper to check if a file path is covered by an excluded prefix (Rule 9).
 */
export function isPathExcluded(filePath, excludePaths = ['.hermes']) {
  if (!filePath) return false;
  const norm = filePath.replace(/\\/g, '/').replace(/^\.?\//, '');
  return excludePaths.some((ex) => {
    const normEx = ex.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/$/, '');
    return norm === normEx || norm.startsWith(normEx + '/') || norm.includes('/' + normEx + '/');
  });
}

/**
 * Computes deterministic SHA-256 diffHash of changes under review.
 * Binds verdict to committed and uncommitted changes relative to base.
 * Single source of truth for qa-runner, qa-gate, and recovery journal.
 * Hermetically excludes .hermes/ and configured internal paths (REQ-1 / P0).
 */
export function computeWorkingTreeDiffHash(workspaceDir = process.cwd(), options = {}) {
  try {
    const cfg = getHermesConfig(workspaceDir);
    const excludePaths = options.excludePaths || cfg.excludePaths || ['.hermes'];
    const pathspecExcludes = excludePaths.map((p) => `:(exclude)${p.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/$/, '')}`);
    const baseRef = resolveBaseRef(workspaceDir, options);

    const rawStatus = execFileSync('git', ['status', '--porcelain', '-uall'], {
      cwd: workspaceDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    // Filter status lines to exclude Hermes internal artifacts (.hermes, etc.)
    const statusLines = rawStatus ? rawStatus.split(/\r?\n/).filter((line) => {
      const match = line.match(/^..\s+(.*)$/);
      if (!match) return true;
      let p = match[1].trim();
      if (p.includes(' -> ')) p = p.split(' -> ')[1].trim();
      p = p.replace(/^"|"$/g, '');
      return !isPathExcluded(p, excludePaths);
    }) : [];
    const status = statusLines.join('\n');

    // Collect untracked files content to avoid blind spots, ignoring excluded paths
    let untrackedPayload = '';
    const untracked = statusLines
      .filter((l) => l.startsWith('?? '))
      .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
      .filter((p) => !isPathExcluded(p, excludePaths))
      .sort();

    for (const f of untracked) {
      try {
        const full = path.resolve(workspaceDir, f);
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
          const fileHash = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
          untrackedPayload += `\n${f}:${fileHash}`;
        }
      } catch {}
    }

    if (baseRef) {
      // Base resolved: compare base against working tree excluding internal paths
      const diffArgs = ['diff', baseRef, '--', '.', ...pathspecExcludes];
      const diff = execFileSync('git', diffArgs, {
        cwd: workspaceDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 16 * 1024 * 1024
      });

      let payload;
      if (!status && !untrackedPayload) {
        // Clean working tree: payload is diff directly (matches git diff base..HEAD character-by-character)
        payload = diff;
      } else {
        payload = (status ? status + '\n' : '') + diff + untrackedPayload;
      }

      if (!payload) {
        return 'e3b0c44298fc1c14'; // SHA-256 of empty diff
      }

      return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
    }

    // Fallback when no base branch can be resolved (e.g. detached HEAD / standalone repo without remotes)
    // Uses HEAD tree-hash + working tree diff to guarantee different commits produce different hashes
    let headTree = '';
    try {
      headTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
        cwd: workspaceDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
    } catch {}

    let diff = '';
    try {
      const fallbackDiffArgs = ['diff', 'HEAD', '--', '.', ...pathspecExcludes];
      diff = execFileSync('git', fallbackDiffArgs, {
        cwd: workspaceDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 16 * 1024 * 1024
      });
    } catch {}

    const payload = (headTree ? headTree + '\n' : '') + (status ? status + '\n' : '') + diff + untrackedPayload;
    if (!payload) {
      return 'e3b0c44298fc1c14';
    }
    return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
  } catch {
    return '0000000000000000';
  }
}

export const computeVerdictDiffHash = computeWorkingTreeDiffHash;

/**
 * Detects project stack and standard test execution command.
 */
export function detectProjectStack(workspaceDir = process.cwd()) {
  // 1. Check for Node.js / npm
  const pkgPath = path.join(workspaceDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name === 'hermes-fleet' || pkg.name === 'hermes') {
        return {
          stack: 'node',
          isSelfRepo: true,
          command: 'node',
          args: ['hooks/test-runner.mjs'],
          description: 'Hermes Fleet Plugin Test Suite'
        };
      }
      if (pkg.scripts?.test) {
        return {
          stack: 'npm',
          isSelfRepo: false,
          command: 'npm',
          args: ['test'],
          description: 'NPM package test script'
        };
      }
    } catch {}
  }

  // 2. Check for .NET (csproj / sln)
  try {
    const files = fs.readdirSync(workspaceDir);
    const hasSlnOrProj = files.some(f => f.endsWith('.sln') || f.endsWith('.csproj') || f.endsWith('.fsproj'));
    if (hasSlnOrProj) {
      return {
        stack: 'dotnet',
        isSelfRepo: false,
        command: 'dotnet',
        args: ['test'],
        description: '.NET solution/project test suite'
      };
    }
  } catch {}

  // 3. Check for Python / pytest
  const pyFiles = ['pytest.ini', 'pyproject.toml', 'setup.cfg', 'conftest.py'];
  const hasPyTestConfig = pyFiles.some(f => fs.existsSync(path.join(workspaceDir, f)));
  const hasTestsDir = fs.existsSync(path.join(workspaceDir, 'tests'));
  if (hasPyTestConfig || hasTestsDir) {
    return {
      stack: 'pytest',
      isSelfRepo: false,
      command: 'pytest',
      args: [],
      description: 'Python pytest suite'
    };
  }

  // 4. Check for Go
  if (fs.existsSync(path.join(workspaceDir, 'go.mod'))) {
    return {
      stack: 'go',
      isSelfRepo: false,
      command: 'go',
      args: ['test', './...'],
      description: 'Go test package suite'
    };
  }

  return {
    stack: 'unknown',
    isSelfRepo: false,
    command: null,
    args: [],
    description: 'Unknown project stack'
  };
}

/**
 * Checks availability of mutation testing tooling.
 */
export function detectMutationTool(workspaceDir = process.cwd(), stack = 'unknown') {
  try {
    if (stack === 'node' || stack === 'npm') {
      const localStryker = path.join(workspaceDir, 'node_modules', '.bin', process.platform === 'win32' ? 'stryker.cmd' : 'stryker');
      if (fs.existsSync(localStryker)) {
        return { available: true, tool: 'stryker', command: localStryker, args: ['run'] };
      }
      const res = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['stryker', '--version'], {
        cwd: workspaceDir,
        encoding: 'utf-8',
        stdio: 'ignore'
      });
      if (res.status === 0) {
        return { available: true, tool: 'stryker', command: 'npx', args: ['stryker', 'run'] };
      }
    } else if (stack === 'dotnet') {
      const res = spawnSync('dotnet', ['stryker', '--version'], {
        cwd: workspaceDir,
        encoding: 'utf-8',
        stdio: 'ignore'
      });
      if (res.status === 0) {
        return { available: true, tool: 'dotnet-stryker', command: 'dotnet', args: ['stryker'] };
      }
    } else if (stack === 'pytest') {
      const res = spawnSync('mutmut', ['--version'], {
        cwd: workspaceDir,
        encoding: 'utf-8',
        stdio: 'ignore'
      });
      if (res.status === 0) {
        return { available: true, tool: 'mutmut', command: 'mutmut', args: ['run'] };
      }
    }
  } catch {}

  return { available: false, tool: null, command: null, args: [] };
}

/**
 * Parses mutation report artifacts from disk for Stryker/Stryker.NET (Rule 13).
 * Enforces mtime freshness against run start timestamp (REQ-6).
 */
export function parseMutationReport(workspaceDir, tool, minTimestampMs = 0) {
  try {
    // 1. Stryker (Node)
    const strykerJsonPath = path.join(workspaceDir, 'reports', 'mutation', 'mutation.json');
    if (fs.existsSync(strykerJsonPath)) {
      if (minTimestampMs > 0) {
        const stat = fs.statSync(strykerJsonPath);
        if (stat.mtimeMs < minTimestampMs) {
          return { found: false, stale: true, reason: 'Stale mutation report: file modified before execution start', killed: 0, survived: 0, escaped: [], mutantsTotal: 0 };
        }
      }
      const data = JSON.parse(fs.readFileSync(strykerJsonPath, 'utf-8'));
      let killed = 0;
      let survived = 0;
      const escaped = [];
      if (data.files && typeof data.files === 'object') {
        for (const [file, fData] of Object.entries(data.files)) {
          if (Array.isArray(fData?.mutants)) {
            for (const m of fData.mutants) {
              const status = String(m?.status || '');
              if (status === 'Killed' || status === 'Timeout') {
                killed++;
              } else if (status === 'Survived' || status === 'NoCoverage') {
                survived++;
                escaped.push(`${file}:${m?.id || m?.mutatorName || 'mutant'}`);
              }
            }
          }
        }
      }
      return { found: true, killed, survived, escaped, mutantsTotal: killed + survived };
    }

    // 2. Stryker.NET (.NET)
    const strykerOutputDir = path.join(workspaceDir, 'StrykerOutput');
    if (fs.existsSync(strykerOutputDir)) {
      const findReports = (dir) => {
        let results = [];
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, item.name);
          if (item.isDirectory()) {
            results.push(...findReports(full));
          } else if (item.name === 'mutation-report.json') {
            results.push(full);
          }
        }
        return results;
      };
      const reports = findReports(strykerOutputDir);
      if (reports.length > 0) {
        reports.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
        const newest = reports[0];
        if (minTimestampMs > 0) {
          const stat = fs.statSync(newest);
          if (stat.mtimeMs < minTimestampMs) {
            return { found: false, stale: true, reason: 'Stale mutation report: file modified before execution start', killed: 0, survived: 0, escaped: [], mutantsTotal: 0 };
          }
        }
        const data = JSON.parse(fs.readFileSync(newest, 'utf-8'));
        let killed = 0;
        let survived = 0;
        const escaped = [];
        if (data.files) {
          for (const [file, fData] of Object.entries(data.files)) {
            if (Array.isArray(fData?.mutants)) {
              for (const m of fData.mutants) {
                const s = String(m?.status || '');
                if (s === 'Killed' || s === 'Timeout') killed++;
                else if (s === 'Survived' || s === 'NoCoverage') {
                  survived++;
                  escaped.push(`${file}:${m?.id || 'mutant'}`);
                }
              }
            }
          }
        }
        return { found: true, killed, survived, escaped, mutantsTotal: killed + survived };
      }
    }
  } catch {}

  return { found: false, killed: 0, survived: 0, escaped: [], mutantsTotal: 0 };
}

/**
 * Executes mutation testing MVP (advisory-first, Rule 13 honest reporting).
 */
export function runMutationTesting(workspaceDir = process.cwd(), options = {}) {
  const diffHash = options.diffHash || computeWorkingTreeDiffHash(workspaceDir);
  const cfg = getHermesConfig(workspaceDir);
  const stack = options.stack || detectProjectStack(workspaceDir).stack;
  const toolCheck = detectMutationTool(workspaceDir, stack);

  const hermesDir = path.join(workspaceDir, '.hermes');
  if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
  const reportPath = path.join(hermesDir, 'mutation-report.json');

  if (!toolCheck.available) {
    const unavailableReport = {
      status: 'unavailable',
      reason: `Mutation testing toolchain not available for stack '${stack}' (Rule 13)`,
      mutantsTotal: 0,
      killed: 0,
      survived: 0,
      escaped: [],
      killRate: null,
      threshold: cfg.mutationThreshold,
      tool: 'none',
      diffHash,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(reportPath, JSON.stringify(unavailableReport, null, 2) + '\n', 'utf-8');
    return unavailableReport;
  }

  // Execute mutation testing with budget bounds
  try {
    const runStartMs = Date.now();
    const budget = options.budget || cfg.mutationBudget;
    const procArgs = [...toolCheck.args, `--max-concurrent-test-runners=2`];
    const res = spawnSync(toolCheck.command, procArgs, {
      cwd: workspaceDir,
      encoding: 'utf-8',
      shell: true,
      timeout: 60000 // 60s mutation budget timeout
    });

    if (res.error || (res.status !== 0 && res.status !== null)) {
      const failedReport = {
        status: 'unavailable',
        reason: res.error ? res.error.message : `Mutation testing process exited with status ${res.status}`,
        mutantsTotal: 0,
        killed: 0,
        survived: 0,
        escaped: [],
        killRate: null,
        threshold: cfg.mutationThreshold,
        tool: toolCheck.tool,
        diffHash,
        timestamp: new Date().toISOString()
      };
      fs.writeFileSync(reportPath, JSON.stringify(failedReport, null, 2) + '\n', 'utf-8');
      return failedReport;
    }

    const parsed = parseMutationReport(workspaceDir, toolCheck.tool, runStartMs);
    if (!parsed.found) {
      const notFoundReport = {
        status: 'unavailable',
        reason: parsed.stale ? parsed.reason : `Mutation report artifact not found after executing ${toolCheck.tool}`,
        mutantsTotal: 0,
        killed: 0,
        survived: 0,
        escaped: [],
        killRate: null,
        threshold: cfg.mutationThreshold,
        tool: toolCheck.tool,
        diffHash,
        timestamp: new Date().toISOString()
      };
      fs.writeFileSync(reportPath, JSON.stringify(notFoundReport, null, 2) + '\n', 'utf-8');
      return notFoundReport;
    }

    if (parsed.mutantsTotal === 0) {
      const zeroMutantsReport = {
        status: 'no-mutants',
        reason: 'Zero mutants generated by mutation tool for the reviewed files (Rule 13)',
        mutantsTotal: 0,
        killed: 0,
        survived: 0,
        escaped: [],
        killRate: null,
        threshold: cfg.mutationThreshold,
        tool: toolCheck.tool,
        diffHash,
        timestamp: new Date().toISOString()
      };
      fs.writeFileSync(reportPath, JSON.stringify(zeroMutantsReport, null, 2) + '\n', 'utf-8');
      return zeroMutantsReport;
    }

    const killRate = parsed.killed / parsed.mutantsTotal;
    const pass = killRate >= cfg.mutationThreshold && parsed.survived === 0;

    const report = {
      status: pass ? 'PASS' : (cfg.mutationMode === 'strict' ? 'REJECT' : 'advisory'),
      mutantsTotal: parsed.mutantsTotal,
      killed: parsed.killed,
      survived: parsed.survived,
      escaped: parsed.escaped,
      killRate,
      threshold: cfg.mutationThreshold,
      tool: toolCheck.tool,
      diffHash,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    return report;
  } catch (err) {
    const errorReport = {
      status: 'unavailable',
      reason: `Mutation execution failed: ${err.message}`,
      mutantsTotal: 0,
      killed: 0,
      survived: 0,
      escaped: [],
      killRate: null,
      threshold: cfg.mutationThreshold,
      tool: toolCheck.tool,
      diffHash,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(reportPath, JSON.stringify(errorReport, null, 2) + '\n', 'utf-8');
    return errorReport;
  }
}

/**
 * Main mechanical QA execution engine.
 * Runs tests, captures real exit codes, executes mutation check, writes .hermes/qa-verdict.json.
 */
export function runQaSuite(workspaceDir = process.cwd(), options = {}) {
  const cfg = getHermesConfig(workspaceDir);
  const diffHash = options.diffHash || computeWorkingTreeDiffHash(workspaceDir);
  const detected = detectProjectStack(workspaceDir);
  const testExitCodes = [];

  if (options.testExitCodes) {
    // Explicit exit codes override for test harnesses
    testExitCodes.push(...options.testExitCodes);
  } else if (detected.command) {
    console.log(`[QA RUNNER] Executing ${detected.description}: ${detected.command} ${detected.args.join(' ')}`);
    const res = spawnSync(detected.command, detected.args, {
      cwd: workspaceDir,
      encoding: 'utf-8',
      shell: true,
      stdio: options.silent ? 'ignore' : 'inherit',
      timeout: cfg.testTimeoutMs
    });
    const code = res.status !== null ? res.status : (res.error ? 1 : 0);
    testExitCodes.push(code);
  } else {
    console.warn(`[QA RUNNER] Warning: No automated test runner detected for workspace '${workspaceDir}'.`);
    testExitCodes.push(1);
  }

  // Determine overall test status
  const allZero = testExitCodes.length > 0 && testExitCodes.every(c => c === 0);

  // Run mutation testing MVP (advisory-first)
  let mutationReport = null;
  if (options.runMutations || options.mutation) {
    mutationReport = typeof options.mutation === 'object'
      ? options.mutation
      : runMutationTesting(workspaceDir, { diffHash, stack: detected.stack });
  }

  // Resolve requirements ledger (REQ-1: fail-closed by default, zero fabrication)
  let reqLedger = options.reqLedger;
  if (!reqLedger && process.env.HERMES_REQ_LEDGER) {
    reqLedger = process.env.HERMES_REQ_LEDGER.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(reqLedger) || reqLedger.length === 0) {
    try {
      const tasksPath = path.join(workspaceDir, '.hermes', 'tasks.json');
      if (fs.existsSync(tasksPath)) {
        const tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
        if (Array.isArray(tasksData.tasks)) {
          reqLedger = tasksData.tasks.filter(t => t.status === 'DONE' && t.id).map(t => t.id);
        }
      }
    } catch {}
    if (!Array.isArray(reqLedger)) reqLedger = [];
  }

  const hasReqs = reqLedger.length > 0;
  let status = allZero ? 'PASS' : 'REJECT';

  const requireReqLedger = options.requireReqLedger !== undefined
    ? Boolean(options.requireReqLedger)
    : cfg.requireReqLedger;

  if (!hasReqs) {
    if (requireReqLedger) {
      status = 'REJECT';
      console.error(
        `[QA RUNNER ERROR] Requirement ledger is empty: missing or incomplete .hermes/tasks.json (no tasks with status: "DONE"). ` +
        `The Lead orchestrator must bootstrap .hermes/tasks.json with REQ-1..N during decomposition and update task statuses to DONE upon completion, ` +
        `or pass --reqLedger=REQ-1,... / set HERMES_REQ_LEDGER. (To opt out in projects without requirement tracking, set requireReqLedger: false in .hermes/config.json [reduced assurance]).`
      );
    } else {
      console.warn(`[QA RUNNER WARNING] requireReqLedger is disabled: running with empty requirement ledger (reduced assurance).`);
    }
  }

  // Strict mutation mode check
  if (cfg.mutationMode === 'strict' && mutationReport) {
    const mutStatus = mutationReport.status;
    const survived = Number(mutationReport.survived ?? 0);
    const mutantsTotal = Number(mutationReport.mutantsTotal ?? 0);
    if (mutStatus !== 'PASS' || mutantsTotal === 0 || survived > 0 || mutationReport.killRate === null) {
      status = 'REJECT';
    }
  }

  const hermesDir = path.join(workspaceDir, '.hermes');
  if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
  const verdictPath = path.join(hermesDir, 'qa-verdict.json');

  const verdict = {
    schemaVersion: '1.1.0',
    runner: 'mechanical',
    status,
    diffHash,
    testExitCodes,
    reqLedger,
    agent: 'viktor',
    reqsVerified: reqLedger,
    timestamp: new Date().toISOString()
  };

  if (!requireReqLedger && !hasReqs) {
    verdict.reducedAssurance = 'empty-ledger-opt-out';
  }

  const convId = options.conversationId || process.env.HERMES_CONVERSATION_ID || process.env.AGY_CONVERSATION_ID || null;
  if (convId) {
    verdict.conversationId = String(convId);
  }

  const tm = options.turnMarker !== undefined
    ? options.turnMarker
    : (process.env.HERMES_TURN_MARKER !== undefined ? process.env.HERMES_TURN_MARKER : null);
  if (tm !== null && tm !== undefined) {
    verdict.turnMarker = typeof tm === 'number' ? tm : (Number.isInteger(Number(tm)) ? Number(tm) : String(tm));
  }

  const vUuid = options.viktorUuid || process.env.HERMES_VIKTOR_UUID || null;
  if (vUuid) {
    verdict.viktorUuid = String(vUuid);
  }

  if (options.ackToken) {
    verdict.ackToken = String(options.ackToken);
  } else {
    verdict.ackToken = crypto.randomUUID();
  }

  if (mutationReport) {
    verdict.mutation = mutationReport;
  }

  // Validate contract schema before writing (Fail-closed)
  try {
    const schemaPath = path.join(rootDir, 'skills', 'compliance-policy-as-code', 'references', 'schemas', 'qa-verdict.schema.json');
    if (fs.existsSync(schemaPath)) {
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      const validation = validateSchema(verdict, schema);
      if (!validation.valid) {
        throw new Error(`Generated qa-verdict fails schema: ${JSON.stringify(validation.errors)}`);
      }
    }
  } catch (err) {
    console.error(`[QA RUNNER ERROR] Contract schema validation failed: ${err.message}`);
    throw err;
  }

  fs.writeFileSync(verdictPath, JSON.stringify(verdict, null, 2) + '\n', 'utf-8');
  console.log(`[QA RUNNER] Successfully wrote mechanical verdict: ${verdictPath} (status=${verdict.status})`);
  return verdict;
}

// CLI invocation
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  try {
    const args = process.argv.slice(2);
    const runMut = args.includes('--mutation');
    const reqArg = args.find(a => a.startsWith('--reqLedger='));
    const reqLedger = reqArg ? reqArg.slice('--reqLedger='.length).split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const viktorUuidArg = args.find(a => a.startsWith('--viktorUuid='));
    const viktorUuid = viktorUuidArg ? viktorUuidArg.slice('--viktorUuid='.length).trim() : undefined;
    const convArg = args.find(a => a.startsWith('--conversationId='));
    const conversationId = convArg ? convArg.slice('--conversationId='.length).trim() : undefined;
    const turnArg = args.find(a => a.startsWith('--turnMarker='));
    const turnMarker = turnArg ? turnArg.slice('--turnMarker='.length).trim() : undefined;
    const reqOptArg = args.find(a => a.startsWith('--requireReqLedger='));
    const requireReqLedger = reqOptArg ? reqOptArg.slice('--requireReqLedger='.length).trim() === 'true' : undefined;
    const verdict = runQaSuite(process.cwd(), { runMutations: runMut, reqLedger, viktorUuid, conversationId, turnMarker, requireReqLedger });
    console.log(`\nQA VERDICT SUMMARY: runner=${verdict.runner} status=${verdict.status} exitCodes=[${verdict.testExitCodes.join(',')}] diffHash=${verdict.diffHash}`);
    if (verdict.status !== 'PASS') process.exit(1);
  } catch (err) {
    console.error(`[QA RUNNER FATAL] ${err.message}`);
    process.exit(1);
  }
}
