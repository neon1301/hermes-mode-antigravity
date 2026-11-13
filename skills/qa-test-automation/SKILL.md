---
name: qa-test-automation
description: Strict QA verification, TDD Iron Law, systematic root-cause debugging, test anti-pattern elimination, property-based invariants, E2E automation, and concurrency/leak testing. Use when designing test suites, debugging bugs, or executing Viktor's [QA PASS] / [QA REJECT] integration barrier.
---

# QA Automation, Anti-Regression & Systematic Verification Skill

This skill guides **🛡️ Viktor** (alongside **`security-audit`**) when enforcing the integration quality barrier, reviewing diffs, debugging failures, preventing regressions, and building deterministic automated tests.

---

## 1. Progressive Reference Routing Matrix

Load ONLY the reference guide needed for the active verification task:

| Verification Scope | Load Reference | Core Techniques Covered |
| :--- | :--- | :--- |
| **TDD, Debugging & Anti-Patterns** | [references/tdd-debugging-anti-patterns.md](references/tdd-debugging-anti-patterns.md) | **Superpowers Iron Law TDD**, **Systematic Root-Cause Debugging**, **`dotnet/skills` Test Anti-Patterns** (`test-anti-patterns` + `crap-score`), avoiding mock-only illusions & `Thread.Sleep` flakiness, integration harnesses |
| **Property-Based, E2E & Concurrency** | [references/property-e2e-concurrency.md](references/property-e2e-concurrency.md) | **Trail of Bits Property-Based Testing** (Roundtrip, Idempotence, Oracle, Invariants), flaky-free Playwright/UI E2E locators, multi-threaded race & lock contention stress tests, handle/GDI/memory leak verification |

---

## 2. The Ironclad Anti-Regression & Fix Completeness Protocol ("Compiles != Works")

A clean compilation (`dotnet build`, `pytest`, `tsc` with 0 warnings) is merely an entry requirement. Viktor rejects any change where syntax compiles but functionality or UI state degrades:

1. **`REQ-1..REQ-N` 100% Completeness Audit:**
   - Deconstruct user prompt into `REQ-1..REQ-N`. Audit `git diff` against every requirement.
   - Any unaddressed or partially fixed symptom triggers instant `🔴 [QA REJECT: Пропущен пункт REQ-X]`.
2. **Project-Wide Sibling Sweep (`N of N Occurrences`):**
   - Grep the entire repository for duplicate instances of the altered control or pattern (e.g. all `AutoScroll`/`ScrollBar`/`DataGridView` controls, socket reads, or error toasts).
   - If 1 instance was fixed while other siblings remain unpatched ➔ `🔴 [QA REJECT: Исправлено 1 место из N]`.
3. **UI & Event-Order Regression Tracing:**
   - **Popup Toggle vs Deactivate / Outside Click Race:** Check whether clicking the toggle/button causes `Deactivate` or `mousedown-outside` to fire first and block reopening or normal toggling.
   - **Hover Flicker:** Ensure `MouseLeave`/`mouseout` when moving to child controls checks `ClientRectangle.Contains(PointToClient(Cursor.Position))` or uses `DoubleBuffered`.
   - **Broken Prior Fix:** Compare `git diff` against previous commits to verify no guard or fix was reverted.

---

## 3. The 7-Vector Integration Gate (`[QA PASS]` vs. `[QA REJECT]`)

Every PR or specialist deliverable MUST clear all 7 vectors before receiving `[QA PASS]`:
1. **Concurrency & Deadlocks:** Lock ordering hierarchy, `CancellationToken`/`AbortSignal` forwarding, zero `.Result`/`.Wait()` sync-over-async.
2. **Resource & Handle Hygiene:** Deterministic disposal (`using`/`try-finally`), unsubscribed events on teardown, no GDI/COM/socket leaks, bounded queues/caches.
3. **Boundaries & Edge Cases:** `null`, `""`, `0`, negatives, `Int32.MaxValue`/overflows, truncated socket packets (`ReadExactly`), malformed inputs.
4. **Security & Sanitization:** Parameterized queries, shell escape safety, path traversal blocks, zero secrets (`security-audit`).
5. **Contract & UI State Integrity:** Exact DTO match (`[CONTRACT ACKNOWLEDGED]`) and 4-state UI (`Idle`, `Loading`, `Success`, `Error`).
6. **Test Quality & Execution:** Deterministic tests run *after* the final edit; zero relaxed assertions, zero skipped tests hiding failures.
7. **Zero-Hardcode (Hermes Rule 9):** Zero literal IPs, ports, credentials, or absolute disk paths (`C:\...`, `/var/...`) in code -> instant `🔴 [QA REJECT]`.

---

## 4. `MUST DO / MUST NOT DO` Guardrails

- **MUST DO:** Reproduce bugs with a minimal failing test *before* fixing production code; audit all `REQ-1..REQ-N` points against `git diff`; sweep repo for `N of N` occurrences; verify UI event sequences.
- **MUST NOT DO:** NEVER approve based solely on green builds; NEVER silently weaken assertions; NEVER leave sibling controls unpatched.
