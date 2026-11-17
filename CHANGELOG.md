# 📝 Changelog

All notable changes to the **Hermes Fleet** plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [4.6.1] - 2026-11-17

### v4.6.0 Audit Tails & TASK-004 Line-Scoped `hermes-hardcode-ignore` (TASK-015, TASK-004)
- **Pruned Member Observability Restored (REQ-1, P2):**
  - Persisted `prunedUuids` alongside active `membersCount` and active `roster` in BOTH `canEarlyStop` and full 3-stage `roundtable` `.hermes/council-state.json` records (without altering pruning enforcement).
- **Honest Multi-Domain Detection Without Reputation Inflation (REQ-2, P2):**
  - Added `detectDomains(promptText, roster)` and fixed `DOMAIN_PRIORITY` tie-breaker in `hooks/council-learning.mjs`.
  - Records full `domains: [...]` in `.hermes/council-outcomes.jsonl` and `.hermes/council-state.json`, selects deterministic `primary` (`domain`: higher match count -> fixed `DOMAIN_PRIORITY` -> first roster member default -> `'general'`), and accrues reputation strictly on `primary` only (`+1` observation per specialist per record, never `+N`).
- **Distinguished Authorship Weights (`lead_declared` vs `team_fallback`) (REQ-3, P2):**
  - Added `authorshipSource: "lead_declared" | "team_fallback"` to `.hermes/council-outcomes.jsonl` and `teamFallbackWeight: 0.5` to `REPUTATION_POLICY` (`lead_declared` = `1.0`, `team_fallback` = `0.5`, hard `±0.15` cap preserved).
  - Documented Lead's protocol obligation to populate accepted ideas authorship in `.hermes/decisions.md` in `council-learning-protocol.md` and `specialist-council-protocol.md`.
- **Line-Scoped `hermes-hardcode-ignore` (±1 Line) & ADR 0001 Compatibility Shim (REQ-4, P1 / TASK-004):**
  - Narrowed `hermes-hardcode-ignore` in `hooks/clean-edits-guard.mjs` from whole-payload suppression to strictly line-scoped `±1` (`N-1..N+1`). Violations 2+ lines away are denied.
  - Blocked blanket file-wide markers (`hermes-hardcode-ignore-file`, `whole file`, `entire file`, `на весь файл`) and bare markers without a reason.
  - Formalized `v2` (`: <reason>`), `v1-legacy` (`(<reason>)`, `= <reason>`), and `ackToken || signature` compatibility shims in `docs/adr/0001-l2-diff-review-and-anti-self-signing.md` and `TROUBLESHOOTING.md`. Layer 1 security checks remain strictly unbypassable.
- **13 New Deterministic Test Locks (10 REQ-5 + 3 QA Audit Regression Locks):**
  - Expanded `hooks/clean-edits-guard.test.mjs` to 223/223 PASS (497/497 total across 11 suites): `pruned_uuids_persisted_in_state_full_roundtable`, `domain_multimatch_recorded_primary_only`, `domain_priority_deterministic_tiebreak`, `reputation_no_inflation_from_multidomain`, `authorship_team_fallback_weight`, `authorship_lead_declared_full_weight`, `hardcode_ignore_line_scoped_allow`, `hardcode_ignore_far_violation_deny`, `hardcode_ignore_file_blanket_deny`, `hardcode_ignore_legacy_marker_shim`, plus QA regression locks `hardcode_ignore_multiline_bypass_after_scoped_ignore_deny`, `hardcode_ignore_multi_replace_cross_chunk_deny`, and `hardcode_multiline_env_fallback_allow`.

## [4.6.0] - 2026-11-17

### Outcome-Based Council Learning, Mechanical Domain Reputation & Criteria Freeze (TASK-014)
- **Protected Council Outcome Ledger (REQ-1, P1):**
  - Implemented `hooks/council-learning.mjs` and hook-written `.hermes/council-outcomes.jsonl` synced strictly from protected mechanical artifacts (`test-summary.json`, `qa-verdict.json`, `security-verdict.json`) — never MODEL prose.
  - Added `.hermes/council-outcomes.jsonl`, `.hermes/instincts.json`, and `.hermes/council-criteria.json` to default `protectedVerdictPaths` and `SHELL_MUTATE_PATTERNS` (blocking `write_file`/`edit_file` and shell redirects/removals).
  - Verified Lead-declared authorship (`source: "lead_declared"`) strictly against actual transcript roster (`verifiedInRoster`); unverified authors and `mode: "solo"` tasks never accrue specialist reputation.
- **Mechanical Specialist × Domain Reputation (REQ-2 & REQ-3, P1):**
  - Recomputed deterministically inside protected `.hermes/instincts.json` (preserving manual `instincts` rules) with documented constants: `priorScore = 0.5`, `minObservations = 3`, `maxDeltaPerObservation = ±0.15`, `halfLifeDays = 30`, clamped `[0, 1]`.
  - Strict separation invariant: reputation affects ONLY council composition recommendations (displaying honest `n=...` via `rankRecommendedSpecialists` and `context-injector.mjs`) and NEVER alters `requiredCount`, `missingNames`, user roster, devil's advocate, or gate `allow`/`deny`.
- **Criteria Freeze / Anti Metric-Shopping (REQ-4, P2):**
  - Hook freezes SHA-256 hash of board criteria (`## Критерии оценки` / `## Criteria`) into `.hermes/council-criteria.json` at Stage 2 completion and verifies immutability before Stage 3 acceptance (`deny` on metric-shopping).
  - Documented protocol-level arbitrator role (`@stanislav` or Lead log in `.hermes/decisions.md`) in `skills/hermes/references/council-learning-protocol.md`.
- **Name → UUID Binding Honesty / Partial Closure of TASK-005 (REQ-5, P2):**
  - Prioritized exact `tool_call_id` matching (`bindingConfidence: "exact"`) with single-invoke FIFO (`"fifo"`) and ambiguous multi-invoke marking (`"uncertain"`). Uncertain bindings participate in quorum but never accrue reputation.
- **v4.5.1 Audit Tails Closed (REQ-6, P3):**
  - Early stop phrasing `«Завершить сейчас, пропустить R3»` / `«Завершить сейчас, без R3»` now accepted via negative lookbehind (`SKIP_R3_PREFIX`) while preserving fail-closed rejection on bare `R3` / `Провести R3`.
  - Fallback `[CONVERGED]` attribution (steps without `[Message]` prefixes) now slices strictly per-sender segments so markers never leak across agents.
- **21 New Deterministic Test Locks (REQ-7 + QA Regression Locks):**
  - Expanded `hooks/clean-edits-guard.test.mjs` to 210/210 PASS (484/484 total across 11 suites): `outcome_ledger_written_from_artifacts`, `outcome_not_written_from_model_prose`, `deny_write_file_council_outcomes`, `deny_write_file_instincts`, `deny_shell_redirect_instincts`, `reputation_min_samples_threshold`, `reputation_bounded_delta`, `reputation_decay`, `reputation_cannot_drop_named_specialist_deny`, `authorship_not_in_roster_rejected`, `solo_mode_no_specialist_reputation`, `criteria_freeze_changed_after_r2_deny`, `criteria_freeze_unchanged_allow`, `binding_uncertain_no_reputation`, `early_stop_skip_r3_phrasing_allow`, `converged_marker_fallback_segment_deny`, plus 5 QA audit regression locks (`criteria_freeze_real_r2_board_edit_tamper_deny`, `deny_shell_mv_cp_and_node_unlink_protected_artifacts`, `reputation_no_double_decay`, `declared_authors_cyrillic_and_no_rejected_leak`, `stale_artifact_not_reused_across_tasks`).

## [4.5.1] - 2026-11-17

### Stall Circuit Breaker Fix & Intent Binding for Escalation / Early-Stop Windows (HERMES-STALL-INTENT-FIX, TASK-013)
- **Progress Journal Attempt Identity & Idempotency (REQ-1, P0):**
  - Fixed `syncProgressJournal` in `hooks/clean-edits-guard.mjs` so repeated real test/QA failures with unchanged or absent `diffHash` accumulate by artifact identity key `(taskHash, outcome, diffHash || null, artifactTimestamp || contentHash)` instead of requiring an outcome/diffHash flip.
  - Added deterministic SHA-256 content-hash fallback when artifacts omit timestamps (zero timestamp fabrication).
  - Preserved idempotency across repeated hook calls with unchanged artifacts, stale-artifact timestamp guard, `PASS` counter reset, and `stalled = consecutiveFails >= 3`.
- **Escalation Override — Intent Binding & Cyrillic Negation-Guard (REQ-2, P1):**
  - Bound stall override selection to the actual text of the chosen `ask_question` option (`options[0]`/`options[1]`) rather than assuming option number.
  - Added Cyrillic-aware word-boundary negation-guard (`(?<![а-яёa-z0-9_-])` / `(?![а-яёa-z0-9_-])`) so negated replies like «не хочу сам, зови стол» or «самостоятельно не надо» never trigger override.
- **Early Stop — Intent Binding & Cyrillic Negation-Guard (REQ-3, P1):**
  - Bound early-stop selection to the text of the chosen option with Cyrillic negation-guard («Никакого раннего стопа, проводим R3») and fail-closed fallback to mandatory Stage 3. Preserved Dissent Dominance (`[DISSENT]` overrides consensus).
- **Sender UUID Attribution for Convergence Markers (REQ-4, P2):**
  - Split multi-message `SYSTEM` transcript steps into per-sender `[Message]` chunks so `[CONVERGED]` / `[NO DISSENT]` is checked exclusively inside the designated devil's advocate (`@kritik`/`@stanislav`) message chunk, preventing cross-sender leakage.
- **Escalation Numeric Option 1 Enforces 3-Stage Roundtable (REQ-5, P2):**
  - Updated escalation context handling so choosing `"1"` / `"A1"` on the stall escalation window (`1. Собрать стол`) unconditionally activates 3-stage `roundtable` (`requiredRounds = 3`) instead of falling back to 1-round parallel council.
