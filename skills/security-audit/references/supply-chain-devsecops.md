# Supply Chain, Secrets, Containers & CI/CD Hardening (DevSecOps)

Synthesized from **`semgrep/skills`**, **`github/awesome-copilot`** (`security-review`), **`cdmx-in/security-review`**, and **OWASP CI/CD Security**.

---

## 1. Secrets Hygiene & Automated SAST/SCA Workflow

When local security tooling is installed in the project environment, prefer verifiable automated output alongside manual inspection:
- **Secrets Detection (`Gitleaks` / `Semgrep` / Rule 9):** Never leave API keys, private RSA/SSH PEM blocks, JWT signing secrets, DB passwords, or webhook secrets in source files, tests, `Dockerfile` `ENV`/`ARG`, or committed `.env` files.
  - Note: If a real secret was *ever* committed to Git history, **simply deleting it in a new commit is NOT enough** — flag mandatory **secret rotation/revocation** immediately!
- **Dependency & CVE Audits (SCA):**
  - Pin exact dependency versions cleanly via lockfiles (`packages.lock.json`, `package-lock.json`, `uv.lock`, `go.sum`) committed to VCS; run reproducible installs (`npm ci`, `dotnet restore --locked-mode`).
  - Run ecosystem vulnerability checks where applicable (`dotnet list package --vulnerable --include-transitive`, `npm audit`, `pip-audit`, `govulncheck`, `trivy fs .`), separating **reachable** critical CVEs in production dependencies from dev-only test noise.
- **Automated Static Analysis (`Semgrep`):** Confirm high-signal SAST findings against real code rather than blindly suppressing `# nosemgrep` rules without an architectural justification comment.

---

## 2. Docker & Container Hardening Checklist

| Layer / Risk | Vulnerable Pattern | Secure Hardening Standard |
| :--- | :--- | :--- |
| **Privilege Escalation (`CWE-250`)** | Running app as default `root` inside container (`USER` omitted) | Create & switch to dedicated low-privilege `USER` before `ENTRYPOINT` |
| **Base Image Bloat & CVEs** | Heavy full OS images with compilers/curl/shells (`:latest` floating tags) | Use minimal/distroless/alpine multi-stage builds pinned by version/digest (`@sha256:...`) |
| **Build-Time Secret Leaks** | `ARG NPM_TOKEN`, `ENV API_KEY=...`, or `.env` copied inside image layers (`docker history` exposes them!) | Use BuildKit `--mount=type=secret` during build and inject runtime secrets strictly via secret manager/mounted tmpfs |
| **Container Runtime Surface** | `--privileged`, `CAP_SYS_ADMIN`, host network/PID namespaces, writable root FS | Drop `ALL` capabilities (`cap_drop: [ALL]`), mount read-only rootfs where possible, enforce memory/CPU limits |

---

## 3. CI/CD Pipeline Security (GitHub Actions / GitLab CI)

- **Script Injection (`CWE-94`):** NEVER interpolate untrusted PR titles, branch names, issue bodies, or commit messages directly inside `run:` shell scripts (`${{ github.event.pull_request.title }}`) — pass them safely through intermediate `env:` variables quoted cleanly!
- **Unpinned Third-Party Actions (`CWE-829`):** Pin third-party GitHub Actions to **immutable full 40-char commit SHAs** (`uses: actions/checkout@<sha> # v4`) rather than mutable branch/version tags (`@v4` or `@main`).
- **Over-Privileged Workflow Tokens:** Declare top-level `permissions: read-all` (or `contents: read`) by default and grant write scopes ONLY on specific release/comment jobs.
- **Untrusted Fork PR Execution (`pull_request_target`):** NEVER check out and run untrusted fork code under `pull_request_target` with access to repository write tokens or deployment secrets.
