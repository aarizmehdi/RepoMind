import React from "react";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RepoMind — Codebase Semantic Search",
  description:
    "AI-powered semantic search engine for your GitHub repositories. Ask questions, explore code, and get grounded answers — all in real-time.",
  keywords: ["code search", "AI", "RAG", "semantic search", "GitHub", "codebase"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
