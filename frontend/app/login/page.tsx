"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { GithubAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import gsap from "gsap";

export default function LoginPage() {
  const { user, loading, setGithubToken } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const router = useRouter();

  // Redirect authenticated users to dashboard.
  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  async function handleGitHubSignIn() {
    if (signingIn) return;
    setSigningIn(true);
    const provider = new GithubAuthProvider();
    provider.addScope("repo");

    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GithubAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) throw new Error("GitHub access token was not returned.");
      setGithubToken(credential.accessToken);
      router.replace("/dashboard");
    } catch (err) {
      const error = err as { code?: string; message?: string };
      const silent = ["auth/popup-closed-by-user", "auth/cancelled-popup-request"];
      if (error.code && silent.includes(error.code)) return;
      console.error("Sign-in error:", error.message);
    } finally {
      setSigningIn(false);
    }
  }

  // --- GSAP ANIMATIONS ---
  const containerRef = useRef<HTMLElement>(null);
  const bgSvgRef = useRef<SVGSVGElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (loading || !containerRef.current) return;

    const ctx = gsap.context(() => {
      // 1. Staggered reveal for left column text
      gsap.fromTo(
        ".stagger-text",
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, ease: "power3.out", stagger: 0.2 }
      );

      // 2. Floating Background SVG
      if (bgSvgRef.current) {
        gsap.to(bgSvgRef.current, {
          y: -20,
          duration: 4,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut"
        });
      }

      // 3. Right column login card
      if (cardRef.current) {
        gsap.fromTo(
          cardRef.current,
          { scale: 0.95, opacity: 0, y: 20 },
          { scale: 1, opacity: 1, y: 0, duration: 1, delay: 0.3, ease: "power4.out" }
        );
      }
    }, containerRef);
    
    return () => ctx.revert();
  }, [loading]);

  if (loading) {
    return (
      <main className="login-loading-screen">
        <div className="login-spinner-large" />
      </main>
    );
  }

  return (
    <main ref={containerRef} className="login-root">
      
      {/* EPIC 1: Left Column (The Hook) */}
      <div className="login-left-col">
        {/* Floating Background SVG */}
        <svg
          ref={bgSvgRef}
          className="login-bg-svg"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.757-1.333-1.757-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
        </svg>

        {/* EPIC 2: Typography */}
        <div className="login-text-content">
          <h1 className="stagger-text login-h1">
            Master your codebase with absolute <span className="login-gradient-text">clarity.</span>
          </h1>
          <p className="stagger-text login-subtitle">
            The most elegant, frictionless platform for semantic code search and architecture tracking.
          </p>
        </div>
      </div>

      {/* EPIC 1: Right Column (The Action) */}
      <div className="login-right-col">
        {/* EPIC 3: Login Card */}
        <div ref={cardRef} className="login-card">
          {/* Logo Mark */}
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="login-logo-svg">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>

          <h2 className="login-title">RepoMind.</h2>
          <p className="login-card-sub">Sign in to securely index your repositories.</p>

          {/* GitHub Button */}
          <button
            onClick={handleGitHubSignIn}
            disabled={signingIn}
            className="login-github-btn"
          >
            {signingIn ? (
              <span className="login-spinner-sm" aria-hidden="true" />
            ) : (
              <svg className="login-btn-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.757-1.333-1.757-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
              </svg>
            )}
            {signingIn ? "Authenticating..." : "Continue with GitHub"}
          </button>

          <p className="login-note">
            SECURE GITHUB OAUTH
          </p>
        </div>
      </div>

      <style>{`
        .login-loading-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
        }
        .login-spinner-large {
          width: 32px;
          height: 32px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        .login-root {
          min-height: 100vh;
          width: 100%;
          display: grid;
          background: #000;
          overflow: hidden;
          font-family: var(--font-sans, system-ui, sans-serif);
        }
        @media (min-width: 1024px) {
          .login-root { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        
        .login-left-col {
          display: none;
          flex-direction: column;
          justify-content: center;
          position: relative;
          background: #000;
          padding: 0 4rem;
        }
        @media (min-width: 1024px) {
          .login-left-col { display: flex; }
        }
        @media (min-width: 1280px) {
          .login-left-col { padding: 0 6rem; }
        }

        .login-bg-svg {
          position: absolute;
          right: -80px;
          top: 80px;
          width: 600px;
          height: 600px;
          opacity: 0.05;
          filter: blur(4px);
          color: #fff;
          pointer-events: none;
        }

        .login-text-content {
          z-index: 10;
          position: relative;
        }

        .login-h1 {
          font-size: 3rem;
          line-height: 1.1;
          font-weight: 700;
          letter-spacing: -0.05em;
          color: #fff;
        }
        @media (min-width: 1280px) {
          .login-h1 { font-size: 4.5rem; }
        }

        .login-gradient-text {
          color: transparent;
          background-clip: text;
          -webkit-background-clip: text;
          background-image: linear-gradient(to right, #e5e5e5, #525252);
        }

        .login-subtitle {
          margin-top: 1.5rem;
          font-size: 1.125rem;
          color: #a3a3a3;
          max-width: 28rem;
          line-height: 1.625;
        }

        .login-right-col {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #050505;
          position: relative;
          width: 100%;
          padding: 1.5rem;
        }

        .login-card {
          width: 100%;
          max-width: 400px;
          padding: 2.5rem;
          background: linear-gradient(180deg, #121212 0%, #050505 100%);
          border-radius: 1.5rem;
          box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.08),
                      0 0 0 1px rgba(255, 255, 255, 0.05),
                      0 24px 64px -12px rgba(0, 0, 0, 0.8),
                      0 0 40px rgba(255, 255, 255, 0.02);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          z-index: 10;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .login-logo-svg {
          margin-bottom: 1.25rem;
          filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.4));
        }

        .login-title {
          font-size: 1.5rem;
          font-weight: 500;
          color: #fff;
          margin-bottom: 0.5rem;
          letter-spacing: -0.025em;
        }

        .login-card-sub {
          font-size: 14px;
          color: #737373;
          margin-bottom: 2rem;
        }

        .login-github-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          background: transparent;
          color: #000;
          padding: 0.875rem;
          border-radius: 0.75rem;
          font-weight: 500;
          border: none;
          cursor: pointer;
          position: relative;
          z-index: 1;
          overflow: hidden;
          transition: transform 0.1s, box-shadow 0.2s;
          box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.2);
        }
        .login-github-btn::before,
        .login-github-btn::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          z-index: -1;
          transition: opacity 0.3s ease;
        }
        .login-github-btn::before {
          background: linear-gradient(180deg, #ffffff 0%, #e5e5e5 100%);
          box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 1);
        }
        .login-github-btn::after {
          background: linear-gradient(180deg, #e5e5e5 0%, #c4c4c4 100%);
          box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 1);
          opacity: 0;
        }
        .login-github-btn:hover:not(:disabled)::after {
          opacity: 1;
        }
        .login-github-btn:hover:not(:disabled) {
          box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.3);
        }
        .login-github-btn:active:not(:disabled) {
          transform: scale(0.98);
          box-shadow: 0 1px 2px -1px rgba(0, 0, 0, 0.1);
        }
        .login-github-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .login-btn-icon {
          width: 1.25rem;
          height: 1.25rem;
        }

        .login-spinner-sm {
          display: block;
          width: 1.25rem;
          height: 1.25rem;
          border: 2px solid rgba(0,0,0,0.2);
          border-top-color: #000;
          border-radius: 50%;
          animation: spin 0.65s linear infinite;
        }

        .login-note {
          font-size: 11px;
          font-weight: 500;
          color: #525252;
          margin-top: 1.5rem;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        @keyframes spin { 
          to { transform: rotate(360deg); } 
        }
      `}</style>
    </main>
  );
}