- **Documentation & Backlog Grounding (REQ-6, P2):**
  - Documented recommended Model Cascade tiering (`flash` for R1 scouts, `pro`/`inherit` for devil's advocate and synthesis) in `skills/hermes/references/specialist-council-protocol.md` with honest Antigravity platform constraint note.
  - Synchronized Engineering Roadmaps in `README.md` / `README.ru.md` with `docs/backlog.md` (`v4.6.0` for `TASK-004`/`TASK-005`) and registered `TASK-009`..`TASK-013` in `docs/backlog.md`.
- **15 New Deterministic Test Locks (REQ-7 + QA Regression Locks):**
  - Expanded `hooks/clean-edits-guard.test.mjs` to 189/189 PASS (463/463 total across 11 suites):
    * `stall_accumulates_three_real_test_failures_deny` (hook-generated journal, no setup seeding), `stall_accumulates_with_stale_qa_diffhash_deny`, `stall_no_double_count_on_repeated_hook_calls`, `stall_override_negated_deny`, `stall_override_negated_long_word_deny`, `stall_override_option_order_bound`, `early_stop_negated_deny`, `early_stop_option_order_bound_deny`, `early_stop_marker_from_other_sender_deny`, `escalation_numeric_option1_is_roundtable_deny`, plus 5 QA audit regression locks (`stall_override_a1_prefix_option2_deny`, `early_stop_a1_prefix_option2_deny`, `stall_override_negated_completes_roundtable_allow`, `stall_accumulates_test_fails_with_stale_qa_reject_deny`, `stall_override_cyrillic_boundary_pre_allow`).

## [4.5.0] - 2026-11-17

### Council Token Economy, Progress Journal, Stall Circuit Breaker & Escalation (HERMES-COUNCIL-STALL-ESCALATE)
- **Early Stop via 2FA & Dissent Dominance (REQ-1):**
  - Added optional Early Stop `ask_question` dialog after Stage 2: «Стол сошёлся: завершить без стадии ранжирования (R3)?» with options `(1) Завершить сейчас (экономия)` and `(2) Провести R3 (полный протокол)`.
  - Fail-closed mechanical conjunction in `clean-edits-guard.mjs`: early stop allowed strictly when user explicitly chooses Option 1, full R1/R2 deliveries are verified, and devil's advocate (`@kritik` / `@stanislav`) delivered authentic `[CONVERGED]` / `[NO DISSENT]` without any `[DISSENT]`.
  - Dissent Dominance: `[DISSENT]` unconditionally overrides consensus and makes Stage 3 mandatory. State tracked as `earlyStop: true, requiredRounds: 2, roundsCompleted: 2, reason: "early_stop_converged"`.
- **Agent Dropout / Pruning without Weakening Quorum (REQ-2):**
  - Lead may prune ONLY extra members not named in user-selected option (`extra = dispatchedTypes \ expectedNames`).
  - Pruning named specialists, devil's advocates (`kritik`/`stanislav`), or dropping below required quorum is blocked (`deny`).
  - Pruned members recorded in `council-state.json` (`prunedUuids`); subsequent waves evaluate against active roster.
- **Progress Journal, Stall Circuit Breaker & Escalation (REQ-3):**
  - Protected artifact `.hermes/progress-journal.jsonl` added to `protectedVerdictPaths` and shell mutate patterns.
  - Test/QA outcomes synced strictly from protected machine artifacts (`.hermes/test-summary.json`, `qa-verdict.json`, `security-verdict.json`). Fabricated prose assertions ignored (Rule 13).
  - Circuit Breaker: $\ge 3$ consecutive FAIL records on the same `taskHash` without intervening PASS triggers `stalled`.
  - Further write operations blocked (`deny`) until: (a) escalation roundtable via `ask_question`, (b) validated user override («продолжить сам»), or (c) mechanical PASS.
  - Escalation recorded in `council-state.json` (`escalation: { taskHash, status, mode, timestamp }`) without corrupting base decision.
- **Model Cascade & Honest Cost Telemetry (REQ-4):**
  - Token usage recorded in `.hermes/council-cost.jsonl`. When usage is absent from host/payload, logged as `{ tokens: null, source: "unavailable" }` without fabricated numbers (Rule 13).
  - Price tags in council window labeled «оценка (диапазон)» or «измерено» when $\ge 3$ empirical measurements exist.
- **Structural Recognition of Option 2 (REQ-5):**
  - In 3-option windows where Option 3 is solo, selection of Option 2 (including numeric `"2"`) is unconditionally recognized as `roundtable`.
- **Deterministic Test Suite Expansion (REQ-6):**
  - Added 15 new deterministic test locks in `clean-edits-guard.test.mjs` (174/174 PASS):
    * `deny_write_file_progress_journal`, `numeric_option2_without_markers_is_roundtable_deny`, `early_stop_without_user_answer_deny`, `early_stop_forged_model_prose_deny`, `early_stop_user_approved_converged_allow`, `early_stop_opponent_dissent_requires_r3_deny`, `prune_extra_member_allow`, `prune_named_specialist_deny`, `prune_devil_advocate_deny`, `stall_three_failures_blocks_write_deny`, `stall_forged_prose_deny`, `stall_validated_user_override_allow`, `stall_escalation_roundtable_allow`, `stall_reset_on_real_pass_allow`, `cost_telemetry_no_fabricated_numbers`.

## [4.4.0] - 2026-11-17

### Canonical 3-Stage Roundtable (NGT / Delphi), Devil's Advocate & Dissent Preservation (HERMES-ROUNDTABLE-NGT)
- **3-Stage Roundtable Engine (REQ-1):**
  - Upgraded `verifyCouncilGate` in `hooks/clean-edits-guard.mjs` to enforce 3 distinct stages for roundtable mode (`requiredRounds: 3`):
    * Stage 1 (R1): «Silent» independent proposal generation (`invoke_subagent` + deliveries).
    * Stage 2 (R2): Full proposal exchange on `.hermes/council-roundtable.md` board, round-robin critique, Steelman, and **MANDATORY devil's advocate** (`@kritik` or `@stanislav` from table roster) + deliveries.
    * Stage 3 (R3): Blind ranking without author names via `send_message` + deliveries from all members.
  - Fail-closed wave progression: wave $N+1$ dispatch/delivery only proceeds after wave $N$ is fully delivered by all roster participants.
  - State tracking in `.hermes/council-state.json`: `requiredRounds: 3`, `roundsCompleted: 3`. Tamper-protection preserved.
- **Council Protocol & Anti-Conformism Doctrine (REQ-2):**
  - Updated `specialist-council-protocol.md`:
    * Nominal Group Technique (NGT) & Delphi method to eliminate anchoring bias and authority bias.
    * Hidden profile protection: every specialist is required to surface a unique domain fact.
    * Steelman principle: formulating the strongest version of another's idea prior to critique.
    * Blind ranking aggregated via objective mathematical methods (median / Borda count).
    * Arbitrator criteria audit (`@stanislav`) to eliminate metric-shopping.
    * Dissent preservation: lone dissenters protected; dissenting opinions and rejected alternatives logged in `.hermes/decisions.md` with full attribution.
    * Diversity prediction theorem: prioritizing divergence of angles/domains over head count.
    * Honest price tag updated: ~60k–150k tokens, ~5–9 min.
  - Core `fleet-protocol.md` updated and physically measured at 12 191 B (CRLF) / 12 092 B (LF) $\le 12\,288$ B budget.
- **Deterministic Test Locks (REQ-3):**
  - Added 4 new deterministic test locks in `clean-edits-guard.test.mjs` (total 159/159):
    * `roundtable_2_stages_deny`: 2 stages rejected under v4.4.0.
    * `roundtable_missing_r3_deny`: missing stage 3 deliveries rejected.
    * `roundtable_no_devil_advocate_deny`: stage 2 without devil's advocate (`@kritik` / `@stanislav`) rejected.
    * `roundtable_3_stages_allow`: full 3-stage flow with devil's advocate and blind ranking approved.
    * `forged_ranking_prose_deny`: prose claiming ranking completed without platform deliveries rejected.

## [4.3.0] - 2026-11-17

### Universal Council Window, Proposal Contract, Board & Basic Roundtable (HERMES-COUNCIL-ROUNDTABLE)
- **Universal 3-Option Council Window (REQ-1):**
  - Updated `verifyCouncilGate` in `hooks/clean-edits-guard.mjs` to support exactly 3 options:
    1) `Посоветоваться с работниками: @имена — независимые мнения + синтез (1 раунд)` (legacy key specialist is single-name case of this option).
    2) `🗣️ Собраться за столом: @имена — живое обсуждение, 2 раунда (базовый roundtable)`.
    3) `Нет, оркестр решает сам (экономия токенов)`.
  - Added `mode` (`"parallel" | "roundtable" | "solo"`), `requiredRounds`, and `roundsCompleted` to `.hermes/council-state.json`. Tamper protection for `council-state.json` preserved.
  - Backwards-compatible parsing: legacy «ключевой специалист» continues to map cleanly to parallel mode with single name.
- **Basic 2-Round Roundtable Mechanics (REQ-2):**
  - Round 1: independent proposals of roster (`invoke_subagent` + deliveries in Contour A).
  - Lead summarizes full proposals on `.hermes/council-roundtable.md` board and distributes them to roster via `send_message`.
  - Round 2: participants react to proposals of others + deliveries.
  - Mechanical gate requires $\ge 2$ full rounds of authentic SYSTEM deliveries from all roster members. Forged MODEL prose is rejected. Auto-mode defaults to parallel.
- **Proposal Contract, Board, Price Tag & Adaptive Recommendation (REQ-3):**
  - Canonical 10-point proposal contract in `specialist-council-protocol.md`: idea, rationale, pros, risks/edge cases, unique domain fact, verification plan, pre-mortem, cost, confidence, what would change mind. De-hallucination rule: questions before assertions.
  - Board `.hermes/council-roundtable.md`: full proposals and lightweight file/line links, Contour A read access.
  - Honest price tag: token/time ranges per option in window without fabricated metrics (Rule 13).
  - Adaptive recommendation: trivial $\rightarrow$ solo, standard $\rightarrow$ parallel, complex/architectural $\rightarrow$ roundtable.
  - Core `fleet-protocol.md` updated and measured at 12 141 B (strictly $\le 12\,288$ B budget).
