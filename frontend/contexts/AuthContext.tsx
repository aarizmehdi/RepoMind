"use client";

/**
 * Auth Context
 * Wraps the app with Firebase auth state + GitHub OAuth token storage.
 * Provides: user, githubToken, loading state, and signOut helper.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthContextValue {
  user: User | null;
  githubToken: string | null;
  loading: boolean;
  setGithubToken: (token: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  githubToken: null,
  loading: true,
  setGithubToken: () => undefined,
  signOut: async () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [githubToken, setGithubTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        // Clear GitHub token on logout.
        setGithubTokenState(null);
        sessionStorage.removeItem("gh_token");
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Restore GitHub token from sessionStorage on mount (survives page refresh
  // but not a full session close — matches the Firebase auth session lifetime).
  useEffect(() => {
    const stored = sessionStorage.getItem("gh_token");
    if (stored) setGithubTokenState(stored);
  }, []);

  const setGithubToken = useCallback((token: string) => {
    sessionStorage.setItem("gh_token", token);
    setGithubTokenState(token);
  }, []);

  const signOut = useCallback(async () => {
    sessionStorage.removeItem("gh_token");
    setGithubTokenState(null);
    await firebaseSignOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, githubToken, loading, setGithubToken, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
