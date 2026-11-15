# Hybrid RAG Architecture, Contextual Chunking & Evals Playbook

This reference manual provides production-grade AI / RAG architecture patterns for **🧠 Mikhail** (Lead AI & RAG Engineer) covering hybrid retrieval (BM25 + Dense Vectors), Reciprocal Rank Fusion, Cross-Encoder reranking, and automated hallucination evaluation.

---

## 1. Hybrid Search Architecture (BM25 + Qdrant / pgvector)

Single-vector dense search fails on exact identifiers, serial numbers, error codes, and technical jargon. Modern enterprise RAG combines lexical and semantic search:

```
User Query ──┬──► BM25 Sparse Search (Exact matches, serial numbers) ──┬──► Reciprocal Rank ──► Cross-Encoder ──► LLM Context
             └──► Dense Vector Search (HNSW Cosine semantic meaning)  ──┘       Fusion (RRF)       Reranker (Top-5)
```

### Reciprocal Rank Fusion (RRF) Implementation
```python
def reciprocal_rank_fusion(dense_results: list[dict], sparse_results: list[dict], k: int = 60) -> list[dict]:
    """
    Combines ranked lists from dense vector search and sparse BM25 search.
    RRF score = sum(1.0 / (k + rank))
    """
    rrf_scores = {}
    doc_map = {}

    for rank, doc in enumerate(dense_results, start=1):
        doc_id = doc["id"]
        doc_map[doc_id] = doc
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + (1.0 / (k + rank))

    for rank, doc in enumerate(sparse_results, start=1):
        doc_id = doc["id"]
        doc_map[doc_id] = doc
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + (1.0 / (k + rank))

    # Sort documents by accumulated RRF score descending
    sorted_docs = sorted(rrf_scores.items(), key=lambda item: item[1], reverse=True)
    return [doc_map[doc_id] for doc_id, score in sorted_docs]
```

---

## 2. Cross-Encoder Reranking (`bge-reranker-large` / Cohere)

Bi-encoders (embedding models) compare isolated vectors. A Cross-Encoder processes `(Query, Document)` jointly through full cross-attention layers, boosting retrieval precision by 15–25%:

```python
from typing import List

class CrossEncoderReranker:
    def __init__(self, model_name: str = "BAAI/bge-reranker-large"):
        # Initialized lazily or connected via local high-throughput serving
        self.model_name = model_name

    def rerank(self, query: str, candidates: List[dict], top_k: int = 5) -> List[dict]:
        """
        Scores candidate passages jointly against the query and returns top_k.
        """
        if not candidates:
            return []
        
        # Pairs: [[query, doc1_text], [query, doc2_text], ...]
        pairs = [[query, c["text"]] for c in candidates]
        # In production: scores = model.predict(pairs)
        # Sort candidates by descending relevance score
        ranked = sorted(candidates, key=lambda c: c.get("score", 0.0), reverse=True)
        return ranked[:top_k]
```

---

## 3. Contextual Chunking with Header Injection

Splitting documents purely by character count destroys context (e.g. chunk 3 loses the table name or chapter heading from chunk 1).

### The Invariant
Every chunk MUST contain its structural breadcrumb prepended to the raw text:
```text
[Document: MachineManual_V4.pdf | Section: 4.2 Spindle Maintenance | Component: Bearing Lubrication]
Actual chunk text describing lubrication intervals and oil grades...
```

---

## 4. Automated RAG Triad Evals (Zero-Hallucination Barrier)

Never deploy an LLM prompt or retrieval change without deterministic evaluations:
1. **Context Relevance:** Does the retrieved context contain the information needed to answer the query?
2. **Groundedness / Faithfulness:** Is every claim in the generated answer strictly backed by the retrieved context? (Ban ungrounded speculation).
3. **Answer Relevance:** Does the response directly address the user's question without extraneous fluff?