- **Mechanical Test Suite Expansion (REQ-4):**
  - Added 7 deterministic test locks to `hooks/clean-edits-guard.test.mjs` (suite total: 155):
    - `roundtable_1_round_deny`
    - `roundtable_missing_r2_deny`
    - `roundtable_2_rounds_allow`
    - `option1_parallel_single_key_allow`
    - `option3_solo_allow`
    - `roundtable_name_quorum_deny`
    - `forged_roundtable_prose_deny`

## [4.2.2] - 2026-11-17

### Specialist Council Quorum by Name & Reporting Hygiene (HERMES-COUNCIL-NAMES)
- **Named Specialist Quorum Enforcement (REQ-1):**
  - Updated `verifyCouncilGate` in `hooks/clean-edits-guard.mjs`: `expectedNames` are filtered to valid fleet specialists (`HERMES_AGENTS`), ignoring extraneous `@tokens`.
  - Added named coverage verification: detects `missingNames` not invoked in `dispatchedTypes` and denies with actionable error specifying missing specialists.
  - Enriched existing council fixtures with authentic `invoke_subagent` calls with `TypeName`.
  - Added 4 deterministic test locks:
    - `deny_council_gate_option1_missing_named_specialist` (counts match, but wrong specialist invoked)
    - `allow_council_gate_option1_all_named_specialists_present` (all expected specialists invoked and delivered)
    - `deny_council_gate_option2_wrong_key_specialist` (key specialist mismatch)
    - `allow_council_gate_option2_correct_key_specialist_with_invoke` (correct key specialist invoked and delivered)
- **Reporting & Core Measurement Hygiene (REQ-2):**
  - Added measurement requirement to `docs/release-checklist.md`: core protocol size and test totals must be measured directly from disk and `.hermes/test-summary.json`, never recalled from memory.
  - Verified exact core `fleet-protocol.md` size adherence to the $\le 12\,288$ B budget.

## [4.2.1] - 2026-11-17

### Council Gate Hardening & Delayed Honesty (HERMES-COUNCIL-HARDENING)
- **Tamper Protection for council-state.json (REQ-1):**
  - Added `.hermes/council-state.json` to default `protectedVerdictPaths` in `hooks/clean-edits-guard.mjs`. Model tool calls (`write_file`, `edit_file`) targeting `council-state.json` are denied with Tamper Protection; mechanical gate execution via `fs.writeFileSync` remains fully functional.
  - Added deterministic tests `deny_write_file_council_state` and `deny_edit_file_council_state`.
- **Step 0 Handshake Isolation from Council Gate (REQ-2):**
  - Updated Step 0 Model Handshake validator in `hooks/clean-edits-guard.mjs` to exclude Council Gate `ask_question` calls from fulfilling model handshake prerequisites.
  - Added test `deny_step0_when_only_council_ask_present`.
- **Council Composition & Quorum Verification (REQ-3):**
  - Enhanced `verifyCouncilGate` to parse option selection (Option 1 full council vs. Option 2 key specialist).
  - Enforced delivery count matches expected specialists count from option text (`dispatchedUuids.size >= requiredCount` and `deliveredUuids.size >= requiredCount`).
  - Added tests `deny_council_gate_option1_with_fewer_deliveries_than_specialists` and `allow_council_gate_option2_key_specialist_with_one_delivery`.
- **Solo Matcher Negation Guard & Direct-Next Anchoring (REQ-4):**
  - Added Cyrillic-aware negation guard (`SOLO_NEGATION_RE`) to reject negative intents like "не надо экономия токенов" from activating solo mode.
  - Restricted answer capture to direct-next step to prevent accumulation of unrelated later user steps.
  - Added test `deny_council_gate_negated_solo_choice`.
- **Loop & Fast-Path Boundary Hardening (REQ-5):**
  - Restricted loop decision reuse strictly to identical `taskHash` (eliminating false reuse from substring "loop" on new tasks).
  - Restricted Fast-Path bypass to explicit flags (`--fast-path`, `--quick`, `/hermes fast-path`) or standalone trivial typo tasks; complex composite prompts ("исправь опечатку и отрефактори модуль") enforce Council Gate.
  - Added tests `deny_council_gate_new_task_mentioning_loop_does_not_reuse_old_loop_approval` and `deny_council_gate_compound_prompt_with_typo_and_refactor_not_fast_path`.
- **Test Runner Delayed Honesty & Roadmap Alignment (REQ-6):**
  - Replaced premature `status: "PASS"` in `hooks/test-runner.mjs` bootstrap and intermediate summaries with honest `status: "RUNNING"`, `passed: null`.
  - Updated consistency test suite to enforce zero premature PASS during in-progress executions.
  - Updated Engineering Roadmap in `README.md`, `README.ru.md`, and `docs/backlog.md` with current milestones (`v4.3.0` / `Post-v4.3`).
  - Synchronized real test count to 418 passed tests across 11 suites (Rule 13).

---

## [4.2.0] - 2026-11-17

### Specialist Council Gate Pre-Plan Enforcement (HERMES-COUNCIL-GATE)
- **Protocol & Documentation (REQ-1):**
  - Updated `skills/hermes/SKILL.md` Phase 2 to make Council Gate a mandatory milestone before deep planning and freezing the implementation plan.
  - Added Council Gate specification in `skills/hermes/references/fleet-protocol.md` (Rule 12 / Phase 2) while strictly preserving the 12 KB core protocol budget (12,160 <= 12,288 bytes).
  - Created comprehensive modular reference `skills/hermes/references/specialist-council-protocol.md` defining dialog window format, Contour A read-only council execution, anti-formalism requirements, and `.hermes/decisions.md` synthesis.
  - Added domain-to-council recommendation matrix (`specialist-dispatch-matrix.md`) mapping 11 software and industrial domains to recommended councils (≤3–4 experts).
  - Introduced `/hermes council [task]` command across commands reference and documentation.
- **Mechanical PreToolUse Council Gate (REQ-2):**
  - Implemented mechanical PreToolUse lock in `hooks/clean-edits-guard.mjs`: blocks the first write tool (`write_file`, `edit_file`, `define_subagent` with `EnableWriteTools: true`, `swarm`) in Standard/Complex tasks without an approved Council Gate decision.
  - Reused hardened Token Economy Gate validators (`USER_EXPLICIT` or harness-bound `isDirectNext` + status `DONE` + banner) rejecting MODEL prose and forged SYSTEM echoes.
  - Bound council execution to authentic deliveries from launched specialist UUIDs before allowing write access.
  - Enforced session and task binding via `.hermes/council-state.json` preventing stale decisions from leaking across tasks.
- **Configuration & Troubleshooting (REQ-3):**
  - Added `councilGate` configuration support in `.hermes/config.json` (`"ask"` default, `"auto"`, `"off"`).
  - Added dedicated troubleshooting sections in `TROUBLESHOOTING.md` and `docs/troubleshooting.md`.
- **Mechanical Test Suite (REQ-4):**
  - Added 12 deterministic unit and integration test cases in `hooks/clean-edits-guard.test.mjs` verifying negative locks, valid solo decisions, pending deliveries, authentic deliveries, forged prose rejection, Fast-Path bypass, loop iterations, task isolation, and configuration modes.

---

## [4.1.2] - 2026-11-16

### Mechanical QA Rails Plumbing & Producer Integration (HERMES-QA-PLUMBING)
- **Requirements Ledger Bootstrap & Orchestrator Plumbing (REQ-1):**
  - Updated Lead orchestration rules (Rule 2 & SKILL.md Phase 2): Lead must bootstrap `.hermes/tasks.json` with `REQ-1..N` marked `DONE` before verification.
  - Added CLI flag `--reqLedger=...` and env var `HERMES_REQ_LEDGER` to `qa-runner.mjs`.
  - Added graceful opt-out `--requireReqLedger=false` / config `requireReqLedger: false` tagging `reducedAssurance: "empty-ledger-opt-out"` for ad-hoc projects.
- **Viktor & Canonical Verification Pipeline Specification (REQ-2, REQ-3):**
  - Created modular specification `skills/qa-test-automation/references/qa-verdict-protocol.md` defining the canonical 8-stage verification pipeline.
  - Plumbed Viktor agent card (`agents/viktor.md`) to adhere to the iron rule: artifact status dictates prose (`status !== "PASS"` strictly issues `[QA REJECT]`).
- **Session & Turn Cryptographic Binding (REQ-4):**
  - Strictly enforced `conversationId` and `turnMarker` binding on `qa-verdict.json` mirroring `security-verdict.json`.
  - Mismatched or absent session parameters are fail-closed rejected with actionable diagnostic reasons.
- **Actionable Diagnostic Failure Reasons (REQ-7):**
  - Enhanced `qa-gate.mjs` rejection messages with detailed failure reasons array (`failedChecks`) recorded in `.hermes/gate-log.jsonl`.
- **Mutation Report Freshness & Honest Parameters (REQ-6):**
  - `parseMutationReport` checks timestamp freshness (`mtimeMs >= minTimestampMs`), rejecting pre-existing stale reports.
  - Documented realistic mutation runner parameters in ADR-0005 (60s budget, Stryker `--concurrency=1`, honest mutmut status).

---

## [4.1.1] - 2026-11-16

### Mechanical QA Rails Honesty & Anti-Tamper Hardening (HERMES-QA-HONESTY-PATCH)
- **diffHash Hermetic Isolation (REQ-1 / P0):**
  - Hermetically isolated `.hermes/` and configured internal paths (`excludePaths` via Rule 9) from `computeWorkingTreeDiffHash`.
  - Filtered `.hermes/` from `git status --porcelain -uall`, untracked file discovery, and `git diff` pathspecs (`:(exclude).hermes`).
  - Fixed self-invalidation vulnerability in repositories lacking `.gitignore` where writing `qa-verdict.json` or appending to `gate-log.jsonl` altered the verdict hash.
- **Rule 13 Mutation Testing Honesty & Real Report Parsing (REQ-2 / P0):**
  - Eliminated metric fabrication in `runMutationTesting`: zero mutants or missing tooling now yields `status: "no-mutants"` or `"unavailable"`, `killRate: null` (never fabricated `1.0` or false `PASS`).
  - Added real artifact parsing for Stryker (`reports/mutation/mutation.json`) and Stryker.NET (`StrykerOutput/**/mutation-report.json`).
  - Enforced strict gate rejection in `mutationMode: "strict"` when mutants survive, report is unavailable, or `killRate` is null.
