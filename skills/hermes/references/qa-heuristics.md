# 🛡️ ECC QA & Security Review Heuristics (Viktor's Standard)

This document defines the strict inspection criteria used by **Viktor (Lead QA & Security Reviewer)**.
Every PR or task submitted for review MUST be audited against all **7 vectors** (the 6 technical vectors below plus **Vector 7: Zero-Hardcode Compliance** per `fleet-protocol.md` Rule 9).

> [!IMPORTANT]
> Full QA verification & testing standards live in **`skills/qa-test-automation/SKILL.md`** (alongside **`skills/security-audit/SKILL.md`**), with modules in [references/tdd-debugging-anti-patterns.md](../../qa-test-automation/references/tdd-debugging-anti-patterns.md) (Iron Law TDD, Systematic Root-Cause Debugging, Test Anti-Patterns & CRAP triage) and [references/property-e2e-concurrency.md](../../qa-test-automation/references/property-e2e-concurrency.md) (Property-Based Invariants, flaky-free Playwright/E2E locators, concurrency & leak stress testing).

---

## 1. Concurrency & Deadlock Prevention
- **Lock Ordering:** Ensure all multi-threaded locking mechanisms acquire locks in a globally consistent hierarchy to prevent cyclic deadlocks.
- **Async/Await Hygiene:**
  - No `async void` (except top-level UI event handlers).
  - Always handle cancellations using cancellation tokens (`CancellationToken` / `AbortSignal`).
  - No blocking calls on async tasks (avoid `.Result` or `.Wait()`; use `await`).
- **Race Conditions:** Verify shared mutable state is protected by mutexes, channels, or atomic primitives.

## 2. Resource & Memory Leak Auditing
- **Event Listeners / Subscriptions:** Any component or class subscribing to an event, stream, or publisher MUST unsubscribe on dispose/teardown.
- **Native / Unmanaged Handles:** Files, sockets, database connections, and COM objects must use deterministic resource management (`using`, `try-finally`, `IDisposable`).
- **Memory Growth:** Watch for unbounded collections (e.g. growing cache maps, unpruned queues). Verify caching uses LRU/TTL eviction policies.

## 3. Boundary & Edge Case Analysis
- **Zero / Null / Undefined:** What happens with empty lists, null strings, 0 numbers, or negative values?
- **Boundary Limits:** Integer min/max overflows, string truncation, large payload uploads.
- **Network Glitches:** Verify system behavior under socket disconnects, packet drops, timeouts, and malformed frames.

## 4. Security & Sanitization (`skills/security-audit/`)
- **Injection & Traversal Defense:** Strictly parameterized SQL/NoSQL; safe argument arrays for processes (never `UseShellExecute`/shell interpolation); canonical `GetFullPath`/`resolve` boundary checks against `..` traversal; XSS sanitization + SSRF private/metadata-IP/redirect blocks.
- **Auth, Access Control & Crypto:** Verify deny-by-default auth, tenant/owner scoping against **IDOR/BOLA** and **Mass Assignment**, pinned JWT algorithms + `iss`/`aud`/`exp` validation, Argon2id/bcrypt passwords, CSPRNG tokens, and strict TLS certificate validation (`security-audit/references/web-auth-crypto-owasp.md`).
- **Diff Regressions, Sockets & Supply Chain:** Audit deleted guards (`differential-review`), fail-closed defaults (`insecure-defaults`), packet length bounds BEFORE allocations, and secrets/CVEs/non-root containers (`security-audit/references/diff-review-sharp-edges.md`, `supply-chain-devsecops.md`) using Cloudflare Fresh-Verifier proof before confirming findings.
- **Secrets Management:** Ensure API keys, private keys, or credentials are never hardcoded in source files or Docker/CI configs.

## 5. Contract & State Machine Integrity
- **Contract Verification:** Confirm that backend DTOs strictly match the schema agreed upon with the frontend.
- **Four-State Principle:** Any data-fetching operation in UI must support 4 states: `Idle`, `Loading`, `Success`, `Error`.

## 6. Test Coverage & Verification
- Unit tests for pure logic and transformation functions.
- Integration test or mocked verify step for critical paths.
- All tests must be deterministic (no random flaky timeouts).

## 7. Zero-Hardcode & Configuration Hygiene (Mandatory Blocker)
- **Zero IP/Port Hardcoding:** Network endpoints, machine IPs, ports, and socket targets must be read from the project's native configuration provider (environment variables, config files, or settings services).
- **Zero Absolute Paths:** Absolute disk paths (`C:\...`, `/var/...`) are strictly forbidden; always use dynamic relative path resolution.
- **Zero Hardcoded Secrets:** Passwords, tokens, and credentials must never appear as plain string literals in source code.
- **Mandatory Rejection:** The presence of hardcoded infrastructure literals triggers an immediate 🔴 `[QA REJECT]`.
