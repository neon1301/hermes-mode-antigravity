# 🎨 Platform Design Systems & Accessibility Guide

*Adapted from `ehmo/platform-design-skills` under the MIT License.*

---

## 1. Apple Human Interface Guidelines (HIG)

### Navigation & Surface Hierarchy
- **iOS Navigation Stack**: Large title collides into standard inline title on scroll. Back button retains predecessor view title or concise `< Back`.
- **Modality (Sheets)**: Present secondary flows as non-full-screen sheets (`pageSheet` / `formSheet`) with clear drag indicator. Destructive dismissals require confirmation alert.
- **macOS Layout**: Standard toolbar with unified search, sidebar navigation (`SourceList` style), two-pane or three-pane split views. Keyboard shortcuts for every primary menu action (`Cmd+S`, `Cmd+P`, `Cmd+W`).

---

## 2. Google Material Design 3 (MD3)

### Adaptive Window Size Classes
| Window Class | Width Range | Layout Strategy | Navigation Pattern |
| :--- | :--- | :--- | :--- |
| **Compact** | `< 600 dp` | Single column, stacked content | Bottom Navigation Bar |
| **Medium** | `600–839 dp` | Dual pane, master-detail side-by-side | Navigation Rail (collapsed) |
| **Expanded** | `>= 840 dp` | Multi-pane, persistent panels | Navigation Drawer (expanded) |

### Tonal Surfaces & Elevation
- Do not use harsh drop shadows for depth. In MD3, surface elevation is communicated via tonal color mapping (increasing tint of primary color on `surfaceContainer` tokens: Lowest, Low, Default, High, Highest).

---

## 3. Web & Desktop Accessibility (WCAG 2.2 Level AA)

### Contrast Ratios
- **Normal Text (`< 18 pt` or `< 14 pt bold`)**: Minimum contrast ratio **4.5:1** against adjacent background.
- **Large Text (`>= 18 pt` or `>= 14 pt bold`)**: Minimum contrast ratio **3.0:1**.
- **UI Components & Graphical Objects**: Minimum contrast ratio **3.0:1** for active control borders and status indicators.

### Touch & Pointer Target Dimensions
- **iOS / macOS**: Minimum clickable/tappable target size **44 × 44 pt**.
- **Android / Web**: Minimum target size **48 × 48 dp (px)**.
- **Desktop Density**: For compact desktop data grids, interactive cells must provide at least 28–32 px click height with clear row hover highlights.

### Keyboard & Screen Reader Focus
- All interactive elements (`<button>`, `<a href>`, `input`, custom controls) must maintain a clearly visible focus indicator (`outline: 2px solid #1F4E78; outline-offset: 2px;`).
- Never suppress outline (`outline: none`) without providing an equally visible custom focus state.