- **Requirements Ledger Integrity & Zero Fabrication (REQ-3 / P1):**
  - Removed hardcoded default `['REQ-1']` fallback in `qa-runner.mjs`; unresolved requirements fail-closed (`reqLedger: []`).
  - `qa-gate.mjs` verifies `reqLedger` strictly covers all requirements specified in user prompt (`REQ-1..N`) and active sprint tasks.
- **Symmetric Viktor Binding & Anti-Show Protection (REQ-4 / P1):**
  - Made `viktorUuid` strictly mandatory on `qa-verdict.json`, validating against active subagent session UUIDs.
  - Eliminated static default `ackToken: "viktor-qa-pass"` in favor of dynamic UUID tokens.
  - Added `conversationId` and `turnMarker` binding on `qa-verdict.json` mirroring `security-verdict.json`.
  - Enforced Anti-Show Protection: Viktor's delivery text must explicitly contain `diffHash`.
- **Verdict Artifact Tamper Protection (REQ-5 / P1):**
  - `clean-edits-guard.mjs` intercepts and denies `write_file` and `edit_file` targeting verdict artifacts (`qa-verdict.json`, `security-verdict.json`, `mutation-report.json`, `test-summary.json`).
  - Verdict creation restricted to mechanical OS processes (`qa-runner.mjs`).
- **Dynamic Configuration & Freshness TTL (REQ-6):**
  - Added `qaVerdictTtlMs` (default 5 min = 300,000 ms) and `excludePaths` to `getHermesConfig()` and `.hermes/config.json`.
  - Softened overclaims in `ADR-0005` with realistic threat modeling and residual risk documentation.
- **CI Matrix Resilience (REQ-7):**
  - Configured `strategy.fail-fast: false` in `.github/workflows/ci.yml` across Ubuntu and Windows test runners.

## [4.1.0] - 2026-11-16

### Mechanical QA Rails & Artifact-Driven Gate Acceptance (HERMES-QA-MECHANICAL-RAILS, B1–B5)
- **Mechanical QA Writer (`hooks/qa-runner.mjs`, Track B2):**
  - Implemented automated multi-stack detection supporting `.NET` (`dotnet test`), Python (`pytest`), Node.js (`test-runner.mjs`, `npm test`), and Go (`go test ./...`).
  - Executes real test processes, captures operating system exit codes in `testExitCodes: [number]`, and computes deterministic working tree SHA-256 `diffHash`.
  - Deterministically writes `.hermes/qa-verdict.json` conforming to `qa-verdict.schema.json` with zero LLM prose generation.
- **Fail-Closed Artifact Stop Gate Acceptance (`hooks/qa-gate.mjs`, Track B1):**
  - Transitioned `[QA PASS]` verification from conversational transcript text token parsing to a machine-verified artifact (`.hermes/qa-verdict.json`).
  - Enforced strict invariants: schema compliance, `runner: "mechanical"`, all `testExitCodes === 0`, non-empty `reqLedger`, `diffHash` binding to touched snapshots or git working tree, freshness TTL <= 5 minutes, authentic Viktor invocation, and subagent delivery binding.
  - Added compatibility mode `qaVerdictMode: "artifact" | "legacy"` (defaults to `"artifact"`; `"legacy"` mode outputs deprecation warning and accepts transcript tokens).
- **Mutation Testing MVP (`hooks/qa-runner.mjs`, Track B3):**
  - Implemented diff-scoped mutation testing (budget <= 20 mutants, 60s timeout) with automated detection for Stryker (Node/.NET) and mutmut (Python).
  - Adheres strictly to Rule 13 (Data Honesty): toolchain absence is reported honestly as `mutation: "unavailable"`, never fabricated.
  - Advisory by default (`mutationMode: "advisory"`); optional `mutationMode: "strict"` blocks gate on survived mutants.
- **Comprehensive Negative & Anti-Spoofing Vectors (`hooks/qa-gate.test.mjs`, Track B4):**
  - Added 11 negative and compliance tests verifying rejection on non-mechanical runners, stale diffHash, UUID mismatch, missing/non-zero exit codes, empty reqLedger, schema violations, missing artifact, transcript-only attempts, and survived mutants in strict mode.
  - Expanded `qa-gate` test suite to 88/88 PASS (100% clean).
- **Changes-Under-Review diffHash Binding Fix (`HERMES-QA-DIFFHASH-FIX`):**
  - Eliminated degenerate empty diffHash (`01ba4719c80b6fe9` / `e3b0c44298fc1c14`) on clean trees with commits ahead of upstream by binding verdict diffHash to real changes relative to base (`resolveBaseRef`), covering both committed branch changes and uncommitted edits.
  - Enforced fail-closed gate rejection of empty/degenerate diffHash whenever commits or working tree changes exist ahead of base.
- **Full Working Tree diffHash Binding (`HERMES-QA-DIFFHASH-WORKTREE`):**
  - Extended `computeWorkingTreeDiffHash` to inspect all untracked files across nested subdirectories using `git status --porcelain -uall`.
  - Switched untracked file content hashing from UTF-8 string concatenation to binary SHA-256 buffers, preventing encoding errors and blind spots on nested directories.
  - Added acceptance tests 7–9 in `hooks/qa-gate.test.mjs` (uncommitted tracked edits rejection, untracked files rejection, and full state divergence consistency), expanding the test suite to 91/91 PASS and total project suite to 381/381 PASS.
  - Implemented robust fallback to `HEAD^{tree}` + working diff for detached HEAD or repos without upstream, guaranteeing distinct HEAD commits yield distinct hashes.
  - Established `computeWorkingTreeDiffHash` in `hooks/qa-runner.mjs` as single source of truth shared by `qa-gate.mjs` and `skills/hermes/scripts/journal.mjs`.
  - Added 6 dedicated acceptance tests covering non-empty hashes, degenerate empty rejection, distinct HEAD commits, session commit invalidation, runner/gate consistency, and mechanical verdict regeneration.
- **Architectural Documentation & Troubleshooting (Track B5):**
  - Authored `docs/adr/ADR-0005-mechanical-qa-rails-and-artifact-gate.md` with cross-references to ADR-0001 and ADR-0004.
  - Created `docs/troubleshooting.md` documenting QA gate rejection diagnostics and resolution.
  - Updated `skills/qa-test-automation/SKILL.md` and `skills/hermes/references/fleet-protocol.md` (Rule 4).
  - Recorded completion of TASK-008 in `docs/backlog.md`.

## [4.0.0] - 2026-11-15

### Gas Town Refinery Merge-Queue Automation (TASK-003) — MAJOR
- **Architectural Decision & Formal ADR (ADR-0002, REQ-1):**
  - Formulated and documented `docs/adr/ADR-0002-refinery-merge-queue.md` analyzing integration of the Gas Town Refinery merge queue with Google Antigravity subagent branch workspaces.
  - Evaluated interception points: rejected `PreToolUse` (git) and `Stop` hooks due to strict 10-second platform execution ceilings and fail-open requirements; adopted standalone user-space CLI and library `scripts/refinery.mjs`.
  - Formally reviewed and adopted by Lead Orchestrator, Chief Fleet Auditor (Stanislav), and Lead QA & AppSec (Viktor) prior to implementation.
- **Refinery Merge Queue & Bisecting Pipeline (`scripts/refinery.mjs`, REQ-2):**
  - Implemented automated Bors-style serial integration pipeline merging parallel write-worker branches (`Workspace: "branch"`) into a temporary staging branch (`hermes/refinery-staging-<timestamp>`).
  - Implemented recursive binary bisection (`bisectCandidates`): upon Single Build Gate failure (`npm test`), the pipeline automatically isolates the offending branch with exact build error output, while safely merging all passing branches into the target branch.
  - Implemented strict ref sanitization (`validateBranchName`), rejecting CLI flags (`--*`), path traversal (`..`), reflog traversal (`@{`), and git forbidden characters.
  - Implemented fail-open atomic rollback (`safeRollback`) via `git merge --abort` and `git checkout`, guaranteeing zero repository corruption or dirty files on unexpected crashes or 3-way conflicts.
  - Zero external Go binaries (`gt`), zero patch scripts (Rule 8), zero hardcoding of paths/IPs (Rule 9).
- **Beads Ledger Integration & Anti-Premature Kill Preservation (REQ-3):**
  - Integrated status synchronization with `.hermes/tasks.json`: accepted branches mark tasks as `DONE` with `mergedAt`; bisected/rejected branches mark tasks as `FAILED` with `mergeError`.
  - Preserved the Anti-Premature Kill invariant: `scripts/refinery.mjs` never kills subagents; worker lifecycle remains strictly governed by Lead under the Watchdog recovery ladder.
  - Updated `skills/hermes/references/orchestrator-parallel.md` documenting usage of `scripts/refinery.mjs`.
- **Refinery Test Suite & Baseline Expansion (REQ-4):**
  - Added dedicated test suite `hooks/refinery.test.mjs` covering positive green batch merges, red batch bisection isolation, injection resistance, atomic rollback, and Beads ledger updates.
  - Registered `refinery` as the 10th suite in `hooks/test-runner.mjs`, updating baseline to **324 tests** (324/324 PASS).
  - Updated `hooks/consistency.test.mjs` test 13 and test 17 to validate 10 suites and `scripts/refinery.mjs` + `ADR-0002` integrity.
- **Universal Version Alignment (REQ-5):**
  - Synchronized MAJOR version `4.0.0` across all 7 targets: `plugin.json`, `package.json`, `README.md`, `skills/hermes/references/fleet-protocol.md`, `skills/hermes/SKILL.md`, `install.ps1`, and `install.sh`.
  - Added `"scripts"` directory to `install.ps1` and `install.sh` distribution payload.

### Security Hardening, Anti-Self-Signing & Platform Alignment
- **Symmetric UUID Verdict Binding (qa-gate.mjs, REQ-4):**
  - Bound verdict recognition strictly to authentic incoming `SYSTEM` deliveries from verified subagent session UUIDs: `[QA PASS]` and `[SECURITY PASS]` strictly from `@viktor`, `[COMPLIANCE PASS]` strictly from `@stanislav`, and `[UX PASS]` strictly from `@kritik`.
  - Prohibited name and string fallbacks (`sender="viktor"`, `s.sender`) and model prose spoofing; enforced TDD negative locks.
