# 📝 Changelog

All notable changes to the **Hermes Fleet** plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
