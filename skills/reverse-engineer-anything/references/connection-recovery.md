# REA Connection Recovery & Setup Guide

This reference guide documents setup diagnostics, MCP connection recovery ladders, CLI fallbacks, and installation boundaries for the **Reverse Engineer Anything (REA)** skill.

---

## 1. Connection Lifecycle & Diagnostics

- Installing this skill supplies instructions; it does not automatically register the REA MCP server or install analysis engines.
- If REA tools are available and registration is not stale, proceed directly to the target without running diagnostics or setup.
- If tools are absent or calls are blocked, check upstream REA guides: `https://github.com/morluto/rea/tree/main/docs` or `skills/hermes/references/rea-investigation.md`.
- **MCP Connection Drops:** Retry once only when safe. If tools remain unavailable, restart the MCP client.
- **Doctor Diagnostics:** For setup-owned registrations, run `rea doctor`. For plugin-only installs, restart/re-enable the plugin.

---

## 2. Prerequisites & Tool Boundaries

- REA setup never installs or upgrades Node.js, npm, Homebrew, Java, Ghidra, IDA, JADX, Kuna, Binwalk, or Unblob.
- Use existing prerequisites; do not install unrelated software to repair MCP registration.
- For unsupported clients, use manual stdio registration with an existing installation's absolute runtime and entry script.

---

## 3. CLI Fallback for JS/ASAR Trees

When MCP registration is unavailable or transport constraints prevent full graph streaming:

```bash
npx -y rea-agents@latest analyze-javascript-application /absolute/path/to/app --json
```

- Returns the Evidence record directly without requiring an active disassembler database.
- Use `npx -y rea-agents@latest` only when acquisition is within authorized scope.