- **Verdict Confirmation Token Renaming (ackToken, REQ-5):**
  - Renamed `signature` to `ackToken` across JSON schemas (`security-verdict.schema.json`), contract validators, hooks, tests, and ADR 0001, clarifying its role as an audit acknowledgment token rather than an asymmetric cryptographic signature.
- **Hook Matcher Optimization (hooks.json, REQ-6):**
  - Removed `view_file` and `read_file` from `hermes-clean-edits` PreToolUse hook matcher, eliminating unnecessary 4MB parse overhead on read events while maintaining strict write and execution controls.
- **Rule 9 Escape Hatch (hermes-hardcode-ignore, REQ-7):**
  - Introduced `// hermes-hardcode-ignore: <mandatory reason>` inline comment for intentional constants (such as local dev loopback bindings); requires non-empty reason and logs to `.hermes/gate-log.jsonl`; strictly maintains Layer 1 security blocks (`innerHTML`, `eval`).
- **Internationalization of Gate Messages (i18n, REQ-8):**
  - Added single-line English translations (`[EN: ...]`) to all Russian deny and block notifications across `clean-edits-guard.mjs` and `qa-gate.mjs`.

## [3.10.0] - 2026-11-15

### Marketplace Readiness & Polish
- **Antigravity Marketplace Technical Validation (REQ-3):**
  - Fully validated against `agy plugin validate --strict .` and `agy plugin validate --strict --json .` with exit code 0 and `findings: []` (0 errors, 0 warnings).
  - Trimmed `suggestedPrompts` in `plugin.json` from 6 to the top 3 core prompts (`/hermes`, `@kritik`, `@viktor`) to satisfy platform display limits.
  - Calibrated `plugin.json` description to 139 characters (within 120–160 character recommended window).
  - Verified `assets/logo.svg` square high-contrast 128x128 SVG format.
- **Dedicated `doc-lint` Test Suite (REQ-1):**
  - Added formal named `doc-lint` test suite (`hooks/doc-lint.test.mjs`) executing all 15 skill pattern verification scripts (`skills/*/scripts/verify-*-patterns.mjs`).
  - Integrated `doc-lint` into `hooks/test-runner.mjs` `SUITES` registry, expanding test execution from 8 to 9 suites and baseline from 300 to 315 tests.
- **Specification-Driven Development Templates (REQ-4, TASK-005):**
  - Created `skills/hermes/references/spec-driven-templates.md` containing standardized feature specification (`spec.md`), technical architecture plan (`plan.md`), and task breakdown (`tasks.md`) templates adapted from `github/spec-kit` (Apache License 2.0).
  - Added Section 13 attribution for `github/spec-kit` in `THIRD_PARTY_NOTICES.md`.
  - Evaluated and recorded `ADOPT (Templates) / HOLD (specify-cli runtime)` decision in `docs/backlog.md` [TASK-005], preventing unnecessary Python runtime dependency.
- **Test Boundary Delineation & Documentation Precision (REQ-2):**
  - Explicitly delineated test responsibilities across documentation and `docs/release-checklist.md`: consistency test 17 validates modular protocol core size budget (`<= 12,288 B`), references, attribution, and backlog status; `context-injector` tests 3 & 5 and `consistency` tests 3 & 5 validate triggers, markers, counters, and version alignment.
  - Corrected protocol core size calculation in documentation down to exact byte measurements.
- **Universal Version Alignment (REQ-5):**
  - Synchronized version `3.10.0` across all 7 targets: `plugin.json`, `package.json`, `README.md`, `skills/hermes/references/fleet-protocol.md`, `skills/hermes/SKILL.md`, `install.ps1`, and `install.sh`.

## [3.9.0] - 2026-11-15

### Orchestrator Upgrade — BMAD & Gas Town Methodologies (TASK-001)
- **Modular Protocol Architecture (TASK-001):** Split `skills/hermes/references/fleet-protocol.md` from 30,305 bytes (~30 KB) into an eager Core Kernel of 12,008 bytes (11.73 KB <= 12 KB budget, **-60.38% reduction**) and modular, on-demand reference specifications.
- **Specialist Dispatch Matrix (`specialist-dispatch-matrix.md`):** Extracted the complete 14-specialist cross-agent chain-reaction matrix ("What did you change -> whom to dispatch") and Two-Tier Kritik 3-mode specification into a dedicated stack-first reference file.
- **BMAD Methodology Integration (`orchestrator-planning.md`):**
  - *Scale-Adaptive Planning Ladder:* 3-tier planning ceremony (Micro/Fast-Path for 1-2 files; Standard/Feature for 3-10 files; Complex/Enterprise for macro-architecture with full ceremony and stakes evaluation).
  - *Decisions & Assumptions Ledger (`.hermes/decisions.md`):* Explicit tracking of `[ASSUMPTION]` items across High/Medium/Low stakes with verification status and cross-sprint continuity via `/hermes save` & `/hermes resume`.
  - *Spec Law «Done when»:* Mandatory objective, verifiable acceptance probe for every requirement in `REQ-1..REQ-N` (prohibiting vague or subjective completion claims).
  - *Attribution:* Added attribution for `bmad-code-org/BMAD-METHOD` (MIT License) in `THIRD_PARTY_NOTICES.md`.
- **Gas Town Methodology Integration (`orchestrator-parallel.md`):**
  - *Refinery Merge Queue:* Bors-style serial integration pipeline for parallel write workers (isolated branch/worktree execution -> candidate staging -> Single Build Gate -> automated/manual bisection upon red builds).
  - *Beads Task Graph Ledger (`.hermes/tasks.json`):* Structured JSON graph with explicit `blockedBy` dependencies, worker assignment, and execution states surviving restarts.
  - *Worker Health Watchdog (Witness/Deacon/Dogs):* Formal health classification (`HEALTHY`, `STALLED`, `STUCK`, `ZOMBIE`) and 3-step recovery ladder (`Nudge ➔ Handoff ➔ GC`) strictly adhering to the Anti-Premature Kill invariant.
  - *Séance Protocol:* Cross-session transcript diagnostic query standard via `grep_search`.
  - *Attribution:* Added attribution for `gastownhall/gastown` (MIT License) in `THIRD_PARTY_NOTICES.md`.
- **Engineering Backlog & Rejected Donor Registry:**
  - Marked [TASK-001] as COMPLETED.
  - Registered [TASK-003] (Refinery Merge-Queue Hook) and [TASK-004] (Convoy Stall Detection Hook).
  - Registered explicit `HOLD` rejections with rationale for `ruvnet/ruflo` (unbounded swarms violate token economy), `itqan-engineering` (duplicates feature-dev), and `NeoLabHQ/sdd` (duplicates spec-driven development).
- **Version Alignment across 7 Targets:** Synchronized version 3.9.0 across `plugin.json`, `package.json`, `README.md`, `skills/hermes/references/fleet-protocol.md`, `skills/hermes/SKILL.md`, `install.ps1`, and `install.sh`.

## [3.8.0] - 2026-11-15

### Fleet Skills Upgrade & World-Class Methodology Integration
- **New Skill `office-documents`:** Enterprise document engineering for Microsoft Excel (.xlsx) and Word (.docx) workbooks adapted from `anthropics/skills` (Apache License 2.0). Implemented formula-first architecture (`=SUM(...)`), financial color modeling, zero formula error enforcement (`#REF!`, `#DIV/0!`), heading keep_with_next invariants, and formula injection sanitization. Equipped Ruslan (`@ruslan`) for SAP exports and Anna (`@anna`) for technical Word specifications.
- **Superpowers Methodology References (`skills/hermes/references/`):** Ported battle-tested methodologies from `obra/superpowers` (MIT License):
  - `systematic-debugging.md`: 4-phase root cause debugging workflow (Reproduce -> Trace/Isolate -> Hypothesis/Test -> Atomic Fix) with prohibition of shotgun debugging.
  - `verification-before-completion.md`: 5-step gate function (IDENTIFY -> RUN -> READ -> VERIFY -> ONLY THEN) with strict prohibition of unverified completion claims.
  - `writing-skills.md`: Standard specification for authoring bounded, verifiable, stack-first Antigravity skills.
- **Elena Platform Design & A11y Standards:** Integrated Apple HIG, Google Material Design 3, and WCAG 2.2 AA accessibility checklists into `skills/frontend-design/references/platform-design-systems.md` (adapted from `ehmo/platform-design-skills`).
- **Viktor Playwright E2E Testing Patterns:** Integrated Page Object Model, web-first auto-waiting assertions, network idle synchronization, and trace-based flake elimination into `skills/qa-test-automation/references/playwright-e2e-patterns.md` (adapted from `testdino-hq/playwright-skill`).
- **Igor Pairwise Fault Testing:** Integrated Microsoft PICT combinatorial testing syntax and 2-way orthogonal fault injection matrices into `skills/hardware-protocol-simulation/references/pairwise-fault-matrices.md` (adapted from `omkamal/pypict-skill`).
- **Stanislav Skill Trigger & Hallucinated Tool Verification:** Integrated automated skill discovery trigger checks and hallucinated tool call detectors into `skills/compliance-policy-as-code/references/skill-trigger-verification.md` (adapted from `UiPath/check-skill` and `aurite-ai/agent-verifier`).
- **Gleb Modern Three.js (r186+) Patterns:** Integrated modern PBR materials, instanced telemetry rendering, and GPU VRAM disposal lifecycles into `skills/procedural-3d-digital-twin/references/modern-threejs-patterns.md` (adapted from `CloudAI-X/threejs-skills`).
- **Kritik Russian Typography & Info-Style:** Integrated Russian typography rules (`« »`, `—`, `&nbsp;`), anti-neuroslop guidelines, and UX microcopy standards into `skills/product-ux-scouting/references/ru-text-typography.md` (adapted from `talkstream/ru-text`).
- **Mikhail Context Compaction & Token Economy:** Integrated prefix caching, KV reuse, and structured output density into `skills/agent-context-memory-engineering/references/context-compaction-patterns.md` (adapted from `muratcankoylan/context-*`).
- **Deferred Candidates Registry:** Documented rationales for holding non-core catalog packages in `docs/backlog.md`.
- **Third-Party Attribution:** Added explicit attribution entries in `THIRD_PARTY_NOTICES.md` for MIT and Apache 2.0 donors.
- **Test Suite & Verification Expansion:** Updated `consistency.test.mjs` to validate 22 skills, updated doc-linting to 15 verify scripts, and updated test runner baseline.

