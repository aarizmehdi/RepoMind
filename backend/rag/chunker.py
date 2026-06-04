"""
Language-Aware Code Chunker
Uses LangChain's RecursiveCharacterTextSplitter.from_language() to split
source files into semantically meaningful chunks respecting code boundaries.
"""

from dataclasses import dataclass

from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

# Chunk size (characters) and overlap tuned for code retrieval.
_CHUNK_SIZE: int = 1500
_CHUNK_OVERLAP: int = 150

# Maps supported file extensions to LangChain Language enums.
_EXTENSION_TO_LANGUAGE: dict[str, Language] = {
    ".py": Language.PYTHON,
    ".ts": Language.TS,
    ".tsx": Language.TS,
    ".js": Language.JS,
}


@dataclass(frozen=True)
class CodeChunk:
    """A single semantically coherent code chunk with source metadata."""

    filename: str
    code: str
    start_line: int


def chunk_file(filename: str, content: str, extension: str) -> list[CodeChunk]:
    """
    Splits a source file's content into language-aware chunks.

    Args:
        filename: Original filename / path in the repository.
        content: Raw source code as a string.
        extension: Lowercase file extension, e.g. ".py", ".ts".

    Returns:
        A list of CodeChunk objects with approximate start line numbers.

    Raises:
        ValueError: If the extension is not in the supported set.
    """
    language = _EXTENSION_TO_LANGUAGE.get(extension)

    if language:
        splitter = RecursiveCharacterTextSplitter.from_language(
            language=language,
            chunk_size=_CHUNK_SIZE,
            chunk_overlap=_CHUNK_OVERLAP,
            strip_whitespace=False,
        )
    else:
        # Fallback for HTML, Markdown, Go, Rust, etc.
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=_CHUNK_SIZE,
            chunk_overlap=_CHUNK_OVERLAP,
            strip_whitespace=False,
        )

    raw_chunks: list[str] = splitter.split_text(content)

    # Calculate approximate start line for each chunk by scanning forward
    # through the original content.
    chunks: list[CodeChunk] = []
    cursor: int = 0

    for raw in raw_chunks:
        # Find where this chunk starts in the original content.
        idx = content.find(raw, cursor)
        if idx == -1:
            # Fallback: search from the beginning of the file (in case whitespace stripping messed up the cursor)
            idx = content.find(raw, 0)
            if idx == -1:
                # Absolute fallback if LangChain heavily modified the chunk (rare)
                idx = cursor

        start_line = content[:idx].count("\n") + 1
        chunks.append(CodeChunk(filename=filename, code=raw, start_line=start_line))

        # Advance cursor to just past the start of this chunk so we don't miss overlapping chunks
        cursor = idx + 1

    return chunks
