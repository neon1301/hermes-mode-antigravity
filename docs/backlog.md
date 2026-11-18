# 📌 Hermes Fleet Enterprise — Engineering Backlog

This backlog tracks architectural tasks, technical debt, and external donor evaluations across Hermes Fleet releases.

---

### [TASK-001] Split 30-KB Fleet Protocol into Core + Modular References
* **Priority:** P1
* **Status:** ✅ COMPLETED in v3.9.0
* **Resolution:** 
  - `skills/hermes/references/fleet-protocol.md` reduced from 30,305 bytes (~30 KB) to 12,008 bytes (11.73 KB <= 12 KB budget).
  - Initial injection payload reduced by **-60.38%** (-18,297 bytes saved eager per session).
  - Specialized content extracted to modular references:
    * `skills/hermes/references/specialist-dispatch-matrix.md` (Chain-reaction matrix, Two-tier Kritik, Model matrix).
    * `skills/hermes/references/orchestrator-planning.md` (BMAD planning ladder, `.hermes/decisions.md` ledger, Spec Law «Done when»).
    * `skills/hermes/references/orchestrator-parallel.md` (Gas Town Refinery merge queue, Beads `.hermes/tasks.json`, Watchdog recovery).
  - All 18 tests in `context-injector.test.mjs` pass cleanly.

---

### [TASK-002] Deferred Skill Candidates Registry (v3.8.0 External Scout Audit)
* **Priority:** P3
* **Target Version:** Post-v3.8.0 Evaluation
* **Audit Verdict Ledger:**
  1. **`mcollina/skills` (Fastify & Node.js Performance)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Dmitry (`backend-architecture`) already provides high-throughput Node.js/Go/.NET patterns and zero-alloc streams. Additional standalone skill would cause token budget bloat.
  2. **`prisma/skills` (Prisma ORM)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Narrow ORM scope. Denis (`high-load-db-tuning`) focuses on database engine fundamentals (PostgreSQL/SQLite WAL/MSSQL/DuckDB) rather than high-level JS ORMs.
  3. **`sanjay3290/postgres` (PostgreSQL Optimization)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Redundant. `high-load-db-tuning` already covers MVCC bloat, EXPLAIN ANALYZE, partial indexes, and connection pool sizing.
  4. **`mattpocock/skills` (TypeScript Type Gymnastics)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Dmitry and Elena already maintain strict TypeScript types and schemas; overly complex type acrobatics reduce codebase readability.
  5. **`supercorp-ai/supercov` (Coverage Reporting)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Viktor (`qa-test-automation`) already enforces 100% `REQ-1..REQ-N` coverage and deterministic TDD without external SaaS coverage tools.
  6. **`aklofas/kicad-happy` (KiCad EDA / PCB Design)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Hardware PCB layout is outside the Hermes Fleet software engineering scope. Physical interfaces and PLCs are covered by Alexey and Igor.
  7. **`tt-a1i/archify` (Architecture Diagrams)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Anna (`c4-architecture-mermaid`) already delivers living C4 architecture and validated Mermaid diagrams.
  8. **`anthropics/skills` (`webapp-testing`, `mcp-builder`)**:
     - *Verdict:* `HOLD`.
     - *Rationale:* Web app testing is unified under Viktor (`playwright-e2e-patterns.md`), and MCP authoring is covered under Antigravity built-in `agy-customizations`.

---

### [TASK-003] Lightweight Merge-Queue Utility (Gas Town Refinery Automation)
* **Priority:** P2
* **Target Version:** v4.0.0
* **Status:** ✅ COMPLETED in v4.0.0
* **Resolution:** 
  - Designed via `docs/adr/ADR-0002-refinery-merge-queue.md` (interception at user-space CLI/module `scripts/refinery.mjs` avoiding hook 10s timeout risks).
  - Implemented standalone Bors-style staging pipeline and recursive binary bisection in `scripts/refinery.mjs`.
  - Added deterministic test suite `hooks/refinery.test.mjs` (9/9 PASS) verifying green batch merges, red batch bisection isolation, injection resistance, atomic rollback, and Beads ledger synchronization.
  - Zero external Go binaries (`gt`), zero patch scripts (Rule 8), zero hardcoding (Rule 9).

---

