"""
POST /ingest — GitHub Repository Ingestion Endpoint

Flow:
1. Validate Firebase Bearer token (via `verify_token` dependency).
2. Accept repo_url + github_token from the request body.
3. Fetch all repository tree entries via GitHub REST API using the client's GitHub OAuth token.
4. Filter to supported extensions: .ts, .tsx, .js, .py
5. Download each file's raw content.
6. Chunk each file using language-aware chunking.
7. Embed all chunks locally via sentence-transformers.
8. Upsert to Pinecone with per-repo namespace (owner/repo).
9. Return indexing summary.
"""

import os
import uuid
import asyncio
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from pinecone import Pinecone
from pydantic import BaseModel, HttpUrl

from core.auth import verify_token
from rag.chunker import CodeChunk, chunk_file
from rag.embedder import embed

load_dotenv()

router = APIRouter()

# ---------------------------------------------------------------------------
# Pinecone client — initialized once at module load.
# ---------------------------------------------------------------------------
_PINECONE_API_KEY: str = os.environ["PINECONE_API_KEY"]
_PINECONE_INDEX_NAME: str = os.environ["PINECONE_INDEX_NAME"]

_pc = Pinecone(api_key=_PINECONE_API_KEY)
_index = _pc.Index(_PINECONE_INDEX_NAME)

# ---------------------------------------------------------------------------
# Supported file extensions.
# ---------------------------------------------------------------------------
_SUPPORTED_EXTENSIONS: frozenset[str] = frozenset({
    # JavaScript / TypeScript
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    # Python
    ".py", ".pyw",
    # Systems languages
    ".go", ".rs", ".c", ".cpp", ".cc", ".cxx", ".h", ".hpp",
    # JVM
    ".java", ".kt", ".scala",
    # C# / .NET
    ".cs",
    # Ruby / PHP / Swift / Dart
    ".rb", ".php", ".swift", ".dart",
    # Web
    ".html", ".htm", ".css", ".scss", ".sass", ".less", ".svelte", ".vue",
    # Data / Config
    ".json", ".yaml", ".yml", ".toml", ".xml", ".env",
    # Shell / Scripts
    ".sh", ".bash", ".zsh", ".ps1", ".bat",
    # Documentation
    ".md", ".mdx", ".rst", ".txt",
    # Database
    ".sql", ".graphql", ".gql",
    # Other
    ".lua", ".r", ".m", ".ex", ".exs",
})

# Pinecone upsert batch size. Lowered to 16 to avoid HuggingFace Serverless API payload limits.
_UPSERT_BATCH_SIZE: int = 16

# GitHub REST API base URL.
_GITHUB_API_BASE: str = "https://api.github.com"


# ---------------------------------------------------------------------------
# Request / Response models.
# ---------------------------------------------------------------------------
class IngestRequest(BaseModel):
    repo_url: HttpUrl
    github_token: str


class IngestResponse(BaseModel):
    status: str
    namespace: str
    files_processed: int
    chunks_indexed: int


# ---------------------------------------------------------------------------
# Helper functions.
# ---------------------------------------------------------------------------
def _parse_repo_url(repo_url: str) -> tuple[str, str]:
    """
    Extracts (owner, repo) from a GitHub URL.

    Supports:
    - https://github.com/owner/repo
    - https://github.com/owner/repo.git
    - https://github.com/owner/repo/

    Raises:
        HTTPException(400): If the URL cannot be parsed into owner/repo.
    """
    parsed = urlparse(str(repo_url))
    if parsed.netloc not in ("github.com", "www.github.com"):
        raise HTTPException(status_code=400, detail="URL must be a github.com repository.")

    path_parts = [p for p in parsed.path.strip("/").split("/") if p]
    if len(path_parts) < 2:
        raise HTTPException(
            status_code=400,
            detail="Cannot parse owner/repo from URL. Expected: https://github.com/owner/repo",
        )

    owner = path_parts[0]
    repo = path_parts[1].removesuffix(".git")
    return owner, repo


async def _get_default_branch(
    client: httpx.AsyncClient, owner: str, repo: str, headers: dict[str, str]
) -> str:
    """Fetches the default branch name of a repository."""
    resp = await client.get(f"{_GITHUB_API_BASE}/repos/{owner}/{repo}", headers=headers)
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Repository '{owner}/{repo}' not found or not accessible.")
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="GitHub token is invalid or expired.")
    resp.raise_for_status()
    return resp.json()["default_branch"]


async def _get_repo_tree(
    client: httpx.AsyncClient,
    owner: str,
    repo: str,
    branch: str,
    headers: dict[str, str],
) -> list[dict]:
    """Fetches the full recursive file tree of a repository."""
    url = f"{_GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    resp = await client.get(url, headers=headers)
    resp.raise_for_status()
    data = resp.json()
    if data.get("truncated"):
        # For very large repos the tree may be truncated — warn but continue.
        pass
    return [entry for entry in data.get("tree", []) if entry.get("type") == "blob"]


