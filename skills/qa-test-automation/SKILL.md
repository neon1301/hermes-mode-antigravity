---
name: qa-test-automation
description: Strict QA verification, TDD Iron Law, systematic root-cause debugging, test anti-pattern elimination, property-based invariants, E2E automation, and concurrency/leak testing. Use when designing test suites, debugging bugs, or executing Viktor's [QA PASS] / [QA REJECT] integration barrier.
---

# QA Automation, TDD & Systematic Verification Skill

This skill guides **🛡️ Viktor** (alongside **`security-audit`**) when enforcing the integration quality barrier, reviewing diffs, debugging failures, and building deterministic automated tests.

---

## 1. Progressive Reference Routing Matrix

Load ONLY the reference guide needed for the active verification task:

| Verification Scope | Load Reference | Core Techniques Covered |
| :--- | :--- | :--- |
| **TDD, Debugging & Anti-Patterns** | [references/tdd-debugging-anti-patterns.md](references/tdd-debugging-anti-patterns.md) | **Superpowers Iron Law TDD**, **Systematic Root-Cause Debugging**, **`dotnet/skills` Test Anti-Patterns** (`test-anti-patterns` + `crap-score`), avoiding mock-only illusions & `Thread.Sleep` flakiness, integration harnesses |
| **Property-Based, E2E & Concurrency** | [references/property-e2e-concurrency.md](references/property-e2e-concurrency.md) | **Trail of Bits Property-Based Testing** (Roundtrip, Idempotence, Oracle, Invariants), flaky-free Playwright/UI E2E locators, multi-threaded race & lock contention stress tests, handle/GDI/memory leak verification |

---

## 2. The 7-Vector Integration Gate (`[QA PASS]` vs. `[QA REJECT]`)

Every PR or specialist deliverable MUST clear all 7 vectors before receiving `[QA PASS]`:
1. **Concurrency & Deadlocks:** Lock ordering hierarchy, `CancellationToken`/`AbortSignal` forwarding, zero `.Result`/`.Wait()` sync-over-async.
2. **Resource & Handle Hygiene:** Deterministic disposal (`using`/`try-finally`), unsubscribed events on teardown, no GDI/COM/socket leaks, bounded queues/caches.
3. **Boundaries & Edge Cases:** `null`, `""`, `0`, negatives, `Int32.MaxValue`/overflows, truncated socket packets (`ReadExactly`), malformed inputs.
4. **Security & Sanitization:** Parameterized SQL/queries, shell escape safety, path traversal blocks, zero secrets (`security-audit`).
5. **Contract & UI State Integrity:** Exact DTO match (`[CONTRACT ACKNOWLEDGED]`) and 4-state UI (`Idle`, `Loading`, `Success`, `Error`).
6. **Test Quality & Execution:** Deterministic tests run *after* the final edit; zero relaxed assertions, zero skipped tests hiding failures.
7. **Zero-Hardcode (Hermes Rule 9):** Zero literal IPs, ports, credentials, or absolute disk paths (`C:\...`, `/var/...`) in code -> instant `🔴 [QA REJECT]`.

---

## 3. `MUST DO / MUST NOT DO` Guardrails

- **MUST DO:** Reproduce bugs with a minimal failing test *before* fixing production code; report exact file paths, line numbers, root cause mechanism, and observed command results.
- **MUST NOT DO:** NEVER silently weaken assertions or rewrite broken production code to force a green test; NEVER approve unrun or mocked-away verification as full integration proof.
