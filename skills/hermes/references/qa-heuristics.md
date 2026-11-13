# 🛡️ ECC QA, Anti-Regression & Security Review Heuristics (Viktor's Standard)

This document defines the strict inspection criteria used by **Viktor (Lead QA & Security Reviewer)**.
Every PR or task submitted for review MUST be audited against the **Anti-Regression Protocol** and all **7 technical vectors** below (including **Vector 7: Zero-Hardcode Compliance** per `fleet-protocol.md` Rule 9).

> [!IMPORTANT]
> **Compiles != Works:** Zero compiler warnings or clean exit codes only prove syntactic validity, not functional correctness. Full testing guidelines live in **`skills/qa-test-automation/SKILL.md`** and **`skills/security-audit/SKILL.md`**.

---

## 0. Anti-Regression & 100% Fix Completeness Gate

1. **`REQ-1..REQ-N` Completeness Audit:**
   - Deconstruct user prompt into atomic items `REQ-1..REQ-N`.
   - Verify every item against `git diff`. Skipping any item ➔ `🔴 [QA REJECT: Пропущен пункт REQ-X]`.
2. **Project-Wide Sibling Sweep (`N of N Occurrences`):**
   - If a fix styles a scrollbar, patches a socket read, or adds error handling, grep the repository for other sibling occurrences (`AutoScroll`, `ScrollBar`, `DataGridView`, `Stream.Read`).
   - Partial fixes (e.g., 1 of 10 controls updated) ➔ `🔴 [QA REJECT: Исправлено 1 место из N]`.
3. **UI & Event-Order Regression Trace:**
   - **Popup Toggle vs Outside-Click / `Deactivate` Race:** Verify clicking toggle button does not trigger `Deactivate`/`mousedown-outside` first, causing a race that prevents proper opening or closing cycles.
   - **Hover Flicker:** Ensure `MouseLeave`/`mouseout` moving to child controls checks `ClientRectangle.Contains(PointToClient(Cursor.Position))` or uses `DoubleBuffered`.
   - **Broken Prior Fix:** Compare `git diff` to ensure previous turn's guards were not deleted, relaxed, or inverted.

---

## 1. Concurrency & Deadlock Prevention
- **Lock Ordering:** Ensure all multi-threaded locking mechanisms acquire locks in a globally consistent hierarchy to prevent cyclic deadlocks.
- **Async/Await Hygiene:**
  - No `async void` (except top-level UI event handlers).
  - Always handle cancellations using cancellation tokens (`CancellationToken` / `AbortSignal`).
  - No blocking calls on async tasks (avoid `.Result` or `.Wait()`; use `await`).
- **Race Conditions:** Verify shared mutable state is protected by mutexes, channels, or atomic primitives.

## 2. Resource & Memory Leak Auditing
- **Event Listeners / Subscriptions:** Any component subscribing to an event, stream, or publisher MUST unsubscribe on dispose/teardown.
- **Native / Unmanaged Handles:** Files, sockets, database connections, and COM objects must use deterministic resource management (`using`, `try-finally`, `IDisposable`).
- **Memory Growth:** Watch for unbounded collections (e.g. growing cache maps, unpruned queues). Verify caching uses LRU/TTL eviction policies.

## 3. Boundary & Edge Case Analysis
- **Zero / Null / Undefined:** What happens with empty lists, null strings, 0 numbers, or negative values?
- **Boundary Limits:** Integer min/max overflows, string truncation, large payload uploads.
- **Network Glitches:** Verify system behavior under socket disconnects, packet drops, timeouts, and malformed frames (`ReadExactly`).

## 4. Security & Sanitization (`skills/security-audit/`)
- **Injection & Traversal Defense:** Strictly parameterized SQL/NoSQL; safe argument arrays for processes (never `UseShellExecute`/shell interpolation); canonical `GetFullPath`/`resolve` boundary checks against `..` traversal; XSS sanitization + SSRF private/metadata-IP/redirect blocks.
- **Auth, Access Control & Crypto:** Verify deny-by-default auth, tenant/owner scoping against **IDOR/BOLA** and **Mass Assignment**, pinned JWT algorithms + `iss`/`aud`/`exp` validation, Argon2id/bcrypt passwords, CSPRNG tokens, and strict TLS certificate validation.
- **Diff Regressions & Supply Chain:** Audit deleted guards (`differential-review`), fail-closed defaults (`insecure-defaults`), packet length bounds BEFORE allocations, and secrets/CVEs/non-root containers using Cloudflare Fresh-Verifier proof before confirming findings.
- **Secrets Management:** Ensure API keys, private keys, or credentials are never hardcoded in source files or Docker/CI configs.

## 5. Contract & State Machine Integrity
- **Contract Verification:** Confirm that backend DTOs strictly match the schema agreed upon with frontend (`[CONTRACT ACKNOWLEDGED]`).
- **Four-State Principle:** Any data-fetching operation in UI must support 4 states: `Idle`, `Loading`, `Success`, `Error`.

## 6. Test Coverage & Verification
- Unit tests for pure logic and transformation functions.
- Integration test or mocked verify step for critical paths.
- All tests must be deterministic (no random flaky timeouts or sleep waits).

## 7. Zero-Hardcode & Configuration Hygiene (Rule 9)
- **Zero IP/Port Hardcoding:** Network endpoints, machine IPs, ports, and socket targets must be read from the project's native configuration provider.
- **Zero Absolute Paths:** Absolute disk paths (`C:\...`, `/var/...`) are strictly forbidden; always use dynamic relative path resolution.
- **Zero Hardcoded Secrets:** Passwords, tokens, and credentials must never appear as plain string literals in source code.
- **Mandatory Rejection:** The presence of hardcoded infrastructure literals triggers an immediate 🔴 `[QA REJECT]`.
