# RAG Architecture, Hybrid Retrieval & Vector Index Tuning

Synthesized from **`qdrant/skills`**, **`sickn33/agentic-awesome-skills`** (`vector-database-engineer`), and **`huggingface/skills`**.

---

## 1. Document Ingestion & Chunking Discipline

Poor RAG answers usually originate at ingestion, not generation:
- **Match Strategy to Format:**
  - *Technical Docs / Markdown:* Split structurally by heading hierarchy (`#`, `##`) first, preserving section path breadcrumbs in metadata (`"section": "Auth > Refresh Tokens"`).
  - *Source Code:* Chunk cleanly along AST / class / function boundaries — NEVER slice blindly across mid-function lines.
  - *Prose / Manuals:* Recursive character/token splitter targeting **256–512 tokens** with **10–15% overlap** (keep larger parent-document context available via parent-ID expansion).
- **Content Hashing & Idempotent Upserts:** Compute SHA-256 content hashes per chunk so re-indexing skips unchanged fragments cleanly without duplicate vectors.

---

## 2. Hybrid Retrieval + Reranking Pipeline

Pure dense cosine search fails on exact part numbers, error codes (`SQLITE_BUSY`, `ERR_1205`), acronyms, and SKU identifiers. Always combine signals:
1. **Dense Vector Search:** Captures semantic/paraphrase similarity (Cosine or Dot Product for L2-normalized embeddings).
2. **Sparse / Keyword Search (BM25 / `tsvector` / SPLADE):** Captures exact identifiers, protocol opcodes, and rare domain tokens.
3. **Fusion (RRF — Reciprocal Rank Fusion):** Combine candidate rankings cleanly (`top 20–50` from each leg) without brittle manual score weighting.
4. **Cross-Encoder / Reranker Stage:** Re-score the fused candidate set down to the **top 3–6 high-precision chunks** before injecting into LLM context (simultaneously boosts groundedness and cuts prompt tokens).

---

## 3. Vector Index Tuning (`Qdrant` & `pgvector`)

### Qdrant (`qdrant/skills` Playbook)
- **HNSW Parameters:**
  - `m` (links per node, e.g. `16–32`): higher improves recall at higher RAM cost.
  - `ef_construction` (build quality, e.g. `100–200`): raise carefully for higher graph recall.
  - `ef` / `hnsw_ef` (query time): tune dynamically per SLA (recall vs. p95 latency).
- **Quantization vs. Accuracy:** Use Scalar (`int8`) or Binary quantization for million-scale collections in RAM, paired with **oversampling + exact original-vector rescoring** from disk so recall stays near fp32!
- **Payload Filtering Performance:** Create explicit **payload indexes** on every metadata filter field (`tenant_id`, `category`, `created_ts`), otherwise pre/post-filtering degrades badly. Always scope multi-tenant queries strictly by `tenant_id`.

### PostgreSQL (`pgvector`)
- Prefer **HNSW** (`vector_cosine_ops` / `vector_ip_ops`) over legacy `IVFFlat` for dynamic datasets with updates; inspect actual execution plans (`EXPLAIN (ANALYZE, BUFFERS)`) and tune `hnsw.ef_search`.
- Watch `WHERE tenant_id = $1 ORDER BY embedding <=> $2 LIMIT 5` selectivity: combine partial indexes or pre-filtered strategies when filtered subsets are tiny (<1% of rows), or pgvector's HNSW scan can return fewer than `LIMIT` results (`pgvector` iterative scan).
