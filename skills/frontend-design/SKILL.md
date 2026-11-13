---
name: frontend-design
description: Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don't read as templated defaults.
---

# Frontend Design & UI Engineering Standard

Approach UI as a design lead delivering a bespoke visual identity and rock-solid engineering. Reject generic AI defaults; make deliberate, opinionated choices grounded in the subject matter.

---

## 🎨 Bespoke Visual Direction & Aesthetic Principles

### 1. Ground in Subject Matter
Visual choices must reflect domain vernacular: industrial telemetry differs fundamentally from consumer fintech or medical diagnostics. Build with authentic content and real workflows throughout.

### 2. Reject AI Clichés
Ban recognizable generator tells:
- The terracotta/warm-clay accent on cream background (`#F4F1EA`).
- The near-black background with a single neon acid-green accent.
- Generic SaaS card kits: identical rounded boxes, uniform grey shadows (`rgba(0,0,0,0.1)`), and decorative gradient washes.
- Typographic tells: accenting a single word in a headline, tracked-out ALL-CAPS eyebrow labels, and `→` appended to buttons.

### 3. Two-Pass Process & Compact Token Plan
Plan tokens first, critique uniqueness against the brief, then implement:
- **Color Palette:** 4 to 6 named, high-harmony hex values tailored to the domain.
- **Typography:** Intentional hierarchy, weights, and letter-spacing (avoid defaulting to Inter/Roboto). Keep line lengths under 80 characters.
- **Layout & Composition:** ASCII wireframe with structural alignment and hierarchy.
- **Chanel's Rule:** Spend boldness in one memorable hero moment; keep everything else quiet, disciplined, and functional.

### 4. Active UX Microcopy
Words guide navigation:
- Use active-voice verbs: "Save changes" instead of "Submit".
- Treat errors as actionable instructions: explain what happened and how to fix it without vague apologies.
- Treat empty states as invitations to act.

---

## 🛠️ Desktop & Web UI Engineering Invariants (Anti-Flicker, Popups, Scrollbars & Regression Lock)

Every interface implementation must strictly prevent these 4 classic regression traps:

### Trap 1 — Project-Wide Control Sweep (`N of N` places)
Never patch or style a single scrollbar, input, or grid in isolation.
- **Audit:** Grep the entire repository for all scrollable and themed containers:
  `AutoScroll`, `ScrollBar`, `DataGridView`, `FlowLayoutPanel`, `TreeView`, `ListBox`, `overflow-y`, `::-webkit-scrollbar`.
- **Enforcement:** Apply the custom scrollbar or theme helper across **100% of occurrences** or through a shared base control/theme manager. Leaving even one white/un-themed scrollbar is an unacceptable regression.

### Trap 2 — Popup / Dropdown Toggle vs Outside-Click Race
When closing popups, flyouts, or custom tooltips on outside click (`Deactivate`, `LostFocus`, `mousedown`), clicking the toggle button causes an event race: `Deactivate` closes the popup, then the button's `Click` immediately re-opens it (or prevents opening).
- **Desktop (WinForms / WPF):**
  ```csharp
  // Exclude toggle button bounds from outside-click or track cooldown
  if (toggleBtn.RectangleToScreen(toggleBtn.ClientRectangle).Contains(Cursor.Position)) return;
  if (Environment.TickCount64 - _lastDeactivateTick < 180) return; // reopen cooldown
  ```
- **Web (React / DOM):**
  ```typescript
  if (toggleRef.current && toggleRef.current.contains(e.target as Node)) return;
  ```
- **4-State State Machine Invariant:** Always verify all 4 transitions:
  `Closed -> Click Toggle (Opens) -> Click Inside (Stays Open) -> Click Outside (Closes) -> Click Toggle Again (Re-opens!)`.

### Trap 3 — Hover Flicker & Child-Control Thrashing
Raw `MouseLeave` / `mouseout` fires when the cursor moves from a parent container onto a child control (label, icon, button), causing rapid show/hide flicker.
- **Desktop (WinForms):**
  ```csharp
  protected override void OnMouseLeave(EventArgs e) {
      if (ClientRectangle.Contains(PointToClient(Cursor.Position))) return; // Still inside parent!
      _debounceHideTimer.Start(); // 60-100ms debounce before collapsing
  }
  ```
- **Anti-Flicker Hygiene:** Set `DoubleBuffered = true`, use `CreateParams` with `WS_EX_COMPOSITED = 0x02000000` where needed, and wrap batch updates in `SuspendLayout()` / `ResumeLayout()`.
- **Web:** Use `pointerenter` / `pointerleave` instead of `mouseover` / `mouseout`, or CSS `:hover` containment.

### Trap 4 — Full Requirement Checklist (`REQ-1..REQ-N`)
Enumerate every user complaint and requirement (`REQ-1`, `REQ-2`, ...) before touching code. Validate each requirement against the running UI and confirm zero regressions on previously resolved issues.