### [TASK-004] Narrow `hermes-hardcode-ignore` Scope to Trigger Line (±1 Line) & ADR 0001 Schema Shim
* **Priority:** P1
* **Target Version:** v4.6.1
* **Status:** ✅ COMPLETED in v4.6.1
* **Resolution:**
  - Narrowed `hermes-hardcode-ignore` in `hooks/clean-edits-guard.mjs` from whole-payload suppression to strictly line-scoped `±1` (`N-1..N+1`). Violations 2+ lines away are denied (`hardcode_ignore_far_violation_deny`).
  - Rejected blanket file-wide markers (`hermes-hardcode-ignore-file`, `whole file`, `entire file`, `на весь файл`) and bare markers without a reason (`hardcode_ignore_file_blanket_deny`, `hardcode_ignore_legacy_marker_shim`).
  - Formalized `hermes-hardcode-ignore` `v2` / `v1-legacy` compatibility shim and `ackToken || signature` shim in `docs/adr/0001-l2-diff-review-and-anti-self-signing.md` and `TROUBLESHOOTING.md`. Layer 1 security checks remain strictly unbypassable.

---

### [TASK-005] Subagent UUID FIFO Assignment Verification & tool_call_id Binding
* **Priority:** P2
* **Target Version:** v4.6.0 (Partially Closed) -> v4.7.1 (Closed)
* **Status:** ✅ COMPLETED in v4.7.1
* **Resolution:**
  - `v4.6.0`: Implemented `tool_call_id`-first `invoke_subagent -> conversationId` binding (`bindingConfidence: "exact"`) in `hooks/clean-edits-guard.mjs`, with single-invoke FIFO (`"fifo"`) and ambiguous multi-invoke marking (`"uncertain"`, zero reputation accrual).
  - `v4.7.1`: Extracted unified `hooks/subagent-binding.mjs` (`exact` / `fifo` / `uncertain` + per-sender `splitSystemDeliveries`) and wired into `hooks/qa-gate.mjs` for L2 auditors (`viktor`, `kritik`, `stanislav`) and independent graders. Ambiguous multi-invoke without `tool_call_id` fails closed (`l2_binding_uncertain`) with `bindingConfidence` logged to `.hermes/gate-log.jsonl` (locked by `l2_binding_exact_accept`, `l2_binding_single_fifo_accept_logged`, `l2_binding_multi_uncertain_reject`).

---

### [TASK-006] Convoy Stall & Distributed Deadlock Detection Hook
* **Priority:** P3
* **Target Version:** Post-v4.7.1 Evaluation
* **Scope & Context:**
  Dynamic detection of circular dependency chains (`Worker A awaits Worker B awaits Worker A`) in multi-agent swarms using `.hermes/tasks.json` dependency graph.

---

### [TASK-007] External Scout Audit & Rejected Donors Registry (v3.9.0)
* **Priority:** P3
* **Audit Verdict Ledger:**
  1. **`ruvnet/ruflo` (ex-Claude-Flow, ~66k★)**:
     - *Verdict:* `HOLD` (Rejected).
     - *Rationale:* Unbounded swarm auto-spawning contradicts Hermes Fleet Rule 12 (bounded waves 3–5) and Rule 3 (Token Economy Post-Edit Gate). Would lead to uncontrolled token expenditure and quota exhaustion.
  2. **`itqan-engineering`**:
     - *Verdict:* `HOLD` (Rejected).
     - *Rationale:* Duplicates existing 7-Phase feature development protocol (`skills/hermes/references/feature-dev-protocol.md`). Zero unique delta.
  3. **`NeoLabHQ/sdd` (Spec-Driven Development)**:
     - *Verdict:* `HOLD` (Rejected).
     - *Rationale:* Redundant. Contract First (Rule 1), Spec Law «Done when» (BMAD), and REQ-1..REQ-N already enforce strict spec-driven verification.
  4. **`github/spec-kit` (Specification-Driven Development)**:
     - *Verdict:* `ADOPT` (Templates) / `HOLD` (`specify-cli`).
     - *Rationale:* Clean markdown templates (`spec.md`, `plan.md`, `tasks.md`) ported to `skills/hermes/references/spec-driven-templates.md` under Apache 2.0 for Anna and Lead on Enterprise tasks. Heavy CLI tool (`specify-cli`) and orchestration logic are held to avoid external Python dependencies and keep Hermes zero-context outside `/hermes`.


---

