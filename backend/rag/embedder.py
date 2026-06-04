"""
Cloud Embedder
Generates dense vector embeddings using BAAI/bge-small-en-v1.5 via
HuggingFace Inference API. This keeps memory usage near zero to prevent OOM errors.
"""

import os
import httpx

_MODEL_ID = "BAAI/bge-small-en-v1.5"
_HF_API_URL = f"https://api-inference.huggingface.co/pipeline/feature-extraction/{_MODEL_ID}"


def embed(texts: list[str]) -> list[list[float]]:
    """
    Generates embeddings for a list of text strings via HuggingFace API.
    Returns: A list of float vectors, one per input text. Dimension 384.
    """
    if not texts:
        return []

    hf_token = os.getenv("HUGGINGFACE_API_KEY")
    if not hf_token:
        raise RuntimeError("HUGGINGFACE_API_KEY environment variable is missing. Add it to Render!")

    headers = {"Authorization": f"Bearer {hf_token}"}
    payload = {"inputs": texts, "options": {"wait_for_model": True}}

    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(_HF_API_URL, headers=headers, json=payload)
            response.raise_for_status()
            embeddings = response.json()
            
            # Hugging Face feature-extraction returns a list of floats for a single string, 
            # and a list of lists of floats for a list of strings.
            if not isinstance(embeddings, list):
                raise RuntimeError(f"Unexpected HF response: {embeddings}")
            
            # If a single string was passed, wrap it back in a list so the return type is consistent
            if isinstance(embeddings[0], float):
                return [embeddings]
            
            return embeddings
    except Exception as e:
        raise RuntimeError(f"HuggingFace embedding failed: {e}")


def embed_single(text: str) -> list[float]:
    """
    Convenience wrapper to embed a single string.
    Returns: A single float vector of dimension 384.
    """
    result = embed([text])
    return result[0]
