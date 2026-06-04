"""
POST /chat — DeepSeek RAG Inference Endpoint (SSE Streaming)

Flow:
1. Validate Firebase Bearer token (via `verify_token` dependency).
2. Embed user query locally via sentence-transformers.
3. Query Pinecone (top-5) in the repo's namespace.
4. Apply anti-hallucination cosine similarity filter (threshold: 0.72).
5. Construct a grounded system prompt from filtered code snippets.
6. Stream the DeepSeek response token-by-token via Server-Sent Events.
"""

import os
import json
import asyncio
from collections.abc import AsyncGenerator

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pinecone import Pinecone
from pydantic import BaseModel

from core.auth import verify_token
from core.deepseek import stream_chat
from rag.embedder import embed_single

load_dotenv()

router = APIRouter()

# ---------------------------------------------------------------------------
# Pinecone client — reuses the same index as ingest.py.
# ---------------------------------------------------------------------------
_PINECONE_API_KEY: str = os.environ["PINECONE_API_KEY"]
_PINECONE_INDEX_NAME: str = os.environ["PINECONE_INDEX_NAME"]

_pc = Pinecone(api_key=_PINECONE_API_KEY)
_index = _pc.Index(_PINECONE_INDEX_NAME)

# ---------------------------------------------------------------------------
# Anti-hallucination filter threshold.
# ---------------------------------------------------------------------------
_SIMILARITY_THRESHOLD: float = 0.3
_TOP_K: int = 5


# ---------------------------------------------------------------------------
# Request model.
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    query: str
    namespace: str  # e.g. "owner/repo" — matches the ingestion namespace.


# ---------------------------------------------------------------------------
# Prompt construction.
# ---------------------------------------------------------------------------
def _build_system_prompt(snippets: list[dict]) -> str:
    """
    Constructs a grounded system prompt from filtered Pinecone results.
    The LLM is strictly instructed to answer only from the provided context.
    """
    context_blocks = []
    for i, snippet in enumerate(snippets, start=1):
        meta = snippet.metadata or {}
        filename = meta.get("filename", "unknown")
        start_line = meta.get("start_line", 0)
        code = meta.get("code", "")
        context_blocks.append(
            f"### Snippet {i} — {filename} (line {start_line})\n```\n{code}\n```"
        )

    formatted_context = "\n\n".join(context_blocks)

    system_prompt = f"""You are RepoMind, an elite Senior Staff Engineer and AI assistant for GitHub repositories.
Your goal is to analyze the provided codebase context and answer the user's query with extreme precision, architectural insight, and premium formatting.

CRITICAL RULES:
1. TONE & PERSONA: Be concise, authoritative, and direct. Do not use cliché AI fluff (e.g., "As an AI...", "Here is the code you requested..."). Speak like an expert human engineer pair-programming with the user. If the user asks a question, give the answer immediately, followed by the explanation.
2. STRICT INTENT MATCHING: Read exactly what the user is asking for. If they ask for a short summary, give a short summary. If they ask for a specific format, give exactly that format. Do not over-explain or provide things they didn't ask for. Tailor your format, length, and depth strictly to their prompt.
3. ENGINEERING MINDSET (THINK DEEPLY): Before answering, internally map out the architecture. Evaluate performance, edge cases, security, and scalability. Point out subtle bugs or anti-patterns in the context if you see them. Demonstrate high intelligence by anticipating the user's *next* problem, not just answering their literal question.
4. BEAUTIFUL FORMATTING: Structure your response cleanly. Use H3 (###) headings for distinct sections, bullet points for lists, and bold text for emphasis. Never output a giant wall of plain text.
5. CONTEXT & INTELLIGENCE: Base your answer primarily on the provided context. Connect the dots between snippets to explain the broader architecture. If a detail is missing from the context, use your vast engineering knowledge to fill the gaps, but explicitly state when you are making an educated assumption versus reading the code.
6. PINPOINT ACCURACY: Always cite the exact `filename` and `start_line` from the context metadata when referencing code. (e.g., "The auth logic is implemented in `frontend/lib/auth.ts` around line 45"). Do not hallucinate file paths.
7. EXPLAIN LIKE A MENTOR: When explaining code or suggesting fixes, break down complex logic. Explain *why* a design decision was made, not just *what* the code does.
8. STRICT CODE DISPLAY RULE: NEVER output raw code blocks (like ```html or ```js) directly in the chat message if you are showing existing code from the repo. If the user asks "where is X", "show me Y", or wants to see *any* existing code from the context, YOU MUST exclusively output an `<artifact type="existing_code">` tag. NEVER say you cannot access GitHub. The artifact tag automatically generates the GitHub link in the UI!

THE ARTIFACT SYSTEM (CRITICAL):
You must autonomously decide when to open the Right Panel (Artifact Viewer) using an `<artifact>` tag.
- Rule: NEVER output raw code blocks in the chat. ANY code snippet, README, or deep architectural documentation MUST go into an artifact.
- Rule: Do not duplicate code. If it's in the artifact, do not print it again in the chat.
- Rule: Max 1 artifact per response. Do not spawn multiple artifacts.

Artifact XML Syntax: `<artifact type="..." title="..." start_line="...">...content...</artifact>`
Variant 1 (Pure Existing Code): Use `type="existing_code"`. `title` MUST be the exact filename (e.g., `src/App.tsx`). Include the `start_line="<number>"`. 
  - CRITICAL: If the user asks "where is this code in GitHub?", "show me the code", or asks about a specific chunk (e.g., "what is the html head of this"), YOU MUST output an `existing_code` artifact. NEVER say you can't access GitHub. The frontend automatically generates the clickable GitHub link when you provide this artifact.
Variant 2 (Generated Fixes/New Code): Use `type="new_code"`. `title` MUST be `src/App.tsx - FIXED CODE`. Use this when the user asks for a code fix, to show the new code without generating a GitHub link.
Variant 3 (Markdown / READMEs / Error Analysis / System Prompts / Advice): Use `type="markdown"`.
  - For READMEs: `title="README.md"`
  - For Architecture/Docs: `title="Documentation"`
  - For Error Analysis: `title="Error Analysis"`
  - For ANY user-requested 'prompt', 'fix prompt', 'advice', or text-based instruction: `title="prompt.md"`
  - CRITICAL: A "prompt" is NOT code. You must use `type="markdown"` for any requested prompts or advice. NEVER use `existing_code` for markdown!

PROVIDED CODEBASE CONTEXT:
{formatted_context}
"""
    return system_prompt


