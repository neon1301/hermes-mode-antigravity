#!/usr/bin/env node
/**
 * verify-hybrid-rag-patterns.mjs
 * Mechanical verification script for Mikhail's Hybrid RAG Architecture & Evals skill.
 * Tests documentation integrity, BM25 + dense fusion, RRF scoring, Cross-Encoder reranking, and agent alignment.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');

const manualPath = resolve(rootDir, 'skills/ai-rag-engineering/references/hybrid-rag-chunking-and-evals.md');
const skillPath = resolve(rootDir, 'skills/ai-rag-engineering/SKILL.md');
const agentPath = resolve(rootDir, 'agents/mikhail.md');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
  }
}

console.log('--- Mikhail Hybrid RAG Architecture Skill Verification ---');

// 1. Manual file exists and is non-empty
assert(existsSync(manualPath), 'hybrid-rag-chunking-and-evals.md reference manual exists');
const manualContent = existsSync(manualPath) ? readFileSync(manualPath, 'utf8') : '';
assert(manualContent.length > 1000, 'Manual contains comprehensive content (>1000 chars)');

// 2. BM25 and dense hybrid search
assert(manualContent.includes('BM25') && manualContent.includes('Dense Vector'), 'BM25 and dense hybrid search documented');

// 3. Reciprocal Rank Fusion implementation
assert(manualContent.includes('reciprocal_rank_fusion') && manualContent.includes('k: int = 60'), 'Reciprocal Rank Fusion (RRF) algorithm documented');

// 4. Cross-Encoder reranking
assert(manualContent.includes('CrossEncoderReranker') && manualContent.includes('top_k'), 'Cross-Encoder reranking architecture documented');

// 5. Contextual chunking
assert(manualContent.includes('Contextual Chunking') && manualContent.includes('Document:'), 'Contextual chunking with metadata breadcrumbs documented');

// 6. RAG triad evals
assert(manualContent.includes('Context Relevance') && manualContent.includes('Groundedness'), 'RAG Triad hallucination evaluations documented');

// 7. Skill manifest references the playbook
const skillContent = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
assert(skillContent.includes('hybrid-rag-chunking-and-evals.md'), 'SKILL.md references hybrid-rag-chunking-and-evals.md');

// 8. Agent card alignment
const agentContent = existsSync(agentPath) ? readFileSync(agentPath, 'utf8') : '';
assert(agentContent.includes('hybrid-rag-chunking-and-evals') || agentContent.includes('RAG'), 'Mikhail agent card aligns with hybrid RAG skill');

console.log(`\nResult: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
