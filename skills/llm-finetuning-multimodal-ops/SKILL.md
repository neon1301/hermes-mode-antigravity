---
name: llm-finetuning-multimodal-ops
description: End-to-end LLM fine-tuning (SFT, LoRA/QLoRA, Unsloth, LLaMA-Factory, TRL DPO/GRPO), synthetic training dataset curation, high-throughput GPU serving (vLLM, SGLang, quantization/PagedAttention), and multimodal/complex document pipelines (Docling PDF/tables, Whisper ASR, Vision-Language). Synthesizing Orchestra-Research/AI-Research-SKILLs, huggingface/skills, Unsloth, TRL, vLLM, and Docling. Use when fine-tuning custom models, sizing GPU serving engines, or processing PDFs/audio/images into AI workflows.
---

# LLM Fine-Tuning, GPU Serving & Multimodal AI Ops Skill

This skill guides **🧠 Mikhail** when projects outgrow prompting/RAG alone and require custom model adaptation (LoRA/SFT/DPO/GRPO), production GPU inference serving, or layout-aware multimodal ingestion.

---

## 1. Decision Gate & Hardware/Data Preflight

1. **Follow the Cost/Complexity Ladder First:** Prompt Engineering + Structured Outputs + Evals -> Hybrid RAG (for changing facts) -> SFT / LoRA (for domain tone, strict schema adherence, or small-model distillation) -> DPO / GRPO post-training (when preference ranking or verifiable reasoning rewards improve accuracy).
2. **VRAM, License & PII Check (`huggingface-best` Discipline):** Verify GPU VRAM headroom, context window needs, base-model commercial license terms, and PII scrubbing on training corpora BEFORE starting any fine-tune or cluster job.
3. **Zero-Hardcode Config (Hermes Rule 9):** Hugging Face tokens (`HF_TOKEN`), dataset paths, checkpoint storage buckets, and vLLM/Triton endpoints MUST come from environment variables or config files — NEVER embed credentials or hardcoded machine paths.

---

## 2. Progressive Reference Routing Matrix

Load ONLY the reference module matching the active phase:

| Engineering Scope | Load Reference | Core Techniques Covered |
| :--- | :--- | :--- |
| **Dataset Curation, LoRA & Post-Training** | [references/finetuning-posttraining.md](references/finetuning-posttraining.md) | Synthetic/curated dataset hygiene, dedup & train/eval leakage checks, exact chat-template parity, **LoRA/QLoRA (`Unsloth`, `LLaMA-Factory`, `Axolotl`)**, **Post-Training (`TRL` SFT, DPO, GRPO)**, catastrophic forgetting tests |
| **GPU Serving & Multimodal Pipelines** | [references/gpu-serving-multimodal.md](references/gpu-serving-multimodal.md) | **High-Throughput Serving (`vLLM`, `SGLang`, TensorRT-LLM)** — PagedAttention, continuous batching, `--enable-prefix-caching`, quantization (`FP8`/`AWQ`/`GPTQ`/`GGUF`), **Document AI (`Docling` PDF/tables/OCR)**, **Whisper VAD audio**, **VLM pipelines** |

---

## 3. Core `MUST DO / MUST NOT DO` Guardrails

### `MUST DO`
- Keep **100% identical chat template formatting and special/EOS tokens** between training preprocessing (`apply_chat_template`) and production serving!
- Compute validation metrics on held-out domain tests **AND** a small general regression set after every LoRA/SFT run to catch catastrophic forgetting early.
- Use layout-aware parsers (`Docling` / structured OCR) on complex PDFs, scanned forms, and multi-column engineering tables before chunking into RAG or training corpora.
- Benchmark GPU serving engines (`TTFT`, `ITL`, `tok/s`, error rate under concurrency) and quantization accuracy (`FP8` / `AWQ` / `GGUF`) against baseline `bf16`/`fp16` outputs.

### `MUST NOT DO`
- NEVER fine-tune to memorize volatile factual data (prices, inventory, live tickets) that belongs in Hybrid RAG or SQL tools.
- NEVER train on raw uncleaned data containing duplicated eval samples, broken Unicode/JSON, or assistant-prompt template mismatches.
- NEVER run `whisper` on unsegmented noisy audio without VAD (causes endless hallucinated repetition loops) or serve concurrent production traffic over unbatched naive Python loops when `vLLM`/`SGLang` is appropriate.

---

## 4. Verification & Collaboration Gate

1. Record dataset hashes, hyperparameters, VRAM footprint, LoRA rank/alpha, baseline vs tuned eval metrics, and serving latency benchmarks in `.hermes/memory/mikhail.md`.
2. Align scalable serving APIs, queues, and streaming contracts with **💻 Dmitry** (`backend-architecture`) and artifact/corpus storage schemas with **🗄️ Denis**.
3. Submit PII-scrub checks, OOM/batch-limit safeguards, and quantization regression results to **🛡️ Viktor** (`[QA PASS]`) and **⚖️ Stanislav** (`[COMPLIANCE PASS]`).
