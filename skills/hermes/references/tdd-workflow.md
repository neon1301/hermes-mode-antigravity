# 🧪 ECC TDD & Autonomous Build-Repair Loop

This document defines the Test-Driven Development (TDD) and Self-Repair standards for the Hermes fleet.

> [!IMPORTANT]
> Full QA test verification methodology lives in **`skills/qa-test-automation/SKILL.md`** ([qa-test-automation](../../qa-test-automation/SKILL.md)), including [tdd-debugging-anti-patterns.md](../../qa-test-automation/references/tdd-debugging-anti-patterns.md) (Iron Law TDD, Systematic Root-Cause Debugging, CRAP-score triage) and [property-e2e-concurrency.md](../../qa-test-automation/references/property-e2e-concurrency.md) (Property-Based invariants, E2E, race/leak tests).

---

## 1. The Red-Green-Refactor Protocol

Before writing implementation code for critical backend APIs, algorithms, or binary parsers:
1. **Red (Specification Test):**
   - Write a unit/integration test reflecting the agreed Contract Proposal.
   - Verify the test fails for the expected reason (e.g. method not implemented or schema mismatch).
2. **Green (Minimal Implementation):**
   - Write the cleanest, most direct code required to make the test pass.
   - Run the test runner to confirm the test is green.
3. **Refactor (Clean Code & Optimization):**
   - Optimize performance (N+1 queries, memory allocations).
   - Ensure clean resource disposal.
   - Verify tests remain green throughout refactoring.

---

## 2. Autonomous Build & Test Repair Loop

When a build fails or tests fail during development, agents MUST NOT immediately yield or ask the user for trivial fixes. Instead, follow the autonomous repair loop:

```text
[Build/Test Failure]
         │
         ▼
[1. Parse Error Diagnostics] ──> Identify exact file, line, and compiler/test error code
         │
         ▼
[2. Root Cause Hypothesis]   ──> Distinguish between syntax, missing import, nullability, or contract breach
         │
         ▼
[3. Targeted Remediation]    ──> Apply single isolated correction (do not rewrite unrelated modules)
         │
         ▼
[4. Re-Verify]               ──> Rerun compiler / test runner (Max 3 autonomous attempts)
         │
         ▼
[Pass or Escalate]           ──> If resolved: notify QA; if blocked: escalate with full diagnostics to Lead
```
