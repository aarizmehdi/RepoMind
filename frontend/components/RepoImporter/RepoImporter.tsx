"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  updated_at: string;
  description: string | null;
  language: string | null;
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(dateStr));
}

interface Props {
  githubToken: string | null;
  onImport: (repo: GitHubRepo) => void;
  isLocked?: boolean;
}

function SkeletonRows() {
  const widths = [120, 160, 95, 140, 110];
  return (
    <>
      {widths.map((w, i) => (
        <div key={i} className="ri-row" style={{ animationDelay: `${i * 50}ms` }}>
          <div className="ri-row-left">
            <div className="ri-skel" style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0 }} />
            <div className="ri-skel" style={{ width: w, height: 13, borderRadius: 5 }} />
          </div>
          <div className="ri-skel" style={{ width: 62, height: 28, borderRadius: 7 }} />
        </div>
      ))}
    </>
  );
}

export default function RepoImporter({ githubToken, onImport, isLocked = false }: Props) {
  const [initialRepos, setInitialRepos] = useState<GitHubRepo[]>([]);
  const [searchRepos, setSearchRepos] = useState<GitHubRepo[] | null>(null);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [query, setQuery] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInitial = useCallback(async () => {
    if (!githubToken) { setInitError("GitHub token missing."); setInitLoading(false); return; }
    setInitLoading(true); setInitError(null);
    try {
      const [uRes, rRes] = await Promise.all([
        fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" },
        }),
        fetch("https://api.github.com/user/repos?per_page=5&sort=updated&affiliation=owner,collaborator", {
          headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" },
        }),
      ]);
      if (uRes.ok) { const u = await uRes.json(); setUsername(u.login ?? ""); setAvatarUrl(u.avatar_url ?? null); }
      if (!rRes.ok) throw new Error(`GitHub API error ${rRes.status}`);
      setInitialRepos(await rRes.json());
    } catch (e) { setInitError((e as Error).message); }
    finally { setInitLoading(false); }
  }, [githubToken]);

  useEffect(() => { fetchInitial(); }, [fetchInitial]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || !githubToken) return;
    setSearchError(null);
    skeletonTimerRef.current = setTimeout(() => setShowSkeleton(true), 150);
    setSearching(true);
    try {
      const res = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}+user:${encodeURIComponent(username)}&sort=updated&per_page=10`,
        { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" } }
      );
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data = await res.json();
      setSearchRepos(data.items ?? []);
    } catch (e) { setSearchError((e as Error).message); }
    finally {
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
      setShowSkeleton(false); setSearching(false);
    }
  }, [githubToken, username]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setSearchRepos(null); setSearchError(null); setShowSkeleton(false); return; }
    debounceRef.current = setTimeout(() => runSearch(val), 350);
  };

  const isSearching = query.trim().length > 0;
  const displayRepos = isSearching ? (searchRepos ?? []) : initialRepos;
  const showSkeletons = isSearching ? showSkeleton : initLoading;

  return (
    <div className="ri-root">
      {/* Header */}
      <div className="ri-header">
        <div className="ri-header-left">
          <div className="ri-icon-box">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" style={{ color: "#e4e4e7" }}>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </div>
          <div>
            <h1 className="ri-title">Import Repository</h1>
            <p className="ri-subtitle">Index your codebase and start chatting with AI</p>
          </div>
        </div>
        {username && (
          <div className="ri-user-pill">
            {avatarUrl
              ? <img src={avatarUrl} alt={username} className="ri-avatar-img" />
              : <div className="ri-avatar-fallback">{username[0]?.toUpperCase()}</div>
            }
            <span className="ri-username">{username}</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="ri-search-wrap">
        <svg className="ri-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
        </svg>
        <input
          className={`ri-search-input ${isLocked ? 'ri-locked-input' : ''}`}
          type="text"
          placeholder={isLocked ? "🔒 Account limit reached" : "Search all your repositories…"}
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          spellCheck={false}
          disabled={isLocked}
        />
        {searching && !showSkeleton && <span className="ri-search-spinner" />}
        {query && !searching && (
          <button className="ri-clear-btn" onClick={() => { setQuery(""); setSearchRepos(null); }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        )}
      </div>

      {/* Hint */}
      <p className="ri-hint">
        {!isSearching
          ? "5 most recent repos · search to find any repository"
          : searchRepos
            ? `${searchRepos.length} result${searchRepos.length !== 1 ? "s" : ""} for "${query}"`
            : "Searching…"}
      </p>

      {/* List */}
      <div className="ri-list">
        {/* Init error */}
        {initError && !initLoading && (
          <div className="ri-error">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ color: "#f87171", flexShrink: 0 }}>
              <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
            </svg>
            {initError}
            <button className="ri-retry" onClick={fetchInitial}>Retry</button>
          </div>
        )}

        {/* Skeletons */}
        {showSkeletons && <SkeletonRows />}

        {/* Empty search */}
        {!showSkeletons && !searchError && isSearching && searchRepos?.length === 0 && (
          <div className="ri-empty">No repositories found for "{query}"</div>
        )}

        {/* Rows */}
        {!showSkeletons && displayRepos.map((repo, i) => (
          <div key={repo.id} className="ri-row" style={{ animationDelay: `${i * 35}ms` }}>
            <div className="ri-row-left">
              {/* Repo icon */}
              <svg className="ri-repo-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8V1.5Z" />
              </svg>
              <span className="ri-repo-name">{repo.name}</span>
              {/* Lock for private */}
              {repo.private && (
                <svg className="ri-lock-icon" width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                  <title>Private</title>
                  <path d="M4 4v2h-.25A1.75 1.75 0 0 0 2 7.75v5.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 13.25v-5.5A1.75 1.75 0 0 0 12.25 6H12V4a4 4 0 0 0-8 0Zm6.5 2h-5V4a2.5 2.5 0 0 1 5 0Z" />
                </svg>
              )}
              <span className="ri-dot">·</span>
              <span className="ri-date">{formatDate(repo.updated_at)}</span>
            </div>

            <button 
              className={`ri-import-btn ${isLocked ? 'ri-import-locked' : ''}`} 
              onClick={() => onImport(repo)}
              disabled={isLocked}
            >
              {isLocked ? "Locked" : "Import"}
            </button>
          </div>
        ))}
      </div>

      <style>{`
        .ri-root {
          width: 100%;
          max-width: 620px;
          margin: 0 auto;
          padding: 12px 28px 16px;
          font-family: inherit;
          animation: ri-in 0.4s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes ri-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Header ── */
        .ri-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          gap: 12px;
        }
        .ri-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .ri-icon-box {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.07);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ri-title {
          font-size: 17px;
          font-weight: 600;
          color: #f4f4f5;
          letter-spacing: -0.03em;
          margin: 0 0 2px;
          line-height: 1;
        }
        .ri-subtitle {
          font-size: 12.5px;
          color: #3f3f3f;
          margin: 0;
        }
        .ri-user-pill {
          display: flex;
          align-items: center;
          gap: 7px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 100px;
          padding: 4px 10px 4px 5px;
          flex-shrink: 0;
        }
        .ri-avatar-img {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          object-fit: cover;
        }
        .ri-avatar-fallback {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a78bfa, #38bdf8);
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ri-username {
          font-size: 12.5px;
          font-weight: 500;
          color: #a3a3a3;
        }

        /* ── Search ── */
        .ri-search-wrap {
          position: relative;
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }
        .ri-search-icon {
          position: absolute;
          left: 12px;
          color: #404040;
          pointer-events: none;
        }
        .ri-search-input {
          width: 100%;
          background: #080808;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 9px;
          color: #f4f4f5;
          font-size: 13.5px;
          padding: 10px 36px 10px 34px;
          outline: none;
          font-family: inherit;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .ri-search-input::placeholder { color: #333; }
        .ri-search-input:focus {
          border-color: rgba(255,255,255,0.4);
          background: rgba(255,255,255,0.06);
        }
        .ri-locked-input {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ri-search-spinner {
          position: absolute;
          right: 12px;
          width: 13px;
          height: 13px;
          border: 1.5px solid rgba(255,255,255,0.08);
          border-top-color: #525252;
          border-radius: 50%;
          animation: ri-spin 0.7s linear infinite;
        }
        .ri-clear-btn {
          position: absolute;
          right: 10px;
          background: rgba(255,255,255,0.05);
          border: none;
          color: #525252;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          transition: background 0.12s, color 0.12s;
        }
        .ri-clear-btn:hover { background: rgba(255,255,255,0.09); color: #a3a3a3; }

        .ri-hint {
          font-size: 11.5px;
          color: #2d2d2d;
          margin: 0 0 12px 2px;
        }

        /* ── List ── */
        .ri-list {
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 11px;
          background: #050505;
          overflow: hidden;
        }

        /* Shared skeleton pulse */
        .ri-skel {
          background: rgba(255,255,255,0.055);
          animation: ri-pulse 1.6s ease-in-out infinite;
        }
        @keyframes ri-pulse {
          0%,100% { opacity: 0.5; }
          50%      { opacity: 1; }
        }

        /* Error */
        .ri-error {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 18px 16px;
          color: #f87171;
          font-size: 13px;
        }
        .ri-retry {
          margin-left: auto;
          background: none;
          border: 1px solid rgba(248,113,113,0.25);
          color: #f87171;
          font-size: 12px;
          padding: 3px 10px;
          border-radius: 5px;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.12s;
        }
        .ri-retry:hover { background: rgba(248,113,113,0.07); }
        .ri-empty {
          padding: 40px 20px;
          text-align: center;
          color: #333;
          font-size: 13.5px;
        }

        /* ── Rows ── */
        .ri-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          transition: background 0.12s;
          animation: ri-row-in 0.32s cubic-bezier(0.16,1,0.3,1) both;
          gap: 12px;
        }
        @keyframes ri-row-in {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ri-row:last-child { border-bottom: none; }
        .ri-row:hover { background: rgba(255,255,255,0.018); }
        .ri-row-left {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
          overflow: hidden;
        }
        .ri-repo-icon { color: #2d2d2d; flex-shrink: 0; }
        .ri-repo-name {
          font-size: 13.5px;
          font-weight: 500;
          color: #e4e4e7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: -0.01em;
        }
        .ri-lock-icon {
          color: #404040;
          flex-shrink: 0;
        }
        .ri-dot {
          color: #2a2a2a;
          font-size: 14px;
          flex-shrink: 0;
          margin: 0 1px;
          line-height: 1;
        }
        .ri-date {
          font-size: 12px;
          color: #383838;
          flex-shrink: 0;
          white-space: nowrap;
        }

        /* ── Import button ── */
        .ri-import-btn {
          display: inline-flex;
          align-items: center;
          background: rgba(255,255,255,0.06);
          color: #d4d4d4;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 7px;
          font-size: 12.5px;
          font-weight: 500;
          padding: 6px 14px;
          cursor: pointer;
          flex-shrink: 0;
          font-family: inherit;
          letter-spacing: -0.01em;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .ri-import-btn:hover {
          background: rgba(255,255,255,0.15);
          border-color: rgba(255,255,255,0.3);
        }
        .ri-import-btn:active { transform: scale(0.97); }
        .ri-import-locked {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ri-import-locked:hover {
          background: transparent;
          border-color: rgba(255,255,255,0.15);
        }

        @keyframes ri-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
