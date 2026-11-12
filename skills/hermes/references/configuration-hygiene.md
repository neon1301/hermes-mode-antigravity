# ⚙️ Zero-Hardcode & Dynamic Configuration Architecture

This standard defines the mandatory rules for externalizing all environment-specific and infrastructure data across any codebase, framework, or programming language (.NET, Python, TypeScript, Go, Rust, C++).

---

## 🚫 1. What is Strictly Forbidden (Hardcoding Anti-Patterns)

Agents and Leads are **strictly prohibited** from embedding literal infrastructure values in source code:

| Forbidden Hardcode | Dangerous Anti-Pattern | Universal Engineering Requirement |
| :--- | :--- | :--- |
| **IP Addresses & Hosts** | Literal IPs (`"192.168.x.x"`, `"127.0.0.1"`, `"10.0.x.x"`) | Read from the project's native configuration provider |
| **Network Ports** | Hardcoded port numbers (`8080`, `5000`, `4001`) | Read from config with a documented fallback constant |
| **Logins & Passwords** | Plaintext credentials (`"admin"`, `"secret"`) | Read from environment variables, secrets manager, or config |
| **Absolute File Paths** | Drive roots (`"C:\..."`, `"/var/app/..."`) | Construct dynamically relative to application/workspace root |
| **Magic Timeouts** | Literal sleep/delay (`Thread.Sleep(5000)`) | Named configuration parameter or explicit option |
| **Database Connections**| Literal connection strings with credentials | Read from project connection provider / environment variables |

---

## 🔍 2. Dynamic Configuration Discovery (No Assumptions)

When onboarding any project, agents **must never assume specific configuration filenames** from past projects. Instead, they follow this discovery sequence:

1. **Detect Framework Configuration Standard:**
   - **.NET:** Check for `appsettings.json`, `app.config`, or custom `.ini`/`.json` loaders in the codebase.
   - **Node.js / TypeScript:** Check for `process.env`, `.env`, `config/`, or config packages.
   - **Python:** Check for `pydantic-settings`, `os.environ`, `.env`, `settings.py`, or `config.yaml`.
   - **Go / Rust:** Check for environment configs, flags, or config structs.
2. **Reuse Existing Patterns:**
   - If the codebase already has an established configuration service or options pattern, agents **must reuse that existing pattern** rather than inventing a new one or hardcoding literals.
3. **Dynamic Relative Path Resolution:**
   - Always resolve file and database paths relative to the runtime base directory:
     - *.NET:* `AppDomain.CurrentDomain.BaseDirectory`
     - *Node:* `process.cwd()` or `__dirname`
     - *Python:* `Path(__file__).resolve().parent`
     - *Go:* `os.Executable()` / relative workdir

---

## 🛡️ 3. The Viktor QA Enforcement Barrier
Viktor (Lead QA) audits every git diff before issuing `[QA PASS]`:
* Regex scan for raw IP literals: `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b` (outside of mock test fixtures).
* Regex scan for absolute disk roots: `[A-Za-z]:\\[^"'\n]+` or `/home/[^"'\n]+`.
* Scan for hardcoded password strings: `password\s*=\s*"[^"]+"` or `secret\s*=\s*"[^"]+"`.

> [!CAUTION]
> If ANY hardcoded IP, absolute path, or credential is found in business logic, Viktor **MUST immediately issue 🔴 `[QA REJECT]`** with instructions to bind the parameter to the project's active configuration provider.

---

## 🏗️ 4. What If the Project Has NO Configuration System At All?

If a codebase is legacy or brand new and currently has **ZERO configuration infrastructure**:

1. **Hardcoding is STILL Forbidden:** Agents are strictly barred from embedding literals into business logic under the pretext that "there was no config file yet".
2. **Mandatory Configuration Proposal:** The agent **MUST** proactively propose introducing a clean configuration mechanism suitable for the language and stack:
   - **Option A (Lightweight File):** A clean, human-readable config file (`.env`, `.ini`, or `.yaml`) with clear comments and safe default fallbacks.
   - **Option B (Framework Standard):** Standard framework configuration (`appsettings.json` for .NET, `pydantic-settings` for Python, `dotenv` for Node/TS).
   - **Option C (Centralized Config Class):** If external files are not feasible, centralize all values into a single dedicated static options file (e.g. `AppConfig.cs` / `config.py`), completely separating configuration from business logic.
3. **Action:** The agent presents the options, gets user consent, scaffolds the config file and accessor service cleanly, and only then implements the business logic.


---

## 🎨 5. UI Settings Extension Protocol (Desktop / Web / GUI)

If the project features a graphical user interface (WinForms, WPF, Web UI, Desktop):

1. **Check for Existing UI Settings Forms:**
   - On discovering the UI architecture, Elena & Dmitry inspect whether the application already has a Settings Dialog, Preferences Window, or Administration Tab.
2. **Complementing Existing UI Settings:**
   - **If a settings form exists:** Rather than making the user edit text files in Notepad, Elena & Dmitry **MUST propose complementing the existing settings form** with a new control (e.g. validated `TextBox`, `NumericUpDown` for ports, masked input for IPs, or a "Browse..." folder dialog) and bind it to the configuration save/load routine.
3. **If No UI Settings Form Exists:**
   - The team proposes creating an intuitive, ergonomic Preferences/Settings window so plant operators can configure the system directly from the user interface.
