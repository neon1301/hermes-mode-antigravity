# Fine-Tuning, Dataset Curation & Post-Training (`Unsloth` / `TRL` / `LLaMA-Factory`)

Synthesized from **`Orchestra-Research/AI-Research-SKILLs`** (~14.4k ★), **`huggingface/skills`** (~11.2k ★: `hf_dataset_creator`, `hf-llm-trainer`, `huggingface-best`), **`unslothai/unsloth`** (~79.3k ★), **`hiyouga/LlamaFactory`** (~76k ★), and **`huggingface/trl`** (~19.7k ★).

---

## 1. Should You Fine-Tune? (Escalation Checklist)

Fine-tuning shines ONLY for specific failure modes:
- ✅ **Good fit for SFT/LoRA:** strict output syntax/domain DSL reliability, specialized classification/extraction, distilling an expensive 70B/frontier prompt teacher into a fast local 3B–14B model, consistent domain tone.
- ❌ **Wrong fit for Fine-Tuning:** teaching rapidly changing facts (use Hybrid RAG or live API tools), fixing broken input parsing/OCR (fix `Docling`/ingestion), or compensating for dirty prompts without an eval dataset.

---

## 2. Dataset Curation & Leakage Prevention (`hf_dataset_creator`)

1. **Curation Over Volume:** `500–2,000` verified, diverse, conflict-free examples outperform `50,000` noisy synthetic scrapes. Filter out refusals, truncated completions, and schema violations before training.
2. **Strict Deduplication & Zero Leakage:** Deduplicate near-identical prompts (exact hash + semantic cosine check) BEFORE splitting train/val/test — duplicate leaks inflate validation scores artificially while failing in production.
3. **Chat Template & EOS Parity (`hf-llm-trainer`):**
   - Always format training pairs through the target model's canonical tokenizer chat template (`tokenizer.apply_chat_template`).
   - Verify `<|im_end|>` / `<|eot_id|>` / `eos_token` is present at completion end (missing EOS causes infinite generation loops!).
   - Mask prompt/system tokens from cross-entropy loss (`assistant_only_loss` / `DataCollatorForCompletionOnlyLM`) so capacity tunes response quality, not static system text.

---

## 3. LoRA / QLoRA & Post-Training Alignment (`Unsloth` / `TRL`)

| Phase / Tooling | Best Practices & Tuning Parameters | Guardrails & Diagnostics |
| :--- | :--- | :--- |
| **SFT + LoRA / QLoRA (`Unsloth` / `LLaMA-Factory` / `Axolotl`)** | Target all attention + MLP linear layers (`q, k, v, o, gate, up, down`); typical rank `r = 16–64`, `lora_alpha = 1–2 * r`; cosine LR scheduler + warmup (`3–5%`); 4-bit NF4 QLoRA fits larger models on consumer/single GPUs | Watch for sudden val-loss divergence (overfitting after `1–3` epochs); log reproducible random seeds & gradient norm spikes |
| **Preference Tuning (`TRL DPOTrainer`)** | Contrast explicit chosen vs. rejected response pairs when SFT still exhibits unwanted style/verbosity/mistakes (`beta` typically `0.05–0.1`) | Verify chosen and rejected pairs share the exact prompt & differ cleanly on the target behavior |
| **Verifiable RL (`TRL GRPOTrainer`)** | Use Group Relative Policy Optimization when outputs have **deterministic programmatic verifiers** (SQL validity, unit-test pass, math equality, strict schema format) | Design dense, cheat-proof reward functions (never reward length or brittle regex loopholes!) |
| **Post-Merge Verification** | Test BOTH domain Golden Eval suite AND a small general instruction/safety holdout after `merge_and_unload()` or GGUF export (`convert_to_gguf.py`) | Reject checkpoints showing silent catastrophic forgetting or broken JSON/tool-calling syntax |
