# Diátaxis Framework, ADRs & Operational Runbooks

Synthesized from **`cursor/plugins`** (`technical-writing`), **`skillrecordings/adr-skill`**, and **`affaan-m/ECC`** (`adr`).

---

## 1. The Diátaxis Documentation Architecture

Never blend four incompatible reader intents into one confusing document. Route every page to its proper quadrant:

| Quadrant | Reader Mindset | Purpose & Style | Example Artifact |
| :--- | :--- | :--- | :--- |
| **Tutorials** | Learning safely | Guided step-by-step path reaching a working result; zero tangent choices | "Run Your First Local Machine Simulator in 5 Minutes" |
| **How-To Guides** | Solving a real task | Goal-oriented recipe assuming baseline knowledge; direct steps | "How to Migrate SQLite Storage to Production MSSQL" |
| **Reference** | Looking up exact facts | Dry, exhaustive, structured accuracy matching code 1:1 (tables, schemas) | Config Key Catalog, Protocol Byte Map, OpenAPI Spec |
| **Explanation** | Understanding *why* | Context, architecture trade-offs, invariants, diagrams (C4/Sequence) | Why WAL Mode Fails Over SMB Shares; System Overview |

### Writing Style Rules
- **Active Voice & Imperative Actions:** *"Set `BusyTimeoutMs` in `appsettings.json`"* instead of *"The timeout setting may be configured by the user"*.
- **Task-First Structuring:** Lead troubleshooting/config sections with symptoms or setting names in scannable tables, never walls of prose.

---

## 2. Architecture Decision Records (`ADR-NNNN`)

Maintain lightweight decision logs (`docs/adr/ADR-NNNN-short-title.md` or `.hermes/docs/`) whenever teams select databases, protocols, messaging, or major refactors:

```markdown
# ADR-0001: [Short Descriptive Title]

- **Status:** Proposed | Accepted | Superseded by ADR-XXXX
- **Date:** YYYY-MM-DD
- **Owners / Deciders:** @dmitry, @denis, ...

## Context & Problem Statement
What constraints, throughput targets, failure modes, or regulatory rules forced a choice?

## Options Considered
1. **Option A:** summary + pros / cons
2. **Option B:** summary + pros / cons

## Decision
Chosen option and exact invariants (what MUST stay true).

## Consequences & Trade-offs
Positive outcomes, accepted operational costs, migration/rollback plan.
```

---

## 3. Production & Shop-Floor Operator Runbooks

Every runbook for operators, DevOps, or plant technicians MUST be self-contained under incident pressure:
1. **Incident Signature / Symptoms:** Exact log errors, UI status indicators, or alarm codes (`SQLITE_BUSY`, disconnected socket, timeout).
2. **Immediate Triage Checks:** Safe read-only diagnostic commands/health endpoints to isolate root cause in <2 minutes.
3. **Recovery / Mitigation Steps:** Ordered numbered actions with expected outputs after each step.
4. **Verification & Rollback:** How to confirm service health restored + how to undo the mitigation safely if it did not help.
5. **Escalation Path:** Which component owner / vendor support / logs bundle must be collected before escalating.