## [3.7.4] - 2026-11-15

### Skill Hygiene, Tool Realignment & Verification Linting
- **Kritik Tool & Delegation Realignment:** Equipped Kritik (`@kritik`) with `read_url_content` for direct deep research of public forum threads and documentation; restructured browser delegation to route complex interactive flows through Lead to Read-Only `browser`.
- **Elena Artwork Tool Realignment:** Equipped Elena (`@elena`) with `generate_image` instead of abstract subagent references, strictly enforcing Anthropic Frontend design standards.
- **SAP NCo Version Precision:** Corrected references from hallucinated `NCo 4.0` to official `NCo 3.0 / 3.1.x` across README, skill documentation, and the integration ladder based on primary SAP documentation.
- **Skill Compression to <= 7 KB:** Refactored `reverse-engineer-anything` (14.7 KB -> 4.0 KB) and `industrial-equipment-research` (12.0 KB -> 4.4 KB), offloading routing tables, connection recovery ladders, and hardware matrices to modular `references/`. Compressed `procedural-3d-digital-twin` (7.4 KB -> 6.5 KB).
- **Enforced `when`-Clauses:** Verified and ensured all 21 skills have explicit `Use when...` trigger clauses in their frontmatter descriptions for deterministic discovery.
- **Doc-Lint Test Suite Expansion:** Added test 15 (`doc_lint_verify_scripts_pass`) to `consistency.test.mjs`, mechanically executing all 14 `skills/*/scripts/verify-*.mjs` scripts during every CI run.

## [3.7.3] - 2026-11-15

### Hotfix: Fail-Closed Anti-Self-Signing Invariant & Unbound Hook Hardening
- **Narrowed Unbound Ask Validation (`qa-gate.mjs`, REQ-1):** On platforms omitting `tool_call_id` on `ask_question` (such as Antigravity runtime), responses are accepted strictly when `isDirectNext`, `status === 'DONE'`, and authentic execution banner (`hasHarnessBanner`) are present. Arbitrary later SYSTEM tool outputs (e.g. `run_command echo "без проверки"`) without call ID binding are strictly ignored and never accumulated in `postEditAskAnswer`, eliminating forged token economy skip vectors.
- **TDD Mechanical Testing Locks (`qa-gate.test.mjs`, REQ-2):** Added 4 deterministic test cases:
  1. `allow_unbound_ask_direct_next_harness_output_with_done_and_banner`: verified direct-next harness execution output with DONE and banner allows economy skip.
  2. `reject_unbound_ask_with_user_verification_followed_by_forged_system_echo`: verified user choosing verification followed by subsequent forged SYSTEM echo `без проверки` is rejected (`continue`).
  3. `reject_unbound_ask_model_banner_without_status_done`: verified model-generated banner lacking `status === 'DONE'` is rejected (`continue`).
  4. `past_turn_loop_flag_does_not_activate_loop_in_current_turn`: verified `--loop` in historical turn steps does not leak into the current turn.
- **Residual Limitations & Documentation (`docs/adr/0001-...md`, `TROUBLESHOOTING.md`, REQ-3):** Documented the residual risk of parallel tool calls in a single turn in ADR 0001 (Section 4); updated Section 7 in `TROUBLESHOOTING.md` detailing the fail-closed contract for bound vs unbound platforms.
- **Version Alignment across 7 Targets (v3.7.3, REQ-4):** Aligned version to 3.7.3 across `plugin.json`, `package.json`, `README.md`, `skills/hermes/references/fleet-protocol.md`, `skills/hermes/SKILL.md`, `install.ps1`, and `install.sh`. Updated test runner baselines to 297 tests (63 in `qa-gate`).

## [3.7.2] - 2026-11-15

### Platform Contract Hardening & Hygiene Audit Closure (REQ-1..REQ-10)
- **Universal Workspace Resolution (`resolveWorkspaceDir`, REQ-1):** Extracted `resolveWorkspaceDir(payload, fallbackCwd)` into `hooks/workspace.mjs` with priority `payload.workspacePaths[0]` (converts `file://` URI to OS path) → `payload.cwd` → `fallbackCwd` (`process.cwd()`). Used across all hooks (`context-injector.mjs`, `clean-edits-guard.mjs`, `qa-gate.mjs`) and `session-report.mjs`. Command hooks safely resolve `.hermes`, gate logs, checkpoints, profiles, and custom rules even when spawned with `cwd=<plugin-root>`.
- **Dual Tool Naming Support (`view_file` & `read_file`, REQ-2):** Official platform tool list uses `view_file` with `AbsolutePath`, while assistant runtime uses `read_file` with `Path`. Added `view_file` to `hooks.json` matcher, normalized parameter extraction in `clean-edits-guard.mjs`, preserved `read_file` as full alias, supported Step-0 exception for skills/agents docs under both names, and added `view_file` to `tools:` across all 14 `agents/*.md`.
- **Subagent Array Normalization (`Subagents: [...]`, REQ-3):** Implemented `extractSubagentSpecs(args)` in `clean-edits-guard.mjs` supporting both flat (`TypeName`, `Model`) and batched multi-agent array specs (`Subagents: [...]`). Applied Rule 12 model validation, tier constraints, and forbidden name checks across every element.
- **Markdown Reference Links Integrity & Link Fix (REQ-4):** Corrected broken link to `hooks/context-injector.mjs` in `README.md`. Expanded `markdown_reference_links_integrity` in `hooks/consistency.test.mjs` to validate all markdown links across `README.md` and `TROUBLESHOOTING.md`.
- **Agent Card Budget Enforcement (<= 5120 bytes, REQ-5):** Streamlined `agents/kritik.md` from 9,094 bytes to 5,014 bytes by offloading verbose tables to `skills/product-ux-scouting/references/` while preserving full persona, 3 modes, and 6 radars. Expanded `specialized_agent_cards_size_budget` in `hooks/consistency.test.mjs` to enforce the 5 KB limit across all 14 agent cards.
- **Strictly Read-Only Kritik (REQ-6):** Removed `invoke_subagent` from `agents/kritik.md` `tools:`, aligning Kritik strictly with Contour A Read-Only Scout.
- **Marketplace Manifest & Logo Standardization (REQ-7):** Updated `plugin.json` with `"$schema"`, `"license": "MIT"`, and `"keywords"`. Shortened `description` to 136 characters (within 120–160 limit) and added length assertion to `consistency.test.mjs`. Updated `assets/logo.svg` to square `viewBox="0 0 128 128" width="128" height="128"` with dark container ensuring contrast across both light and dark IDE themes.
- **Single-Pass Transcript Performance Optimization (REQ-8):** Implemented memoized `getTranscriptData(transcriptPath)` in `clean-edits-guard.mjs`. Slices and JSONL steps are read and parsed once per execution instead of 3-4 times. Verified 4.92x speedup (79.7% faster, 35.72 ms → 7.26 ms on a 4.0 MB synthetic transcript).
- **Hardened Model Tier Heuristics (REQ-9):** Anchored `detectSelectedTier` in `clean-edits-guard.mjs` strictly to Step 0 Handshake questions (`A2:`, `Answer 2:`, `Ответ 2:`, bullet tiers, and `ask_question` user replies), preventing false positives from ordinary conversational prose discussing low/high modes. Added negative test fixtures.
- **Documentation Honesty & IDE Execution Smoke Check (REQ-10):** Corrected "15 KB" comment in `context-injector.mjs` to "~30 KB". Added Section 10 in `TROUBLESHOOTING.md` documenting step-by-step smoke verification of hook execution across CLI, App, and IDE surfaces via `<!-- HERMES_PROTOCOL_LOADED -->` and `.hermes/gate-log.jsonl`. Registered 30-KB protocol split task into `docs/backlog.md` for v3.8.0.

## [3.7.1] - 2026-11-14

### HERMES-COGNITION Protocol & Cognitive Discipline (REQ-1..REQ-6)
- **HERMES-COGNITION v1.1 Skill (`cognitive-discipline`, REQ-1):** Installed `skills/cognitive-discipline/SKILL.md` verbatim codifying cognitive sobriety principles: status classification (`[ПРОВЕРЕНО]` file:line, `[ВЫВОД]`, `[ГИПОТЕЗА]`), primary source truth over memory/README, physics before architecture, cheapest falsification check, second-order impact analysis on fleet agents, mandatory 3-point pre-mortem for plans, visible self-correction, explicit knowledge boundaries, output artifacts tailored to prompt form, and constructive doubt.
- **PreInvocation Trigger & Lazy Loading (REQ-2):** Added `COGNITIVE_TRIGGER_RE` (`план|аудит|архитектур|релиз|диагноз|пре-мортем`) and `isCognitiveTrigger` to `hooks/hermes-trigger.mjs`. Wired lazy trigger-based injection in `hooks/context-injector.mjs` ensuring zero context bloating on non-trigger queries while keeping all existing 20 skills intact.
- **Lead & Stanislav Plan Governance (REQ-3):** Integrated mandatory Lead checklist check in `skills/hermes/references/fleet-protocol.md` before plan issuance. Added P1 checklist acceptance rule to `@stanislav` in `agents/stanislav.md` and fleet protocol. Added unified invariant line `Факты о системе — только [ПРОВЕРЕНО] со ссылкой файл:строка` across all 14 `agents/*.md` files, preserving the strict `<= 5 KB` size budget across all agent cards (`anna.md` verified at 5088/5120 bytes).
- **Skill Expansion N-of-N Sweep (20 → 21, REQ-4):** Synchronized skill count from 20 to 21 across `README.md` (header, specialist roster, skills library, commands), `plugin.json` (version 3.7.1, description), `skills/hermes/scripts/monitor.mjs` (Stanislav card), `skills/hermes/references/compliance-audit-standards.md`, `agents/stanislav.md`, and `skills/hermes/SKILL.md`.
- **Mechanical Testing Locks (REQ-5):** Added `cognitive_skill_registered` consistency test validating skill presence, verbatim marker integrity, and trigger functionality. Upgraded `consistency.test.mjs` (13 → 14 tests, total 276 → 277). Synchronized `test-runner.mjs` baseline to 277 tests and updated `skills_count_20` → `skills_count_21`.
- **Version Alignment (v3.7.1, REQ-6):** Aligned version across all 7 monitored targets (`plugin.json`, `package.json`, `README.md`, `fleet-protocol.md`, `SKILL.md`, `install.ps1`, `install.sh`) and documented in `CHANGELOG.md`.

