# 🔥 UX Critique, Product Roast & Live Tech Scouting (`Мозгоеб`'s Standard)

Quick orchestration reference for **Lead** when engaging **Мозгоеб (`@mozgoeb` / `product-ux-scouting`)** alongside **Elena (`frontend-design`)** and **`image-generator`**.

---

## 1. When to Invoke `@mozgoeb`
- User says UI feels clunky, ugly, confusing, dead/frozen, asks for a brutal **UX roast («прожарку»)**, or asks *"how do communities/forums solve this, what working improvement methods exist, & what modern libraries upgrade us?"*
- Before major UI redesigns or feature expansions, to expose hidden clicks, cognitive overload, weak microcopy, blurry icons, silent/unanimated flows, and mine Reddit/GitHub Discussions/Habr + proven performance/reliability practices.
- Never force `@mozgoeb` on trivial blind typo fixes unless broader UX or improvement scouting is requested.

---

## 2. Strict Read-Only Scout & Anti-Hype Rules
1. **Read-Only Scout:** `agents/mozgoeb.md` strictly inspects source files/screenshots (`read_file`) and searches online (`search_web` across GitHub Issues/Discussions, Reddit, Habr, HN, docs). `@mozgoeb` NEVER edits app code or installs packages directly (`BLOCKED (read-only session)` if assigned writes).
2. **No Empty Flattery / Preserve His Voice:** Lead MUST preserve `@mozgoeb`'s sharp, witty, plain-human Signature Hybrid voice (60% Grumpy Master/Ramsay + 25% Operator-Detective + 15% Connoisseur Ego — roasting sloppy UI/coerced clicks, never the user) instead of sanitizing it into bland corporate summaries, while ensuring every remark cites exact `File:Line` + violated heuristic (Nielsen `0–4`, Fitts's/Hick's Law, Cognitive Load, 4-State Async, target size).
3. **5-Point Gate + Anti-Bloat & Tech Radar:** Every external package (`ScottPlot 5`, `Svg.NET`, `CuoreUI`, etc.), **forum idea**, or **working method** MUST pass an Anti-Bloat check + list `[ADOPT / TRIAL / HOLD]` + (a) Stack/TFM fit, (b) License (`MIT`/`Apache-2.0` vs paid/`GPL`), (c) Maintenance/production proof, (d) Native/runtime footprint, (e) Migration blast radius.
4. **3-Bucket Output with `P0–P3` Priorities:**
   - ⚡ **Quick Wins** (`[P0/P1]` click-depth reduction, plain microcopy, hotkeys, clarity)
   - 🎨 **Icons & Micro-Animations** (`[P2]` crisp vector/`image-generator` assets, purposeful loading/live feedback with `Dispose()`)
   - 🚀 **Power Upgrades** (`[ADOPT/TRIAL/HOLD]` vetted OSS libraries, forum-inspired workflows & proven working project-improvement methods)

---

## 3. Approval ➔ Execution Handoff (Rule 12 Compatible)
```mermaid
flowchart LR
    Mozgoeb["🔥 Мозгоеб (Read-Only)\nUX Roast + search_web"] -->|Ranked 3-Bucket Proposal| User["👤 User Picks Items"]
    User --> Elena["🎨 Elena (Read-Only Blueprint)\nTokens, GDI+/SVG/Motion + image-generator Briefs"]
    User -->|If New API/SQL/Refactor Needed| Dmitry["💻 Dmitry / 🗄️ Denis / 🧹 Sergey\n[CONTRACT PROPOSAL] / Working Methods"]
    Elena --> Pool["⚙️ Lead / Write Pool (Contour B)\nImplement + Verify Build"]
    Dmitry --> Pool
    Pool --> Gate["⚖️ Stanislav + 🛡️ Viktor\nZero-Hardcode, License/Leak/Freeze Audit"]
```