async def _download_file(
    client: httpx.AsyncClient,
    owner: str,
    repo: str,
    path: str,
    headers: dict[str, str],
) -> str:
    """Downloads the raw content of a single file."""
    url = f"https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{path}"
    resp = await client.get(url, headers=headers)
    if resp.status_code != 200:
        return ""
    return resp.text


def _upsert_chunks_to_pinecone(
    chunks: list[CodeChunk],
    namespace: str,
) -> int:
    """
    Embeds and upserts a list of CodeChunks to Pinecone in batches.

    Returns:
        Number of vectors successfully upserted.
    """
    total_upserted = 0

    # Process in batches to avoid memory spikes.
    for batch_start in range(0, len(chunks), _UPSERT_BATCH_SIZE):
        batch = chunks[batch_start : batch_start + _UPSERT_BATCH_SIZE]
        texts = [c.code for c in batch]
        vectors = embed(texts)

        records = [
            {
                "id": str(uuid.uuid4()),
                "values": vectors[i],
                "metadata": {
                    "filename": batch[i].filename,
                    "code": batch[i].code,
                    "start_line": batch[i].start_line,
                },
            }
            for i in range(len(batch))
        ]

        _index.upsert(vectors=records, namespace=namespace)
        total_upserted += len(records)

    return total_upserted


# ---------------------------------------------------------------------------
# Route handler.
# ---------------------------------------------------------------------------
@router.post("", response_model=IngestResponse)
async def ingest_repository(
    body: IngestRequest,
    _user: dict = Depends(verify_token),
) -> IngestResponse:
    """
    Ingests a GitHub repository into the Pinecone vector index.

    Security:
    - Firebase Bearer token required (via Authorization header).
    - GitHub OAuth token provided by client — enables private repo access.
    - No server-side GitHub token fallback.
    """
    owner, repo = _parse_repo_url(str(body.repo_url))
    namespace = f"{owner}/{repo}"

    github_headers = {
        "Authorization": f"Bearer {body.github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    all_chunks: list[CodeChunk] = []
    files_processed = 0
    chunks_indexed = 0

    try:
        # 0. Wipe existing namespace to prevent ghost chunks on re-sync
        try:
            await asyncio.to_thread(_index.delete, delete_all=True, namespace=namespace)
            await asyncio.sleep(2)  # Give Pinecone backend time to process the deletion
        except Exception:
            pass  # Ignored if namespace doesn't exist yet

        async with httpx.AsyncClient(timeout=60.0) as client:
            # 1. Resolve the default branch.
            branch = await _get_default_branch(client, owner, repo, github_headers)

            # 2. Fetch full recursive file tree.
            tree_entries = await _get_repo_tree(client, owner, repo, branch, github_headers)

            # 3. Filter to supported extensions.
            supported_entries = [
                entry
                for entry in tree_entries
                if any(entry["path"].endswith(ext) for ext in _SUPPORTED_EXTENSIONS)
            ]

            if not supported_entries:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"No supported files (.ts, .tsx, .js, .py) found in '{owner}/{repo}'. "
                        "Ensure the repository is not empty."
                    ),
                )

            # 4. Download ALL files concurrently — this is the main speedup.
            #    asyncio.gather fires all HTTP requests at once instead of one-by-one.
            paths = [e["path"] for e in supported_entries]
            contents = await asyncio.gather(
                *[_download_file(client, owner, repo, p, github_headers) for p in paths]
            )

            # 5. Chunk each file (CPU-bound, but fast for small repos).
            for path, content in zip(paths, contents):
                if not content.strip():
                    continue
                extension = "." + path.rsplit(".", 1)[-1] if "." in path else ""
                try:
                    file_chunks = chunk_file(
                        filename=path,
                        content=content,
                        extension=extension,
                    )
                except ValueError:
                    continue
                all_chunks.extend(file_chunks)
                files_processed += 1

    except HTTPException:
        raise
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"GitHub API error: {exc.response.status_code} — {exc.response.text[:200]}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Ingestion failed: {str(exc)}",
        ) from exc

    if not files_processed:
        raise HTTPException(
            status_code=422,
            detail="All supported files were empty or could not be chunked.",
        )

    # 5. Embed and upsert remaining chunks to Pinecone.
    if all_chunks:
        try:
            upserted = await asyncio.to_thread(_upsert_chunks_to_pinecone, all_chunks, namespace)
            chunks_indexed += upserted
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Pinecone upsert failed for remaining chunks: {str(exc)}",
            ) from exc

    return IngestResponse(
        status="ok",
        namespace=namespace,
        files_processed=files_processed,
        chunks_indexed=chunks_indexed,
    )
