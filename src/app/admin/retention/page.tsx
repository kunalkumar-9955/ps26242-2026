"use client";

import React, { useState, useEffect } from "react";
import { Clock, ShieldAlert, CheckCircle, RefreshCw, Play, AlertTriangle, Database } from "lucide-react";

export default function AdminRetentionPage() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const fetchPolicies = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/retention");
      if (!res.ok) throw new Error("Failed to load retention policies");
      const json = await res.json();
      setPolicies(json.policies || []);
    } catch (err: any) {
      setError(err.message || "Failed to load policies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const handleUpdateDays = async (dataType: string, newDays: number) => {
    try {
      setSaveSuccess(null);
      setError(null);
      const res = await fetch("/api/admin/retention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataType,
          retentionDays: newDays,
          cryptoShredMedia: true,
          preserveChainHashes: true,
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      setSaveSuccess(`Updated retention policy for ${dataType}`);
      await fetchPolicies();
    } catch (err: any) {
      setError(err.message || "Failed to update policy");
    }
  };

  const handleRunPurge = async () => {
    if (!window.confirm("Execute scheduled retention purge job across all expired records?")) return;
    setPurging(true);
    setPurgeResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/retention", { method: "POST" });
      if (!res.ok) throw new Error("Purge job failed");
      const json = await res.json();
      setPurgeResult(json.result);
      await fetchPolicies();
    } catch (err: any) {
      setError(err.message || "Purge execution failed");
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-10 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full text-xs font-semibold mb-2">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>DPDP Compliance Administration</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              डेटा प्रतिधारण नीतियां (Data Retention Policies)
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Configure lifecycle retention, scheduled purges, and crypto-shredding policies per data category.
            </p>
          </div>

          <button
            onClick={handleRunPurge}
            disabled={purging || loading}
            className="inline-flex items-center min-h-[44px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs transition shadow-lg"
          >
            <Play className="w-4 h-4 mr-2" />
            {purging ? "Purging expired records..." : "Run Scheduled Purge Job"}
          </button>
        </header>

        {/* Legal Disclaimer Alert */}
        <div className="p-4 bg-amber-950/30 border border-amber-500/40 rounded-2xl flex items-start space-x-3 text-amber-200">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold text-amber-300">LEGAL COMPLIANCE NOTICE:</span>
            <p className="leading-relaxed">
              Default retention periods and purge configurations are{" "}
              <strong className="underline text-white">UNVERIFIED pending formal legal review</strong> by the Ministry
              of Skill Development and Entrepreneurship (MSDE) and MeitY Data Protection Board. This configuration
              system does not constitute formal legal counsel.
            </p>
          </div>
        </div>

        {saveSuccess && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{saveSuccess}</span>
          </div>
        )}

        {purgeResult && (
          <div className="p-4 bg-emerald-950/40 border border-emerald-500/50 rounded-2xl text-emerald-300 text-xs space-y-1">
            <p className="font-bold text-sm text-white">Purge Execution Summary:</p>
            <p>Policies Checked: {purgeResult.policiesChecked} • Total Items Purged / Crypto-Shredded: {purgeResult.itemsPurged}</p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/50 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400" />
            <p className="text-xs">Loading retention policies...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {policies.map((p) => (
              <div
                key={p.id}
                className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:border-slate-700 transition"
              >
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center space-x-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span className="font-mono text-sm font-bold text-white">{p.data_type}</span>
                    <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-2xs font-bold rounded-full">
                      UNVERIFIED PENDING LEGAL
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{p.legal_notes}</p>
                  <div className="flex items-center space-x-4 text-2xs text-slate-500 pt-1">
                    <span>Crypto-Shred: {p.crypto_shred_media ? "Enabled" : "Disabled"}</span>
                    <span>•</span>
                    <span>Preserve Ledger Hashes: {p.preserve_chain_hashes ? "Enforced" : "No"}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3 bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-300 font-semibold">{p.retention_days} Days</span>
                  <div className="flex items-center space-x-1 pl-2 border-l border-slate-800">
                    <button
                      onClick={() => handleUpdateDays(p.data_type, Math.max(30, p.retention_days - 30))}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded text-slate-300"
                    >
                      -30d
                    </button>
                    <button
                      onClick={() => handleUpdateDays(p.data_type, p.retention_days + 30)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded text-slate-300"
                    >
                      +30d
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
