---
name: code-refactoring-modernization
description: Safe legacy monolith decomposition, behavior-preserving refactoring, CRAP-score prioritization, Strangler Fig incremental modernization, and cyclic dependency removal across C#, TypeScript, Python, and Go. Use when breaking down god-classes (>300-400 lines), migrating legacy systems, or removing dead code without regressions.
---

# Code Refactoring & Legacy Modernization Skill

This skill guides **🧹 Sergey** in transforming multi-thousand-line monoliths and brittle legacy modules into clean, modular, SOLID services **with zero unintended behavior changes**.

---

## 1. Golden Rule: Preserve Semantics Above All Else

Refactoring means **changing internal structure without changing external behavior**.
- Never bundle feature changes, silent logic "improvements", or API schema breaks inside a structural extraction step.
- Modify existing files strictly via clean atomic `edit_file` operations — **NEVER generate temporary patch scripts** (`patch_*.ps1`, `.bat`, `.py`, `.sh`, per Hermes Rule 8).

---

## 2. Progressive Reference Routing Matrix

Load the reference guide matching the scale of refactoring required:

| Refactoring Scale | Load Reference | Core Techniques Covered |
| :--- | :--- | :--- |
| **File / Class / Module Decomposition** | [references/monolith-decomposition.md](references/monolith-decomposition.md) | **CRAP-Score triage** (`CC^2 * (1-cov)^3`), 300–400 line modularity target, Seam identification, Responsibility/Interface extraction, Breaking circular dependencies, Dead-code & clone elimination |
| **System / Legacy Architecture Evolution** | [references/strangler-characterization.md](references/strangler-characterization.md) | **Characterization / Golden Master Tests** before touching legacy code, **Strangler Fig** facade & percentage traffic shifting, Branch by Abstraction, Rollback triggers & atomic compile/test verification loop |

---

## 3. Core Workflow Loop (Pin ➔ Extract ➔ Compile ➔ Verify)

1. **Map & Measure First:** Identify existing callers, public signatures, shared mutable state, event subscriptions, and `CRAP` / complexity hotspots before cutting code.
2. **Pin Behavior (Safety Net):** Ensure existing characterization/unit tests lock current outputs (including edge cases, rounding, socket byte order, error codes). If no tests exist around a high-risk seam, write them first!
3. **Extract One Cohesive Seam at a Time:** Pull one clear concern (e.g. `FrameParser`, `RetryPolicy`, `ArchiveCleaner`) into its own focused module (`< 300–400` lines), inject via explicit interface/constructor, and update callers cleanly.
4. **Compile & Test After Every Step:** Run build + tests immediately after each extraction (`dotnet build`, `tsc --noEmit`, `pytest`, `go test`). Maximum 3 self-repair retries before reverting broken extraction cleanly via Git.

---

## 4. `MUST DO / MUST NOT DO` Guardrails

### `MUST DO`
- Preserve exact public namespaces, DTO wire formats, SQL semantics, and UI event bindings unless an explicit `[CONTRACT PROPOSAL]` was approved.
- Keep `Zero-Hardcode` hygiene intact during extraction (inject `IOptions<T>` / config interfaces rather than moving hardcoded constants into new files).
- Coordinate interface signatures with **💻 Dmitry** and submit extracted modules + characterization tests to **🛡️ Viktor** (`[QA PASS]`) & **⚖️ Stanislav** (`[COMPLIANCE PASS]`).

### `MUST NOT DO`
- NEVER execute a "big-bang rewrite" across 20 files without intermediate passing builds/tests.
- NEVER leave partial `TODO` stubs, commented-out legacy graveyards, unused imports/variables, or circular `Project/Module` references behind.
- NEVER touch lock ordering or `IDisposable`/event-unsubscription lifecycles accidentally while moving methods between classes.
