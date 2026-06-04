# RepoRAG — Codebase Semantic Search Engine
> **Executive PRD & Full Implementation Guide** · v1.0

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Folder Structure](#3-folder-structure)
4. [Implementation Phases](#4-implementation-phases)
   - [Phase 1 — Backend Setup & Auth Middleware](#phase-1--backend-setup--firebase-auth-middleware)
   - [Phase 2 — Data Ingestion & Local Embeddings](#phase-2--data-ingestion--local-embeddings)
   - [Phase 3 — DeepSeek Inference Engine](#phase-3--deepseek-inference-engine)
   - [Phase 4 — Frontend UI/UX](#phase-4--frontend-uiux)
5. [Design System](#5-design-system)
6. [Critical Rules](#6-critical-rules)
7. [Setup Checklist](#7-setup-checklist)

---

## 1. Project Overview

| Field        | Details                                                                 |
|--------------|-------------------------------------------------------------------------|
| **Name**     | RepoRAG                                                                 |
| **Type**     | Full-Stack AI Application                                               |
| **Purpose**  | Highly precise, cost-efficient Codebase Semantic Search Engine          |
| **Role**     | Staff Software Engineer — complete, production-ready implementation     |
| **Standard** | No placeholders · No `TODO` comments · No skipped logic                |

---

## 2. Tech Stack

### Frontend

| Layer          | Technology                                         |
|----------------|----------------------------------------------------|
| Framework      | Next.js 14/15 (App Router)                         |
| Language       | TypeScript (strict mode)                           |
| Styling        | Tailwind CSS                                       |
| Authentication | Firebase Auth — "Sign in with GitHub"              |
| Animation      | GSAP (minimalist timeline animations)              |

### Backend

| Layer          | Technology                                         |
|----------------|----------------------------------------------------|
| Runtime        | Python 3.10+                                       |
| Framework      | FastAPI + Uvicorn                                  |
| Validation     | Pydantic v2 (strict typing)                        |

### AI Pipeline

| Component      | Technology                                                  |
|----------------|-------------------------------------------------------------|
| LLM            | DeepSeek API — Model: `deepseek-chat` (DeepSeek-V3)        |
| Embeddings     | `sentence-transformers` — Model: `BAAI/bge-small-en-v1.5`  |
| Vector DB      | Pinecone Serverless                                         |

> **Cost note:** Embeddings are generated **locally** via HuggingFace — no external embedding API calls, zero embedding cost.

---

## 3. Folder Structure

```
reporag-workspace/
│
├── frontend/                        # Next.js Application
│   ├── app/
│   │   ├── dashboard/               # Protected RAG UI (authenticated)
│   │   └── login/                   # Firebase Auth UI
│   ├── components/                  # Shared UI components
│   │   ├── ChatBox/
│   │   └── CodeViewer/
│   └── lib/                         # Firebase config & utility functions
│
└── backend/                         # FastAPI Application
    ├── api/                         # Route handlers
    │   ├── ingest.py                # POST /ingest
    │   └── chat.py                  # POST /chat (SSE stream)
    ├── core/                        # Infrastructure
    │   ├── auth.py                  # Firebase Admin middleware
    │   └── deepseek.py              # DeepSeek client connection
    ├── rag/                         # AI pipeline logic
    │   ├── chunker.py               # AST / language-aware chunking
    │   └── embedder.py              # sentence-transformers logic
    └── main.py                      # App entry point
```

---

## 4. Implementation Phases

> **Strict execution order — do not skip or reorder phases.**

---

### Phase 1 — Backend Setup & Firebase Auth Middleware

**Goal:** Initialize FastAPI and protect all API routes with Firebase token verification.

#### Tasks

- [ ] Initialize FastAPI application in `/backend`
- [ ] Integrate `firebase-admin` SDK
- [ ] Implement Bearer token authentication middleware

#### Auth Middleware Specification

```
Request Header: Authorization: Bearer <firebase_id_token>
```

| Condition           | Behavior                          |
|---------------------|-----------------------------------|
| Valid token         | Attach decoded user to request    |
| Missing token       | `401 Unauthorized`                |
| Invalid/expired     | `401 Unauthorized`                |

> **Scope:** Middleware must protect **both** `/ingest` and `/chat` endpoints.

---

### Phase 2 — Data Ingestion & Local Embeddings

**Goal:** Accept a GitHub URL, parse the repository, chunk code semantically, embed locally, and upsert to Pinecone.

#### Tasks

- [ ] Create `POST /ingest` route accepting a GitHub repository URL
- [ ] Fetch and filter repository files
- [ ] Apply language-aware chunking
- [ ] Generate embeddings locally
- [ ] Upsert vectors to Pinecone with required metadata

#### File Filter

Only the following extensions are processed — all others are ignored:

```
.ts  .tsx  .js  .py
```

#### Chunking Strategy

```
Method: LangChain RecursiveCharacterTextSplitter.from_language()
```

> ⚠️ **Do NOT** use standard character splitters. The splitter must be language-aware to respect code block boundaries.

#### Embedding Strategy

```
Library : sentence-transformers
Model   : BAAI/bge-small-en-v1.5
Runtime : Local (CPU/GPU on backend server)
Cost    : $0.00 — no external API calls
```

#### Pinecone Vector Metadata Schema

```json
{
  "filename"   : "string",
  "code"       : "string",
  "start_line" : "integer"
}
```

---

### Phase 3 — DeepSeek Inference Engine

**Goal:** Accept a user query, retrieve relevant code context from Pinecone, filter low-quality results, and stream a grounded response via SSE.

#### Tasks

- [ ] Create `POST /chat` route with SSE streaming response
- [ ] Embed user query using local `sentence-transformers` model
- [ ] Query Pinecone — retrieve top 5 results
- [ ] Apply anti-hallucination cosine similarity filter
- [ ] Construct grounded prompt and call DeepSeek API
- [ ] Stream token-by-token response to the Next.js client

#### Anti-Hallucination Filter

```
Method : Cosine Similarity
Threshold : 0.72
Action : Discard any result scoring below threshold before prompt construction
```

#### DeepSeek Prompt Contract

| Parameter     | Value                                                                 |
|---------------|-----------------------------------------------------------------------|
| Model         | `deepseek-chat`                                                       |
| Temperature   | `0.1`                                                                 |
| Context rule  | LLM must answer **only** from filtered code context — no freeform    |

#### Streaming Transport

```
Protocol : Server-Sent Events (SSE)
Direction : Backend → Next.js client
```

---

### Phase 4 — Frontend UI/UX

**Goal:** Build a dark-mode, Apple/Vercel-aesthetic UI with GitHub auth, split-panel layout, streaming code display, and GSAP animations.

#### Tasks

- [ ] Implement Firebase "Sign in with GitHub" on `/login`
- [ ] Build protected `/dashboard` route
- [ ] Split-panel dashboard layout
- [ ] Wire streaming SSE from backend to UI
- [ ] Apply GSAP entrance animations to code blocks
- [ ] Integrate syntax highlighting

#### Dashboard Layout

```
┌─────────────────────────────────────────────────────────┐
│                      /dashboard                         │
├──────────────────────────┬──────────────────────────────┤
│      LEFT PANEL          │       RIGHT PANEL            │
│   ─────────────────      │   ──────────────────────     │
│   Chat Interface         │   Code Viewer                │
│   · Input prompt         │   · Syntax-highlighted       │
│   · Message history      │     code blocks              │
│   · SSE stream display   │   · GSAP animated entries    │
└──────────────────────────┴──────────────────────────────┘
```

#### GSAP Animation Specification

Trigger: when a code block streams into the Right Panel

```js
// Target: each incoming code block element
gsap.from(codeBlock, {
  y: 15,
  opacity: 0,
  duration: 0.4,
  stagger: 0.08,
  ease: "power2.out"
})
```

#### Syntax Highlighting

```
Library options : shiki  |  react-syntax-highlighter
Theme           : Match the 3-color design system (dark background)
```

---

## 5. Design System

> **Three colors only. No exceptions.**

| Token       | Hex       | Usage                         |
|-------------|-----------|-------------------------------|
| `--canvas`  | `#09090b` | Page background               |
| `--surface` | `#18181b` | Cards, borders, panels        |
| `--text`    | `#fafafa` | All text, accents, highlights |

```css
:root {
  --canvas  : #09090b;
  --surface : #18181b;
  --text    : #fafafa;
}
```

> ⚠️ Do not introduce any color outside of this palette — not in components, not in inline styles, not in Tailwind arbitrary values.

---

## 6. Critical Rules

| # | Rule                     | Description                                                                                   |
|---|--------------------------|-----------------------------------------------------------------------------------------------|
| 1 | **No truncated code**    | Never write `// ...rest of the code`. Always write the full implementation.                   |
| 2 | **Strict typing**        | TypeScript: no `any`. Pydantic v2: all fields explicitly typed. Zero exceptions.              |
| 3 | **No hallucinated libs** | Do not use ad-hoc AST parsing libraries. Use only the LangChain language splitters specified. |
| 4 | **Graceful error handling** | Wrap all DeepSeek and GitHub API calls in `try/catch`. Bubble errors properly.             |
| 5 | **Design system locked** | All UI components must use only the 3 defined colors. No CSS outside those boundaries.       |

---

## 7. Setup Checklist

Before beginning Phase 1, confirm the following credentials are available:

- [ ] **Pinecone API Key** — for vector upsert and query
- [ ] **Pinecone Index Name** — target index for this project
- [ ] **DeepSeek API Key** — for LLM inference
- [ ] **Firebase Project Config** — Web SDK config object
- [ ] **Firebase Service Account JSON** — for `firebase-admin` on backend

---

*Provide the above credentials to begin Phase 1.*
