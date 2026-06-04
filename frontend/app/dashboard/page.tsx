"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ingestRepository, streamChat, type ContextSnippet } from "@/lib/api";
import ChatBox from "@/components/ChatBox/ChatBox";
import EvidenceBoard from "@/components/CodeViewer/CodeViewer";
import RepoImporter, { GitHubRepo } from "@/components/RepoImporter/RepoImporter";
import { saveRepository, getUserRepositories, saveChatHistory, getChatHistory, SavedRepository, getUserLimits, incrementUserLimit, updateUserLimit } from "@/lib/firestore";
import { FolderGit2, History, ChevronLeft, ChevronRight, Plus } from "lucide-react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export interface CodeBlock {
  id: string;
  filename: string;
  language: string;
  code: string;
  start_line?: number;
  score?: number;
}

export default function DashboardPage() {
  const { user, githubToken, loading, signOut } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [codeBlocks, setCodeBlocks] = useState<CodeBlock[]>([]);
  const [namespace, setNamespace] = useState<string>("");
  const [repoUrl, setRepoUrl] = useState<string>("");
  const [ingesting, setIngesting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [messagesUsed, setMessagesUsed] = useState<number>(0);
  const [messageLimit, setMessageLimit] = useState<number>(5);
  const isPanelOpenRef = useRef(false); // For live stream tracking

  // Repo selection flow
  const [activeRepo, setActiveRepo] = useState<GitHubRepo | null>(null);

  const [activeArtifact, setActiveArtifact] = useState<{
    type: string;
    title: string;
    content: string;
    startLine?: number;
  } | null>(null);

  // History / Modal state
  const [sidebarRepos, setSidebarRepos] = useState<SavedRepository[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Expose a ref so ChatBox can inject "Explain This" prompts programmatically.
  const injectPromptRef = useRef<((prompt: string) => void) | null>(null);

  const streamBufferRef = useRef<string>("");

  // Auth guard and initial data load
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    } else if (user) {
      getUserRepositories(user.uid).then(setSidebarRepos).catch(console.error);
      getUserLimits(user.uid).then((limits) => {
        setMessagesUsed(limits.total_messages);
        setMessageLimit(limits.message_limit);
      }).catch(console.error);
    }
  }, [user, loading, router]);

  const loadRepository = useCallback(async (repo: SavedRepository) => {
    if (!user) return;
    setNamespace(repo.id);
    setRepoUrl(repo.url);
    setCodeBlocks([]); 
    setIsPanelOpen(false);
    isPanelOpenRef.current = false;
    setActiveArtifact(null);
    setIngestStatus(`Loaded from history: ${repo.name}`);
    setError("");
    setIsHistoryModalOpen(false);
    
    // Set the active repo so the view switches to ChatBox
    setActiveRepo({
      id: Date.now(),
      name: repo.name.split("/").pop() || repo.name,
      full_name: repo.name,
      html_url: repo.url,
      description: null,
      updated_at: new Date().toISOString(),
      private: false
    } as any);
    
    try {
      const history = await getChatHistory(user.uid, repo.id);
      setMessages(history);
    } catch (e) {
      console.error(e);
      setMessages([]);
    }
  }, [user]);


  const handleIngest = useCallback(
    async (url: string) => {
      if (!githubToken) {
        setError("GitHub token not found. Please sign in again.");
        return;
      }

      let isNewRepo = false;
      if (user) {
        isNewRepo = !sidebarRepos.some(r => r.url === url);
        if (isNewRepo) {
          const limits = await getUserLimits(user.uid);
          if (limits.repos_indexed >= 3) {
            setError("GitHub Account Limit Reached: You have indexed your maximum of 3 free repositories. Upgrade coming soon.");
            return;
          }
        }
      }

      setError("");
      setIngesting(true);
      setIngestStatus("Indexing repository…");
      setRepoUrl(url);
      setCodeBlocks([]);
      setMessages([]);

      try {
        const result = await ingestRepository(url, githubToken);
        setNamespace(result.namespace);
        setIngestStatus(
          `✓ Indexed ${result.chunks_indexed} chunks from ${result.files_processed} files`
        );
        
        // Save to Firestore
        if (user) {
          if (isNewRepo) {
            await incrementUserLimit(user.uid, 'repos_indexed');
          }
          const repoName = url.split('/').filter(Boolean).pop() || url;
          await saveRepository(user.uid, result.namespace, url, repoName);
          const repos = await getUserRepositories(user.uid);
          setSidebarRepos(repos);
        }
        
        // Post-Ingest Hook: Automatically trigger the architectural overview.
        setTimeout(() => {
          handleSendMessage("Generate a brief 3-sentence architectural overview of this repository.");
        }, 500);
      } catch (err) {
        setError(`Ingestion failed: ${(err as Error).message}`);
        setIngestStatus("");
      } finally {
        setIngesting(false);
      }
    },
    [githubToken, user, sidebarRepos]
  );

  const handleImport = useCallback((repo: GitHubRepo) => {
    const existing = sidebarRepos.find(r => r.url === repo.html_url);
    if (existing) {
      // Already indexed! Jump to chat history immediately.
      loadRepository(existing);
      setActiveRepo(repo);
    } else {
      // Kick off real ingestion for a new repo
      handleIngest(repo.html_url);
      setActiveRepo(repo);
    }
  }, [sidebarRepos, loadRepository, handleIngest]);
  const handleSendMessage = useCallback(
    async (query: string) => {
      if (streaming || !query.trim()) return;
      if (!namespace) {
        setError("Please ingest a repository first.");
        return;
      }
      
      if (user) {
        const limits = await getUserLimits(user.uid);
        if (limits.total_messages >= messageLimit) {
          setError(`Account limit reached (${messageLimit}/${messageLimit} messages). Premium coming soon!`);
          setMessagesUsed(limits.total_messages);
          return;
        }
      }

      setError("");

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: query,
      };

      const assistantMsgId = `a-${Date.now()}`;
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        streaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);
      streamBufferRef.current = "";

      await streamChat(
        query,
        namespace,
        (token) => {
          streamBufferRef.current += token;
          
          // Live extraction of artifacts
          const artifactMatches = Array.from(streamBufferRef.current.matchAll(/<artifact([^>]*)>([\s\S]*?)(?:<\/artifact>|$)/g));
          
          if (artifactMatches.length > 0) {
            const latest = artifactMatches[artifactMatches.length - 1];
            const attrStr = latest[1];
            const content = latest[2];
            
            const typeMatch = attrStr.match(/type="([^"]+)"/);
            const titleMatch = attrStr.match(/title="([^"]+)"/);
            const startLineMatch = attrStr.match(/start_line="([^"]+)"/);
            
            if (typeMatch && titleMatch) {
              setActiveArtifact({
                type: typeMatch[1],
                title: titleMatch[1],
                startLine: startLineMatch ? parseInt(startLineMatch[1], 10) : undefined,
                content: content,
              });
              if (!isPanelOpenRef.current) {
                setIsPanelOpen(true);
                isPanelOpenRef.current = true;
              }
            }
          }

          const currentContent = streamBufferRef.current;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: currentContent }
                : m
            )
          );
        },
        () => {
          // onDone
          if (user) {
            incrementUserLimit(user.uid, 'total_messages').then(() => {
              setMessagesUsed(prev => prev + 1);
            }).catch(console.error);
          }
          
          const finalContent = streamBufferRef.current;
          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: finalContent, streaming: false }
                : m
            );
            // Auto save chat history
            if (user && namespace) {
              saveChatHistory(user.uid, namespace, updated).catch(console.error);
            }
            return updated;
          });
          setStreaming(false);
        },
        (errMsg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: `Error: ${errMsg}`, streaming: false }
                : m
            )
          );
          setError(errMsg);
          setStreaming(false);
        },
        // onMetadata — populate the Evidence Board from retrieved Pinecone chunks.
        (snippets: ContextSnippet[]) => {
          const newBlocks: CodeBlock[] = snippets.map((s, i) => {
            const ext = s.filename.split(".").pop() ?? "text";
            return {
              id: `ctx-${Date.now()}-${i}`,
              filename: s.filename,
              language: ext,
              code: s.code,
              start_line: s.start_line,
              score: s.score,
            };
          });
          setCodeBlocks(newBlocks);
        }
      );
    },
    [namespace, streaming, user, messageLimit]
  );

  const handleUnlockEasterEgg = useCallback(async () => {
    if (!user) return;
    try {
      const newLimit = messageLimit + 5;
      await updateUserLimit(user.uid, "message_limit", newLimit);
      setMessageLimit(newLimit);
      setError(""); // clear any existing limit error
    } catch (e) {
      console.error("Easter egg unlock failed:", e);
    }
  }, [user, messageLimit]);

  // Called when user clicks an Artifact Button in the chat
  const handleArtifactClick = useCallback((type: string, title: string, content: string, startLine?: number) => {
    setActiveArtifact({ type, title, content, startLine });
    setIsPanelOpen(true);
    isPanelOpenRef.current = true;
  }, []);

  // Called by EvidenceBoard's "Explain This" button.
  const handleExplainChunk = useCallback(
    (filename: string, startLine: number, code: string) => {
      const prompt = `Please explain in detail what the following code does. It's from \`${filename}\` starting at line ${startLine}:\n\n\`\`\`\n${code}\n\`\`\``;
      injectPromptRef.current?.(prompt);
      setIsPanelOpen(false); // Focus back on chat
    },
    []
  );

  // Called when user opens history modal to ensure it's fresh
  const handleOpenHistory = useCallback(async () => {
    if (user) {
      try {
        const repos = await getUserRepositories(user.uid);
        setSidebarRepos(repos);
      } catch (e) {
        console.error(e);
      }
    }
    setIsHistoryModalOpen(true);
  }, [user]);

  if (loading || !user) {
    return (
      <div className="dash-loading">
        <div className="login-spinner" />
      </div>
    );
  }

  const filteredRepos = sidebarRepos.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="dash-shell">
      {/* Left Navigation Rail — Premium Gemini Style */}
      <aside className="dash-rail">
        {/* Logo */}
        <div className="rail-logo">
          <svg
            width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0 8px rgba(255,255,255,0.4))", flexShrink: 0 }}
            aria-label="RepoMind" role="img"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div>

        {/* Switch Repository */}
        <div className="rail-section" style={{ marginTop: 8 }}>
          <button
            className="rail-btn"
            title="Switch Repository"
            onClick={() => {
              setActiveRepo(null);
              setNamespace("");
              setMessages([]);
              setCodeBlocks([]);
              setIsPanelOpen(false);
              isPanelOpenRef.current = false;
              setActiveArtifact(null);
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            <span className="rail-tooltip">Switch Repo</span>
          </button>
        </div>

        {/* History */}
        <div className="rail-section">
          <button
            className="rail-btn"
            title="Chat History"
            onClick={handleOpenHistory}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 15" />
            </svg>
            <span className="rail-tooltip">History</span>
          </button>
        </div>

        {/* Sign Out — bottom */}
        <div className="rail-section" style={{ marginTop: 'auto' }}>
          <button
            className="rail-btn"
            title="Sign Out"
            onClick={signOut}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="rail-tooltip">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="dash-content">
        <header className="dash-topbar">
          <div className="dash-brand">
            <span>RepoMind</span>
          </div>
          {namespace && (
            <span className="dash-namespace" title={namespace}>
              {namespace}
            </span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
            {activeRepo && !ingesting && (
              <button 
                className="dash-sync-btn"
                style={{ opacity: messagesUsed >= messageLimit ? 0.5 : 1, cursor: messagesUsed >= messageLimit ? 'not-allowed' : 'pointer' }}
                onClick={() => {
                  if (messagesUsed < messageLimit) handleIngest(activeRepo.html_url);
                }}
                title={messagesUsed >= messageLimit ? "Account limit reached" : "Sync Latest Code"}
                disabled={messagesUsed >= messageLimit}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                {messagesUsed >= messageLimit ? "Locked" : "Sync"}
              </button>
            )}
          </div>
        </header>

      <main className="dash-main">
        {/* VIEW A: Repo Importer */}
        {activeRepo === null && (
          <div className="dash-importer-view">
            <RepoImporter
              githubToken={githubToken}
              onImport={handleImport}
              isLocked={messagesUsed >= messageLimit}
            />
          </div>
        )}

        {/* VIEW B: Chat Interface */}
        {activeRepo !== null && (
          <div className="dash-chat-view">
            {/* Existing Chat + Evidence Panel – untouched */}
            <div className="dash-main" style={{ flex: 1, overflow: 'hidden' }}>
              <section className={`dash-panel dash-left ${isPanelOpen ? "dash-left-split" : "dash-left-full"}`} aria-label="Chat">
                <ChatBox
                  messages={messages}
                  streaming={streaming}
                  ingesting={ingesting}
                  ingestStatus={ingestStatus}
                  error={error}
                  namespace={namespace}
                  onIngest={handleIngest}
                  onSendMessage={handleSendMessage}
                  injectPromptRef={injectPromptRef}
                  onArtifactClick={handleArtifactClick}
                  messagesUsed={messagesUsed}
                  messageLimit={messageLimit}
                  onUnlockEasterEgg={handleUnlockEasterEgg}
                />
              </section>

              {isPanelOpen && (
                <>
                  <div className="dash-divider" aria-hidden="true" />
                  <section className="dash-panel dash-right" aria-label="Evidence Board">
                    <div className="dash-right-header">
                      <button
                        className="dash-close-panel"
                        onClick={() => setIsPanelOpen(false)}
                        title="Close Panel"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <EvidenceBoard
                      blocks={codeBlocks}
                      ingesting={ingesting}
                      repoUrl={repoUrl}
                      onExplain={handleExplainChunk}
                      activeArtifact={activeArtifact}
                    />
                  </section>
                </>
              )}
            </div>
          </div>
        )}
      </main>
      </div> {/* End dash-content */}

      {/* History Modal Overlay */}
      {isHistoryModalOpen && (
        <div className="history-modal-backdrop" onClick={() => setIsHistoryModalOpen(false)}>
          <div className="history-modal" onClick={e => e.stopPropagation()}>
            <div className="history-modal-header">
              <div className="history-search-wrapper">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="history-search-icon">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input 
                  type="text" 
                  className="history-search-input" 
                  placeholder="Search chats" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="history-modal-body">
              <div className="history-modal-title">Recent</div>
              {filteredRepos.length === 0 ? (
                <div className="history-empty">No chats found.</div>
              ) : (
                filteredRepos.map(repo => (
                  <button key={repo.id} className="history-item" onClick={() => loadRepository(repo)}>
                    <span className="history-item-name">{repo.name}</span>
                    <span className="history-item-date">
                      {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(repo.indexedAt)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .dash-shell {
          height: 100vh;
          width: 100vw;
          display: flex;
          background: #000000;
          overflow: hidden;
        }
        /* ── Premium Rail (Gemini-style, no border) ── */
        .dash-rail {
          width: 64px;
          background: transparent;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px 0 20px;
          gap: 4px;
          flex-shrink: 0;
          z-index: 50;
        }
        .rail-logo {
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
          border-radius: 12px;
          background: radial-gradient(circle at 40% 40%, rgba(167,139,250,0.13), transparent 70%);
        }
        .rail-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          padding: 0 10px;
        }
        .rail-btn {
          position: relative;
          background: transparent;
          border: none;
          color: color-mix(in srgb, var(--text) 45%, transparent);
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: color 0.18s, background 0.18s, box-shadow 0.18s;
          margin: 2px 0;
        }
        .rail-btn:hover {
          color: var(--text);
          background: color-mix(in srgb, var(--text) 7%, transparent);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 6%, transparent);
        }
        .rail-btn:hover .rail-tooltip {
          opacity: 1;
          transform: translateX(0);
          pointer-events: auto;
        }
        /* Floating tooltip */
        .rail-tooltip {
          position: absolute;
          left: calc(100% + 12px);
          top: 50%;
          transform: translateY(-50%) translateX(-6px);
          background: color-mix(in srgb, var(--surface) 95%, var(--text) 10%);
          border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
          color: var(--text);
          font-size: 12px;
          font-weight: 500;
          padding: 5px 10px;
          border-radius: 8px;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s, transform 0.15s;
          z-index: 100;
          box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        }
        .dash-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .dash-topbar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 20px;
          height: 52px;
          flex-shrink: 0;
          background: transparent;
        }
        .dash-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.3px;
        }
        .dash-sidebar-toggle {
          background: none;
          border: none;
          padding: 4px;
          cursor: pointer;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s;
        }
        .dash-sidebar-toggle:hover {
          background: color-mix(in srgb, var(--text) 10%, transparent);
        }
        .dash-namespace {
          font-size: 11.5px;
          color: color-mix(in srgb, var(--accent) 80%, var(--text));
          background: color-mix(in srgb, var(--accent) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
          border-radius: 5px;
          padding: 2px 8px;
          font-family: var(--font-mono);
          max-width: 240px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dash-sync-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: 1px solid color-mix(in srgb, var(--text) 15%, transparent);
          color: color-mix(in srgb, var(--text) 70%, transparent);
          font-size: 12px;
          font-weight: 500;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .dash-sync-btn:hover {
          color: var(--text);
          background: color-mix(in srgb, var(--text) 8%, transparent);
          border-color: color-mix(in srgb, var(--text) 30%, transparent);
        }
        .dash-signout {
          margin-left: auto;
          background: none;
          border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
          color: color-mix(in srgb, var(--text) 45%, transparent);
          font-size: 12px;
          padding: 5px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
          font-family: var(--font-sans);
        }
        .dash-signout:hover {
          color: var(--text);
          border-color: color-mix(in srgb, var(--text) 25%, transparent);
        }
        .dash-main {
          flex: 1;
          display: flex;
          overflow: hidden;
        }
        .dash-importer-view {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          animation: view-fade 0.3s ease-out both;
        }
        .dash-chat-view {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: view-fade 0.3s ease-out both;
        }
        @keyframes view-fade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .repo-chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          flex-shrink: 0;
          z-index: 10;
        }
        .repo-chat-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .repo-connected-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #4ade80;
          box-shadow: 0 0 6px rgba(74, 222, 128, 0.6);
          flex-shrink: 0;
        }
        .repo-chat-name {
          font-size: 14px;
          font-weight: 500;
          color: #fff;
          letter-spacing: -0.02em;
        }
        .repo-chat-indexed {
          font-size: 11px;
          font-weight: 500;
          color: #4ade80;
          background: rgba(74, 222, 128, 0.08);
          border: 1px solid rgba(74, 222, 128, 0.15);
          border-radius: 4px;
          padding: 1px 7px;
          letter-spacing: 0.02em;
        }
        .repo-switch-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          color: #737373;
          font-size: 13px;
          font-family: inherit;
          cursor: pointer;
          padding: 5px 8px;
          border-radius: 6px;
          transition: color 0.15s, background 0.15s;
        }
        .repo-switch-btn:hover {
          color: #fff;
          background: rgba(255,255,255,0.05);
        }
        
        /* History Modal */
        .history-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          z-index: 1000;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 10vh;
        }
        .history-modal {
          width: 100%;
          max-width: 640px;
          background: var(--canvas);
          border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
          border-radius: 24px;
          box-shadow: 0 24px 48px rgba(0,0,0,0.5);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          max-height: 80vh;
        }
        .history-modal-header {
          padding: 24px 24px 16px 24px;
        }
        .history-search-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          background: color-mix(in srgb, var(--text) 6%, transparent);
          border-radius: 100px;
          padding: 0 16px;
        }
        .history-search-icon {
          color: color-mix(in srgb, var(--text) 40%, transparent);
          margin-right: 12px;
        }
        .history-search-input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text);
          font-size: 15px;
          padding: 16px 0;
          outline: none;
        }
        .history-search-input::placeholder {
          color: color-mix(in srgb, var(--text) 40%, transparent);
        }
        .history-modal-body {
          padding: 0 24px 24px 24px;
          overflow-y: auto;
        }
        .history-modal-title {
          font-size: 13px;
          color: color-mix(in srgb, var(--text) 50%, transparent);
          margin-bottom: 12px;
          padding-left: 8px;
        }
        .history-empty {
          color: color-mix(in srgb, var(--text) 40%, transparent);
          padding: 24px 8px;
          text-align: center;
        }
        .history-item {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 16px;
          background: transparent;
          border: none;
          color: var(--text);
          font-size: 14px;
          cursor: pointer;
          border-radius: 12px;
          transition: background 0.15s;
        }
        .history-item:hover {
          background: color-mix(in srgb, var(--text) 6%, transparent);
        }
        .history-item-name {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: left;
        }
        .history-item-date {
          font-size: 12.5px;
          color: color-mix(in srgb, var(--text) 40%, transparent);
          flex-shrink: 0;
          margin-left: 16px;
        }
        .dash-panel {
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .dash-left-full {
          flex: 1;
          transition: flex 0.3s ease;
        }
        .dash-left-split {
          flex: 1;
          transition: flex 0.3s ease;
        }
        .dash-right {
          flex: 1;
          position: relative;
          background: var(--surface);
        }
        .dash-right-header {
          position: absolute;
          top: 10px;
          right: 14px;
          z-index: 10;
        }
        .dash-close-panel {
          background: color-mix(in srgb, var(--text) 5%, transparent);
          border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
          color: color-mix(in srgb, var(--text) 60%, transparent);
          border-radius: 6px;
          padding: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .dash-close-panel:hover {
          background: color-mix(in srgb, var(--text) 10%, transparent);
          color: var(--text);
        }
        .dash-divider {
          width: 1px;
          background: color-mix(in srgb, var(--text) 5%, transparent);
          flex-shrink: 0;
        }
        .dash-loading {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--canvas);
        }
        .login-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid color-mix(in srgb, var(--text) 12%, transparent);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
