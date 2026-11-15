/**
 * Hermes Fleet Enterprise - Gas Town Refinery Merge Queue (TASK-003, v4.0.0)
 * Automated Bors-style serial integration pipeline and bisecting runner.
 * Standard library only (Zero npm dependencies).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BRANCH_NAME_REGEX = /^[a-zA-Z0-9_\-\./]+$/;

/**
 * Validates branch ref to prevent command injection and malformed git refs.
 * @param {string} name
 * @returns {boolean}
 */
export function validateBranchName(name) {
  if (typeof name !== 'string' || !name.trim()) return false;
  const trimmed = name.trim();
  if (trimmed.startsWith('-')) return false; // Prohibit command line flags
  if (trimmed.includes('..')) return false;  // Prohibit path traversal / double-dot
  if (trimmed.includes('@{')) return false;  // Prohibit reflog traversal
  if (/[\s~^:?*\[\\]/.test(trimmed)) return false; // Git forbidden ref chars
  return BRANCH_NAME_REGEX.test(trimmed);
}

/**
 * Default git executor wrapping execFileSync with array arguments.
 */
export function defaultGitRunner(args, options = {}) {
  try {
    const stdout = execFileSync('git', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: options.cwd || process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      ...options
    });
    return { ok: true, stdout: stdout.trim(), exitCode: 0 };
  } catch (err) {
    return {
      ok: false,
      stdout: (err.stdout || '').toString().trim(),
      stderr: (err.stderr || err.message || '').toString().trim(),
      exitCode: err.status || 1
    };
  }
}

/**
 * Executes the verification test gate command.
 */
export function defaultVerificationGate(command, options = {}) {
  try {
    // Split command or execute via safe shell
    const [cmd, ...args] = Array.isArray(command) ? command : command.split(' ');
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: options.cwd || process.cwd(),
      shell: process.platform === 'win32',
      maxBuffer: 10 * 1024 * 1024,
      ...options
    });
    return { passed: true, output: stdout.trim() };
  } catch (err) {
    return {
      passed: false,
      output: ((err.stdout || '') + '\n' + (err.stderr || err.message || '')).trim()
    };
  }
}

/**
 * Bisects a failing candidate batch to isolate culprit branches.
 * @param {string[]} branches
 * @param {function(string[]): Promise<{passed: boolean, output?: string}>|function(string[]): {passed: boolean, output?: string}} testGate
 * @returns {Promise<{accepted: string[], rejected: Array<{branch: string, reason: string}>}>}
 */
export async function bisectCandidates(branches, testGate) {
  if (!branches || branches.length === 0) {
    return { accepted: [], rejected: [] };
  }

  // If the whole batch passes, all are accepted
  const fullCheck = await testGate(branches);
  if (fullCheck.passed) {
    return { accepted: [...branches], rejected: [] };
  }

  // If only one branch was in the batch and it failed, it's definitely the culprit
  if (branches.length === 1) {
    return {
      accepted: [],
      rejected: [{ branch: branches[0], reason: fullCheck.output || 'Verification gate failed' }]
    };
  }

  // Recursive bisection
  const mid = Math.floor(branches.length / 2);
  const left = branches.slice(0, mid);
  const right = branches.slice(mid);

  const leftResult = await bisectCandidates(left, testGate);

  // If left passed completely, test left + right together or bisect right
  const rightResult = await bisectCandidates(right, testGate);

  return {
    accepted: [...leftResult.accepted, ...rightResult.accepted],
    rejected: [...leftResult.rejected, ...rightResult.rejected]
  };
}

/**
 * Updates task statuses in .hermes/tasks.json (Beads Ledger).
 * Strictly maintains Anti-Premature Kill invariant: never kills subagents.
 */
export function syncTasksJson(tasksPath, acceptedBranches, rejectedBranches) {
  if (!fs.existsSync(tasksPath)) return false;
  try {
    const raw = fs.readFileSync(tasksPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.tasks)) return false;

    let modified = false;
    const acceptedSet = new Set(acceptedBranches);
    const rejectedMap = new Map(rejectedBranches.map(r => [r.branch, r.reason]));

    for (const task of data.tasks) {
      const taskBranch = task.branch || (task.targetBranch) || '';
      if (!taskBranch) continue;

      if (acceptedSet.has(taskBranch)) {
        task.status = 'DONE';
        task.mergedAt = new Date().toISOString();
        delete task.mergeError;
        modified = true;
      } else if (rejectedMap.has(taskBranch)) {
        task.status = 'FAILED';
        task.mergeError = rejectedMap.get(taskBranch);
        task.rejectedAt = new Date().toISOString();
        modified = true;
      }
    }

    if (modified) {
      data.updatedAt = new Date().toISOString();
      fs.writeFileSync(tasksPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
      return true;
    }
    return false;
  } catch {
    return false; // Fail-open: do not throw on tasks.json parse error
  }
}

/**
 * Main Refinery Merge Queue orchestrator.
 */