### [TASK-008] Mechanical QA Rails & Artifact-Driven Gate Acceptance (Track B1–B5)
* **Priority:** P1
* **Target Version:** v4.1.0
* **Status:** ✅ COMPLETED in v4.1.0
* **Resolution:**
  - Transitioned `[QA PASS]` from conversational text token matching to deterministic machine-verified artifact (`.hermes/qa-verdict.json`).
  - Implemented `hooks/qa-runner.mjs` with automated stack detection (`dotnet`, `pytest`, `npm`, `go`), real process exit codes, and `diffHash` binding.
  - Expanded `qa-verdict.schema.json` with contract validation.
  - Implemented fail-closed Stop gate acceptance in `hooks/qa-gate.mjs` with backward-compatible `qaVerdictMode: "legacy"` flag.
  - Added Mutation Testing MVP (advisory-first, Rule 13 honest reporting, strict mode option).
  - Documented in `docs/adr/ADR-0005-mechanical-qa-rails-and-artifact-gate.md` and `docs/troubleshooting.md`.
  - Added 11 negative and anti-spoofing test vectors in `hooks/qa-gate.test.mjs` (82/82 PASS).

---

### [TASK-009] Specialist Council Gate, Hardening & Named Specialist Quorum (v4.2.0–v4.2.2)
* **Priority:** P1
* **Target Version:** v4.2.0–v4.2.2
* **Status:** ✅ COMPLETED in v4.2.2 (`87341bd`, `633df67`)
* **Resolution:**
  - Enforced named specialist quorum (`expectedNames` filtered against `HERMES_AGENTS`) inside `verifyCouncilGate` (`hooks/clean-edits-guard.mjs`) so Lead cannot substitute wrong specialists to satisfy numeric counts.
  - Hardened Council Gate negation-guard and task-bound loop reuse (`taskHash`).
  - Enforced reporting hygiene across docs and hooks (422/422 PASS, guard 148).

---

### [TASK-010] Universal 3-Option Council Window, Proposal Contract, Board & Basic Roundtable
* **Priority:** P1
* **Target Version:** v4.3.0
* **Status:** ✅ COMPLETED in v4.3.0 (`5843f2b`)
* **Resolution:**
  - Standardized Council Gate `ask_question` dialog to 3 universal options: parallel council (1 round, with single key specialist as special case), basic roundtable (2 rounds), and Lead solo.
  - Introduced canonical 10-point Proposal Contract, `.hermes/council-roundtable.md` board, and Rule 13 range-based cost transparency.
  - Preserved backward compatibility with legacy «ключевой специалист» wording (429/429 PASS, guard 155).

---

