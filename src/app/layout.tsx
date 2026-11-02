import type { Metadata, Viewport } from "next";
import "./globals.css";
import Link from "next/link";
import { Shield, UserCheck, HardHat, ShieldAlert, BookOpen, CheckCircle2 } from "lucide-react";
import { AppProviders } from "@/components/providers";

export const metadata: Metadata = {
  title: "SatyaRPL — Fraud-Resistant, Assessor-Auditable RPL Platform",
  description: "Recognition of Prior Learning framework powered by challenge-response evidence and blind-first assessor auditing.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#2563EB",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 antialiased flex flex-col">
        {/* Top Global Government / Institutional Header */}
        <header className="border-b border-slate-200 bg-white/95 backdrop-blur dark:bg-slate-900/95 dark:border-slate-800 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-sm shadow-blue-500/20 group-hover:bg-blue-700 transition">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">SatyaRPL</span>
                  <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    NCVET / NSQF
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                  Fraud-Resistant & Assessor-Auditable RPL Engine
                </p>
              </div>
            </Link>

            {/* Role Navigation Bar */}
            <nav className="flex items-center gap-1 sm:gap-2">
              <Link
                href="/worker"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 transition"
              >
                <HardHat className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Worker App</span>
              </Link>
              <Link
                href="/assessor"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 transition"
              >
                <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Assessor</span>
              </Link>
              <Link
                href="/auditor"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 transition"
              >
                <ShieldAlert className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="hidden md:inline">Auditor</span>
              </Link>
              <Link
                href="/red-team"
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs sm:text-sm font-medium text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 transition"
                title="Security Red-Team Harness"
              >
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                <span>Red-Team</span>
              </Link>
              <Link
                href="/admin"
                className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition"
                title="Admin Registry"
              >
                <BookOpen className="w-4 h-4" />
              </Link>
            </nav>
          </div>
        </header>

        {/* Main Content Area */}
        <AppProviders>
          <main className="flex-1 flex flex-col">{children}</main>
        </AppProviders>

        {/* Global Verification Footer */}
        <footer className="border-t border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 py-6 text-xs text-slate-500 dark:text-slate-400">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                <strong>Thesis:</strong> We don&apos;t make AI judge workers. We make RPL assessments fraud-resistant and assessor-auditable.
              </span>
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <Link href="/verify" className="hover:text-blue-600 transition">
                Public Verification Portal
              </Link>
              <span>•</span>
              <span>NSQF Level 3 (CON/Q0602)</span>
              <span>•</span>
              <span className="font-mono text-[11px]">Build v1.0-RC</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
