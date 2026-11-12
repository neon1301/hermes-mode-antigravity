# LLM Evaluations, Structured Outputs & Inference Optimization

Synthesized from **`langfuse/skills`**, **`huggingface/skills`** (`lighteval` / `inspect-ai` / datasets), **`ai-evals`**, and **`anthropics/skills`** (`mcp-builder`).

---

## 1. Observability & RAG/LLM Evaluation Harness

Never "vibe-check" prompt edits on 2 examples. Maintain a versioned **Golden Evaluation Dataset** (including adversarial & "unanswerable" cases!):

### Trace Every Pipeline Span (`langfuse/skills` / OpenTelemetry)
Record clean structured spans per request:
- `retrieval_span`: rewritten query, retrieved chunk IDs, scores, filter metadata, retrieval latency.
- `rerank_span`: input vs. selected top-$K$ chunk IDs and scores.
- `generation_span`: prompt template version, model name, token counts (input/cached/output), total latency, JSON parse status.

### Measure Retrieval vs. Generation Separately
1. **Retrieval Metrics:** `Recall@K`, `MRR` (Mean Reciprocal Rank), **Context Precision** (signal-to-noise ratio of top-$K$ chunks).
2. **Generation / Faithfulness Metrics (RAGAS / LLM-as-Judge):**
   - **Faithfulness / Groundedness:** Are *every single claim and number* in the answer directly supported by the retrieved context? Zero unsupported extrapolations!
   - **Answer Relevance & Refusal Accuracy:** Does the system cleanly say *"Not found in provided data"* when the golden test intentionally omits the answer?
3. **Dataset Regression Gate:** Run evals on prompt/chunking/model changes before deployment; track pass rates and failure taxonomies explicitly.

---

## 2. Structured Outputs, Tool Use & Caching

- **Schema-Enforced Outputs:** Always bind responses to strict schemas (`Pydantic v2` / `Zod` / provider Structured Outputs `response_format`). When parsing fails on weaker/local models, return the exact schema validation error in a **bounded repair retry (max 1–2 attempts)** before failing safely.
- **Prompt Caching vs. Semantic Caching:**
  - Put static system instructions, schemas, and few-shot examples FIRST in the prompt prefix (never inject dynamic timestamps at index 0!) so provider prefix caching hits cleanly.
  - Use **Semantic Caching** (embedding similarity above strict high threshold e.g. `>= 0.95` + exact tenant/RBAC filter!) only for repetitive FAQ/read queries — never bypass user permissions via shared cache!
- **Tool / MCP Boundaries (`mcp-builder`):** Give tools narrow, descriptive parameter schemas, return concise actionable error hints (so agents self-recover), and gate destructive actions cleanly.

---

## 3. High-Performance Data Pipelines & Local Inference

- **Polars & DuckDB Before Pandas Loops:** Process embeddings metadata, Parquet datasets, and large CSV/JSONL corpora using **Polars** (lazy expressions) or **DuckDB** SQL directly on files — never iterate rows with Python `iterrows()`.
- **Batch Embeddings & Rate-Limit Backpressure:** Group document chunks into optimal token-bounded batches, run bounded concurrency with exponential-jitter retries (`429` honoring `Retry-After`), and cache unchanged hashes.
- **Local / Edge Inference Efficiency:** Use quantized weights (**GGUF** via `llama.cpp` or **ONNX Runtime** / **AWQ**) benchmarked for tokens/sec and accuracy on the *actual eval dataset* rather than guessing quantization bit-width (`Q4_K_M` vs `Q8_0`).
