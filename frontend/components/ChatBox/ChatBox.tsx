"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Message } from "@/app/dashboard/page";

interface ChatBoxProps {
  messages: Message[];
  streaming: boolean;
  ingesting: boolean;
  ingestStatus: string;
  error: string;
  namespace: string;
  onIngest: (repoUrl: string) => void;
  onSendMessage: (query: string) => void;
  injectPromptRef: React.MutableRefObject<((prompt: string) => void) | null>;
  onArtifactClick?: (type: string, title: string, content: string, startLine?: number) => void;
  messagesUsed?: number;
  messageLimit?: number;
  onUnlockEasterEgg?: () => void;
}

// ---------------------------------------------------------------------------
// Tech Skeleton — mimics lines of code / block structures
// ---------------------------------------------------------------------------
function TechSkeleton() {
  return (
    <div className="skeleton-root">
      {/* Simulated file header */}
      <div className="skeleton-file-header">
        <div className="skel skel-icon skeleton-shimmer" />
        <div className="skel skel-fname skeleton-shimmer" />
        <div className="skel skel-badge skeleton-shimmer" style={{ marginLeft: "auto" }} />
      </div>
      {/* Simulated code lines */}
      {[90, 60, 75, 45, 85, 55, 70].map((w, i) => (
        <div key={i} className="skeleton-line-row">
          <div className="skel skel-linenum skeleton-shimmer" />
          <div className="skel skel-code skeleton-shimmer" style={{ width: `${w}%` }} />
        </div>
      ))}
      {/* Block spacing */}
      <div style={{ height: 12 }} />
      <div className="skeleton-file-header">
        <div className="skel skel-icon skeleton-shimmer" />
        <div className="skel skel-fname skeleton-shimmer" style={{ width: "35%" }} />
      </div>
      {[50, 80, 65, 40].map((w, i) => (
        <div key={i} className="skeleton-line-row">
          <div className="skel skel-linenum skeleton-shimmer" />
          <div className="skel skel-code skeleton-shimmer" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown message renderer
// ---------------------------------------------------------------------------
function MarkdownMessage({ content, isStreaming, onArtifactClick }: { content: string; isStreaming?: boolean; onArtifactClick?: (type: string, title: string, content: string, startLine?: number) => void }) {
  // Pre-process raw <artifact> XML tags into a custom markdown code block format 
  // so ReactMarkdown can easily parse them without needing rehype-raw.
  // We use 5 backticks to ensure that if the LLM generates markdown containing
  // standard 3-backtick code blocks, it doesn't prematurely close our artifact block!
  const processedContent = content.replace(
    /<artifact([^>]*)>([\s\S]*?)(?:<\/artifact>|$)/g,
    (match, attrStr, innerContent) => {
      const typeMatch = attrStr.match(/type="([^"]+)"/);
      const titleMatch = attrStr.match(/title="([^"]+)"/);
      const startLineMatch = attrStr.match(/start_line="([^"]+)"/);

      const type = typeMatch ? typeMatch[1] : "code";
      const title = titleMatch ? titleMatch[1] : "Artifact";
      const startLine = startLineMatch ? startLineMatch[1] : "";

      return `\n\`\`\`\`\`artifact|${type}|${title}|${startLine}\n${innerContent}\n\`\`\`\`\`\n`;
    }
  );

  return (
    <div className={`prose-chat${isStreaming ? " streaming-msg" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Intercept <pre> to avoid double borders around custom blocks
          pre({ children, ...props }) {
            const hasCustomBlock = React.Children.toArray(children).some(
              (child) =>
                React.isValidElement(child) &&
                typeof (child.props as any).className === "string" &&
                (child.props as any).className.includes("language-")
            );
            if (hasCustomBlock) {
              return <>{children}</>;
            }
            return <pre {...props}>{children}</pre>;
          },
          // Syntax-highlighted code blocks
          code({ className, children, ...props }) {
            // Check for our custom artifact smart button
            const artifactMatch = /language-artifact\|([^\|]+)\|([^\|]+)(?:\|([^\|]*))?/.exec(className ?? "");
            if (artifactMatch) {
              const type = artifactMatch[1];
              const title = artifactMatch[2];
              const startLineStr = artifactMatch[3];
              const startLine = startLineStr ? parseInt(startLineStr, 10) : undefined;
              const innerContent = String(children).replace(/\n$/, "");
              const handleDownload = (e: React.MouseEvent) => {
                e.stopPropagation();
                const blob = new Blob([innerContent], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = title;
                a.click();
                URL.revokeObjectURL(url);
              };

              const ext = title.split('.').pop()?.toUpperCase() || 'TXT';
              let subtitle = `Code · ${ext}`;
              if (type === "markdown") subtitle = "Markdown Document";
              else if (type === "existing_code") subtitle = `Existing Code · ${ext}`;
              else if (type === "new_code") subtitle = `Fixed Code · ${ext}`;
              else if (type === "error") subtitle = `Error Analysis · ${ext}`;

              return (
                <div
                  className="chat-artifact-card"
                  onClick={() => onArtifactClick?.(type, title, innerContent, startLine)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="chat-artifact-icon-box">
                    {type === "markdown" ? "📄" : "</>"}
                  </div>
                  <div className="chat-artifact-info">
                    <span className="chat-artifact-title">{title}</span>
                    <span className="chat-artifact-subtitle">{subtitle}</span>
                  </div>
                  <button
                    className="chat-artifact-download-btn"
                    onClick={handleDownload}
                    type="button"
                  >
                    Download
                  </button>
                </div>
              );
            }

            const match = /language-(\w+)/.exec(className ?? "");
            const isBlock = !!match;
            if (isBlock) {
              return (
                <div className="code-block-wrap">
                  <div className="code-block-header">
                    <span className="code-lang-badge">{match![1]}</span>
                  </div>
                  <SyntaxHighlighter
                    language={match![1]}
                    style={vscDarkPlus}
                    customStyle={{
                      margin: 0,
                      padding: "14px 16px",
                      background: "#0d0d10",
                      fontSize: "13.5px",
                      lineHeight: "1.7",
                      fontFamily: "var(--font-mono)",
                      borderRadius: 0,
                    }}
                    showLineNumbers
                    wrapLongLines={false}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                </div>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // Tables
          table({ children }) {
            return (
              <div style={{ overflowX: "auto", overflowY: "hidden", margin: "0.75em 0" }}>
                <table style={{ margin: 0 }}>{children}</table>
              </div>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
      {isStreaming && <span className="chatbox-cursor" aria-hidden="true">▋</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ChatBox
// ---------------------------------------------------------------------------
export default function ChatBox({
  messages,
  streaming,
  ingesting,
  ingestStatus,
  error,
  namespace,
  onIngest,
  onSendMessage,
  injectPromptRef,
  onArtifactClick,
  messagesUsed = 0,
  messageLimit = 5,
  onUnlockEasterEgg,
}: ChatBoxProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [showIngestPanel, setShowIngestPanel] = useState(true);
  const [indexSuccess, setIndexSuccess] = useState(false);
  const [query, setQuery] = useState("");
  
  // Easter egg states
  const [showEasterEggInput, setShowEasterEggInput] = useState(false);
  const [easterEggAnswer, setEasterEggAnswer] = useState("");
  const [easterEggError, setEasterEggError] = useState(false);
  const [showFunnyPopup, setShowFunnyPopup] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Expose inject prompt function to parent (for "Explain This").
  useEffect(() => {
    injectPromptRef.current = (prompt: string) => {
      setQuery(prompt);
    };
  }, [injectPromptRef]);

  // Elapsed timer during ingestion.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!ingesting) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [ingesting]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  // Collapse ingest panel with success flash once namespace is set
  useEffect(() => {
    if (namespace && showIngestPanel) {
      setIndexSuccess(true);
      const t = setTimeout(() => {
        setShowIngestPanel(false);
        setIndexSuccess(false);
      }, 1200);
      return () => clearTimeout(t);
    }
    if (!namespace) {
      setShowIngestPanel(true);
    }
  }, [namespace]);

  // Auto-resize textarea logic
  const handleQueryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  // Reset textarea height when query is cleared
  useEffect(() => {
    if (!query && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [query]);

  const handleEasterEggSubmit = () => {
    if (easterEggAnswer.trim().toLowerCase() === "aariz") {
      if (messageLimit > 5) {
        setShowFunnyPopup(true);
      } else {
        setEasterEggError(false);
        setShowEasterEggInput(false);
        if (onUnlockEasterEgg) {
          onUnlockEasterEgg();
        }
      }
    } else {
      setEasterEggError(true);
    }
  };

  function handleIngestSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = repoUrl.trim();
    if (!trimmed || ingesting) return;
    onIngest(trimmed);
  }

  function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || streaming) return;
    onSendMessage(trimmed);
    setQuery("");
  }

  function handleQueryKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <div className="chatbox-root">
      {/* Messages area */}
      <div className="chatbox-messages" role="log" aria-live="polite">
        <div className="chatbox-messages-inner">
          {ingesting ? (
          // Sleek text-based live indexing indicator
          <div className="chatbox-live-indexing">
            <h3 className="live-indexing-header">
              <span className="live-indexing-spin" />
              Ingesting Repository...
            </h3>
            <div className="live-indexing-steps">
              {["Fetching source code from upstream...", "Parsing abstract syntax trees (AST)...", "Generating semantic code embeddings...", "Vectorizing shards to Pinecone DB...", "Finalizing context mapping..."].map((step, i) => {
                const isDone = elapsed > i * 3;
                const isActive = elapsed === i * 3 || (elapsed > (i-1)*3 && !isDone);
                return (
                  <div key={i} className={`live-indexing-step ${isDone ? "done" : isActive ? "active" : "pending"}`}>
                    <span className="live-step-icon">
                      {isDone ? "✓" : isActive ? "●" : "○"}
                    </span>
                    {step}
                  </div>
                );
              })}
            </div>
            <p className="live-indexing-time">{elapsed}s elapsed</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="chatbox-empty">
            {namespace ? (
              <>
                <div className="chatbox-ready-icon">✓</div>
                <p className="chatbox-ready-title">Repository indexed!</p>
                <p className="chatbox-ready-sub">Ask anything about your codebase below.</p>
              </>
            ) : (
              <>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.2" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p>Index a repository above to get started.</p>
              </>
            )}
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`chatbox-message chatbox-message--${msg.role}`}
            >
              <span className="chatbox-role-label">
                {msg.role === "user" ? "You" : "RepoMind"}
              </span>
              {msg.role === "assistant" ? (
                <MarkdownMessage
                  content={msg.content || (msg.streaming ? "" : "…")}
                  isStreaming={msg.streaming && !!msg.content}
                  onArtifactClick={onArtifactClick}
                />
              ) : (
                <p className="chatbox-message-text">{msg.content}</p>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* MVP Premium Upgrade Banner */}
      {messagesUsed >= messageLimit && (
        <div className="premium-upgrade-banner">
          <p className="premium-title">🔒 Account limit reached</p>
          {messageLimit > 5 ? (
            <div className="premium-funny-popup">
              <p>You thought I could build a RAG and leave a bug 😄</p>
              <p style={{ opacity: 0.8, fontSize: "13px", marginTop: "4px" }}>Stay tuned devs more limits coming soon 😉</p>
            </div>
          ) : (
            <>
              <p className="premium-desc">This is currently an MVP. Want 5 additional messages to test?</p>
              {!showEasterEggInput ? (
                <button className="premium-unlock-btn" type="button" onClick={() => setShowEasterEggInput(true)}>
                  Unlock 5 more messages
                </button>
              ) : (
                <div className="premium-easter-egg">
                  <p>Write the name of the developer who made this:</p>
                  <div className="premium-easter-egg-input-group">
                    <input 
                      type="text" 
                      value={easterEggAnswer} 
                      onChange={e => setEasterEggAnswer(e.target.value)} 
                      placeholder="Developer's name"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleEasterEggSubmit()}
                    />
                    <button type="button" onClick={handleEasterEggSubmit}>Submit</button>
                  </div>
                  {easterEggError && <span className="premium-error">Incorrect name. Try again!</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Query input */}
      <form className="chatbox-input-form" onSubmit={handleChatSubmit}>
        <div className="chatbox-input-inner">
          <textarea
            ref={textareaRef}
            id="query-input"
            className={`chatbox-textarea ${messagesUsed >= messageLimit ? 'opacity-50 cursor-not-allowed' : ''}`}
            placeholder={
              messagesUsed >= messageLimit
                ? `🔒 Account limit reached (${messageLimit}/${messageLimit} messages). Premium coming soon!`
                : namespace
                ? "Ask about your repo"
                : "Index a repo first"
            }
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleQueryKeyDown}
            disabled={streaming || !namespace || messagesUsed >= messageLimit}
            rows={1}
            aria-label="Your question"
          />
          <button
            id="send-btn"
            className={`chatbox-send-btn${query.trim() && messagesUsed < messageLimit ? " send-btn--active" : ""}`}
            type="submit"
            disabled={streaming || !query.trim() || !namespace || messagesUsed >= messageLimit}
            aria-label="Send message"
          >
            {streaming ? (
              <span className="btn-spinner" aria-hidden="true" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            )}
          </button>
        </div>
      </form>

      <style>{`
        .chatbox-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: #000000;
        }

        /* ── Premium MVP Upgrade UI ── */
        .premium-upgrade-banner {
          margin: 0 auto 16px;
          width: calc(100% - 32px);
          max-width: 900px;
          background: linear-gradient(145deg, rgba(30, 30, 35, 0.9), rgba(15, 15, 20, 0.95));
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          animation: slide-up-fade 0.4s ease-out;
        }
        @keyframes slide-up-fade {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .premium-title {
          font-weight: 600;
          font-size: 16px;
          color: #fff;
          margin: 0 0 4px;
        }
        .premium-desc {
          font-size: 14px;
          color: rgba(255,255,255,0.6);
          margin: 0 0 16px;
        }
        .premium-unlock-btn {
          background: #ffffff;
          color: #000000;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 500;
          font-size: 13px;
          cursor: pointer;
          transition: transform 0.1s, opacity 0.2s;
        }
        .premium-unlock-btn:hover {
          opacity: 0.9;
          transform: scale(1.02);
        }
        .premium-unlock-btn:active {
          transform: scale(0.98);
        }
        .premium-easter-egg {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          width: 100%;
        }
        .premium-easter-egg p {
          font-size: 13px;
          color: rgba(255,255,255,0.8);
          margin: 0;
        }
        .premium-easter-egg-input-group {
          display: flex;
          gap: 8px;
          width: 100%;
          max-width: 320px;
        }
        .premium-easter-egg-input-group input {
          flex: 1;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          padding: 8px 12px;
          color: white;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }
        .premium-easter-egg-input-group input:focus {
          border-color: rgba(255, 255, 255, 0.5);
        }
        .premium-easter-egg-input-group button {
          background: #333;
          color: white;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 0 16px;
          border-radius: 6px;
          font-weight: 500;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .premium-easter-egg-input-group button:hover {
          background: #444;
        }
        .premium-error {
          font-size: 12px;
          color: #ff6b6b;
          animation: fade-in 0.3s ease;
        }
        .premium-funny-popup {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 8px 0;
          color: #ffd700;
          font-weight: 500;
          font-size: 14px;
          animation: fade-in 0.4s ease;
        }
        .premium-funny-popup p {
          margin: 0;
        }
        .chatbox-messages {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          width: 100%;
        }
        .chatbox-messages-inner {
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
          padding: 32px 16px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          min-width: 0;
        }
        .chatbox-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: color-mix(in srgb, var(--text) 22%, transparent);
          font-size: 13px;
          text-align: center;
          padding: 40px 20px;
        }

        /* ── Sleek Live Indexing UI ── */
        .chatbox-live-indexing {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: 32px 0;
          animation: fade-in 0.5s ease-out;
          font-family: var(--font-sans);
        }
        .live-indexing-header {
          font-size: 16px;
          font-weight: 600;
          color: #fafafa;
          display: flex;
          align-items: center;
          gap: 14px;
          margin: 0 0 28px 0;
          letter-spacing: -0.01em;
        }
        .live-indexing-spin {
          display: inline-block;
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.1);
          border-top-color: #a855f7;
          border-radius: 50%;
          animation: spin 0.75s linear infinite;
        }
        .live-indexing-steps {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 28px;
          font-family: var(--font-mono), monospace;
          font-size: 13.5px;
        }
        .live-indexing-step {
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.3s ease;
        }
        .live-indexing-step.done { color: #52525b; }
        .live-indexing-step.active { color: #d8b4fe; text-shadow: 0 0 14px rgba(216,180,254,0.35); font-weight: 500; }
        .live-indexing-step.pending { color: #27272a; }
        
        .live-step-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          font-size: 14px;
        }
        .live-indexing-step.active .live-step-icon {
          animation: pulse-glow-icon 1.5s ease-in-out infinite;
        }
        .live-indexing-time {
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          color: #52525b;
          margin: 0;
          letter-spacing: 0.02em;
        }
        
        @keyframes pulse-glow-icon {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; text-shadow: 0 0 12px #d8b4fe; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Post-indexing ready state */
        .chatbox-ready-icon {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: rgba(34, 197, 94, 0.12);
          border: 1.5px solid rgba(34, 197, 94, 0.3);
          color: #22c55e;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .chatbox-ready-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text);
          font-family: var(--font-sans);
        }
        .chatbox-ready-sub {
          font-size: 12.5px;
          color: color-mix(in srgb, var(--text) 35%, transparent);
          font-family: var(--font-sans);
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(255,255,255,0.2); }
          50%       { opacity: 0.8; box-shadow: 0 0 0 4px rgba(255,255,255,0); }
        }
        .chatbox-message {
          display: flex;
          flex-direction: column;
          gap: 6px;
          animation: fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;
          width: 100%;
        }
        .chatbox-message--user {
          align-items: flex-end;
        }
        .chatbox-message--assistant {
          align-items: flex-start;
        }
        .chatbox-role-label {
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.7px;
          color: color-mix(in srgb, var(--text) 30%, transparent);
          font-family: var(--font-sans);
        }
        .chatbox-message--assistant .chatbox-role-label {
          color: color-mix(in srgb, var(--accent) 70%, transparent);
        }
        .chatbox-message--user .chatbox-message-text {
          background: color-mix(in srgb, var(--surface) 80%, transparent);
          border: 1px solid color-mix(in srgb, var(--text) 6%, transparent);
          padding: 12px 16px;
          border-radius: 16px;
          border-top-right-radius: 4px;
          text-align: left;
          max-width: 85%;
        }
        .chatbox-message-text {
          font-size: 15px;
          line-height: 1.75;
          color: var(--text);
          white-space: pre-wrap;
          word-break: break-word;
          overflow-wrap: break-word;
          font-family: var(--font-sans);
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
        }
        .streaming-msg .chatbox-cursor {
          display: inline-block;
          animation: blink 1s step-end infinite;
          color: color-mix(in srgb, var(--accent) 70%, transparent);
          margin-left: 1px;
        }
        .chatbox-cursor {
          display: inline-block;
          animation: blink 1s step-end infinite;
          color: color-mix(in srgb, var(--accent) 70%, transparent);
          margin-left: 1px;
        }
        /* Code block inside markdown */
        .code-block-wrap {
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.08);
          margin: 0.85em 0;
          max-width: 100%;
          min-width: 0;
        }
        .code-block-wrap pre {
          max-width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
        }
        .code-block-header {
          display: flex;
          align-items: center;
          padding: 6px 14px;
          background: #0a0a0a;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .code-lang-badge {
          font-size: 10px;
          font-family: var(--font-mono);
          font-weight: 500;
          color: color-mix(in srgb, var(--text) 45%, transparent);
          text-transform: lowercase;
          letter-spacing: 0.04em;
        }
        /* New Artifact Chat Card (Claude style) */
        .chat-artifact-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #0a0a0a;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 12px;
          padding: 12px 14px;
          margin: 12px 0;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
          width: 100%;
          font-family: var(--font-sans);
        }
        .chat-artifact-card:hover {
          background: #141414;
          border-color: rgba(255,255,255,0.15);
        }
        .chat-artifact-icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 48px;
          background: #141414;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.1);
          font-size: 16px;
          color: #a1a1aa; /* zinc-400 */
          font-family: var(--font-mono);
          font-weight: 600;
          flex-shrink: 0;
        }
        .chat-artifact-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          min-width: 0;
        }
        .chat-artifact-title {
          font-size: 14.5px;
          font-weight: 600;
          color: #f4f4f5; /* zinc-100 */
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .chat-artifact-subtitle {
          font-size: 12px;
          color: #a1a1aa; /* zinc-400 */
        }
        .chat-artifact-download-btn {
          background: transparent;
          border: 1px solid #3f3f46;
          border-radius: 6px;
          color: #e4e4e7;
          padding: 6px 12px;
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .chat-artifact-download-btn:hover {
          background: #3f3f46;
          color: #fff;
        }
        .chatbox-input-form {
          display: flex;
          gap: 8px;
          padding: 8px 20px 20px;
          flex-shrink: 0;
          align-items: flex-end;
          background: #000000;
        }
        .chatbox-input-inner {
          display: flex;
          align-items: flex-end;
          gap: 12px;
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
          background: #181818;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 24px;
          padding: 8px 10px 8px 18px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s, border-radius 0.2s;
        }
        .chatbox-input-inner:focus-within {
          border-color: rgba(255,255,255,0.12);
          background: #1c1c1c;
          box-shadow: 0 8px 30px rgba(0,0,0,0.6);
        }
        .chatbox-textarea {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text);
          padding: 10px 0;
          font-size: 14.5px;
          font-family: var(--font-sans);
          resize: none;
          outline: none;
          line-height: 1.6;
          max-height: 78px;
          overflow-y: auto;
        }
        /* Hover-only scrollbar for textarea */
        .chatbox-textarea::-webkit-scrollbar {
          width: 5px;
          background: transparent;
        }
        .chatbox-textarea::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 10px;
        }
        .chatbox-textarea:hover::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
        }
        .chatbox-textarea:focus { outline: none; }
        .chatbox-textarea::placeholder {
          color: rgba(255,255,255,0.2);
          font-size: 13px;
        }
        .chatbox-textarea:disabled { opacity: 0.35; }
        .chatbox-send-btn {
          background: #2a2a2a;
          color: rgba(255,255,255,0.3);
          border: none;
          border-radius: 50%;
          width: 38px;
          height: 38px;
          min-width: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.2s, color 0.2s, transform 0.1s;
          align-self: flex-end;
          margin-bottom: 2px;
        }
        .chatbox-send-btn.send-btn--active {
          background: #ffffff;
          color: #000000;
        }
        .chatbox-send-btn.send-btn--active:hover {
          background: #f0f0f0;
          transform: scale(1.05);
        }
        .chatbox-send-btn:active:not(:disabled) { transform: scale(0.92); }
        .chatbox-send-btn:disabled:not(.send-btn--active) { opacity: 0.2; cursor: not-allowed; }
        .btn-spinner {
          display: block;
          width: 14px;
          height: 14px;
          border: 2px solid rgba(0,0,0,0.15);
          border-top-color: var(--canvas);
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        /* ---- Tech Skeleton ---- */
        .skeleton-root {
          padding: 16px;
          background: var(--surface);
          border: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .skeleton-file-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .skeleton-line-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .skel { border-radius: 4px; height: 10px; }
        .skel-icon  { width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0; }
        .skel-fname { width: 45%; height: 11px; }
        .skel-badge { width: 48px; height: 18px; border-radius: 8px; }
        .skel-linenum { width: 20px; flex-shrink: 0; opacity: 0.4; }
        .skel-code  { height: 10px; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
