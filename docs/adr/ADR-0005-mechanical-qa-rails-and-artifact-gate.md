# ADR-0005: Mechanical QA Rails & Artifact-Driven Gate Acceptance (Track B1–B5)

- **Status:** Accepted
- **Date:** 2026-11-16
- **Authors:** Hermes Fleet Architecture Council (@dmitry, @viktor, @stanislav)
- **Supercedes / Cross-References:**
  - [ADR-0001: L2 Security Diff-Review & Anti-Self-Signing Protocol](0001-l2-diff-review-and-anti-self-signing.md)
  - [ADR-0004: Enterprise Sandboxing, Durable Recovery Journal & OpenTelemetry GenAI Semantic Conventions](ADR-0004-enterprise-sandboxing-and-durable-journal.md)

---

## 1. Context & Problem Statement

Historically, the Hermes Stop Gate accepted `[QA PASS]` based on regex matching of incoming subagent transcript text tokens (`viktorDeliveryTexts`). While protected against self-signing by Lead prose and basic spoofing by UUID filters, text-token verification had fundamental architectural vulnerabilities:
1. **LLM Hallucination Risk:** An LLM subagent could declare `[QA PASS]` in its prose without actually executing tests or while ignoring test execution failures.
2. **Missing Process Evidence:** There was no deterministic record of real operating system process exit codes, test framework outputs, or exact working tree state during QA sign-off.
3. **Asymmetric Rigor:** While `security-verdict.json` required a signed cryptographic artifact bound to `diffHash` and `conversationId`, QA verification remained reliant on conversational prose.

---

## 2. Decision & Architectural Mechanics

We transition `[QA PASS]` acceptance from conversational text tokens to a deterministic mechanical artifact: `.hermes/qa-verdict.json`.

### 2.1 Mechanical QA Writer (`hooks/qa-runner.mjs`, Track B2)
- Implements `detectProjectStack(workspaceDir)` supporting `.NET` (`dotnet test`), Python (`pytest`), Node.js/NPM (`npm test`, `test-runner.mjs`), and Go (`go test ./...`).
- Executes project test runners via synchronous child processes and captures real operating system exit codes in `testExitCodes: [number]`.
- Calculates deterministic working tree SHA-256 `diffHash` (reusing `computeWorkingTreeDiffHash`).
- Evaluates contract schema compliance via `validateSchema()` against `qa-verdict.schema.json` before writing.
- Outputs purely mechanical JSON without LLM prose generation.

### 2.2 Gate Acceptance Criteria (`hooks/qa-gate.mjs`, Track B1)
In default `qaVerdictMode: "artifact"`, `[QA PASS]` text in transcript is **insufficient** on its own. The gate releases only when all invariant checks succeed:
1. `.hermes/qa-verdict.json` exists and validates against `qa-verdict.schema.json`.
2. `runner === "mechanical"` (strictly rejecting manual or LLM-authored artifacts).
3. `status === "PASS"`.
4. `testExitCodes` is a non-empty array of integers where every element strictly equals `0`.
5. `reqLedger` is a non-empty array covering verified requirements (`REQ-1..N`).
6. `diffHash` matches either `currentDiffHash` (turn edit snapshots) or `computeWorkingTreeDiffHash` (git status + diff).
7. `timestamp` freshness TTL <= 5 minutes.
8. Transcript evidence: Viktor was explicitly invoked in the turn.
9. Delivery evidence: Viktor delivered `[QA PASS]` in an incoming system message after the last write.
10. Viktor UUID / `ackToken` binding: Viktor UUID matches invoked agent.
11. Mutation criteria: Passed in strict mode or advisory in default mode.

### 2.3 Compatibility Mode (`qaVerdictMode`, Track B1)
- `qaVerdictMode: "artifact" | "legacy"` (configured via `.hermes/config.json` or `HERMES_QA_VERDICT_MODE`).
- Default: `"artifact"`.
- Legacy mode: Allows transcript token `[QA PASS]` with an explicit deprecation warning on stderr (`[QA GATE DEPRECATION WARNING]`).

### 2.4 Mutation Testing MVP (`hooks/qa-runner.mjs`, Track B3)
- Diff-scoped mutation testing (budget <= 20 mutants, 60s execution timeout).
- Automated stack detection for Stryker (Node/.NET) and mutmut (Python).
- Adheres to Rule 13 (Data Honesty): if mutation tooling is absent, writes `status: "unavailable"` with reason; zero simulated or fabricated metrics.
- Advisory-first by default (`mutationMode: "advisory"`). Optional `mutationMode: "strict"` blocks gate when `survived > 0`.
- Outputs `.hermes/mutation-report.json`.

---

## 3. Negative Vectors & Anti-Spoofing (Track B4)

Verified across 11 dedicated negative and compliance tests in `hooks/qa-gate.test.mjs`:
1. `runner !== "mechanical"` -> reject.
2. Stale or mismatched `diffHash` -> reject.
3. Viktor UUID mismatch -> reject.
4. Missing `testExitCodes` -> reject.
5. Non-zero exit code (`[0, 1]`) -> reject.
6. Empty `reqLedger` -> reject.
7. Schema violation -> reject.
8. Missing `.hermes/qa-verdict.json` -> reject.
9. Transcript token alone without legacy flag -> reject.
10. Transcript token with legacy flag -> allow (with deprecation warning).
11. Survived mutant in strict mutation mode -> reject.

---

## 4. Migration & Deprecation Plan

1. **v4.1.0:** Introduction of mechanical QA rails. `qaVerdictMode` defaults to `"artifact"`. Projects requiring transition period may set `"qaVerdictMode": "legacy"` in `.hermes/config.json`.
2. **v5.0.0:** Complete removal of `legacy` mode. All QA verification strictly requires `.hermes/qa-verdict.json`.

---

## 5. Consequences

- **Positive:** Immune to LLM hallucinated test passes. Process exit codes are captured directly from OS kernel. Full parity between AppSec (`security-verdict.json`) and QA (`qa-verdict.json`).
- **Residual Limitations:** Mutation testing requires installed external toolchain; reported as `unavailable` when tools are absent.
