---
name: security-audit
description: Enterprise cybersecurity auditing, OWASP Top 10/ASVS vulnerability hunting, adversarial validation, Auth/JWT/SSRF/Crypto hardening, industrial socket DoS defense, and DevSecOps SAST/SCA triage. Use when auditing security, reviewing sensitive diffs, checking auth/crypto/dependencies, or producing CWE-mapped findings.
---

# Cybersecurity Audit & AppSec Verification Skill

This skill guides **🛡️ Viktor** (alongside **`qa-test-automation`** and **⚖️ Stanislav**'s SAST checks) in conducting rigorous, low-false-positive cybersecurity assessments across web APIs, backend services, desktop apps, industrial sockets, containers, and CI/CD pipelines.

---

## 1. The 6-Phase Evidence-Led Audit Workflow (`cloudflare/security-audit-skill`)

Never guess vulnerabilities from isolated single-line snippets. Follow strict proof discipline:
1. **Phase 1 — Recon & Entry-Point Mapping (`entry-point-analyzer`):** Map trust boundaries, external HTTP/WebSocket/gRPC routes, TCP/UDP socket parsers, file uploaders, auth middleware, and state-changing entry points.
2. **Phase 2 — Coverage-Led Source-to-Sink Hunting:** Trace untrusted `Sources` through sanitization/authorization boundaries to sensitive `Sinks` systematically across every mapped module (eliminating unreviewed blind spots).
3. **Phase 3 — Adversarial Candidate Validation ("Fresh Verifier Rule"):** Actively try to **disprove** every candidate bug before reporting it! Verify reachability from an untrusted entry point, bypassability of existing guards/WAF/types, and real exploit impact (`KeygraphHQ/shannon` reachability proof).
4. **Phase 4 — Differential & Sharp-Edges Review (`trailofbits/skills`):** On PRs/commits, trace removed checks via `git log`/`git blame`, assess downstream caller blast radius, and audit dangerous API defaults/footguns.
5. **Phase 5 — Automated Scanner Cross-Check (`Semgrep` / `Gitleaks` / `Trivy`):** Pair manual taint analysis with ecosystem SAST/secrets/SCA tools when available (`dotnet list package --vulnerable`, `npm audit`, `pip-audit`, `trivy fs`, `gitleaks`, `semgrep`).
6. **Phase 6 — Verified Findings Report (`findings.json`):** Classify strictly by evidence (`confirmed`, `needs_validation`, or `rejected`) with **CWE**, file/line numbers, exploit trace, and concrete fix + regression test.

---

## 2. Progressive Reference Routing Matrix

Load ONLY the reference module matching the audit target:

| Security Domain | Load Reference | Core Vulnerabilities & Playbooks |
| :--- | :--- | :--- |
| **Web, API, Auth & Cryptography** | [references/web-auth-crypto-owasp.md](references/web-auth-crypto-owasp.md) | **Injection** (SQL/Cmd/Path/LDAP/XXE/Template), **Broken Access Control (IDOR/BOLA/Mass Assignment)**, **Auth & Tokens (JWT, OAuth2/PKCE, Sessions)**, **XSS/CSRF/SSRF/CORS/Deserialization**, **Crypto & TLS verification**, secrets leaks |
| **Diff Review, Sharp Edges & Sockets/DoS** | [references/diff-review-sharp-edges.md](references/diff-review-sharp-edges.md) | **Trail of Bits `differential-review`, `sharp-edges`, `insecure-defaults`**, **Cloudflare Fresh-Verifier Rules**, **Industrial Sockets & DoS** (frame-length OOM bombs, `ReadExactlyAsync`, GDI/COM leaks, lock deadlocks, rate limits) |
| **Supply Chain, Containers & CI/CD** | [references/supply-chain-devsecops.md](references/supply-chain-devsecops.md) | **SCA / CVE / Dependency Pinning**, **Docker / Container Hardening** (non-root, secrets in image layers, caps), **CI/CD Security** (GitHub Actions script injection, SHA pinning, least-privilege `GITHUB_TOKEN`), **SAST Triage** |

---

## 3. Core `MUST DO / MUST NOT DO` Guardrails

### `MUST DO`
- Separate **`confirmed`** (complete trace + proven impact) from **`needs_validation`** (no severity score yet!) and discard disproved candidates as **`rejected`**.
- Require **negative authorization security tests** ("user A fails to read/mutate user B's resource -> `403`/`404`") alongside every auth or access-control fix.
- Flag any literal secret, password, token, hardcoded IP, or TLS-validation bypass immediately under both **`security-audit`** and **Hermes Rule 9**.

### `MUST NOT DO`
- NEVER invent unverified vulnerabilities, assign `CRITICAL` without checking whether middleware/type-validation blocks exploitation, or commit live exploit payloads/secrets into repos.
- NEVER fix security symptoms only on the client/frontend while leaving the backend endpoint trusting client-supplied IDs, roles, or prices.

---

## 4. Structured Output Schema (`findings.json`)

```json
{
  "auditDate": "YYYY-MM-DD",
  "target": "Subsystem / Service",
  "findings": [
    {
      "id": "SEC-001",
      "status": "confirmed",
      "severity": "CRITICAL",
      "cwe": "CWE-639",
      "title": "Missing object ownership check enables cross-tenant IDOR on order export",
      "file": "src/Controllers/ExportController.cs",
      "lines": "42-58",
      "exploitPath": "Unauthenticated or Tenant-A caller passes orderId belonging to Tenant-B -> repository queries by PK without tenantId scope",
      "remediation": "Enforce authenticated User/TenantId predicate in domain query and add integration negative-auth test",
      "regressionTestRequired": true
    }
  ]
}
```
