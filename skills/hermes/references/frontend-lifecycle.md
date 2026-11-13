# 🎨 ECC Frontend & UI/UX Standards (Elena's Standard)

Frontend architecture and lifecycle engineering invariants applied by **Elena (Senior Frontend Lead)**. Pair with `skills/frontend-design/SKILL.md` for visual tokens and aesthetics.

---

## 1. The 4-State UI Contract
Every async component must explicitly implement all four states:
1. **Idle:** Baseline state before action is triggered.
2. **Loading / Pending:** Non-blocking skeleton/shimmer (disabled submit, no frozen UI).
3. **Success:** Render clean data, including explicit Empty State UX.
4. **Error:** User-friendly message explaining cause + actionable retry.

## 2. Resource Disposal & Request Cancellation
- **Teardown Hygiene:** Dispose GDI+ pens/brushes/fonts, UI `Timer`s, `ResizeObserver`, and DOM listeners in `Dispose()` / unmount.
- **Request Cancellation:** Pass `AbortController.signal` / `CancellationToken` to in-flight requests; abort on unmount/close to eliminate leaks.

## 3. Desktop Anti-Flicker & Assets
- Enable `DoubleBuffered = true` and `WS_EX_COMPOSITED = 0x02000000` on custom-painted controls.
- Clean 100%–200% DPI scaling; prefer SVGs / `Segoe Fluent Icons`. Use **`image-generator`** subagent for custom logos and artwork.

## 4. Popup & Dropdown State Machine Checklist (Trap 2)
Prevent outside-click vs toggle button race conditions:
- **Outside-Click Race Guard:** Exclude toggle bounds from outside-click handler (`!toggleBtn.Bounds.Contains(Cursor.Position)` / `!toggleRef.contains(e.target)`) or enforce a reopen cooldown (`TickCount64 - lastDeactivateTick > 180ms`).
- **Trace All 4 Transitions:**
  `Closed -> Click Toggle (Opens) -> Click Inside (Stays Open) -> Click Outside (Closes) -> Click Toggle Again (Re-opens!)`.

## 5. Hover Anti-Flicker Checklist (Trap 3)
Prevent show/hide thrashing when cursor moves over child controls:
- **Containment Check:** Verify `ClientRectangle.Contains(PointToClient(Cursor.Position))` before handling mouse-leave.
- **Debounce:** Add a 60–100ms debounce timer before hiding on hover-out.
- **Batch Layout:** Wrap visual updates in `SuspendLayout()` / `ResumeLayout()`.

## 6. Project-Wide Scrollbar Sweep Checklist (Traps 1 & 4)
- **100% Sweep (`N of N`):** Grep all scroll containers (`AutoScroll`, `ScrollBar`, `DataGridView`, `FlowLayoutPanel`, `TreeView`, `ListBox`, `overflow-y`, `::-webkit-scrollbar`). Apply custom styling to 100% of occurrences via shared theme helpers.
- **Requirements Audit (`REQ-1..REQ-N`):** Verify every user UI complaint is resolved with zero regressions on existing controls.
