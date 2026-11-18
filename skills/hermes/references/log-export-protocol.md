# Hermes Black Box — Log Export Protocol (`REQ-10`, v4.7.1)

> **Purpose:** Mechanical export of protected/mechanical run artifacts into `logs/<version>/<UTC-timestamp>-<taskHash>/` so external auditors can inspect raw evidence directly on GitHub without manual copy-pasting or LLM paraphrasing.

## 1. Command & Execution Point

Run `scripts/export-logs.mjs` (pure Node.js stdlib ESM, zero runtime dependencies) at the end of a task or **strictly after `install.ps1` / release commit+tag**:

```bash
node scripts/export-logs.mjs \
  --npm-test-log=<path-to-npm-test.log> \
  --verify-log=<path-to-verify.log> \
  --install-log=<path-to-install.log> \
  --transcript=<path-to-transcript.jsonl>
```

### Mandatory Two-Commit Release Discipline
1. **Commit 1 (Release commit + tag):** contains code, tests, protocols, docs, and verdicts bound to the exact pre-commit tree `diffHash`. Tagged `vX.Y.Z`.
2. **Run `install.ps1` / `install.sh`** (capturing `install.log`).
3. **Run `node scripts/export-logs.mjs ...`** — `manifest.json` anchors `releaseCommitHash` and `releaseTreeHash` to Commit 1.
4. **Commit 2 (Separate logs commit):** `[TASK-XXX] chore(logs): export X.Y.Z run artifacts` — touches **ONLY** `logs/<version>/<UTC-timestamp>-<taskHash>/`. Never amend Commit 1 or move the release tag.

## 2. Exported Files & Strict Extension Rule

- **Output directory:** `logs/<version>/<UTC-timestamp>-<taskHash>/`
- **Allowed extensions:** strictly `.json`, `.jsonl`, `.log`, `.txt`. **Zero `.md` files** under `logs/` (keeps markdown/doc-lint/consistency checks untouched).
- **Protected/mechanical sources copied verbatim (after redaction):**
  - `.hermes/test-summary.json`, `gate-log.jsonl`, `council-state.json`, `council-outcomes.jsonl`, `council-cost.jsonl`, `progress-journal.jsonl`, `lessons.jsonl`, `qa-verdict.json`, `security-verdict.json`, `plan-state.json`, `plan-ledger.jsonl`, `rubric.json`, `grade-report.json`, `grade-ledger.jsonl`, `team-stop.json`, `eval-results.jsonl`
  - `.hermes/plan.md` → `plan.md.txt`, `.hermes/decisions.md` → `decisions.md.txt`
  - Optional command stdout captures: `npm-test.log`, `verify.log`, `install.log`
  - Mechanical anchors: `git-state.json`, `manifest.json`
- **Absent sources (Rule 13 — Data Honesty):** missing files are recorded in `manifest.json` as `{ "status": "absent" }`. Content is **never** fabricated.
- **Excluded permanently:** `.hermes/config.json` is **never** exported (local user settings stay private).

## 3. Privacy, Redaction & Size Cap

1. **Secrets redacted before disk write:** reuses `KNOWN_SECRET_PREFIX_RE`, `SECRET_ASSIGN_RE`, and `CONN_SECRET_RE` from `hooks/consent-validator.mjs` → `[REDACTED_SECRET]`.
2. **User paths redacted before disk write:** host home directory and generic `C:\Users\<user>`, `/Users/<user>`, `/home/<user>` → `%USER%`.
3. **Transcript shape by default:** `transcript-shape.jsonl` emits strictly metadata per step (`step_index`, `source`, `type`, `status`, `hasHarnessBanner`, `tool_call_names`, `sender`, `contentLength`) — **zero `content` text**. Full redacted transcript (`transcript-full.jsonl.txt`) is written **only** when the operator explicitly passes `--include-transcript`.
4. **Per-file cap (2 MiB):** files exceeding `2 097 152` bytes are truncated honestly with an inline marker plus `truncated: true`, `originalSize`, and `originalSha256` in `manifest.json`.

## 4. Isolation & Guard Enforcement

- **Install payload exclusion:** `logs/` is excluded from `install.ps1` and `install.sh` (and explicitly cleaned from stale target directories).
- **Agent write protection:** `logs/` is **not** added to the 19 built-in `DEFAULT_PROTECTED_VERDICT_PATHS`, but `hooks/clean-edits-guard.mjs` blocks direct model `write_file`/`edit_file`/shell writes into `logs/` (`rule: "logs_direct_write_deny"`). Only `node scripts/export-logs.mjs` populates `logs/`.
