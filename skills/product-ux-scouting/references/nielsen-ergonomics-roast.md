# Nielsen Ergonomics Roast & Industrial UX Audit Playbook

This reference manual provides production-grade usability evaluation methodologies, 0–4 severity scoring, and operator ergonomics audit patterns for **🔥 Kritik** (360° Product Critic & Global UX Scout).

---

## 1. The 10 Nielsen Usability Heuristics (Industrial & Factory Edition)

Factory operators work in noisy, high-stress environments, frequently wearing gloves and monitoring multiple machines simultaneously. Evaluate user interfaces against these 10 adapted heuristics:

| Heuristic | Industrial Context | What Kritik Flags (The Roast) |
| :--- | :--- | :--- |
| **1. Visibility of System Status** | Machine state (`RUNNING/ALARM/E_STOP`), network ping latency, socket connection indicators | Silent background disconnections, missing heartbeat icons, lack of telemetry freshness timestamp |
| **2. Match Between System & Real World** | Engineering units (`RPM`, `°C`, `bar`, `m/min`), machine schematics | Showing raw database IDs (`0x002F`) or raw ADC voltages instead of meaningful engineering units |
| **3. User Control & Freedom** | Emergency Stop vs. Controlled Rampdown, undoing accidental config changes | Missing "Abort Operation" button during calibration, modal dialogs that lock the entire screen |
| **4. Consistency & Standards** | Universal dark theme, consistent button placement across forms | Red color used for both "Stop" button and "Normal Running Status", mismatched button padding |
| **5. Error Prevention** | Confirmation shields on destructive commands, bounded numeric inputs | Allowing operators to enter `RPM = 99999` on a 5000 RPM motor without software range clamping |
| **6. Recognition Rather than Recall** | Visible status indicators, self-explanatory dashboards | Forcing operators to remember numeric error codes (`Err 4021`) without showing inline descriptions |
| **7. Flexibility & Efficiency of Use** | Keyboard shortcuts (`F1–F12`, `Space` for E-Stop), touch-friendly buttons | Forcing operators to use a mouse to reach primary functions on 15" industrial touchscreens |
| **8. Aesthetic & Minimalist Design** | High signal-to-noise ratio, clean visual hierarchy | 50 dense textboxes with zero visual grouping; flashing elements that cause operator sensory fatigue |
| **9. Help Recognize, Diagnose & Recover** | Plain-language error messages with clear next steps | Cryptic crash popups ("NullReferenceException at line 412") without operator recovery runbooks |
| **10. Help & Documentation** | Contextual tooltips, searchable troubleshooting runbooks | Missing inline calibration guides or completely unindexed PDF manuals |

---

## 2. Nielsen 0–4 Usability Severity Rating Matrix

Every usability defect discovered during an audit MUST be tagged with a deterministic severity rating:

- **0 = Not a usability problem:** Subjective aesthetic preference with zero operational friction.
- **1 = Cosmetic problem only:** Minor styling inconsistency (e.g. 2px padding misalignment); fix if time permits.
- **2 = Minor usability problem:** Low-frequency friction; operator can easily work around it without delay.
- **3 = Major usability problem:** High priority; operator makes frequent errors or experiences cognitive slowdown.
- **4 = Usability catastrophe:** Imperative to fix before deployment; violates physical safety, causes false alarms, or blocks emergency machine shutdowns.

---

## 3. Operator Wasted-Click & Fitts's Law Audit Protocol

### Fitts's Law on Industrial Touch Panels
The time required to rapidly move to a target area is a function of the ratio between the distance to the target and the width of the target:
$$T = a + b \log_2\left(1 + \frac{D}{W}\right)$$

### Touch Target Sizing Rule
- Primary operator controls (Start, Stop, Jog, Alarm Ack) MUST be **at least 48 × 48 physical pixels** (preferably 64 × 64 px) to guarantee 100% first-tap accuracy with work gloves.
- Emergency controls MUST be placed in dedicated boundary anchor zones (screen corners or persistent top header).

### Wasted-Click Triage
Count the number of user interactions (clicks, modal dismissals, screen transitions) required to perform routine tasks:
- **Alarm Silence:** Must require exactly **1 click** from ANY screen.
- **Recipe / Job Load:** Maximum **3 clicks** from primary dashboard.
