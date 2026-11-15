# ✍️ Fleet Skill Specification & Authoring Standard

*Adapted from `obra/superpowers` under the MIT License.*

---

## 🏛️ Standard for Hermes Fleet Skills

Every skill added or refactored within Hermes Fleet must strictly adhere to the following architectural constraints:

### 1. Identity & File System Structure
- **Directory Name**: Must exactly match the skill's `name` in frontmatter (`skills/<skill-name>/SKILL.md`).
- **Bounded Body Budget**: `SKILL.md` body must NOT exceed **7,168 bytes (7 KB)**.
- **Stack-First Design**: Heavy reference tables, deep catalogs, cheat sheets, and architectural decision records must be extracted to `skills/<skill-name>/references/*.md`.
- **Automated Verification**: Every skill that includes domain code patterns must bundle a `scripts/verify-<skill-name>-patterns.mjs` verification script executed during doc-linting.

---

### 2. Frontmatter Contract
The YAML frontmatter of `SKILL.md` must be bounded and concise:

```yaml
---
name: skill-name
description: Clear, action-oriented description of what the skill provides. Use when <explicit trigger scenario / keywords explaining when to activate>.
---
```

- **Length**: Total description must not exceed **1024 characters**.
- **Mandatory Trigger**: Must contain an explicit `when`, `use when`, or `activate when` clause to guide platform routing without hallucination.

---

### 3. Tool Primitives Integrity
Skills must reference **ONLY** official Google Antigravity tools:
- `read_file` / `view_file` (with path normalization)
- `write_file`
- `edit_file`
- `run_command`
- `search_web`
- `search_marketplace`
- `schedule`
- `manage_task`
- `send_message`
- `invoke_subagent`
- `define_subagent`
- `manage_subagents`
- `list_plugin_accounts`
- `run_workflow`
- `swarm`
- `ask_question`

> ⚠️ **Zero Hallucinated Tools**: References to `bash`, `str_replace_editor`, `terminal`, `view_image`, or unmapped `mcp__*` tools are forbidden.

---

### 4. Link & License Integrity
- All local markdown links must resolve to existing files (tested by `consistency.test.mjs`).
- Any adapted or ported external material must be credited with original author and license terms in `THIRD_PARTY_NOTICES.md`.