## [3.7.0] - 2026-11-14

### Final Release Verification & Grounded Test Accounting (F10–F11)
- **Mechanical Test Accounting & Automated Summary (F10):** Ported test execution runner to `hooks/test-runner.mjs`. Verified actual clean-edits-guard test count of 93 (92 cases + 1 gate log isolation) and overall total of 276 tests across 8 suites. Automatically generates machine-verified `.hermes/test-summary.json` on every run of `npm test`, `verify.ps1`, `verify.sh`, and `install.ps1/sh`. `hooks/session-report.mjs` and `/hermes report` read metrics exclusively from this file adhering to Rule 13 (Data Honesty). Added consistency assertion in `consistency.test.mjs` verifying that `.hermes/test-summary.json` exists and matches the exact runner suite totals.
- **Documentation & Path Alignment (F11):** Updated `README.md` Local CI section to reference all 8 test suites (was 5). Confirmed canonical monitor path at `skills/hermes/scripts/monitor.mjs` with 15 rules declaration. Synchronized eval-harness report breakdown to match exact deterministic fixture groupings (36 positive triggers, 24 negative fixtures, 8 structural/option checks = 68 tests).

### Enterprise Integration, Policy Contracts & Activity Accounting (Wave 3: REQ-7..REQ-11)
- **7-Step Integration Ladder for Industrial & Enterprise Equipment (REQ-7):** Ported from `enterprise-integration`. Established a 7-tier architectural hierarchy (`Vendor MCP` → `Community MCP` → `Typed API/BAPI Wrapper` → `Read-Only Database View / CDS Views` → `Bridge Service` → `Screen Automation` → `Scheduled CSV/JSON Export`) under the core principle "Export is a designed path". Documented in `skills/industrial-equipment-research/references/integration-ladder.md` and `skills/sap-enterprise-automation/references/integration-ladder.md`. Updated specialist cards `@alexey` and `@ruslan` with pointers while strictly adhering to the `<= 5 KB` size constraint.
- **Data Honesty, Report Freshness & System of Record Protection (REQ-8):** Added Rules 13, 14, and 15 to the Hermes Fleet Protocol:
  - *Rule 13 (Data Honesty):* Zero data fabrication. Unreadable ≠ 0, missing ≠ 0. All metrics must reference their verifiable source or state "нет данных".
  - *Rule 14 (Report Freshness):* Mandatory ISO-8601 timestamps and explicit stale data warnings (`> 24h`) across all audit, inspection, and session reports.
  - *Rule 15 (System of Record Protection):* Read-Only default for external control systems (SCADA/PLC/MES/SAP/Production DBs). Requires explicit operator confirmation for state-modifying calls, without restricting repo workspace edits (`write_file`/`edit_file`).
  - Executed N-of-N sweep updating rules from 12 to 15 across `README.md`, `plugin.json`, `monitor.mjs`, `compliance-audit-standards.md`, `agents/stanislav.md`, `skills/hermes/SKILL.md`, and `skills/hermes/references/fleet-protocol.md`.
- **Machine-Verifiable JSON Schema Contracts & Stdlib Validator (REQ-9):** Introduced formal JSON Schema definitions in `skills/compliance-policy-as-code/references/schemas/` (`contract-proposal.schema.json`, `patch-blueprint.schema.json`, `security-verdict.schema.json`, `qa-verdict.schema.json`). Implemented a zero-dependency Node.js stdlib mechanical schema validator (`skills/compliance-policy-as-code/scripts/contract-validator.mjs`) and test suite (`contract-validator.test.mjs`), validating valid and invalid payloads across all 4 contract types.
- **Session Activity Reporting & Usage Accounting (REQ-10):** Ported from `session-accounting`. Implemented `/hermes report` via `hooks/session-report.mjs` aggregating `.hermes/gate-log.jsonl`, `.hermes/cost-log.jsonl`, and git metrics. Adheres strictly to Rule 13 (no token fabrication; outputs "нет данных" when token metrics are unrecorded) and Rule 14 (flags stale session data > 24h). Tested in `hooks/session-report.test.mjs`.
- **Deterministic Trigger Evaluation Harness (REQ-11):** Implemented `hooks/eval-harness.test.mjs` testing `isHermesTrigger` and related activation logic with 68 deterministic fixtures covering slash commands, Russian/English mode activation phrases, `@specialist` mentions, subagent invocations, and non-Hermes prompts, guaranteeing zero false positives. Integrated into `package.json` (`npm test`), `verify.ps1`, `verify.sh`, `install.ps1`, and `install.sh`.