### [TASK-011] 3-Stage NGT/Delphi Roundtable, Devil's Advocate, Blind Ranking & Dissent Preservation
* **Priority:** P1
* **Target Version:** v4.4.0
* **Status:** ✅ COMPLETED in v4.4.0 (`325763c`)
* **Resolution:**
  - Upgraded roundtable from 2 rounds to 3 fail-closed NGT/Delphi stages (R1 silent generation -> R2 board critique + Steelman + mandatory `@kritik`/`@stanislav` devil's advocate -> R3 blind anonymized ranking & median/Borda synthesis).
  - Enforced dissent preservation in `.hermes/decisions.md` and criteria arbitration by `@stanislav`.
  - Locked mechanics in `hooks/clean-edits-guard.mjs` (433/433 PASS, guard 159).

---

### [TASK-012] Roundtable Token Economy, Progress Journal, Stall Circuit Breaker & Escalation
* **Priority:** P1
* **Target Version:** v4.5.0
* **Status:** ✅ COMPLETED in v4.5.0 (`30c4185`)
* **Resolution:**
  - Added 2FA Early Stop after Stage 2 with Dissent Dominance (`[DISSENT]` overrides `[CONVERGED]`).
  - Added controlled Agent Dropout / Pruning (only extra members, never named specialists or devil's advocate).
  - Implemented hook-written `.hermes/progress-journal.jsonl`, Stall Circuit Breaker (`>= 3` consecutive fails), escalation to roundtable, and Rule 13 honest cost telemetry `.hermes/council-cost.jsonl` (448/448 PASS, guard 174).

---

### [TASK-013] Stall Circuit Breaker Fix & Intent Binding for Escalation / Early-Stop Windows
* **Priority:** P0 / P1
* **Target Version:** v4.5.1
* **Status:** ✅ COMPLETED in v4.5.1
* **Resolution:**
  - Fixed `syncProgressJournal` attempt identity to key by `(taskHash, outcome, diffHash||null, artifactTimestamp|contentHash)` so repeated real test failures accumulate to `stalled = true` without double-counting unchanged artifacts.
  - Bound Escalation override and Early-Stop choices to selected option text + Cyrillic-aware word-boundary negation-guard (`(?<![а-яёa-z0-9_-])`).
  - Attributed `[CONVERGED]`/`[NO DISSENT]` strictly to devil's advocate sender UUID message chunks (preventing cross-sender contamination within multi-message SYSTEM steps).
  - Fixed numeric answer `"1"` on escalation window to enforce 3-stage roundtable instead of falling back to 1-round parallel council.
  - Documented Model Cascade protocol recommendation (with honest platform constraints), marked README demo output as illustrative example, synced Roadmaps with backlog, and added 15 deterministic test locks (463/463 PASS, guard 189).

---

### [TASK-014] Outcome-Based Council Learning: Outcome Ledger, Mechanical Domain Reputation & Criteria Freeze
* **Priority:** P1
* **Target Version:** v4.6.0
* **Status:** ✅ COMPLETED in v4.6.0
* **Resolution:**
  - Implemented modular learning engine `hooks/council-learning.mjs` and wired into `hooks/clean-edits-guard.mjs` and `hooks/context-injector.mjs`.
  - Added hook-written protected `.hermes/council-outcomes.jsonl` synced strictly from mechanical artifacts (`test-summary.json`, `qa-verdict.json`, `security-verdict.json`) — never MODEL prose — with `lead_declared` authorship verification against actual roster and solo exclusion.
  - Added mechanical specialist × domain reputation inside protected `.hermes/instincts.json` (`observations >= 3` threshold, `[0, 1]` bounds, `±0.15` single-observation delta cap, `30`-day half-life decay toward `0.5`). Reputation strictly affects recommendations (`n=...`) and never alters quorum, `requiredCount`, user roster, or gate `allow`/`deny`.
  - Implemented mechanical Criteria Freeze (`.hermes/council-criteria.json` SHA-256 hash at end of R2, verified before R3 acceptance -> `deny` on metric-shopping), documented protocol-level arbitrator role in `skills/hermes/references/council-learning-protocol.md`.
  - Partially closed `TASK-005` (`tool_call_id` exact binding + `bindingConfidence: "uncertain"` skipping reputation while preserving quorum) and closed v4.5.1 audit tails (`early_stop` skip-R3 phrasing + fallback per-sender `[CONVERGED]` segment isolation).
  - Added 21 deterministic test locks (16 REQ-7 + 5 QA audit regression locks) in `hooks/clean-edits-guard.test.mjs` (210/210 PASS, 484/484 total across 11 suites).

---

### [TASK-015] v4.6.0 Audit Tails & TASK-004 Line-Scoped `hermes-hardcode-ignore`
* **Priority:** P1 / P2
* **Target Version:** v4.6.1
* **Status:** ✅ COMPLETED in v4.6.1
* **Resolution:**
  - Restored `prunedUuids` and active `membersCount` / `roster` persistence in full 3-stage `roundtable` `.hermes/council-state.json` records (both `canEarlyStop` and full 3-stage paths).
  - Implemented honest multi-domain detection (`detectDomains` + fixed `DOMAIN_PRIORITY` tie-break) recording `domains: [...]` while accruing reputation strictly on `primary` domain only (`+1` observation, zero inflation).
  - Distinguished `authorshipSource: "lead_declared"` (weight `1.0`) vs `"team_fallback"` (`teamFallbackWeight = 0.5`, hard `±0.15` cap preserved) and documented Lead's `.hermes/decisions.md` authorship block obligation.
  - Closed `TASK-004`: line-scoped `±1` `hermes-hardcode-ignore`, blanket/bare marker denial, and formalized ADR 0001 compatibility shims.
  - Added 13 deterministic test locks (10 REQ-5 + 3 QA audit regression locks) in `hooks/clean-edits-guard.test.mjs` (223/223 PASS, 497/497 total across 11 suites) with 0 bytes growth on `fleet-protocol.md`.

---

### [TASK-016] Gate Config Tamper Protection, Reason-Safe `hermes-hardcode-ignore` & Fail-Closed Error Handling
* **Priority:** P1 / P2
* **Target Version:** v4.6.2
* **Status:** ✅ COMPLETED in v4.6.2
* **Resolution:**
  - Protected `.hermes/config.json` from agent `write_file`/`edit_file`/shell mutations (immutable union with built-in protected paths, 11 total) and hardened `readCouncilGateConfig` / `getHermesConfig` to fail closed to strict mode on missing or invalid config while preserving legitimate user-authored `councilGate: "off"`.
  - Logged explicit `source` in `.hermes/gate-log.jsonl` for every gate exception (`config`, `env`, direct `@specialist`, `fix-warnings`, `--fast-path`, micro trivial).
  - Scoped `hermes-hardcode-ignore` blanket detection strictly to the marker zone (suffixes and pre-delimiter words), eliminating false denies on free-form reason text while keeping strict `±1` line scoping, Layer 1 immunity, v1-legacy shim, and multiline checks intact.
  - Added fail-closed `deny` (RU + `[EN: ...]`) on internal hook errors and corrupt existing protected artifacts while keeping missing optional artifacts non-blocking for clean new repositories.
  - Documented protocol vs mechanical limits in `docs/known-boundaries.md` and added 16 deterministic test locks (13 REQ-5 + 3 QA audit regression locks) in `hooks/clean-edits-guard.test.mjs` (239/239 PASS, 513/513 total across 11 suites) with 0 bytes growth on `fleet-protocol.md`.

---

### [TASK-017] Hermes Fleet v4.7.0 «Руль» — Plan Gate, Auto-Spec EARS-lite, TDD Pre-Implementation & Mechanical Lessons
* **Priority:** P1 / P2
* **Target Version:** v4.7.0
* **Status:** ✅ COMPLETED in v4.7.0
* **Resolution:**
  - Extracted 3 pure-stdlib modules (`hooks/consent-validator.mjs`, `hooks/plan-gate.mjs`, `hooks/lessons-ledger.mjs`) and expanded built-in immutable protected paths from 11 to 14 (`+.hermes/plan-state.json`, `+.hermes/plan-ledger.jsonl`, `+.hermes/lessons.jsonl`), plus patched `hooks.json` `PreToolUse` matcher with `define_subagent|swarm` and hardened `SHELL_MUTATE_PATTERNS`.
  - Implemented Plan Gate (`verifyPlanGate`) running strictly after `verifyCouncilGate` and orthogonally to council mode (`councilGate: "off"` does not disable `planGate`), requiring `.hermes/plan.md` (meta-path), 4-section + EARS-lite lint (`КОГДА` / `ДОЛЖНА` / `Проверка:` + convention-claim source/honest marker), hardened 5-step consent validation (option-order text binding, Cyrillic negation-guard, colloquial approval allowlist, Edit-Dominance, anti-prose/SYSTEM echo), pre-/post-persistent anti-TOCTOU, and `v2` reconfirmation ledger.
  - Implemented REQ-3 TDD `pre-implementation` 4-factor monotonic ratchet in `syncProgressJournal` using `isStrictTestPath`, so Red tests prior to first production write never trip the stall circuit breaker while post-implementation stalls and v4.5.1 locks remain unweakened.
  - Implemented REQ-4 mechanical error memory `.hermes/lessons.jsonl` (`{ ts, taskHash, rule, reasonHash, count, source: "mechanical" }`) populated exclusively by hooks (`QA REJECT` on Stop, repeated `deny >= 2` per rule in task, `stall_breaker`), injected by `hooks/context-injector.mjs` (`<= 5` unique entries, `<= 2048` UTF-8 bytes) via static `RULE_HINTS`.
  - Added modular `skills/hermes/references/plan-steering-protocol.md`, updated `docs/known-boundaries.md` (explicitly deferring independent grader, team stop on deny, eval suite, and `TASK-005` remainder to `v4.7.1` «Инспектор»; A2A was subsequently rejected in `TASK-018`), fixed `docs/troubleshooting.md` numbering & synced `TROUBLESHOOTING.md`, and added 24 deterministic test locks across existing 11 suites with 0 bytes growth on `fleet-protocol.md`.

---

### [TASK-018] Hermes Fleet v4.7.1 «Инспектор» — Independent Grader, Team Stop, Behavioral Evals, Black Box Logs & TASK-005 Closure (REQ-0..REQ-10)
* **Priority:** P1 / P2
* **Target Version:** v4.7.1
* **Status:** ✅ COMPLETED in v4.7.1
* **Resolution:**
  - Extracted 5 pure-stdlib modules (`hooks/subagent-binding.mjs`, `hooks/grade-gate.mjs`, `hooks/team-stop.mjs`, `scripts/eval-record.mjs`, `scripts/export-logs.mjs`) and unified all **19** built-in immutable protected paths (`DEFAULT_PROTECTED_VERDICT_PATHS` + `buildProtectedShellRegex()`) in `hooks/consent-validator.mjs` (14 from v4.7.0 + `.hermes/rubric.json`, `.hermes/grade-report.json`, `.hermes/grade-ledger.jsonl`, `.hermes/team-stop.json`, `.hermes/eval-results.jsonl`). Also fixed live Antigravity `ask_question` output handling (`source: "MODEL", type: "GENERIC", status: "DONE"` with `Created At` + `Completed At` + `A1:`, hardened against batched `run_command` stdout spoofing `MEDIUM-5`).
  - **REQ-1 & REQ-2 & REQ-3 (Rubric, Independent Grader & Stop Gate):** Mechanical `.hermes/rubric.json` derivation on `PLAN_FROZEN` / `PLAN_REVISED` (preserving `previousRubricHash` in `plan-ledger.jsonl`), independent read-only grader role documented in `skills/hermes/references/independent-grading-protocol.md` (without adding a 15th agent card), mechanical `.hermes/grade-report.json` + `.hermes/grade-ledger.jsonl` verification (authentic UUID, separation of duties `∉ councilRoster ∪ writeWorkers ∪ {Lead}`, hash match, 100% `reqId` coverage, real `path:line` workspace & line-bounds check, `UNKNOWN > NOT_FULFILLED > FULFILLED` recomputation), Stop gate outside `MAX_RETURNS = 2` (`HIGH-1`), `qaVerdictMode = "legacy"`, and `isEconomySkipRequested` with 3-cycle `REWORK` ceiling, post-edit invalidation of `GRADE_USER_OVERRIDE` (`HIGH-3`), and `consent-validator.mjs`-validated user override (never flipping `overall` to `PASS`).
  - **REQ-4 (Hard-Stop `.hermes/team-stop.json`):** Triggered on `sec_l1_pattern`, `tamper_protected` (file-write & shell including `node -e`/`python -c` on `.hermes/*`, `LOW-6`), and `plan_tampered`; blocks Lead & subagent writes and write-worker spawns while permitting read-only council, diagnostics, `ask_question`, and emergency `manage_subagents(kill/kill_all)`; Lead taskHash-isolated (`superseded` on new task, while subagent-triggered stops bind to Lead `taskHash`/`unknown` so Lead cannot silently supersede them, `HIGH-2`), never cleared by mechanical `PASS`, unblocked solely via validated user consent.
  - **REQ-5 & REQ-6 (TASK-005 & Artifact-First Critic):** Closed `TASK-005` in `hooks/qa-gate.mjs` (`exact` / `fifo` / fail-closed `uncertain` with `l2_binding_uncertain`, rejecting `PLANNER_RESPONSE` prose UUID spoofing `HIGH-4`, + `bindingConfidence` in `gate-log.jsonl`) and added Stage 2 Artifact-First clause to `skills/hermes/references/specialist-council-protocol.md`.
  - **REQ-7 & REQ-8 & REQ-9 & REQ-10 (Behavioral Evals, Black Box Logs, Hardening FINDING-7..10, 55 New Locks & Honest v4.7.0 Post-Mortem):** Added `docs/evals/README.md` + 5 real-incident cards (`eval-001.json`..`eval-005.json`) + `scripts/eval-record.mjs`; added `scripts/export-logs.mjs` + `skills/hermes/references/log-export-protocol.md` (`logs/` excluded from installers, direct agent writes denied); closed `FINDING-7` (`--fast-path` rejected on complex tasks), `FINDING-8` (test suites isolated in `mkdtempSync`, never touching live `cwd/.hermes/`), `FINDING-9` (council roster excludes post-edit auditors after state loss), `FINDING-10` (plain-language 4-section plan mirror enforced on `ask_question` without internal IDs); expanded tests from 537 to 592 across 11 suites with `+0 B` on `fleet-protocol.md` (`12 275 B` disk CRLF / `12 176 B` LF); honestly recorded v4.7.0 `7fb0edd` `diffHash` discrepancy (`9a11800dcad79fb9` vs `a31a67ba4a0d3075`).

---

### [DECISION-A2A] Peer-to-Peer Agent-to-Agent (A2A) Protocol
* **Priority:** P3
* **Status:** ❌ HOLD / REJECTED (v4.7.1)
* **Rationale:** Explicitly crossed out from the roadmap based on the *Worse Together* study (2026-11-11): centralized coordinator topology outperforms peer-to-peer agent communication by **10–45 percentage points**. Hermes Fleet commits to the Lead-relay coordinator architecture reinforced by direct artifact inspection (REQ-6) and independent read-only grading (REQ-2). History in `CHANGELOG.md [4.7.0]` is preserved untouched; roadmap entries in `README.md` and `README.ru.md` have been cleaned up.
