"use client";

import React from "react";
import { AuthProvider, useAuth } from "@/lib/auth/auth-context";
import { Globe, UserCheck, HardHat, ShieldAlert, BookOpen, AlertCircle } from "lucide-react";
import { OfflineSyncBar } from "./offline-sync-bar";

function RoleAndLanguageSwitcher() {
  const { currentUser, setRole, setLanguage } = useAuth();

  return (
    <div className="bg-slate-900 text-slate-200 border-b border-slate-800 px-4 py-1.5 text-xs flex flex-wrap items-center justify-between gap-3">
      {/* Synthetic Data Transparency Badge */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          <AlertCircle className="w-3 h-3" />
          <span>SYNTHETIC DEMO ENVIRONMENT</span>
        </span>
        <span className="text-slate-400 hidden sm:inline">
          Logged in as: <strong className="text-white">{currentUser.name}</strong> ({currentUser.role})
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Role Quick Selector */}
        <div className="flex items-center gap-1">
          <span className="text-slate-400 text-[11px] hidden md:inline">Switch Role:</span>
          <select
            value={currentUser.role}
            onChange={(e) => setRole(e.target.value as any)}
            className="bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="worker">Worker (Ramesh Sharma)</option>
            <option value="assessor">Assessor (Er. Sunita Verma)</option>
            <option value="auditor">Auditor (Dr. Arvind Rao)</option>
            <option value="admin">Platform Admin</option>
          </select>
        </div>

        {/* Bilingual Selector */}
        <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded border border-slate-700">
          <button
            onClick={() => setLanguage("hi")}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
              currentUser.language === "hi"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            हिन्दी
          </button>
          <button
            onClick={() => setLanguage("en")}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
              currentUser.language === "en"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            EN
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RoleAndLanguageSwitcher />
      {children}
      <OfflineSyncBar />
    </AuthProvider>
  );
}
