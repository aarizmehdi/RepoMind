"""
Cloud Embedder
Generates dense vector embeddings using BAAI/bge-small-en-v1.5 via
HuggingFace Inference API. Uses urllib for rock-solid DNS resolution in Docker.
"""

import os
import json
import time
import urllib.request
import urllib.error

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

    headers = {
        "Authorization": f"Bearer {hf_token}",
        "Content-Type": "application/json"
    }
    
    payload_dict = {"inputs": texts, "options": {"wait_for_model": True}}
    data = json.dumps(payload_dict).encode("utf-8")
    req = urllib.request.Request(_HF_API_URL, data=data, headers=headers, method="POST")

    max_retries = 5
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=60.0) as response:
                response_data = response.read().decode("utf-8")
                embeddings = json.loads(response_data)
                
                if not isinstance(embeddings, list):
                    raise RuntimeError(f"Unexpected HF response: {embeddings}")
                
                if isinstance(embeddings[0], float):
                    return [embeddings]
                
                return embeddings
        except urllib.error.HTTPError as e:
            if e.code == 503:
                # Model loading, wait and retry
                time.sleep(2 ** attempt)
                continue
            if attempt == max_retries - 1:
                error_body = e.read().decode("utf-8")
                raise RuntimeError(f"HuggingFace embedding failed (HTTP {e.code}): {error_body}")
            time.sleep(2 ** attempt)
        except Exception as e:
            if attempt == max_retries - 1:
                raise RuntimeError(f"HuggingFace embedding failed after {max_retries} attempts: {e}")
            time.sleep(2 ** attempt)


def embed_single(text: str) -> list[float]:
    """
    Convenience wrapper to embed a single string.
    Returns: A single float vector of dimension 384.
    """
    result = embed([text])
    return result[0]
