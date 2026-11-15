# 📜 Third-Party Notices & Attribution

Hermes Fleet Enterprise incorporates architectural patterns, workflows, and inspection mechanics adapted and ported from the open-source project **`anthropics/claude-plugins-official`** under the **Apache License, Version 2.0**.

---

## 🏛️ Ported Architecture & Mechanics

The following concepts have been re-implemented in native Node.js (ECMAScript Modules / stdlib) and adapted specifically for Google Antigravity hooks and multi-agent fleet governance:

1. **Three-Layer Security Architecture (`security-guidance`)**
   - **Layer 1 (PreToolUse Pattern Matching):** Static regex analysis for dangerous deserialization (`pickle`, `yaml.unsafe_load`), unsafe eval, DOM execution, and industrial safety interlock overrides.
   - **Layer 2 (Stop Diff-Review Scheme):** Artifact-based, signed diff review ensuring independent verification before turn completion.
   - **Layer 3 (Agentic Commit Review):** Cross-file data flow audit by Viktor (`@viktor`) prior to integration.
   - *Original source:* [`plugins/security-guidance`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/security-guidance)

2. **Declarative Rule Engine (`hookify`)**
   - Hot-reloaded `.hermes/rules/*.md` rules with YAML frontmatter.
   - 6 condition operators: `regex_match`, `contains`, `not_contains`, `equals`, `starts_with`, `ends_with`.
   - Interactive rule governance (`/hermes rules`) and proposal workflow by Stanislav (`@stanislav`).
   - *Original source:* [`plugins/hookify`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/hookify)

3. **7-Phase Feature Development Protocol (`feature-dev`)**
   - Discovery, Codebase Exploration, Clarifying Questions, Architecture Design (3 alternatives: Minimal Changes, Clean Architecture, Pragmatic Balance), Implementation, Quality Review, and Summary.
   - High-confidence review filtering (reporting findings with confidence ≥ 80).
   - *Original source:* [`plugins/feature-dev`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/feature-dev)

4. **Specialized PR Reviewers (`pr-review-toolkit`)**
   - Test Coverage & Behavioral Analysis integrated into Viktor (`@viktor` += `pr-test-analyzer`).
   - Type Design & Invariant Expression integrated into Dmitry (`@dmitry` += `type-design-analyzer`).
   - Comment Freshness & Rot Analysis integrated into Anna (`@anna` += `comment-analyzer`).
   - *Original source:* [`plugins/pr-review-toolkit`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/pr-review-toolkit)

5. **Self-Referential Convergence Loops (`ralph-loop`)**
   - Iterative feedback loops in Stop hooks (`/hermes fix-warnings --loop`) bounded by `--max-iterations` (ceiling 25) with structured blocker reporting upon exhaustion.
   - *Original source:* [`plugins/ralph-loop`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-loop)

6. **Industrial Data Honesty & Integration Ladder (`claude-for-manufacturing`)**
   - 7-step integration ladder: Vendor MCP → Community MCP → API Wrapper → Read-Only DB View → Bridge → GUI Automation → Scheduled Flat Export.
   - Core industrial rules: *Unreadable ≠ zero*, *Report freshness in header*, *Unattended autonomy is strictly read-only*.
   - *Original source:* [`plugins/claude-for-manufacturing`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/claude-for-manufacturing)

7. **Session Metrics & Usage Accounting (`session-report` / `receipts`)**
   - Honest local metrics from transcript logs without fabricated figures.
   - *Original source:* [`plugins/session-report`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/session-report) & [`plugins/receipts`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/receipts)

8. **Systematic Debugging & Verification Protocol (`superpowers`)**
   - Root-cause before fix enforcement, 4-phase debugging workflow, and verification-before-completion.
   - *Original source:* [`obra/superpowers`](https://github.com/obra/superpowers) under the MIT License.

9. **Office Documents Engineering (`office-documents`)**
   - Formula-first spreadsheet design, zero-error formula invariants, and structured document typography.
   - *Original source:* [`anthropics/skills`](https://github.com/anthropics/skills) under the Apache License 2.0.

10. **Platform Systems, Playwright & Pairwise Testing**
    - Platform design guidelines (HIG/MD3/WCAG 2.2 AA), Playwright E2E patterns, and PICT fault matrices.
    - *Original sources:* `ehmo/platform-design-skills`, `testdino-hq/playwright-skill`, `omkamal/pypict-skill` under the MIT License.

11. **Scale-Adaptive Planning & Spec Law (`BMAD-METHOD`)**
    - Scale-adaptive planning ladder, decisions & assumptions ledger (`.hermes/decisions.md` with stakes), and Spec Law «Done when».
    - *Original source:* [`bmad-code-org/BMAD-METHOD`](https://github.com/bmad-code-org/BMAD-METHOD) under the MIT License.

12. **Refinery Merge Queue, Task Graph & Watchdog (`Gas Town`)**
    - Bors-style bisecting merge queue for parallel write workers, structured Beads task graph (`.hermes/tasks.json`), and worker health watchdog recovery ladder.
    - *Original source:* [`gastownhall/gastown`](https://github.com/gastownhall/gastown) under the MIT License.

13. **Specification-Driven Development Templates (`spec-kit`)**
    - Standardized feature specification (`spec.md`), technical architecture plan (`plan.md`), and task decomposition (`tasks.md`) templates.
    - *Original source:* [`github/spec-kit`](https://github.com/github/spec-kit) under the Apache License 2.0.

---

## 📄 Apache License 2.0 Text

```text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   Copyright 2024-2026 Anthropic, PBC.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```
