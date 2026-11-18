# Hermes Black Box — Log Export Protocol (`REQ-10`, v4.7.2)

> **Purpose:** Mechanical export of protected/mechanical run artifacts into immutable `logs/<version>/<UTC-timestamp>-<taskHash>/` bundles so external auditors can inspect raw evidence directly on GitHub without manual copy-pasting or LLM paraphrasing.

## 1. Command & Execution Point

Run `scripts/export-logs.mjs` (pure Node.js stdlib ESM, zero runtime dependencies) from the **installed plugin root** (works in this repo and any foreign repository such as `tailscale-webos`), strictly **after `install.ps1` / release commit+tag and BEFORE any subsequent smoke task**:

```bash
# Linux / macOS / Git Bash (any repo)
node "${AGY_PLUGIN_DIR:-$HOME/.gemini/config/plugins/hermes-fleet}/scripts/export-logs.mjs" \
  --workspace=. \
  --npm-test-log=<path-to-npm-test.log> \
  --verify-log=<path-to-verify.log> \
  --install-log=<path-to-install.log> \
  --transcript=<path-to-transcript.jsonl>
```

```powershell
# Windows PowerShell (any repo)
node "$env:USERPROFILE\.gemini\config\plugins\hermes-fleet\scripts\export-logs.mjs" --workspace=.
```

### Mandatory Two-Commit Release Discipline & Run-Dir Immutability
1. **Commit 1 (Release commit + tag):** contains code, tests, protocols, docs, and verdicts bound to the exact pre-commit tree `diffHash`. Tagged `vX.Y.Z`.
2. **Run `install.ps1` / `install.sh`** (capturing `install.log`).
3. **Run `export-logs.mjs` immediately BEFORE any follow-up/smoke task** (so single-file `.hermes/grade-report.json` and `.hermes/qa-verdict.json` are captured intact) — `manifest.json` anchors `releaseCommitHash`, `releaseTreeHash`, and `gateModes` (effective `mode` + `source` without leaking raw `.hermes/config.json`).
4. **Immutability:** existing `logs/<version>/<UTC-timestamp>-<taskHash>/` directories are **never overwritten** (atomic leaf `mkdirSync` fails on `EEXIST`).
5. **Commit 2 (Separate logs commit):** `[TASK-XXX] chore(logs): export X.Y.Z run artifacts` — touches **ONLY** `logs/<version>/<UTC-timestamp>-<taskHash>/`. Never amend Commit 1 or move the release tag.

## 2. Exported Files & Strict Extension Rule

- **Output directory:** `logs/<version>/<UTC-timestamp>-<taskHash>/` (version resolved from installed plugin's own `plugin.json`, even in foreign repos).
- **Allowed extensions:** strictly `.json`, `.jsonl`, `.log`, `.txt`. **Zero `.md` files** under `logs/` (keeps markdown/doc-lint/consistency checks untouched). `.gitignore` includes `!logs/**/*.log` so `.log` captures commit cleanly.
- **Protected/mechanical sources copied verbatim (after redaction):**
  - `.hermes/test-summary.json`, `gate-log.jsonl`, `council-state.json`, `council-outcomes.jsonl`, `council-cost.jsonl`, `progress-journal.jsonl`, `lessons.jsonl`, `qa-verdict.json`, `security-verdict.json`, `plan-state.json`, `plan-ledger.jsonl`, `rubric.json`, `grade-report.json`, `grade-ledger.jsonl`, `team-stop.json`, `eval-results.jsonl`, `xray-report.json`, `debt-ledger.jsonl`
  - `.hermes/plan.md` → `plan.md.txt`, `.hermes/decisions.md` → `decisions.md.txt`
  - Optional command stdout captures: `npm-test.log`, `verify.log`, `install.log`
  - Mechanical anchors: `git-state.json`, `manifest.json` (including `gateModes: { councilGate, planGate, gradeGate, xray, qaVerdictMode }` with `mode` + `source`)
- **Absent sources (Rule 13 — Data Honesty):** missing files are recorded in `manifest.json` as `{ "status": "absent" }`. Content is **never** fabricated.
- **Excluded permanently:** `.hermes/config.json` is **never** exported in full (only effective `gateModes` enum + `source` appear in `manifest.json`).

## 3. Privacy, Redaction & Size Cap

1. **Secrets redacted before disk write:** reuses `KNOWN_SECRET_PREFIX_RE`, `SECRET_ASSIGN_RE`, and `CONN_SECRET_RE` from `hooks/consent-validator.mjs` → `[REDACTED_SECRET]`.
2. **User paths redacted before disk write:** host home directory and generic `C:\Users\<user>`, `/Users/<user>`, `/home/<user>` → `%USER%`.
3. **Transcript shape by default:** `transcript-shape.jsonl` emits strictly metadata per step (`step_index`, `source`, `type`, `status`, `hasHarnessBanner`, `tool_call_names`, `sender`, `contentLength`) — **zero `content` text**. Full redacted transcript (`transcript-full.jsonl.txt`) is written **only** when the operator explicitly passes `--include-transcript`.
4. **Per-file cap (2 MiB):** files exceeding `2 097 152` bytes are truncated honestly with an inline marker plus `truncated: true`, `originalSize`, and `originalSha256` in `manifest.json`.

## 4. Isolation & Guard Enforcement

- **Install payload exclusion:** `logs/` is excluded from `install.ps1` and `install.sh` (and explicitly cleaned from stale target directories).
- **Agent write protection:** `logs/` is **not** added to the 21 built-in `DEFAULT_PROTECTED_VERDICT_PATHS`, but `hooks/clean-edits-guard.mjs` blocks direct model `write_file`/`edit_file`/shell writes into `logs/` (`rule: "logs_direct_write_deny"`). Only `scripts/export-logs.mjs` populates `logs/`.
