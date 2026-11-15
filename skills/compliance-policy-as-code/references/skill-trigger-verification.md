# 🔍 Skill Trigger & Hallucinated Tool Verification Protocol

*Adapted from `UiPath/check-skill` and `aurite-ai/agent-verifier` under the MIT / Apache 2.0 Licenses.*

---

## 🏛️ Verification Invariant: Zero Hallucinated Tools

Coding agents often hallucinate external CLI tools or foreign IDE commands (`bash`, `terminal`, `view_image`, `str_replace_editor`, `mcp__*`) when porting third-party skills. In Google Antigravity, only the following primitives are permitted:

```javascript
export const OFFICIAL_ANTIGRAVITY_TOOLS = new Set([
  'read_file', 'view_file',
  'write_file', 'edit_file',
  'run_command', 'search_web', 'search_marketplace',
  'schedule', 'manage_task', 'send_message',
  'invoke_subagent', 'define_subagent', 'manage_subagents',
  'list_plugin_accounts', 'run_workflow', 'swarm', 'ask_question'
]);
```

Any skill documentation, prompt instruction, or test runner referencing tools outside this whitelist triggers an immediate compliance reject.

---

## 🎯 Deterministic Skill Trigger Auditing

Each skill in `skills/<skill-name>/SKILL.md` must pass automated trigger auditing:

| Audit Check | Criteria | Failure Action |
| :--- | :--- | :--- |
| **Directory Match** | Frontmatter `name` must exactly equal folder name | Reject on naming drift |
| **Trigger Clause** | Description must include an explicit `when`, `use when`, or `activate when` clause | Reject on missing trigger |
| **Description Length** | Frontmatter `description` must not exceed 1024 characters | Reject on verbose frontmatter |
| **Body Size Budget** | `SKILL.md` body must not exceed 7,168 bytes (7 KB) | Force extraction to `references/` |
| **Link Integrity** | All markdown relative links `[text](path)` must resolve to real files on disk | Reject on broken links |

---

## 🛠️ Automated Static Verification Script Pattern

```javascript
// Example check in consistency.test.mjs
for (const skill of skills) {
  const content = fs.readFileSync(path.join(skillsDir, skill, 'SKILL.md'), 'utf-8');
  // 1. Check for hallucinated tools
  for (const badTool of ['bash', 'str_replace_editor', 'mcp__']) {
    if (content.includes(`\`${badTool}\``)) {
      throw new Error(`Skill ${skill} references hallucinated tool '${badTool}'`);
    }
  }
}
```
