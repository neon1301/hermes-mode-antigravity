# 📝 Changelog

All notable changes to the **Hermes Fleet** plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
