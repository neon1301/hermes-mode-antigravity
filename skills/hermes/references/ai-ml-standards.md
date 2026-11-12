# 🧠 AI/ML & RAG Architecture Standards (Mikhail's Standard)

This document defines architecture and reliability standards used by **Mikhail (Senior AI/ML & Data Systems Engineer)**.

> [!IMPORTANT]
> Full deep-dive methodology lives across Mikhail's 3 modular skills:
> - **`skills/ai-rag-engineering/SKILL.md`**: [references/rag-vector-hybrid.md](../../ai-rag-engineering/references/rag-vector-hybrid.md) (Hybrid Dense+BM25+RRF, Cross-Encoder reranking, HNSW/`pgvector`/Qdrant tuning, payload indexes) and [references/llm-evals-inference.md](../../ai-rag-engineering/references/llm-evals-inference.md) (Langfuse/OTel, RAGAS, Structured Outputs, Polars/DuckDB, ONNX/GGUF).
> - **`skills/agent-context-memory-engineering/SKILL.md`**: [references/context-memory-harness.md](../../agent-context-memory-engineering/references/context-memory-harness.md) (KV-cache, context compression, agent memory, multi-agent isolation) and [references/agent-evals-redteam.md](../../agent-context-memory-engineering/references/agent-evals-redteam.md) (de-biased LLM-as-a-Judge, Promptfoo/Garak red-teaming).
> - **`skills/llm-finetuning-multimodal-ops/SKILL.md`**: [references/finetuning-posttraining.md](../../llm-finetuning-multimodal-ops/references/finetuning-posttraining.md) (SFT/LoRA/Unsloth/TRL DPO-GRPO, dataset hygiene) and [references/gpu-serving-multimodal.md](../../llm-finetuning-multimodal-ops/references/gpu-serving-multimodal.md) (vLLM/SGLang serving, Docling/Whisper/VLM).

---

## 1. RAG (Retrieval-Augmented Generation) Pipeline Architecture

```text
[Raw Documents / Codebase]
          │
          ▼
[1. Intelligent Chunking]  ──> Token budget: 256–512 tokens with 10–15% overlap
          │
          ▼
[2. Embeddings & Storage]  ──> Dense vectors + Sparse BM25 index in Vector DB (pgvector / Qdrant)
          │
          ▼
[3. Hybrid Retrieval]     ──> Top-K dense candidates + Top-K sparse candidates
          │
          ▼
[4. Re-Ranking]            ──> Cross-Encoder reranker selects top 3–5 most relevant chunks
          │
          ▼
[5. Context Injection]     ──> Structured prompt with system boundaries & source attribution
          │
          ▼
[6. Streaming Generation]  ──> Real-time SSE / WebSocket tokens with grounding metadata
```

---

## 2. Evaluation & Guardrails
- **Evaluation Metrics (Evals):**
  - **Context Precision:** Are the retrieved chunks relevant?
  - **Faithfulness / Groundedness:** Does the output answer strictly from provided context without hallucination?
  - **Answer Relevance:** Does the answer directly address the user query?
- **Structured Output Contracts:**
  - Always validate model responses against explicit Pydantic / Zod models.
  - Apply fallback parsing or retries with schema errors on malformed JSON.

---

## 3. High-Performance Data Processing
- **Polars / DuckDB First:** Avoid Pandas for large datasets; use zero-copy arrow data structures.
- **Semantic Caching:** Cache embedding vectors of frequent questions to achieve sub-millisecond retrieval.
- **Local Inference Efficiency:** Support quantized GGUF models via llama.cpp or ONNX Runtime for offline or cost-sensitive pipelines.
