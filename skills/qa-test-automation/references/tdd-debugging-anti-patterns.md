# TDD Iron Law, Systematic Debugging & Test Anti-Patterns

Synthesized from **`obra/superpowers`** (`test-driven-development`, `systematic-debugging`), **`affaan-m/ECC`** (`tdd-workflow`), and **`dotnet/skills`** (`test-anti-patterns`, `crap-score`).

---

## 1. The Iron Law of TDD (`obra/superpowers`)

- **Red:** Write the minimal failing automated test expressing the exact contract or edge case *before* writing implementation logic. Watch it fail for the right reason (missing behavior, not typo/compile bug).
- **Green:** Write the cleanest minimal production code that makes the failing test pass.
- **Refactor:** Clean up duplication/naming only after tests stay green, keeping builds at 0 warnings.

---

## 2. Systematic Root-Cause Debugging (No Guessing Patches)

When diagnosing failures, compiler breakages, or flaky runs:
1. **Capture Exact Evidence:** Read full error output, stack trace, thread IDs, and minimal failing input. Do NOT apply random speculative edits.
2. **Isolate Minimal Reproducer:** Build the smallest isolated test case reproducing the exact bug deterministically.
3. **Identify True Root Cause:** Trace backward from failure point to the invalid invariant/data source.
4. **Fix Once & Verify:** Change **one root cause at a time** (do not mix unrelated refactors into emergency bugfixes), then re-run full relevant suites to confirm zero regressions.

---

## 3. Test Anti-Patterns Catalog (`dotnet/skills`)

Reject tests exhibiting these structural defects during QA review:

| Anti-Pattern | Failure Mode | Required Fix |
| :--- | :--- | :--- |
| **Testing Your Own Mocks** | Mocking 5 layers until test verifies `mock.Verify(...)` instead of real behavior | Keep pure logic unmocked; mock ONLY external process/network boundaries; use `WebApplicationFactory` / real SQLite `:memory:` or temp-dir DBs for integration tests |
| **`Thread.Sleep` / `Task.Delay` Flakiness** | Arbitrary sleeps pass on fast dev boxes and flake in CI | Use deterministic `TaskCompletionSource`, `CountdownEvent`, fake `TimeProvider` / clock injection, or bounded polling with explicit timeout failure |
| **Weak / Tautological Assertions** | Only checking `Assert.NotNull(res)` or copying broken output as "expected" | Assert exact contract fields, HTTP status, error codes, DB persisted rows, and count invariants |
| **Shared Mutable Static State** | Tests pass individually but fail when run in parallel due to shared files/ports/singletons | Isolate per-test temp folders (cleaned up in `Dispose`), dynamic OS-assigned ports (`port: 0`), and fresh DI scopes |
| **Swallowed Exceptions in Test Hooks** | `try { ... } catch { }` hiding cleanup or background-thread crashes | Assert explicit exceptions (`Assert.ThrowsAsync<T>`) and await/observe background worker exceptions |
| **Coverage Theater on High-CRAP Code** | 90% coverage on trivial getters while complex parsers sit at 0% | Focus tests directly on high cyclomatic-complexity branches (`CRAP` hotspots), error recovery, and protocol parsers |
