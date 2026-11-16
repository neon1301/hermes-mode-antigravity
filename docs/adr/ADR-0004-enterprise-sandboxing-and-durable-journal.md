# ADR-0004: Enterprise Role Sandboxing, Untrusted Input Quarantine & Durable Recovery Journal

- **Status:** Accepted
- **Date:** 2026-11-16
- **Authors:** Lead Orchestrator, Viktor (`@viktor`), Stanislav (`@stanislav`), Dmitry (`@dmitry`)
- **Scope:** Security, Runtime Sandboxing, Session Recovery, Telemetry, Tool Economy

---

## 1. Context & Problem Statement

As Hermes Fleet Enterprise scales to high-autonomy multi-agent swarms operating in industrial and production environments, six critical operational frontiers were identified:

1. **A5 (Injection Defense & Web Quarantine):** When agents query web search engines or scrape public dev forums, adversarial prompt injections or malicious instructions embedded in web content could hijack subagent behavior. A mechanism is required to guarantee that web outputs are quarantined strictly as UNTRUSTED DATA, never executable instructions.
2. **A6 (Role-Based Sandboxing):** Different specialists have distinct permission profiles: auditors (`@viktor`, `@stanislav`) should never mutate project files or access external networks; emulators (`@igor`) should be strictly confined to localhost sockets; writers must never escape workspace boundaries. Platform sandbox capabilities and gaps must be documented honestly (Rule 13).
3. **B6 (Durable Recovery Journal vs. Prose Checkpoints):** Markdown prose checkpoints (`.hermes/checkpoint.md`) are human-readable summaries, but insufficient for deterministic recovery after mid-wave crashes or network timeouts. Replay requires a machine-readable, append-only log with working tree `diffHash` drift verification.
4. **B7 (Defect Resolution Rate):** Metric reporting previously only tracked raw event counts, without calculating the percentage of QA/UX findings actually resolved (`resolved / total`).
5. **B8 (OpenTelemetry GenAI Semantic Conventions):** Telemetry logs (`gate-log.jsonl`, `cost-log.jsonl`, `journal.jsonl`) lacked standard OTel GenAI fields (`gen_ai.operation.name`, `gen_ai.tool.name`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`).
6. **C4 (Tool & Context Economy):** Preloading full `SKILL.md` instructions for all 22 specialized skills wastes ~88 KB (~22,000 tokens) of prompt budget per turn. High-fanout tool queries also pollute context if intermediate outputs are returned to the conversation.

---

## 2. Decision & Architecture

### Track A5: Plan-Then-Execute & Untrusted Input Quarantine
- **Plan Freezing:** The execution plan is frozen in Contour A before any external retrieval.
- **Untrusted Input Invariant:** All outputs from `browser`, `search_web`, external repos, or forums are classified as **UNTRUSTED DATA**, not instructions.
- **Fail-Closed Hook Quarantine (`hooks/clean-edits-guard.mjs`):** In any subagent session where `browser` or `search_web` has been invoked, all file write tools (`write_file`, `edit_file`) and mutating `run_command` invocations are denied fail-closed until session completion. Code modifications can only be applied by Lead in Contour B following sanitization.

### Track A6: Role-Based Sandboxing & Platform Gap Documentation
- **Role Permissions:**
  - **Auditors (`viktor`, `stanislav`):** Read-only filesystem, zero external network access.
  - **Writers (`dmitry`, `sergey`, etc.):** Confined strictly to `activeWorkspaceDir`; path traversal (`..` or absolute paths outside workspace) is blocked.
  - **Emulators (`igor`):** Limited strictly to localhost / `127.0.0.1` / `::1` loopback endpoints. External IP egress is denied.
- **Platform Capability Grounding (Rule 13):** Google Antigravity supports `define_subagent(EnableWriteTools: false)` for subagent write restrictions. However, granular network namespace / socket filtering is not exposed via the platform API. The Hermes PreToolUse Guard (`clean-edits-guard.mjs`) serves as the deterministic runtime layer enforcing network containment and workspace isolation.

### Track B6: Durable Recovery Journal (`.hermes/journal.jsonl`)
- **Append-Only Journal:** Implemented in `skills/hermes/scripts/journal.mjs`. Records recovery-critical milestones only: wave transitions, gate verdicts, tool executions, and git working tree `diffHash`.
- **Auto-Rotation:** Automatically rotates at 512 KB to `journal.1.jsonl` (identical to `gate-log.jsonl`).
- **Deterministic Resume (`resumeFromJournal`):** Computes current working tree `diffHash` against the journal's `lastDiffHash`. If uncommitted working tree drift is detected, warns and provides a structured recovery plan.

### Track B7: QA/UX Defect Resolution Rate
- In `hooks/session-report.mjs`, resolves findings from `.hermes/qa-verdict.json` or `.hermes/findings.json` to calculate `resolved / total` (`resolvedRate%`). If no findings data exists, displays `нет данных` (Rule 13).

### Track B8: OpenTelemetry GenAI Conventions
- Standardizes telemetry fields across `gate-log.jsonl`, `cost-log.jsonl`, and `journal.jsonl`.
- Logs `gen_ai.operation.name`, `gen_ai.tool.name`, and token usage (`gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`). If the host does not report tokens, records `null` (zero fabrication).

### Track C4: Lazy-Loading Skill Index & Batch Tool Execution
- **Lean Skill Index (`skills/hermes/references/skill-index.md`):** Replaces eager dumping of all 22 skills with a ~1.6 KB routing index. Full `SKILL.md` bodies are loaded strictly on demand when a domain is activated (>95% token savings).
- **Batch Execution Pattern:** Multi-file inspections run inside Python/workflow subprocesses. Intermediate raw outputs remain in execution process memory; only synthesized summaries enter LLM context.
- **Verified on Fixtures:** Verified deterministically in `hooks/eval-harness.test.mjs` (>15x token reduction ratio).

---

## 3. Consequences & Compliance
- **Zero regressions:** Existing 10 test suites pass completely.
- **Safety Guarantee:** Hostile web prompt injections cannot mutate code or shell environment.
- **Data Honesty:** Grounded facts and telemetry strictly separated from unverified estimates.
