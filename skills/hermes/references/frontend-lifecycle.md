# 🎨 ECC Frontend & UI/UX Standards (Elena's Standard)

This document defines frontend architecture standards applied by **Elena (Senior Frontend & UI Engineer)**.

> [!IMPORTANT]
> Pair with **`skills/frontend-design/SKILL.md`** ([frontend-design](../../frontend-design/SKILL.md)) for visual aesthetic direction, typography, palette tokens (4–6 tokens), and anti-AI-slop design standards.

---

## 1. The 4-State UI Contract
Every component loading asynchronous data must explicitly support all four states:
1. **Idle:** Before action is triggered.
2. **Loading / Pending:** Non-blocking loading state (skeleton, spinner, disabled buttons).
3. **Success:** Rendering clean data, including an empty collection state (Empty State UX).
4. **Error:** User-friendly error message with actionable retry mechanism.

## 2. Resource Disposal & Memory Hygiene
- **Component Teardown:** Clean up all window event listeners, intervals (`clearInterval`), timers (`clearTimeout`), and ResizeObservers when unmounting.
- **Abort Ongoing Requests:** Pass `AbortController.signal` to in-flight HTTP requests and cancel them if the component unmounts before response arrives.

## 3. State Management & Predictability
- Single source of truth for UI state. Avoid duplicating state derived from props or parent state.
- Prevent layout shifts (Cumulative Layout Shift, CLS) by setting explicit dimensions or skeleton placeholders for dynamic content.

## 4. Accessibility (A11y) & Input Validation
- Keyboard accessibility: all interactive elements must be focusable and operable via Enter/Space/Escape.
- Inline form validation: validate inputs on change/blur with clear human-readable error messages.
- High-contrast color compliance and accessible aria attributes (`aria-expanded`, `aria-busy`, etc.).

## 5. Desktop GUI, Vector Icons & Purposeful Motion (`WinForms`/`WPF` + `Мозгоеб`/`image-generator`)
- **Desktop Hygiene:** Enable `DoubleBuffered` on custom-painted panels/grids, dispose every GDI+ `Pen`/`Brush`/`Font` and animation `Timer` deterministically in `Dispose()`, and verify clean scaling at 100%–200% DPI.
- **Crisp Icons & Brand Assets:** Avoid upscaled blurry PNGs or mismatched glyphs; pair crisp SVGs / `Svg.NET` / `Segoe Fluent Icons` with **`image-generator`** briefs for custom logos or empty-state artwork.
- **UX Critique & Roast Handoff:** Pair with **Мозгоеб (`mozgoeb`, `product-ux-scouting`)** via [`ux-scouting-standards.md`](ux-scouting-standards.md) to eliminate buried clicks, fix `P0–P3` Nielsen/cognitive bottlenecks, add purposeful feedback animations (`prefers-reduced-motion` on Web), and adopt vetted modern UI widgets.
