"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, ExternalLink, Lightbulb, Code2, FileCode2, Zap, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { CodeBlock } from "@/app/dashboard/page";

// ---------------------------------------------------------------------------
// Tech Skeleton for Evidence Board
// ---------------------------------------------------------------------------
function EvidenceSkeleton() {
  return (
    <div className="ev-skeleton-wrap">
      {[1, 2, 3].map((i) => (
        <div key={i} className="ev-skeleton-card">
          <div className="ev-skel-header">
            <div className="ev-skel ev-skel-icon skeleton-shimmer" />
            <div className="ev-skel ev-skel-fname skeleton-shimmer" />
            <div className="ev-skel ev-skel-score skeleton-shimmer" style={{ marginLeft: "auto" }} />
          </div>
          <div className="ev-skel-body">
            {[75, 55, 90, 40, 68].map((w, j) => (
              <div key={j} className="ev-skel-line-row">
                <div className="ev-skel ev-skel-linenum skeleton-shimmer" />
                <div className="ev-skel ev-skel-code skeleton-shimmer" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: infer language from filename extension
// ---------------------------------------------------------------------------
function inferLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "text";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rs: "rust", go: "go", java: "java",
    cpp: "cpp", c: "c", cs: "csharp", rb: "ruby",
    md: "markdown", json: "json", yaml: "yaml", yml: "yaml",
    toml: "toml", sh: "bash", bash: "bash", css: "css",
    html: "html", sql: "sql", graphql: "graphql",
  };
  return map[ext] ?? "text";
}

// ---------------------------------------------------------------------------
// Helper: clean code snippet (remove markdown backticks)
// ---------------------------------------------------------------------------
function cleanCodeBlock(code: string): { cleaned: string; newlinesTrimmed: number } {
  if (!code) return { cleaned: "", newlinesTrimmed: 0 };
  
  const leadingMatch = code.match(/^\s*/);
  const newlinesTrimmed = leadingMatch ? leadingMatch[0].split("\n").length - 1 : 0;
  
  let cleaned = code.trim();
  cleaned = cleaned.replace(/^```[a-zA-Z]*\r?\n/i, "");
  cleaned = cleaned.replace(/\r?\n```$/i, "");
  
  return { cleaned, newlinesTrimmed };
}

// ---------------------------------------------------------------------------
// Helper: construct GitHub deep-link
// ---------------------------------------------------------------------------
function buildGitHubUrl(repoUrl: string, filename: string, startLine?: number, codeLength?: number): string {
  try {
    const clean = repoUrl.replace(/\/$/, "").replace(/\.git$/, "");
    if (startLine !== undefined) {
      const endLine = startLine + (codeLength ?? 1) - 1;
      return `${clean}/blob/main/${filename}#L${startLine}-L${endLine}`;
    }
    return `${clean}/blob/main/${filename}`;
  } catch {
    return repoUrl;
  }
}

// ---------------------------------------------------------------------------
// Score badge color based on similarity
// ---------------------------------------------------------------------------
function scoreColor(score: number): string {
  if (score >= 0.8) return "#22c55e";
  if (score >= 0.6) return "#f59e0b";
  return "#94a3b8";
}

// ---------------------------------------------------------------------------
// Single Evidence Card
// ---------------------------------------------------------------------------
interface EvidenceCardProps {
  block: CodeBlock;
  index: number;
  repoUrl: string;
  onExplain: (filename: string, startLine: number, code: string) => void;
}

function EvidenceCard({ block, index, repoUrl, onExplain }: EvidenceCardProps) {
  const [copied, setCopied] = useState(false);
  const lang = inferLanguage(block.filename);
  const shortName = block.filename.split("/").pop() ?? block.filename;
  const dirPath = block.filename.includes("/")
    ? block.filename.substring(0, block.filename.lastIndexOf("/") + 1)
    : "";

  const { cleaned: cleanedCode, newlinesTrimmed } = cleanCodeBlock(block.code);
  const codeLinesCount = cleanedCode.split('\n').length;
  const actualStartLine = block.start_line !== undefined ? block.start_line + newlinesTrimmed : undefined;

  function handleCopy() {
    navigator.clipboard.writeText(cleanedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleViewGitHub() {
    const url = buildGitHubUrl(repoUrl, block.filename, actualStartLine, codeLinesCount);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleExplain() {
    onExplain(block.filename, actualStartLine ?? 1, cleanedCode);
  }

  return (
    <motion.div
      className="ev-card"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Sticky card header */}
      <div className="ev-card-header">
        <FileCode2 size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <div className="ev-file-path">
          {dirPath && <span className="ev-dir-path">{dirPath}</span>}
          <span className="ev-file-name">{shortName}</span>
        </div>
        {actualStartLine !== undefined && (
          <span className="ev-line-badge">L{actualStartLine}</span>
        )}
        {block.score !== undefined && (
          <span
            className="ev-score-badge"
            style={{ color: scoreColor(block.score) }}
            title={`Similarity score: ${block.score}`}
          >
            {Math.round(block.score * 100)}%
          </span>
        )}

        {/* Action Bar */}
        <div className="ev-action-bar">
          <button
            className={`ev-action-btn${copied ? " ev-action-btn--success" : ""}`}
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy code"}
            aria-label="Copy code"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span className="ev-action-label">{copied ? "Copied" : "Copy"}</span>
          </button>

          <button
            className="ev-action-btn"
            onClick={handleViewGitHub}
            title="View in GitHub"
            aria-label="View in GitHub"
            disabled={!repoUrl}
          >
            <ExternalLink size={13} />
            <span className="ev-action-label">GitHub</span>
          </button>

          <button
            className="ev-action-btn ev-action-btn--explain"
            onClick={handleExplain}
            title="Explain this chunk"
            aria-label="Explain this chunk"
          >
            <Lightbulb size={13} />
            <span className="ev-action-label">Explain</span>
          </button>
        </div>
      </div>

      {/* Syntax-highlighted code */}
      <div className="ev-code-wrap">
        <SyntaxHighlighter
          language={lang}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: "14px 16px",
            background: "#0a0a0d",
            fontSize: "12px",
            lineHeight: "1.7",
            fontFamily: "var(--font-mono)",
          }}
          showLineNumbers
          startingLineNumber={actualStartLine ?? 1}
          wrapLongLines={false}
        >
          {cleanedCode}
        </SyntaxHighlighter>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Artifact Card (for rendering LLM-generated code, errors, or markdown)
// ---------------------------------------------------------------------------
interface ArtifactCardProps {
  type: string;
  title: string;
  content: string;
  repoUrl: string;
  startLine?: number;
  onExplain: (filename: string, startLine: number, code: string) => void;
}

function ArtifactCard({ type, title, content, repoUrl, startLine, onExplain }: ArtifactCardProps) {
  const [copied, setCopied] = useState(false);
  const cleanedContentObj = type === "markdown" ? { cleaned: content, newlinesTrimmed: 0 } : cleanCodeBlock(content);
  const cleanedContent = cleanedContentObj.cleaned;
  const actualStartLine = startLine !== undefined ? startLine + cleanedContentObj.newlinesTrimmed : undefined;
  const baseFilename = title.split(" - ")[0].trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = title;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleViewGitHub = () => {
    if (!repoUrl) return;
    const url = repoUrl.replace(/\/$/, "");
    if (actualStartLine !== undefined) {
      const codeLinesCount = cleanedContent.split('\n').length;
      const endLine = actualStartLine + codeLinesCount - 1;
      window.open(`${url}/blob/main/${baseFilename}#L${actualStartLine}-L${endLine}`, "_blank");
    } else {
      window.open(`${url}/blob/main/${baseFilename}`, "_blank");
    }
  };

  const handleExplain = () => {
    onExplain(baseFilename, actualStartLine ?? 1, cleanedContent);
  };

  const isError = type === "error";
  const isMarkdown = type === "markdown";

  if (isMarkdown) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="ev-artifact-markdown"
      >
          <div className="ev-markdown-header">
          <div className="ev-markdown-title">
            <span style={{ fontSize: "20px" }}>📄</span>
            <span>{title}</span>
          </div>
          <div className="ev-markdown-actions">
            <button
              className="md-btn"
              onClick={handleCopy}
              title="Copy content"
            >
              {copied ? <Check size={14} style={{ color: "#22c55e" }} /> : <Copy size={14} />}
              <span>{copied ? "Copied" : "Copy Text"}</span>
            </button>
            <button
              className="md-btn md-btn--primary"
              onClick={handleDownload}
              title="Download as markdown"
            >
              <Download size={14} />
              <span>Download </span>
            </button>
          </div>
        </div>
        <div className="ev-markdown-container">
          <div className="prose-github ev-markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`ev-card ${isError ? "ev-card--error" : ""}`}
    >
      <div className="ev-card-header">
        <div className="ev-file-info">
          {isError ? (
            <span style={{ fontSize: "14px", marginRight: 2, color: "#f87171" }}>🐛</span>
          ) : (
            <FileCode2 size={13} style={{ color: "var(--accent)" }} />
          )}
          <span className="ev-filename">{title}</span>
        </div>

        <div className="ev-action-bar">
          <button
            className="ev-action-btn"
            onClick={handleCopy}
            title="Copy content"
            aria-label="Copy content"
          >
            {copied ? <Check size={13} style={{ color: "#22c55e" }} /> : <Copy size={13} />}
            <span className="ev-action-label">{copied ? "Copied" : "Copy"}</span>
          </button>

          {type === "existing_code" && (
            <>
              <button
                className="ev-action-btn"
                onClick={handleViewGitHub}
                title="View in GitHub"
                aria-label="View in GitHub"
                disabled={!repoUrl}
              >
                <ExternalLink size={13} />
                <span className="ev-action-label">GitHub</span>
              </button>

              <button
                className="ev-action-btn ev-action-btn--explain"
                onClick={handleExplain}
                title="Explain this code"
                aria-label="Explain code"
              >
                <Lightbulb size={13} />
                <span className="ev-action-label">Explain</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="ev-code-wrap">
        <SyntaxHighlighter
          language={baseFilename.split(".").pop() || "text"}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: "14px 16px",
            background: isError ? "rgba(248, 113, 113, 0.03)" : "#0a0a0d",
            fontSize: "12px",
            lineHeight: "1.7",
            fontFamily: "var(--font-mono)",
          }}
          showLineNumbers={actualStartLine !== undefined}
          startingLineNumber={actualStartLine ?? 1}
          wrapLongLines={false}
        >
          {cleanedContent}
        </SyntaxHighlighter>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Evidence Board (root component — replaces old CodeViewer)
// ---------------------------------------------------------------------------
interface EvidenceBoardProps {
  blocks: CodeBlock[];
  ingesting: boolean;
  repoUrl: string;
  onExplain: (filename: string, startLine: number, code: string) => void;
  activeArtifact?: { type: string; title: string; content: string; startLine?: number } | null;
}

export default function EvidenceBoard({ blocks, ingesting, repoUrl, onExplain, activeArtifact }: EvidenceBoardProps) {
  return (
    <div className="ev-root">
      {/* Panel header */}
      <div className="ev-header">
        <Zap size={14} style={{ color: "var(--accent)" }} />
        <span className="ev-header-title">
          {activeArtifact ? "Artifact View" : "Evidence Board"}
        </span>
        {!activeArtifact && blocks.length > 0 && (
          <span className="ev-count-badge">{blocks.length} context{blocks.length !== 1 ? "s" : ""}</span>
        )}
        {!activeArtifact && blocks.length > 0 && (
          <span className="ev-trust-pill">
            <Code2 size={10} />
            Grounded
          </span>
        )}
      </div>

      <div className={`ev-scroll-area ${activeArtifact && activeArtifact.type === 'markdown' ? 'ev-scroll-area-md' : ''}`}>
        {activeArtifact ? (
          <div className="ev-cards">
            <AnimatePresence mode="popLayout">
              <ArtifactCard
                key={activeArtifact.title + activeArtifact.type}
                type={activeArtifact.type}
                title={activeArtifact.title}
                content={activeArtifact.content}
                repoUrl={repoUrl}
                startLine={activeArtifact.startLine}
                onExplain={onExplain}
              />
            </AnimatePresence>
          </div>
        ) : ingesting ? (
          <EvidenceSkeleton />
        ) : blocks.length === 0 ? (
          <div className="ev-empty">
            <div className="ev-empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <p className="ev-empty-title">Evidence will appear here</p>
            <p className="ev-empty-sub">
              Ask a question and the AI's retrieved code context will populate here as interactive, actionable cards.
            </p>
          </div>
        ) : (
          <div className="ev-cards">
            <AnimatePresence mode="popLayout">
              {blocks.map((block, i) => (
                <EvidenceCard
                  key={block.id}
                  block={block}
                  index={i}
                  repoUrl={repoUrl}
                  onExplain={onExplain}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <style>{`
        .ev-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--canvas);
        }
        .ev-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 18px;
          border-bottom: 1px solid color-mix(in srgb, var(--text) 7%, transparent);
          flex-shrink: 0;
        }
        .ev-header-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: color-mix(in srgb, var(--text) 35%, transparent);
          font-family: var(--font-sans);
        }
        .ev-count-badge {
          font-size: 10.5px;
          color: color-mix(in srgb, var(--accent) 90%, var(--text));
          background: color-mix(in srgb, var(--accent) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
          border-radius: 10px;
          padding: 1px 8px;
          font-family: var(--font-sans);
        }
        .ev-trust-pill {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: #22c55e;
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.2);
          border-radius: 10px;
          padding: 2px 8px;
          font-weight: 600;
          letter-spacing: 0.04em;
          font-family: var(--font-sans);
          margin-left: auto;
        }
        .ev-scroll-area {
          flex: 1;
          overflow-y: auto;
          padding: 16px 16px;
        }
        .ev-scroll-area-md {
          padding: 0 !important;
        }
        .ev-empty {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 40px 24px;
          text-align: center;
        }
        .ev-empty-icon {
          color: color-mix(in srgb, var(--text) 15%, transparent);
        }
        .ev-empty-title {
          font-size: 13.5px;
          font-weight: 600;
          color: color-mix(in srgb, var(--text) 30%, transparent);
          font-family: var(--font-sans);
        }
        .ev-empty-sub {
          font-size: 12px;
          color: color-mix(in srgb, var(--text) 20%, transparent);
          line-height: 1.6;
          max-width: 260px;
          font-family: var(--font-sans);
        }
        .ev-cards {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        /* --- Evidence Card --- */
        .ev-card {
          background: var(--surface);
          border: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
          border-radius: 12px;
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .ev-card:hover {
          border-color: color-mix(in srgb, var(--accent) 30%, transparent);
        }
        .ev-card-header {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 9px 12px;
          background: color-mix(in srgb, var(--surface-2) 80%, var(--surface));
          border-bottom: 1px solid color-mix(in srgb, var(--text) 7%, transparent);
          flex-wrap: wrap;
          gap: 6px;
          row-gap: 5px;
        }
        .ev-file-path {
          display: flex;
          align-items: center;
          gap: 0;
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }
        .ev-dir-path {
          font-size: 10.5px;
          font-family: var(--font-mono);
          color: color-mix(in srgb, var(--text) 30%, transparent);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }
        .ev-file-name {
          font-size: 11.5px;
          font-family: var(--font-mono);
          font-weight: 500;
          color: var(--text);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .ev-line-badge {
          font-size: 10px;
          font-family: var(--font-mono);
          color: color-mix(in srgb, var(--text) 35%, transparent);
          background: color-mix(in srgb, var(--text) 7%, transparent);
          border-radius: 4px;
          padding: 1px 5px;
          flex-shrink: 0;
        }
        .ev-score-badge {
          font-size: 10px;
          font-family: var(--font-sans);
          font-weight: 700;
          flex-shrink: 0;
        }
        /* --- Action Bar --- */
        .ev-action-bar {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
          margin-left: auto;
        }
        .ev-action-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          background: color-mix(in srgb, var(--text) 6%, transparent);
          border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
          border-radius: 6px;
          color: color-mix(in srgb, var(--text) 55%, transparent);
          padding: 3px 8px;
          font-size: 11px;
          font-family: var(--font-sans);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .ev-action-btn:hover:not(:disabled) {
          background: color-mix(in srgb, var(--text) 10%, transparent);
          color: var(--text);
          border-color: color-mix(in srgb, var(--text) 18%, transparent);
        }
        .ev-action-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .ev-action-btn--success {
          background: rgba(34,197,94,0.1);
          border-color: rgba(34,197,94,0.25);
          color: #22c55e;
        }
        .ev-action-btn--explain:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 15%, transparent);
          border-color: color-mix(in srgb, var(--accent) 30%, transparent);
          color: var(--accent);
        }

        /* --- Premium Markdown UI --- */
        .ev-artifact-markdown {
          display: flex;
          flex-direction: column;
          height: 100%;
          animation: fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both;
          position: relative;
        }
        .ev-markdown-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 32px 20px 32px;
          border-bottom: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
          background: var(--canvas);
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .ev-markdown-title {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 20px;
          font-weight: 600;
          color: var(--text);
          font-family: var(--font-sans);
          letter-spacing: -0.3px;
        }
        .ev-markdown-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .md-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: color-mix(in srgb, var(--text) 6%, transparent);
          border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
          border-radius: 8px;
          color: color-mix(in srgb, var(--text) 80%, transparent);
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 500;
          font-family: var(--font-sans);
          cursor: pointer;
          transition: all 0.2s;
        }
        .md-btn:hover {
          background: color-mix(in srgb, var(--text) 10%, transparent);
          color: var(--text);
        }
        .md-btn--primary {
          background: var(--text);
          color: var(--canvas);
          border-color: var(--text);
          font-weight: 600;
        }
        .md-btn--primary:hover {
          background: color-mix(in srgb, var(--text) 85%, transparent);
          color: var(--canvas);
          border-color: transparent;
        }
        .ev-markdown-container {
          flex: 1;
          display: flex;
          justify-content: center;
          padding: 32px 32px 64px 32px;
        }
        .ev-markdown-body {
          width: 100%;
          max-width: 850px;
        }

        .ev-action-label {
          font-size: 10.5px;
        }
        .ev-code-wrap {
          overflow-x: auto;
          max-height: 320px;
          overflow-y: auto;
        }
        .ev-code-wrap pre {
          background: transparent !important;
        }

        /* --- Evidence Board Skeleton --- */
        .ev-skeleton-wrap {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .ev-skeleton-card {
          background: var(--surface);
          border: 1px solid color-mix(in srgb, var(--text) 7%, transparent);
          border-radius: 12px;
          overflow: hidden;
        }
        .ev-skel-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: color-mix(in srgb, var(--surface-2) 80%, var(--surface));
          border-bottom: 1px solid color-mix(in srgb, var(--text) 7%, transparent);
        }
        .ev-skel-body {
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 9px;
        }
        .ev-skel-line-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ev-skel { border-radius: 4px; }
        .ev-skel-icon  { width: 13px; height: 13px; border-radius: 3px; flex-shrink: 0; }
        .ev-skel-fname { height: 11px; width: 50%; }
        .ev-skel-score { height: 10px; width: 32px; border-radius: 8px; }
        .ev-skel-linenum { width: 18px; height: 10px; flex-shrink: 0; opacity: 0.4; }
        .ev-skel-code  { height: 10px; }
      `}</style>
    </div>
  );
}