export async function runRefinery(options = {}) {
  const {
    branches = [],
    targetBranch = 'main',
    stagingPrefix = 'hermes/refinery-staging',
    verifyCommand = 'npm test',
    tasksJsonPath = path.join(process.cwd(), '.hermes', 'tasks.json'),
    gitRunner = defaultGitRunner,
    verificationGate = defaultVerificationGate,
    cwd = process.cwd()
  } = options;

  // 1. Validate branch names
  const validBranches = [];
  const invalidBranches = [];
  for (const b of branches) {
    if (validateBranchName(b)) {
      validBranches.push(b);
    } else {
      invalidBranches.push({ branch: b, reason: 'Invalid branch name (rejected by security filter)' });
    }
  }

  if (validBranches.length === 0) {
    return {
      success: invalidBranches.length === 0,
      accepted: [],
      rejected: invalidBranches,
      message: 'No valid branches to merge'
    };
  }

  // 2. Identify current branch to guarantee atomic rollback
  const initialBranchRes = gitRunner(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  const initialBranch = initialBranchRes.ok ? initialBranchRes.stdout : targetBranch;

  const timestamp = Date.now();
  const stagingBranch = `${stagingPrefix}-${timestamp}`;

  // Helper to safely abort merge and return to initial branch
  const safeRollback = () => {
    gitRunner(['merge', '--abort'], { cwd });
    gitRunner(['checkout', initialBranch], { cwd });
    gitRunner(['branch', '-D', stagingBranch], { cwd });
  };

  try {
    // 3. Create staging branch from targetBranch
    const createStaging = gitRunner(['checkout', '-b', stagingBranch, targetBranch], { cwd });
    if (!createStaging.ok) {
      throw new Error(`Failed to create staging branch: ${createStaging.stderr}`);
    }

    // 4. Define test gate evaluator that merges a given subset and runs verification
    const evaluateSubset = async (candidateSubset) => {
      // Reset staging to targetBranch
      gitRunner(['reset', '--hard', targetBranch], { cwd });

      for (const branch of candidateSubset) {
        const mergeRes = gitRunner(['merge', '--no-ff', '--no-commit', branch], { cwd });
        if (!mergeRes.ok) {
          gitRunner(['merge', '--abort'], { cwd });
          return {
            passed: false,
            output: `Merge conflict or error on branch '${branch}': ${mergeRes.stderr}`
          };
        }
      }

      // Run verification gate
      const gateRes = verificationGate(verifyCommand, { cwd });
      return gateRes;
    };

    // 5. Run Bors-style bisecting pipeline
    const bisection = await bisectCandidates(validBranches, evaluateSubset);
    const finalRejected = [...invalidBranches, ...bisection.rejected];

    // 6. If accepted branches exist, finalize merge into targetBranch
    if (bisection.accepted.length > 0) {
      gitRunner(['reset', '--hard', targetBranch], { cwd });
      for (const branch of bisection.accepted) {
        gitRunner(['merge', '--no-ff', '-m', `refinery: merge ${branch}`, branch], { cwd });
      }

      // Fast-forward or merge staging to targetBranch
      gitRunner(['checkout', targetBranch], { cwd });
      gitRunner(['merge', '--ff-only', stagingBranch], { cwd });
    } else {
      // Nothing accepted, return to initial branch
      gitRunner(['checkout', initialBranch], { cwd });
    }

    // Cleanup staging branch
    gitRunner(['branch', '-D', stagingBranch], { cwd });

    // 7. Sync Beads ledger (.hermes/tasks.json)
    if (fs.existsSync(tasksJsonPath)) {
      syncTasksJson(tasksJsonPath, bisection.accepted, finalRejected);
    }

    return {
      success: true,
      accepted: bisection.accepted,
      rejected: finalRejected,
      targetBranch,
      message: `Refinery complete: ${bisection.accepted.length} accepted, ${finalRejected.length} rejected`
    };
  } catch (err) {
    safeRollback();
    return {
      success: false,
      accepted: [],
      rejected: validBranches.map(b => ({ branch: b, reason: err.message })),
      error: err.message
    };
  }
}

// CLI Execution entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const branchesIdx = args.indexOf('--branches');
  if (branchesIdx === -1 || branchesIdx === args.length - 1) {
    console.log('Usage: node scripts/refinery.mjs --branches <branch1> [branch2...] [--target <targetBranch>] [--verify <command>]');
    process.exit(1);
  }

  const branches = [];
  for (let i = branchesIdx + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break;
    branches.push(args[i]);
  }

  let target = 'main';
  const targetIdx = args.indexOf('--target');
  if (targetIdx !== -1 && targetIdx < args.length - 1) {
    target = args[targetIdx + 1];
  }

  let verify = 'npm test';
  const verifyIdx = args.indexOf('--verify');
  if (verifyIdx !== -1 && verifyIdx < args.length - 1) {
    verify = args[verifyIdx + 1];
  }

  runRefinery({ branches, targetBranch: target, verifyCommand: verify })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Refinery fatal error:', err);
      process.exit(1);
    });
}
