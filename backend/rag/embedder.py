"""
Local Embedder
Generates dense vector embeddings using BAAI/bge-small-en-v1.5 via
sentence-transformers. The model is loaded once at import time (singleton).
All embedding computation runs locally — zero external API cost.
"""

from sentence_transformers import SentenceTransformer

# Singleton model instance — loaded once, reused for all requests.
_MODEL_NAME: str = "BAAI/bge-small-en-v1.5"
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    """Lazy-initializes and returns the singleton SentenceTransformer model."""
    global _model
    if _model is None:
        _model = SentenceTransformer(_MODEL_NAME)
    return _model


def embed(texts: list[str]) -> list[list[float]]:
    """
    Generates normalized embeddings for a list of text strings.

    Args:
        texts: A list of raw text strings to embed (code chunks or queries).

    Returns:
        A list of float vectors, one per input text.
        Each vector has dimension 384 (BAAI/bge-small-en-v1.5 output size).

    Raises:
        RuntimeError: If the model fails to load or encode.
    """
    if not texts:
        return []

    model = _get_model()
    # normalize_embeddings=True ensures cosine similarity == dot product,
    # which is required for the anti-hallucination filter in chat.py.
    embeddings = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
        batch_size=64,
    )
    return [vec.tolist() for vec in embeddings]


def embed_single(text: str) -> list[float]:
    """
    Convenience wrapper to embed a single string.

    Args:
        text: A single text string.

    Returns:
        A single float vector of dimension 384.
    """
    result = embed([text])
    return result[0]
