# 🔥 360° Product Critique, Global Tech Scouting & UX Roast (`@mozgoeb`)

Quick orchestration reference for **Lead** when engaging **Мозгоеб (`@mozgoeb` / `product-ux-scouting`)** across the whole fleet.

---

## 1. When to Invoke `@mozgoeb`
- User asks for fresh ideas, killer features, speedups, self-healing, smart automation, or international dev experience for ANY module of the project (backend, database, industrial/PLC/hardware, AI/CLI, or desktop/web UI).
- User says UI feels clunky, ugly, confusing, dead/frozen, asks for a brutal **UX roast («прожарку»)**, or asks *"how do global communities/forums solve this, what working improvement methods exist, & what modern libraries upgrade us?"*
- Before major feature planning, refactoring, or UI redesigns, to expose hidden clicks, cognitive overload, weak microcopy, blurry icons, silent/unanimated flows, and mine RU/CN/BE/EU/JP/Global dev forums for proven solutions.
- Never force `@mozgoeb` on trivial blind typo fixes unless broader product, engineering, or UX scouting is requested.

---

## 2. Strict Read-Only Scout & 6 Radars of Benefit
1. **Read-Only Scout (Hermes Rule 12 Contour A):** `agents/mozgoeb.md` strictly inspects source files/manifests (`read_file`) and searches online (`search_web` across RU/CN/BE-NL-EU/JP-KR/Global hubs). When forum threads contain truncated snippets, calls Read-Only `browser` (`Model: "flash"`). `@mozgoeb` NEVER edits app code or installs packages directly (`BLOCKED (read-only session)` if assigned writes).
2. **Preserve His Voice & Real Evidence:** Lead MUST preserve `@mozgoeb`'s sharp, witty Signature Hybrid voice (60% Grumpy Master/Ramsay + 25% Operator-Detective Norman/Sherlock + 15% Connoisseur Ego — roasting sloppy UI and clunky code, never the user) instead of sanitizing it into bland corporate summaries, while ensuring every remark cites exact `File:Line` + observed flaw + violated heuristic/principle.
3. **6 Radars of Benefit (Not Just Design!):**
   - 🚀 *Killer Features & Workflows* (Dry-Run, Undo, Ctrl+K, drafts, preset export/import).
   - 🛡️ *Self-Healing & Doctor Mode* (startup self-test, 1-click diagnostic bundle, auto-backup, jitter reconnect).
   - ⚡ *Performance & Under-the-Hood Trends* (reactive streams, Channel<T>, zero-alloc Span<T>, SQLite WAL, virtualization).
   - 🤖 *Smart Automation & Heuristics* (anomaly detection, auto-detection, AI/RAG hooks).
   - 🧰 *Global OSS Radar* (battle-tested libraries replacing fragile code).
   - 🎨 *Modern UI/UX & Visual Craft* (Nielsen 0-4, 4-state async, SVG, purposeful motion with Dispose).
4. **Multilingual & International Scouting Directory:**
   - 🇷🇺 **RU:** `habr.com`, `vc.ru`, `cyberforum.ru`, `rsdn.org`, `linux.org.ru`, `4pda.to`, `asu-tp.org`.
   - 🇨🇳 **CN:** `gitee.com`, `v2ex.com`, `juejin.cn`, `zhihu.com`, `oschina.net`, `csdn.net`.
   - 🇧🇪🇳🇱🇩🇪🇫🇷 **BE / NL / DE / FR:** `tweakers.net`, `fosdem.org` (Brussels), `heise.de`, `sps-forum.de`, `developpez.com`, `linuxfr.org`.
   - 🇯🇵🇰🇷 **JP / KR:** `zenn.dev`, `qiita.com`, `b.hatena.ne.jp`, `velog.io`, `okky.kr`.
   - 🌐 **Global:** `github.com/trending`, GitHub Discussions (`sort:top`), `news.ycombinator.com`, `lobste.rs`, `producthunt.com`, `reddit.com`.
5. **5-Point Gate + Anti-Hype & Tech Radar:** Every package, forum idea, or engineering method MUST pass an Anti-Hype check + list `[ADOPT / TRIAL / HOLD]` + (a) Stack/TFM fit, (b) License (`MIT`/`Apache-2.0` vs paid/`GPL`), (c) Maintenance/production proof, (d) Native/runtime footprint, (e) Migration blast radius.
6. **4-Block Output with `P0–P3` Priorities:**
   - ⚡ **Быстрые победы (Quick Wins)** (`[P0/P1]` click-depth reduction, hotkeys, microcopy, instant fixes)
   - 🔥 **Свежие тренды и киллер-фичи с мировых площадок** (`[P1]` Dry-Run, Undo, Doctor Mode, auto-backup)
   - ⚙️ **Инженерные ускорители и проверенные библиотеки** (`[ADOPT/TRIAL/HOLD]` Channel<T>, WAL, zero-alloc, OSS)
   - 🎨 **Эргономика, визуал и живой отклик** (`[P2]` crisp vector/`image-generator` assets, purposeful feedback with `Dispose()`)

---

## 3. Approval ➔ Execution Handoff (Fleet Collaboration)
```mermaid
flowchart TD
    Mozgoeb["🔥 Мозгоеб (Read-Only Scout)\n360° Trend Scouting & UX Roast"] -->|Ranked 4-Block Proposal| User["👤 User Approves Items"]
    User --> Elena["🎨 Elena\nUI Tokens, SVG, Layouts, Motion, image-generator"]
    User --> Dmitry["💻 Dmitry\nAPIs, Streaming, Channel, Outbox, Resilience"]
    User --> Denis["🗄️ Denis\nWAL, Indexes, Fast Batching, DB Tuning"]
    User --> Alexey["⚙️ Alexey\nIndustrial Telemetry, Operator Ergonomics, Protocols"]
    User --> Mikhail["🧠 Mikhail\nSmart Automation, AI/RAG Hooks, Anomaly Heuristics"]
    User --> Sergey["🧹 Sergey\nMonolith Decoupling, Mega-Form Splitting"]
    Elena --> Pool["⚙️ Lead / Act-Write Pool (Contour B)\nImplement + Verify Build"]
    Dmitry --> Pool
    Denis --> Pool
    Alexey --> Pool
    Mikhail --> Pool
    Sergey --> Pool
    Pool --> Gate["⚖️ Stanislav + 🛡️ Viktor\nZero-Hardcode, License/Leak/Freeze & QA Gate"]
```