# ---------------------------------------------------------------------------
# SSE generator.
# ---------------------------------------------------------------------------
async def _sse_stream(
    query: str,
    namespace: str,
) -> AsyncGenerator[str, None]:
    """
    Core RAG + streaming pipeline.
    Yields SSE-formatted strings: `data: <token>\n\n`
    """
    # 1. Embed the user query locally.
    query_vector = await asyncio.to_thread(embed_single, query)

    # 2. Query Pinecone for the top-K most similar code chunks.
    try:
        results = await asyncio.wait_for(
            asyncio.to_thread(
                _index.query,
                vector=query_vector,
                top_k=_TOP_K,
                namespace=namespace,
                include_metadata=True,
            ),
            timeout=10.0
        )
    except asyncio.TimeoutError:
        yield "data: [ERROR] Pinecone query timed out.\n\n"
        return
    except Exception as exc:
        yield f"data: [ERROR] Pinecone query failed: {str(exc)}\n\n"
        return

    matches = results.matches

    # 3. Anti-hallucination filter — discard low-confidence matches.
    filtered = [m for m in matches if (m.score or 0.0) >= _SIMILARITY_THRESHOLD]

    if not filtered:
        yield (
            "data: I could not find relevant information in the indexed codebase "
            "that matches your query with sufficient confidence.\n\n"
        )
        yield "data: [DONE]\n\n"
        return

    # 4. Build grounded system prompt.
    system_prompt = _build_system_prompt(filtered)

    # 4a. Emit metadata event so the frontend Evidence Board can populate immediately.
    metadata_payload = []
    for m in filtered:
        meta = m.metadata or {}
        metadata_payload.append({
            "filename": meta.get("filename", "unknown"),
            "start_line": meta.get("start_line", 0),
            "code": meta.get("code", ""),
            "score": round(float(m.score or 0.0), 4),
        })
    yield f"data: [METADATA] {json.dumps(metadata_payload)}\n\n"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": query},
    ]

    # 5. Stream DeepSeek response token-by-token.
    try:
        async for token in stream_chat(messages):
            # Escape newlines inside the SSE data field.
            safe_token = token.replace("\n", "\\n")
            yield f"data: {safe_token}\n\n"
    except RuntimeError as exc:
        yield f"data: [ERROR] {str(exc)}\n\n"

    yield "data: [DONE]\n\n"


# ---------------------------------------------------------------------------
# Route handler.
# ---------------------------------------------------------------------------
@router.post("")
async def chat(
    body: ChatRequest,
    _user: dict = Depends(verify_token),
) -> StreamingResponse:
    """
    Streams a grounded DeepSeek response via Server-Sent Events.

    Security:
    - Firebase Bearer token required (via Authorization header).
    - Answers grounded exclusively in indexed code context.
    """
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query must not be empty.")

    if not body.namespace.strip():
        raise HTTPException(
            status_code=400,
            detail="Namespace must be provided (e.g. 'owner/repo').",
        )

    return StreamingResponse(
        _sse_stream(body.query, body.namespace),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
