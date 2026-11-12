# Property-Based Testing, E2E Reliability & Concurrency Stress Audits

Synthesized from **`trailofbits/skills`** (`property-based-testing`), **`affaan-m/ECC`** (`e2e-testing`), **`microsoft/playwright`**, and production concurrency QA practices.

---

## 1. Property-Based Testing (When Example Tests Miss Edge Cases)

Example tests check 3 inputs you thought of; **Property-Based Testing** (Hypothesis in Python, `fast-check` in TS/JS, `FsCheck`/`CsCheck` in .NET, `rapid` in Go) generates hundreds of edge inputs automatically (empty, Unicode surrogates, `NaN`, max-int, weird byte alignments):

### Trail of Bits Property Catalog
Recognize these high-value algebraic properties in code under review:
1. **Roundtrip / Inverse:** `Decode(Encode(frame)) == frame`, `Deserialize(Serialize(dto)) == dto`.
2. **Idempotence:** `ApplyUpdate(ApplyUpdate(state, msg), msg) == ApplyUpdate(state, msg)` (Outbox/Idempotency keys!).
3. **Invariant Preservation:** Queue depth never exceeds `MaxCapacity`; total balance across debit/credit stays constant; generated SQL/JSON validates cleanly against schema.
4. **Oracle / Differential Testing:** Compare fast new SIMD/optimized parser output against simple slow reference implementation across 1,000 random valid+corrupt inputs!
5. **Commutativity / Order Independence:** When ordering shouldn't matter, verify `Process([A, B])` equals `Process([B, A])`.

---

## 2. Flaky-Free E2E & UI Verification (Playwright / Desktop)

- **Resilient Locators Only:** Target semantic roles (`getByRole`, `getByLabel`, `data-testid`) — NEVER brittle auto-generated CSS classes (`div > div:nth-child(4)`).
- **Web-First Auto-Waiting:** Rely on explicit state assertions (`await expect(locator).toBeVisible()`, `toHaveText()`), network intercept completions, or explicit readiness signals — never `waitForTimeout(2000)`.
- **Verify All 4 UI States:** Test `Idle`, `Loading` (spinner/disabled double-submit protection), `Success` (+ Empty State when 0 items), and `Error` (500/timeout -> user-friendly error + working Retry button).
- **Trace & Artifact Capture:** Capture screenshots/traces on failure only so CI stays fast and forensic evidence is immediate.

---

## 3. Concurrency, Fault-Injection & Memory Leak Verification

Before signing off multi-threaded services, sockets, or DB layers:
- **Contention Stress Loop:** Launch $N$ parallel tasks (`Task.WhenAll`, `go test -race`, `asyncio.gather`) exercising concurrent reads+writes against WAL SQLite / Postgres / MSSQL / `Channel<T>` queues — assert **zero unhandled exceptions, zero `SQLITE_BUSY`, zero lost messages**.
- **Fragmented & Dropped Stream Verification:** Pair with `@igor`'s simulator (`hardware-protocol-simulation`) to split frames across 1-byte chunks, inject `RST` disconnects mid-frame, and inject corrupt CRCs.
- **Deterministic Leak Audit:** Inspect diff & runtime handle counts in loops (`for 10,000 iterations`) checking GDI `Font`/`Brush`/`Bitmap` handles, DB connections (`ClearAllPools`), `HttpClient` sockets (`TIME_WAIT`), unremoved `+=` event handlers, and COM refcounts.
