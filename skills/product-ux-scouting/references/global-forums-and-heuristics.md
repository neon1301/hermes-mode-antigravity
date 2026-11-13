# 🌍 Global Forums Directory, Ergonomic Laws & 5-Point Vetting Matrix

Authoritative knowledge base for **Мозгоеб (`@mozgoeb`)** and the Hermes Fleet. Covers international dev forums, cognitive/ergonomic laws, Nielsen heuristics, and strict adoption gating.

---

## 🗺️ 1. International Dev Communities & Forum Directory

Scouting must never be restricted to English-only search. Real power users and engineers discuss bugs, workarounds, and killer patterns in their native forums.

### 🇷🇺 Russia & CIS (`RU`)
- **`habr.com`**: Architecture case studies, post-mortems, .NET/C# internals, high-load architecture, and engineering failure analysis.
- **`vc.ru`**: Product workflows, UX trends, fintech/e-commerce ergonomics, and SaaS onboarding patterns.
- **`cyberforum.ru` & `rsdn.org`**: Systems programming, WinForms/WPF edge cases, low-level Win32/GDI+ bugs, interop, and multithreading.
- **`linux.org.ru` & `4pda.to`**: Linux daemon internals, embedded software, reversing, and mobile/desktop ergonomics.
- **`asu-tp.org` & `plcforum.uz.ua`**: Industrial automation, SCADA UX, PLC protocols (Modbus, OPC UA), and harsh-environment operator interfaces.

### 🇨🇳 China (`CN` — High-Load, IoT & Rapid OSS Innovation)
- **`gitee.com`**: Chinese OSS hub; production C#, Vue, Go, Python, and industrial IoT solutions.
- **`v2ex.com`**: Elite community of Chinese developers and architects. High-signal UX ideas, dev tools, and micro-optimizations.
- **`juejin.cn`**: Leading platform for frontend/backend engineering trends, reactive patterns, and tooling benchmarks.
- **`zhihu.com`, `csdn.net`, `oschina.net`, `segmentfault.com`**: Practical battle stories, zero-alloc algorithms, and performance comparisons under high concurrency.

### 🇧🇪🇳🇱🇩🇪🇫🇷 Benelux & Europe (`BE / NL / DE / FR` — Systems Rigor & Industry Standards)
- **`tweakers.net` & `gathering.tweakers.net` (Belgium & Netherlands)**: Premier Benelux engineering forum. Hardware telemetry, desktop stability, networking, and industrial automation.
- **`fosdem.org` (Brussels, Belgium)**: Epicenter of European open-source architecture, free-software tooling, and resilient protocol designs.
- **`heise.de` & `sps-forum.de` (Germany)**: Industrial automation standards, Siemens/Beckhoff workflows, deterministic error handling, and mission-critical UI safety.
- **`developpez.com` & `linuxfr.org` (France & Belgium)**: French-speaking developer discussions on enterprise architecture, .NET, C++, and robust data pipelines.

### 🇯🇵🇰🇷 Japan & South Korea (`JP / KR` — Micro-Ergonomics & Relentless Polish)
- **`zenn.dev` & `qiita.com` (Japan)**: High-craft engineering, CLI/TUI design, micro-interactions, responsive typography, and minimal cognitive load.
- **`b.hatena.ne.jp` (Japan)**: Real-time tech trend curation and developer debate aggregator.
- **`velog.io` & `okky.kr` (South Korea)**: Modern high-load architectures, responsive UI patterns, and developer productivity tooling.

### 🌐 Global Hubs (`Global`)
- **`github.com/trending` & GitHub Discussions**: Filter by `sort:top` on issues/discussions to uncover top-requested QoL features and real user pain points.
- **`news.ycombinator.com` (Hacker News) & `lobste.rs`**: Engineering innovations, systems performance, and anti-hype software architecture.
- **`producthunt.com`**: Discover emergent interaction models, onboarding flows, and command palettes.
- **`reddit.com` (`r/dotnet`, `r/csharp`, `r/UXDesign`, `r/programming`, `r/sysadmin`)**: Candid operator rants, library abandonment warnings, and battle-tested recommendations.

### 🔍 Scouting Execution Rules
1. **Multilingual Queries:** Query in local idioms (e.g., `C# WinForms 滚动条 闪烁`, `WPF Deactivate 焦点 抖动`, `Span<T> zero alloc socket`).
2. **Domain Targeting:** Use `domain` in `search_web` (e.g. `query="site:v2ex.com/t VirtualMode DataGridView"`).
3. **Deep Reading via Browser Subagent:** When snippets truncate vital discussion threads, delegate to Read-Only `browser` (`Model: "flash"`). Never attempt auth/captcha bypass.

