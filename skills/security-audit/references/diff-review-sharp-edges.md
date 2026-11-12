# Differential Security Review, Sharp Edges & Industrial DoS Defense

Synthesized from **`trailofbits/skills`** (~8.1k ★: `differential-review`, `sharp-edges`, `insecure-defaults`), **`cloudflare/security-audit-skill`** (~68.8k+ ★), and industrial telemetry security patterns.

---

## 1. Trail of Bits `differential-review` (Auditing PRs & Commits)

When reviewing code diffs (`git diff`) rather than static greenfield files, hunt specifically for **security regressions**:
1. **Removed or Weakened Guards:** Check deleted middleware attributes, tightened-then-bypassed `if` guards, changed exception fallbacks returning `true` or allowing passthrough, and use `git log -S` / `git blame` to understand *why* removed validation originally existed.
2. **Blast Radius Estimation:** For every modified auth check, serializer, config parser, or base repository method, inspect **all callers across the repository** — tightening/changing return semantics in one caller frequently opens bypasses in three others!
3. **Asymmetric Path Audit:** Whenever new endpoints, bulk import routes, GraphQL resolvers, or v2 controllers are added alongside existing v1 routes, verify the **same** auth, tenant filtering, rate limiting, and validation rules protect the new surface cleanly.

---

## 2. `sharp-edges` & `insecure-defaults` Audit Playbook

Even syntactically valid code creates catastrophic "footgun" vulnerabilities via unsafe defaults:
- **Fail-Open Auth / Catch Blocks:** `catch (Exception) { return true; }` or null claims falling back to `"default"` / admin roles -> security checks MUST **fail closed**!
- **Dangerous Network / Bind Defaults:** Services defaulting bind addresses to wildcard interfaces without auth, verbose stack traces/Swagger/debug endpoints enabled in production builds, or default admin credentials seeded by migrations (instant 🔴 `[QA REJECT]` under Rule 9!).
- **API Sharp Edges:** Functions taking raw SQL/filepath strings next to safe parameterized siblings (`QueryRaw` vs `Query`), mutable default parameters leaking cross-request state, or regexes vulnerable to **ReDoS** (`(a+)+` catastrophic backtracking on untrusted input).

---

## 3. Cloudflare Fresh-Verifier Validation Protocol

Before confirming ANY vulnerability candidate in `findings.json`:
1. **Trace the Full Chain:** Can untrusted input actually reach the sink? Look for upstream validation middleware, strongly typed enums/GUIDs, framework auto-escaping, or ORM parameterization that neutralizes the suspected bug.
2. **Check Realistic Exploitability (`KeygraphHQ/shannon`):** Verify attacker preconditions (anonymous internet user vs compromised local DBA). Downgrade speculative suspicions without proven paths to `needs_validation` (with zero inflated `CRITICAL` tags) or `rejected`.
3. **Verify Non-Side-Effect PoC:** Document the minimal mathematical/request condition proving the flaw without ever damaging data or embedding live malicious payloads.

---

## 4. Industrial Sockets, Binary Parsers & Resource DoS (`CWE-400`, `CWE-120`)

- **Frame-Length OOM Bombs:** Validate incoming length headers (`if (len < MinLen || len > MaxFrameBytes) throw ...`) BEFORE allocating `new byte[len]` — an attacker sending `0x7FFFFFFF` can OOM-crash the process in 4 bytes!
- **Truncated TCP Streams (`CA2022`):** Reject naive `Stream.Read()` calls assuming whole frames arrive per read; require `Stream.ReadExactlyAsync` / framed ring buffers (`socket-network-diagnostics`).
- **Resource & Handle Exhaustion:** Verify deterministic `Dispose`/`using` on GDI objects (`Font`, `Brush`, `Bitmap` against Windows 10k GDI limit), COM objects, sockets, file descriptors; mandate idle timeouts (`ReceiveTimeout`), max concurrent clients, and bounded queues/caches (TTL/LRU eviction).
- **Concurrency & TOCTOU Races:** Audit Lock ordering hierarchies for deadlocks and check Time-of-Check to Time-of-Use races on balance/quota updates or temp-file creation (`O_CREAT | O_EXCL`, atomic DB conditional `UPDATE`).
