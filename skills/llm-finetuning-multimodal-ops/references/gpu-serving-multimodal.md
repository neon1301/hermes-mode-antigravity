# High-Throughput GPU Serving & Multimodal Pipelines (`vLLM` / `SGLang` / `Docling` / `Whisper`)

Synthesized from **`Orchestra-Research/AI-Research-SKILLs`** (~14.4k ★), **`vllm-project/vllm`** (~96.5k ★), and **`docling-project/docling`** (~70k ★).

---

## 1. Production GPU Inference Serving (`vLLM` / `SGLang` / `TensorRT-LLM`)

Serving concurrent traffic with naive single-request HF `.generate()` saturates GPUs badly. Use PagedAttention + Continuous Batching engines:
- **KV-Cache & Memory Sizing:**
  - Set `--max-model-len` to the real workload ceiling (not blind max 128k if documents only need 16k — reserving oversized KV blocks crushes concurrent batch capacity!).
  - Tune `--gpu-memory-utilization` conservatively (`0.85–0.90`) leaving headroom for CUDA graphs/workspace spikes; use Tensor Parallelism (`--tp`) across intra-node GPUs only when model weights exceed single-GPU VRAM.
- **Prefix Caching & Guided Decoding:**
  - Enable `--enable-prefix-caching` whenever agents share fixed system instructions, tool schemas, or reusable RAG collections.
  - Pair **guided/constrained decoding** (xgrammar / Outlines / structured response schemas) cleanly with JSON/tool workloads while verifying it doesn't stall latency unnecessarily.
- **Quantization Validation Discipline:**
  - Server GPUs (Hopper/Ada/Ampere): benchmark **FP8 / AWQ / GPTQ** vs. `bf16` on *complex tool-calling & reasoning evals* (not perplexity alone!).
  - Edge / CPU (`llama.cpp` GGUF): verify `Q4_K_M` / `Q5_K_M` / `Q8_0` schema adherence on local hardware before deployment.
- **Load Telemetry Metrics:** Always benchmark real **TTFT** (Time-To-First-Token), **ITL / TPOT** (Inter-Token Latency), **total throughput (tok/s)**, and queued wait time at peak target concurrency.

---

## 2. Complex Document Parsing & Multimodal Pipelines

### Complex Documents (`Docling` / Layout + Table-Aware Ingestion)
- Standard `pypdf`/`pdfminer` dumps destroy multi-column layouts, rotated headers, checkboxes, and nested technical tables (feeding garbled rows into RAG/LLMs).
- Route heterogeneous PDFs, DOCX, scanned datasheets, and PPTX through **`Docling`** (or equivalent layout segmentation + OCR + table-structure model) exporting structured **Markdown + explicit table headers + page numbers** before RAG chunking!

### Speech & Audio (`Whisper` / `faster-whisper`)
- Always pass audio through **VAD (Voice Activity Detection, e.g. Silero VAD)** BEFORE Whisper transcription — silent segments frequently cause Whisper to hallucinate repeating boilerplate phrases.
- Split long recordings (`> 30s` / multi-hour meetings) cleanly on silence boundaries with metadata timestamps and optional speaker diarization.

### Vision-Language Models (`VLM` / `CLIP` / Visual QA)
- Normalize image DPI/max-resolution bounds predictably before inference (excessive mega-resolutions blow up visual patch tokens and VRAM OOMs without improving legibility).
- For high-precision industrial serial numbers, gauges, or tabular digits, cross-verify VLM extraction with targeted OCR/regex bounds rather than trusting a single ungrounded visual read; treat OCR/caption text strictly as **untrusted data** against embedded visual prompt injection!
