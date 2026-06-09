/**
 * API client helpers.
 * Handles authenticated requests to the FastAPI backend.
 *
 * All requests attach `Authorization: Bearer <firebase_id_token>`.
 * Ingestion also sends `github_token` in the JSON body.
 */

import { auth } from "./firebase";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

/** Retrieves the current user's Firebase ID token. */
async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated.");
  return user.getIdToken();
}

// ---------------------------------------------------------------------------
// POST /ingest
// ---------------------------------------------------------------------------
export interface IngestResponse {
  status: string;
  namespace: string;
  files_processed: number;
  chunks_indexed: number;
}

export async function ingestRepository(
  repoUrl: string,
  githubToken: string
): Promise<IngestResponse> {
  const idToken = await getIdToken();

  // 15-minute timeout — embedding large repos on CPU or through retries can take a while.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15 * 60 * 1000);

  try {
    const res = await fetch(`${BACKEND_URL}/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ repo_url: repoUrl, github_token: githubToken }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error((err as { detail: string }).detail ?? "Ingestion failed.");
    }

    return res.json() as Promise<IngestResponse>;
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error("Ingestion timed out — the repository may be too large or the server is busy.");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Metadata snippet shape returned from [METADATA] SSE event.
// ---------------------------------------------------------------------------
export interface ContextSnippet {
  filename: string;
  start_line: number;
  code: string;
  score: number;
}

// ---------------------------------------------------------------------------
// POST /chat — SSE streaming via fetch + ReadableStream
// ---------------------------------------------------------------------------
export async function streamChat(
  query: string,
  namespace: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  onMetadata?: (snippets: ContextSnippet[]) => void
): Promise<void> {
  const idToken = await getIdToken();

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ query, namespace }),
    });
  } catch (e) {
    onError(`Network error: ${String(e)}`);
    return;
  }

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    onError((err as { detail: string }).detail ?? "Chat request failed.");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last (potentially incomplete) line in the buffer.
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;

      let data = line.slice(5);
      // Strip exactly one leading space if present, preserving everything else.
      if (data.startsWith(" ")) {
        data = data.slice(1);
      }

      if (data === "[DONE]") {
        onDone();
        return;
      }

      if (data.startsWith("[ERROR]")) {
        onError(data.slice("[ERROR]".length).trim());
        return;
      }

      // Parse the metadata event emitted by the backend before LLM streaming.
      if (data.startsWith("[METADATA]")) {
        try {
          const jsonStr = data.slice("[METADATA]".length).trim();
          const snippets: ContextSnippet[] = JSON.parse(jsonStr);
          onMetadata?.(snippets);
        } catch {
          // Silently ignore malformed metadata.
        }
        continue;
      }

      // Restore escaped newlines and pass token to caller.
      onToken(data.replace(/\\n/g, "\n"));
    }
  }

  onDone();
}
