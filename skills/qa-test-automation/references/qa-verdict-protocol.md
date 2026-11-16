# 🛡️ Mechanical QA Verdict & Artifact Gate Protocol

This protocol defines the exact procedure for generating, verifying, and signing `.hermes/qa-verdict.json` during Hermes Fleet workflows.

---

## 1. ⚙️ Canonical Verification Pipeline

Verification follows an 8-stage pipeline coordinated between the Lead orchestrator and Viktor:

1. **Code Edits:** Developer or Lead applies changes using `write_file` / `edit_file`.
2. **Single Build Gate:** Lead executes project test suite via OS child process to verify syntax and test pass.
3. **Token Economy Gate:** Lead invokes `ask_question` with verification vs economy options.
4. **Viktor Invocation:** Lead calls `invoke_subagent` for Viktor (`Model: "flash"`), obtaining Viktor's `conversationId` (`viktorUuid`).
5. **Context Plumber:** Lead or Viktor gathers parameters: `--viktorUuid`, `--reqLedger`, `--conversationId`, `--turnMarker`.
6. **Mechanical Runner:** Execute mechanical test runner via system process:
   ```bash
   node hooks/qa-runner.mjs --viktorUuid=<viktorUuid> --reqLedger=<REQ-1,REQ-2,...> --conversationId=<convId> --turnMarker=<marker>
   ```
7. **Viktor Audit & Delivery:** Viktor audits code, inspects `.hermes/qa-verdict.json`, and delivers verdict text containing `diffHash`.
8. **Stop Gate:** `qa-gate.mjs` verifies symmetric artifact proofs, diffHash binding, and active subagent UUID before allowing termination.

---

## 2. 📋 Requirement Ledger & Task Bootstrap (Rule 13)

- **Lead Responsibility:** The Lead orchestrator **must** bootstrap `.hermes/tasks.json` during Phase 1 (Decomposition), mapping each prompt requirement (`REQ-1..N`) to a task item.
- As requirements are completed, task statuses must be updated to `"DONE"`.
- If `.hermes/tasks.json` is missing or has no completed tasks, `qa-runner.mjs` strictly sets `status: "REJECT"`. Sentinels or fabricated values (`["ALL-TESTS-PASS"]`, `["REQ-1"]`) are strictly forbidden.
- For projects without formal requirement tracking, `requireReqLedger: false` can be explicitly configured in `.hermes/config.json` (resulting in a logged `reduced assurance` warning).

---

## 3. 🛡️ Viktor's Iron Rule: Mechanical Artifact Parity

- **Artifact Status Dictates Prose:**
  - If `.hermes/qa-verdict.json` has `status: "REJECT"` or any non-zero exit codes in `testExitCodes` $\rightarrow$ Viktor **MUST** output `🔴 [QA REJECT: <детали из артефакта>]`.
  - Viktor is **STRICTLY FORBIDDEN** from hallucinating `🟢 [QA PASS]` in prose when the mechanical artifact on disk is `REJECT`.
  - Viktor's delivery text must include the exact `diffHash` from `.hermes/qa-verdict.json`.

---

## 4. 🔏 Mandatory Gate Invariants

`qa-gate.mjs` enforces the following invariants on `.hermes/qa-verdict.json`:
- `runner === "mechanical"`
- `status === "PASS"`
- `testExitCodes.every(c => c === 0)`
- `reqLedger` non-empty and covering all `REQ-N` mentioned in prompt
- `diffHash` matching `computeWorkingTreeDiffHash`
- `timestamp` freshness $\le$ 300,000ms TTL
- `viktorUuid` matching active Viktor subagent UUID in turn
- `conversationId` matching session ID (strictly required)
- `turnMarker` matching session marker (strictly required)
- `ackToken` dynamic UUID (static `viktor-qa-pass` rejected)
- `mutation` fresh and passing in strict mode
