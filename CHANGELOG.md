# 📝 Changelog

All notable changes to the **Hermes Fleet** plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