---

## 🧠 2. Ergonomic Laws & Cognitive Principles

Anchor all UX critiques in proven human-factors laws:

### Fitts's Law ($T = a + b \log_2(1 + D/W)$)
- Time to acquire a target depends on distance ($D$) and width ($W$).
- Most frequent actions (Top 5 daily tasks) must have large hit areas and sit close to user focus.
- **Click Depth Limit:** No critical daily action may require more than **2 clicks** from the primary screen.

### Hick's Law ($T = b \log_2(n + 1)$)
- Decision time increases logarithmically with the number of choices ($n$).
- Apply **Progressive Disclosure**: Show essential 20% controls by default; place advanced 80% behind expandable details or search.
- Provide sensible defaults for every input field.

### Miller's Law ($7 \pm 2$ chunks)
- Working memory capacity is limited to $7 \pm 2$ chunks.
- Break complex forms into logical visual cards, stepped wizards, or grouped fieldsets.

---

## 🎯 3. Nielsen 10 Usability Heuristics & Severity Scale (0–4)

### Severity Rating
- **`0` = Not an issue:** Aesthetic nuance, no functional hindrance.
- **`1` = Cosmetic issue:** Minor typography or alignment polish.
- **`2` = Minor defect:** Causes minor friction; low-to-medium priority.
- **`3` = Major defect:** Confuses users, causes significant delays or frequent mistakes; must fix.
- **`4` = Usability catastrophe:** Data loss, frozen process, silent failure, or blocker; release-gating.

### The 10 Heuristics
1. **Visibility of System Status:** Inform users of state promptly (4-state contract: `Idle / Loading / Success / Error`; spinners; percentages).
2. **Match Between System and Real World:** Speak user language, not dev jargon. Replace cryptic exceptions with clear actionable descriptions.
3. **User Control & Freedom:** Provide emergency exits without panic (`Undo`, `Cancel`, `Esc` closes popups).
4. **Consistency & Standards:** Follow platform conventions (Ctrl+S saves, Escape closes, Enter submits).
5. **Error Prevention:** Eliminate error-prone conditions before they occur (`Dry-Run` preview before bulk delete, auto-backup before migrations).
6. **Recognition Over Recall:** Minimize memory load by making elements, actions, and options visible (history, auto-complete).
7. **Flexibility & Efficiency of Use:** Accelerators for power users (`Ctrl+K`, quick filters) alongside intuitive UI for novices.
8. **Aesthetic & Minimalist Design:** Eliminate visual noise; dialogs must not contain rarely needed information (Chanel's rule).
9. **Help Users Recognize, Diagnose & Recover from Errors:** Plain-language error messages indicating the problem and actionable recovery.
10. **Help & Documentation:** Contextual tooltips, built-in `Doctor / Self-Test` mode, and 1-click diagnostic logs bundle.

---

## ⚖️ 4. The 5-Point Vetting & Anti-Hype Gate (`[ADOPT / TRIAL / HOLD]`)

Every candidate library, tool, or pattern MUST satisfy all 5 criteria before recommendation:

1. **Stack & Runtime Fit:** Exact TFM (`net8.0-windows`, `net48`, Node 20+, Python 3.11+, Go 1.22+), zero unsupported OS dependencies.
2. **License Safety:** Permissive only (`MIT`, `Apache-2.0`, `BSD-3-Clause`). Strict ban on viral copyleft (`GPL`/`AGPL`) and hidden commercial SDKs.
3. **Community Proof & Maintenance:** Verified production track record in forum discussions; active releases within 12 months.
4. **Footprint & Zero-Hardcode (Rule 9):** Low binary footprint, thread safety, zero leaks, deterministic `IDisposable`, no hardcoded secrets/paths.
5. **ROI & Blast Radius:** Measurable gain over integration labor. Safe isolation behind interfaces.

### Decision Matrix
- **`[ADOPT]`**: Passes all 5 checks; high ROI, low blast radius. Recommend for immediate implementation.
- **`[TRIAL]`**: Passes checks 1–4; promising but requires pilot validation on an isolated screen/service.
- **`[HOLD]`**: Fails any gate (unfavorable license, binary bloat, unproven hype). Explicitly explain rejection.
