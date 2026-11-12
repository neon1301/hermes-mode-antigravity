# Web, API, Auth, OWASP Top 10 & Cryptography Audit Guide

Synthesized from **`semgrep/skills`** (`code-security`), **`cloudflare/security-audit-skill`** (~68.8k+ ★), **`getsentry/skills`** (`security-review`), and **OWASP ASVS**.

---

## 1. Access Control, Authentication & Session Security (Top Real-World Risk)

| Vulnerability Class | Code Smells to Hunt | Mandatory Remediation |
| :--- | :--- | :--- |
| **IDOR / BOLA (`CWE-639`)** | `GetById(id)` / `Update(dto.Id)` querying DB by primary key without scoping to authenticated `currentUser.TenantId` / `UserId` | Derive identity strictly from verified auth context (never request body/query) and apply tenant/owner filter on **every** read & write |
| **Broken Function-Level Auth (`CWE-285`)** | Admin endpoints relying solely on hidden UI buttons, client flags, or inconsistent `[Authorize]` attributes across handlers | Apply **deny-by-default** global auth policy (`FallbackPolicy` / middleware), opting in `[AllowAnonymous]` only explicitly on public routes |
| **Mass Assignment (`CWE-915`)** | Binding HTTP JSON directly into ORM/EF entities (`IsAdmin`, `Balance`, `TenantId`, `Role`) | Bind strictly to explicit allowlisted Input DTOs mapped field-by-field (`backend-architecture`) |
| **JWT & Token Flaws (`CWE-347`)** | `alg: none` accepted, `jwt.decode(..., verify=False)`, missing `aud`/`iss`/`exp` validation, weak/hardcoded HMAC secret, RSA/HMAC key-confusion | Pin allowed signature algorithms explicitly, validate `iss`/`aud`/`exp` with bounded clock skew, store keys securely outside code |
| **OAuth2 / OIDC & Sessions** | Missing PKCE/random `state` check on callback, open `redirect_uri` prefix bugs, session tokens in URLs, cookies missing `HttpOnly`/`Secure`/`SameSite` | Validate exact pre-registered redirect URIs, require PKCE + cryptographically random `state`, set strict cookie flags & rotate session ID on login |

---

## 2. Injection, SSRF, XSS, CSRF & Deserialization (`Source-to-Sink`)

- **SQL / NoSQL Injection (`CWE-89`):** Flag string interpolation/concatenation inside `ExecuteSqlRaw`, `sqlite3`, `psycopg`, Mongo `$where`/raw JSON filters -> mandate parameterized bindings (`@p0`, `$1`) and allowlisted column names for dynamic `ORDER BY`.
- **Command Injection (`CWE-78`):** Flag `Process.Start(UseShellExecute=true)` / `subprocess(..., shell=True)` / `exec()` with user strings -> pass binary + strict argument arrays, reject shell metacharacters, prefer native language APIs.
- **Path Traversal (`CWE-22`):** Flag `Path.Combine(baseDir, userFilename)` (in .NET/Python, if `userFilename` is rooted or contains `..`, `Combine`/`os.path.join` returns the attacker path!) -> canonicalize with `Path.GetFullPath()` / `Path.resolve()` and assert `StartsWith(canonicalBase + DirectorySeparatorChar)`.
- **SSRF (`CWE-918`):** Whenever server code fetches user-supplied URLs (webhooks, PDF generators, image proxies): parse URL strictly (`https` scheme only), resolve DNS and block loopback, private RFC 1918/4193 ranges, and link-local cloud metadata IP ranges (`169.254.0.0/16`), AND block/re-validate HTTP `3xx` redirects!
- **XSS / SSTI (`CWE-79`, `CWE-1336`):** Ban `dangerouslySetInnerHTML`, `v-html`, `innerHTML`, `|safe`, or `javascript:` URLs unless sanitized with a strict allowlist (DOMPurify) + strong CSP; pass user values as template context data, never format into Jinja/Razor/Handlebars strings.
- **Unsafe Deserialization & XXE (`CWE-502`, `CWE-611`):** Ban `BinaryFormatter`, `TypeNameHandling.All` (Newtonsoft), Python `pickle`/`yaml.load()` (without `SafeLoader`), Java `ObjectInputStream`, and XML parsers allowing external DTDs (`DtdProcessing.Prohibit` required).
- **CORS & CSRF (`CWE-942`, `CWE-352`):** NEVER echo arbitrary `Origin` headers dynamically or pair wildcard origins with credentials (`AllowCredentials`); enforce CSRF tokens or strict `SameSite` + Origin checks on cookie-authenticated mutations.

---

## 3. Cryptography, Passwords & Transport Hygiene

- **Passwords:** Always use **Argon2id**, **bcrypt**, or PBKDF2-HMAC-SHA256 with unique per-user salts — NEVER MD5, SHA-1, unsalted SHA-256, or reversible encryption. Compare HMACs/secrets in **constant time** (`CryptographicOperations.FixedTimeEquals` / `hmac.compare_digest`).
- **CSPRNG vs. Non-Crypto RNG:** NEVER use `System.Random`, Python `random`, or JS `Math.random()` for tokens, API keys, OTPs, password resets, or session IDs -> use `RandomNumberGenerator`, `secrets`, or `crypto.randomBytes`.
- **Authenticated Encryption & TLS:** Use **AES-GCM** or **ChaCha20-Poly1305** (never AES-ECB or unauthenticated CBC with predictable IVs). Reject `ServerCertificateCustomValidationCallback => true`, `InsecureSkipVerify: true`, or `verify=False` everywhere except strictly isolated explicit opt-in test harnesses!