### Hardening & Hotfix (Wave 2.1: F5–F9)
- **Elimination of Text Name-Fallbacks for Security Senders (F5):** Removed text-based `sender="viktor"` regex and `s.sender === 'viktor'` string matches in `hooks/qa-gate.mjs`. Verdicts and deliveries are trusted strictly and exclusively when originating from a validated session UUID in `viktorSubagentUuids`. Delivery collection (`viktorDeliveryTexts`) is moved strictly inside non-auditor guard (`!isFromNonAuditor`). Added negative test rejecting self-worker deliveries with embedded `sender="viktor"` + `diffHash` when Viktor is invoked for show.
- **Dual Security Clearance Paths in ADR 0001 (F6):** Formally documented Streaming Fast-Path (direct `[SECURITY PASS]` from Viktor's authentic session UUID with compensating reset on subsequent edits) alongside the Artifact Signed Verdict path (`.hermes/security-verdict.json`) in `docs/adr/0001-l2-diff-review-and-anti-self-signing.md`. Removed string name-fallback for security markers.
- **User-Scoped Convergence Loop Trigger & Deferred L2 (F7):** Restricted `isLoopRequested` detection to `payload.lastUserInput` and genuine user steps (`USER_EXPLICIT` / `USER_INPUT`), preventing edits to files containing `--loop` text from accidentally triggering convergence loops. Deferred L2 Security Diff-Review during loop iterations until `[QA PASS]` is achieved, running L2 exactly once in the final iteration before release.
- **Guard Test Suite Audit & Integrity Verification (F8):** Confirmed all 93 tests in `clean-edits-guard.test.mjs` are present and passing (92 test cases + 1 gate log isolation check). Clarified that the "88" in the Wave 2 report text was a clerical typo, with 0 tests deleted from the suite since v3.6.10.
- **Documentation & Manifest N-of-N Sweep (F9):** Synchronized `/hermes loop` and `/hermes fix-warnings [--loop]` across `README.md`, `plugin.json`, `skills/hermes/SKILL.md`, and `skills/hermes/references/fleet-protocol.md`.

### Advanced Engineering Workflows (Wave 2: REQ-4..REQ-6 & R1–R4 Hardening)
- **7-Phase Feature Dev Protocol & Fast-Path (REQ-4):** Ported from `feature-dev`. Added structured 7-phase flow (`Discovery`, `Exploration`, `Clarifying Questions`, `Architecture Design` with 3 evaluated alternatives, `Implementation`, `Quality Review`, `Summary & Walkthrough`). General findings are filtered by `confidence >= 80`, while High/Critical security findings are always reported. Introduced Fast-Path for trivial changes (< 5 lines, comment typo, rename) skipping formal alternatives while retaining build and test validation. Defined in `skills/hermes/references/feature-dev-protocol.md` and accessible via `/hermes feature`.
- **Specialized PR Reviewers (REQ-5):** Ported from `pr-review-toolkit`. Augmented specialist cards `@viktor` (PR Test Analyzer), `@dmitry` (Type Design Analyzer), and `@anna` (Comment Analyzer) with focused code-quality methodologies. All agent cards strictly maintained `<= 5 KB` to preserve prompt budgets. Methodologies documented in `skills/hermes/references/pr-review-methodologies.md`.
- **Bounded Convergence Loop (REQ-6):** Ported from `loop`. Added convergence loop engine in `hooks/qa-gate.mjs` for `/hermes fix-warnings --loop` and `/hermes loop` with a hard ceiling of 25 iterations (`--max-iterations 25`). Tracks per-conversation iteration counts in memory and `.hermes/loop-state.json`. L2 Diff-Review runs once at loop completion. On ceiling exhaustion, allows Stop while generating `.hermes/loop-blockers.md` actionable report.
- **L2 Anti-Self-Signing & Host Delivery Binding (R1–R4 Hardening):**
  - *R1 Strict Assertion:* Enforced strict `unresolvedHighCritical === 0` in `hooks/qa-gate.mjs:504`. Missing or undefined field immediately rejects verdict with `continue`.
  - *R2 Delivery Binding:* Bound security verdict acceptance to authentic host delivery (`<SYSTEM_MESSAGE>`) from Viktor's subagent UUID containing `diffHash`. Forged Lead verdicts or invocations "для вида" without authentic delivery are rejected.
  - *R3 Full Snapshot Diff-Hash:* Updated `computeDiffHash` to hash the complete content of all touched files without 2000-character truncation; disk content at Stop is read for replacement tool operations.
  - *R4 Residual Limitation ADR:* Documented architectural decision and residual model-collusion limitations in `docs/adr/0001-l2-diff-review-and-anti-self-signing.md` without pseudo-cryptographic terminology.

### Security & Compliance Architecture (Wave 1: REQ-1..REQ-3)
- **Three-Layer Security Architecture (REQ-1):** Ported and adapted from Anthropic's `security-guidance`.
  - *Layer 1 (PreToolUse Pattern Matching):* Static regex guard in `clean-edits-guard.mjs` checking dangerous deserialization (`pickle.loads`, PyYAML unsafe loading, `torch.load` without `weights_only=True`), unsafe DOM / code execution (`innerHTML =`, `eval()`), and industrial safety interlock overrides. Whitelisted for tests, mocks, and Igor's simulators (`igor`, `simulator`), or via explicit `hermes-security-ignore:` inline comments.
  - *Layer 2 (Artifact-Based Signed Diff-Review):* Artifact-based verification scheme for Stop hooks (`qa-gate.mjs`). Avoids LLM calls in Stop hooks to strictly respect Antigravity's 10-second hook timeout. Requires authentic signed verdict (`.hermes/security-verdict.json`) from Viktor / Security Reviewer using v3.6.12 anti-self-signing mechanics.
  - *Layer 3 (Agentic Commit Review):* Pre-commit architectural data-flow and cross-file invariant audit by Viktor.
- **Declarative Rule Engine (REQ-2):** Ported from `hookify`. Implemented native Node.js stdlib rule engine (`hooks/rule-engine.mjs`) evaluating `.hermes/rules/*.md` files with YAML frontmatter. Supports 6 condition operators (`regex_match`, `contains`, `not_contains`, `equals`, `starts_with`, `ends_with`), action modes (`block`, `warn`), and event filtering (`PreToolUse`, `Stop`).
- **Version Alignment & Open-Source Attribution (REQ-3):** Bumped version to `v3.7.0` across manifests, protocols, documentation, and installers. Added `THIRD_PARTY_NOTICES.md` with complete Apache License 2.0 attribution for all 7 ported mechanics from `anthropics/claude-plugins-official`. Excluded historical records (`CHANGELOG.md`, `docs/adr/`) from N-of-N sweep consistency assertions.

---

## [3.6.12] - 2026-11-14

### Security & Hardening
- **Self-Signing Elimination in QA Gate (REQ-1):** Closed the self-signing vulnerability where forged `Created At:` / `Completed At:` execution banners in `MODEL` prose allowed Lead to bypass QA. Enforced mandatory harness metadata checks (`status === 'DONE'` AND `tool_call_id` strictly bound to the `ask_question` call ID). Sourceless steps and model prose steps without validated harness binding are strictly rejected.
- **Fail-Closed Contract for Tool Outputs (REQ-1 & REQ-2):** Grounded by empirical analysis of live Antigravity transcripts (Steps 367–368), where platform tool results provide `status: 'DONE'` but omit `tool_call_id`. The gate enforces a strict Fail-Closed policy requiring full QA review or explicit user input (`USER_EXPLICIT`), refusing fragile text heuristics. Fully documented in `TROUBLESHOOTING.md`.

### Added
- **Local Pre-Push CI Gate (REQ-3 & REQ-4):** Added standalone cross-platform validation scripts `verify.ps1` (PowerShell) and `verify.sh` (Bash/macOS/Linux) checking Node runtime (>= 20), validating `plugin.json` and `hooks.json` manifests, and executing all 4 test suites. Integrated into `.githooks/pre-push` to automatically block broken commits before push without dependency on cloud runners.
- **Documentation & Billing Guidance (REQ-4):** Added "Локальный CI без биллинга" section to `README.md` and updated `TROUBLESHOOTING.md` explaining that GitHub Actions on public repositories are 100% free and clarifying how to diagnose account-level billing flags versus running offline local CI.
- **Installer Version Sync & CI Assertions (REQ-5):** Synchronized `install.ps1` and `install.sh` versions to `v3.6.12` and added automated version consistency tests in `consistency.test.mjs`.

---

## [3.6.11] - 2026-11-14

### Added
- **CSS/HTML Layout Protection (D/E):** Added `css|scss|sass|less|html|htm` to `SOURCE_CODE_EXT_RE`, `UI_SOURCE_FILE_RE`, and `clean-edits-guard.mjs`, ensuring styling and markup modifications cannot bypass the QA Gate and strictly require Kritik's `[UX PASS]`. Added unit tests for pure CSS and HTML edits.
- **Negation-Guarded Economy Skip (A/B/C & K/L):** Replaced ASCII `\b` with Cyrillic-aware `(?![\wА-Яа-яЁё])` and bidirectional matcher to prevent multiline negations (`Не надо.\nБез проверки не оставляй`, `Нельзя пропустить проверку.\nБез проверки`) from bypassing verification. Anchored positive skip matcher `POSITIVE_SKIP_RE` to line/option starts to eliminate accidental substring matches on free-text user requests.
- **Anti-Spoofing & Tool-Binding Protection (3 & I):** Hardened `qa-gate.mjs` to accept `ask_question` answers strictly from user-sourced steps (`USER_EXPLICIT`) or tool outputs explicitly bound to `ask_question` via `tool_call_id` / `tool_name`. Sourceless steps and model-sourced prose (`source: 'MODEL'`) are strictly rejected. Added negative regression tests for both vectors.
- **Protocol Documentation Version Alignment & CI Guard:** Synchronized `skills/hermes/references/fleet-protocol.md` header to `v3.6.11` and added automated version alignment assertions for `fleet-protocol.md` and `skills/hermes/SKILL.md` in `consistency.test.mjs`.

---

## [3.6.10] - 2026-11-14

### Added
- **YAML Frontmatter & Name Uniqueness Validation:** New automated tests in `consistency.test.mjs` ensuring all 14 agents and 20 skills have valid, non-duplicate frontmatter matching filenames/directories.
- **Markdown References Integrity Check:** Automated validation verifying that all local relative links in `SKILL.md` and `references/*.md` resolve to existing files on disk.
- **Fail-Open Resilience for External Models:** Explicit handling and unit tests for `tier=null` when non-Gemini models (Claude Sonnet, GPT-OSS) are active.
- **E2E Smoke Verification Checklist:** Comprehensive 12-point manual and automated verification procedure in `TROUBLESHOOTING.md`.

### Fixed
- **Narrowed Economy Gate & UI Protection:** Hardened `qa-gate.mjs` token economy skip regex to explicit intent (`без проверки`, `skip`, `пропустить проверку`), blocking casual phrases (`достаточно`, `no`, `нет`). Enforced mandatory `[UX PASS]` from Kritik even in economy mode if UI files were modified.
- **Gate Log Session Isolation:** Guarded `logGateDecision` in `clean-edits-guard.mjs` and `qa-gate.mjs` with `isHermesSession` check, preventing accidental `.hermes/gate-log.jsonl` creation in standard user projects.
- **Automatic Gate Log Rotation:** Enforced 512 KB size limit on `gate-log.jsonl` with automatic rotation to `gate-log.1.jsonl`.
- **Async Consistency Test Runner:** Replaced synchronous error wrapper on dynamic imports with static ESM imports and top-level awaits, ensuring CI fails reliably on assertion errors.
- **MIT License & Author Alignment:** Synced `package.json` with root `LICENSE` (`MIT`) and set author to `neon1301`.
- **Whitelisted Low-Tier Pro Escalation:** Allowed `Model: "pro"` for UI designer `@elena` and complex write workers (`self`) even when Low tier is selected.
- **Profile Generation in Protocols:** Mandated `.hermes/profile.json` creation in Phase 0 Handshake and Phase 5 `/hermes save` in `SKILL.md` and `fleet-protocol.md`.
- **CI Counter Deduplication:** Removed duplicate inline checks (`14/20`) from `.github/workflows/ci.yml`, centralizing validation in `consistency.test.mjs`.

---

## [3.6.9] - 2026-11-14

### Added
- **Policy as Code Model Tier Enforcement:** Programmatic validation in `clean-edits-guard.mjs` ensuring subagents inherit `High` on Flash High hosts and preventing silent down-tiering to base `flash`.
- **Structured `.hermes/profile.json`:** Deterministic, machine-readable store for active model profile and reasoning tier (`high`, `medium`, `low`).
- **Gate Decision Logging:** Automated audit trail in `.hermes/gate-log.jsonl` recording decisions, triggers, and reasons for both `clean-edits-guard` and `qa-gate`.
- **Consistency Test Suite (`consistency.test.mjs`):** CI barrier verifying agents count (14), skills count (20), documentation counters, manifest version alignment, and trigger registry integrity.
- **Cross-Platform Matrix CI:** Updated `.github/workflows/ci.yml` with `os: [ubuntu-24.04, windows-latest]` to prevent cross-platform path drift.
- **Bash Installer (`install.sh`):** Native installer for Linux/macOS users with stale item cleanup and Node >= 20 validation.
- **Root `package.json`:** Standard npm script runner (`test`, `test:consistency`, `test:guard`, `test:gate`, `test:injector`).
- **`TROUBLESHOOTING.md`:** Comprehensive handbook for common deny triggers (Rule 8, Rule 9, Rule 12 Handshake/Tier Mismatch, Stop Gate).

### Fixed
- Unblocked `Model: "inherit"` in `clean-edits-guard.mjs` to preserve Gemini 3.8 Flash (High) reasoning budget.
- Added dynamic 503 error handling protocol (backoff retry ➔ fallback ➔ escalation) replacing pre-emptive model downgrades.
- Protected `\bThree(?:\.js)?\b` regex with word boundaries in domain routing rules.
- Normalized cross-platform artifact path comparison in `qa-gate.mjs`.

---

## [3.6.8] - 2026-11-14

### Added
- **Gleb (`@gleb`):** 14th specialist for Procedural 3D Modeling, WebGL/Three.js, Industrial Digital Twins, and WebView2 integration.
- **`procedural-3d-digital-twin`:** 20th skill for Three.js factory floors, telemetry visualization, and `InstancedMesh` performance optimization.
- **InstancedMesh Emissive Snippet:** Shader-based per-instance alarm pulsation via `InstancedBufferAttribute` and `onBeforeCompile`.

### Changed
- Renamed `@mozgoeb` to `@kritik` (`product-ux-scouting`) across all protocols, references, and monitor UI.
- Upgraded Stanislav's audit scope from 19 to 20 skills.
- Synchronized Monitor web dashboard to Lead + 14 experts.

---

## [3.6.7] - 2026-11-13

### Added
- Step 0 Model Handshake (`ask_question` for subagent model and reasoning tier).
- Strategic Context Compaction reminders on high transcript turn counts.
- Project Instincts engine (`.hermes/instincts.json`).
