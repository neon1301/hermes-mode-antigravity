# De-Biased LLM-as-a-Judge & Adversarial Red-Teaming

Synthesized from **`Agent-Skills-for-Context-Engineering`** (`evaluation` / `advanced-evaluation`), **`promptfoo/promptfoo`** (~27.1k ★), and **`NVIDIA/garak`** (~10k ★).

---

## 1. De-Biased LLM-as-a-Judge Evaluation (`advanced-evaluation`)

Using an LLM to grade model outputs or agent trajectories fails silently unless systematic judge biases are controlled:
1. **Position Bias Mitigation (Swap Protocol):** In pairwise comparisons (`A vs. B`), ALWAYS run every pair in both orders (`[A, B]` and `[B, A]`). Count a win only when consistent across both positions; otherwise mark a tie or escalate!
2. **Verbosity & Length Bias Defense:** Explicitly penalize padded filler and instruct rubrics to grade **claim correctness per requirement**, preferring concise accurate answers over long speculative essays.
3. **Anchored Discrete Rubrics (1–5 Scale):** Define concrete anchor criteria for every score band (what earns `1`, `3`, vs `5`), require the judge to cite **exact factual evidence / mismatches first** (CoT before score!), and pass reference/ground-truth answers whenever available.
4. **Deterministic Trajectory & Outcome Grading:** For tool-using agents, evaluate BOTH:
   - *Code / Assertion Gradients (Deterministic):* JSON schema validity, exact tool calls invoked, regex/SQL checks, final file/DB state mutations.
   - *Behavioral Rubrics (Judge):* escalation judgment, refusal accuracy on impossible tasks, adherence to bounds.

---

## 2. Adversarial LLM Red-Teaming & Guardrails (`Promptfoo` / `Garak` Playbook)

Every production AI feature with external inputs or tool access MUST clear automated red-team probes before release:

| Attack Vector | Real-World Failure Mode | Required Defense Pattern |
| :--- | :--- | :--- |
| **Indirect Prompt Injection** | Malicious instructions hidden inside PDFs, emails, Jira tickets, web pages, or DB fields | Wrap external content strictly in delimited `<untrusted_data>` blocks; train/instruct policy separation; confirm sensitive tool calls via deterministic allowlists |
| **System Prompt / Secret Extraction** | Probes using translation, encoding (Base64/hex), roleplay, or debug modes to dump system prompts/keys | NEVER place API keys, passwords, or private DB credentials inside system prompts (Zero-Hardcode Rule 9); enforce output scanners |
| **Confused Deputy / Auth Bypass** | Tricking an agent into reading another tenant's rows or executing an admin tool for an unprivileged caller | Bind user session/RBAC identity & `tenant_id` **deterministically in backend middleware/tool wrappers**, NEVER relying on the model to honor access rules |
| **PII & Data Exfiltration** | Model echoing sensitive tokens or encoding secrets inside generated Markdown links/images (`![x](https://.../?leak=...)`) | Run deterministic PII/secret DLP redaction on inputs/outputs and strict CSP/allowlisted image/link rendering in UI |
| **Jailbreak & Resource DoS** | Adversarial prompts triggering infinite tool retries, recursive token bombs, or banned actions | Enforce server-side `max_tokens`, request timeouts, per-user rate limits, and `max_steps` circuit breakers |

### CI Red-Team Regression Gate
Maintain a small reproducible adversarial suite (e.g., **Promptfoo** YAML matrix or Python pytest + **Garak**-style probe cases) covering top attack categories on every change to prompts, model versions, or tool permissions — verify `0` critical bypasses and track false-positive refusal rate on benign queries!
