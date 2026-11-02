"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import Link from "next/link";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Info,
  Layers,
  HelpCircle,
  Eye,
  SlidersHorizontal,
  Flame,
  Award,
  Users,
  Film,
  FileSpreadsheet,
  FileCode2,
  Check,
  X,
  ExternalLink,
} from "lucide-react";

export default function AuditorAnalyticsDashboard() {
  const { currentUser, setRole } = useAuth();
  const lang = currentUser.language;

  // Role Gate: Auditor or Admin only
  const isAuthorized = ["auditor", "admin"].includes(currentUser.role);

  // States
  const [activeTab, setActiveTab] = useState<"reliability" | "comparison" | "anomalies" | "integrity">("reliability");
  const [dataSource, setDataSource] = useState<"real" | "synthetic" | "all">("all");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [perCriterion, setPerCriterion] = useState<any[]>([]);
  const [pairMatrix, setPairMatrix] = useState<any>({ assessors: [], cells: [] });
  const [comparison, setComparison] = useState<any>(null);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [integritySummary, setIntegritySummary] = useState<any>(null);

  // Anomaly Resolution Modal State
  const [selectedAnomaly, setSelectedAnomaly] = useState<any | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolving, setResolving] = useState(false);

  // Raw PII Unmasking Modal State
  const [unmaskSessionId, setUnmaskSessionId] = useState<string | null>(null);
  const [unmaskReason, setUnmaskReason] = useState("");
  const [unmasking, setUnmasking] = useState(false);
  const [unmaskedData, setUnmaskedData] = useState<any | null>(null);

  // Export State
  const [exporting, setExporting] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // 1. Fetch Analytics Overview & Breakdown
      const res = await fetch(`/api/auditor/analytics?dataSource=${dataSource}`, {
        headers: {
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.id,
        },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load auditor analytics");
      }

      const data = await res.json();
      setOverview(data.overview);
      setPerCriterion(data.perCriterion || []);
      setPairMatrix(data.pairMatrix || { assessors: [], cells: [] });
      setComparison(data.controlledComparison);

      // 2. Fetch Anomalies
      const anomRes = await fetch("/api/auditor/anomalies", {
        headers: {
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.id,
        },
      });
      if (anomRes.ok) {
        const anomData = await anomRes.json();
        setAnomalies(anomData.anomalies || []);
      }

      // 3. Fetch Evidence Integrity
      const integRes = await fetch("/api/auditor/integrity", {
        headers: {
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.id,
        },
      });
      if (integRes.ok) {
        const integData = await integRes.json();
        setIntegritySummary(integData);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to fetch auditor data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchDashboardData();
    }
  }, [currentUser.role, currentUser.id, dataSource]);

  // Handle Export (JSON or CSV)
  const handleExport = async (format: "json" | "csv") => {
    try {
      setExporting(true);
      const res = await fetch(`/api/auditor/export?format=${format}&dataSource=${dataSource}`, {
        headers: {
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.id,
        },
      });
      if (!res.ok) throw new Error("Export generation failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `satyarpl-auditor-analytics-${dataSource}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  // Handle Anomaly Resolution
  const handleResolveAnomaly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnomaly || !resolutionNote) return;

    try {
      setResolving(true);
      const res = await fetch("/api/auditor/anomalies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({
          anomalyId: selectedAnomaly.id,
          resolutionNote,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to resolve anomaly prompt");
      }

      alert("Anomaly review prompt resolved and logged to audit trail.");
      setSelectedAnomaly(null);
      setResolutionNote("");
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setResolving(false);
    }
  };

  // Handle Raw PII Unmasking with Logged Reason
  const handleUnmaskRawPII = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unmaskSessionId || !unmaskReason) return;

    try {
      setUnmasking(true);
      const res = await fetch("/api/auditor/access-log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({
          sessionId: unmaskSessionId,
          reason: unmaskReason,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to log auditor access");
      }

      // Fetch unmasked candidate session
      const sessRes = await fetch(`/api/assessor/sessions?sessionId=${unmaskSessionId}`, {
        headers: {
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.id,
        },
      });
      const sessData = await sessRes.json();
      setUnmaskedData(sessData);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUnmasking(false);
    }
  };

  // 403 PERMISSION DENIED STATE
  if (!isAuthorized) {
    return (
      <div className="max-w-3xl mx-auto my-16 px-4">
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 shadow-lg text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-3 py-1 rounded-full border border-rose-200 dark:border-rose-800">
            HTTP 403 Forbidden · Auditor Role Required
          </span>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-4">
            Auditor Analytics & Anomaly Portal
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mt-2">
            You are authenticated as <strong>{currentUser.name}</strong> with role <code>{currentUser.role}</code>. Access to psychometric reliability metrics, inter-rater matrices, and integrity flags requires Auditor or Admin privileges.
          </p>

          <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <button
              onClick={() => setRole("auditor")}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition"
            >
              Switch to Auditor Demo Role (Dr. Arvind Rao)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1 flex flex-col gap-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>{lang === "hi" ? "ऑडिटर एनालिटिक्स डैशबोर्ड" : "Auditor Analytics & Reliability Dashboard"}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  NCVET Audit Portal
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inter-Rater Reliability (Cohen’s $\kappa$, Krippendorff’s $\alpha$, ICC), Controlled A/B Experiment, Anomaly Detection & Evidence Integrity
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Export */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition text-slate-700 dark:text-slate-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => handleExport("json")}
            disabled={exporting}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition text-slate-700 dark:text-slate-300"
          >
            <FileCode2 className="w-3.5 h-3.5 text-blue-600" />
            <span>Export JSON</span>
          </button>

          <button
            onClick={() => handleExport("csv")}
            disabled={exporting}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition text-slate-700 dark:text-slate-300"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* DATA SOURCE SEGMENTATION TABS (Real vs Synthetic Split) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Data Stream:
          </span>
          <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            {[
              { id: "all", label: "All Data (Demarcated)" },
              { id: "real", label: "Real Operational Only" },
              { id: "synthetic", label: "Synthetic Test Only" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setDataSource(tab.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  dataSource === tab.id
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {overview && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500">Sample:</span>
            <strong className="text-slate-900 dark:text-white">n = {overview.n} pairs</strong>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">{overview.clipsCount} clips</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">{overview.assessorsCount} assessors</span>
          </div>
        )}
      </div>

      {/* SMALL-N & SYNTHETIC DATA BANNERS */}
      {overview?.isSmallN && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <strong>Small Sample Size Warning (n = {overview.n} &lt; {overview.smallNThreshold}):</strong>
              <p className="text-[11px] mt-0.5 opacity-90">
                Statistical reliability estimates (Kappa, ICC, Alpha) carry wide confidence intervals. Findings are exploratory and should not be used as conclusive proof of rater consensus until additional observations are gathered.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-900/60 font-bold shrink-0">
            WIDE CI
          </span>
        </div>
      )}

      {overview?.isSynthetic && (
        <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-900 dark:text-blue-200 text-xs flex items-center gap-2.5">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            <strong>Synthetic Data Stream:</strong> This view includes simulated assessment ratings seeded for testing. Metrics reflect controlled experimental conditions and are explicitly badged as SYNTHETIC.
          </span>
        </div>
      )}

      {/* DASHBOARD MODULE TABS */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: "reliability", label: "Inter-Rater Reliability & Matrix", icon: SlidersHorizontal },
          { id: "comparison", label: "Controlled A/B Comparison (With vs Without)", icon: TrendingUp },
          { id: "anomalies", label: `Assessor Anomaly Prompts (${anomalies.length})`, icon: AlertTriangle },
          { id: "integrity", label: `Evidence Integrity (${integritySummary?.totalFlags || 0})`, icon: ShieldAlert },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                isActive
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
          <p className="text-xs font-semibold">Computing Psychometric Agreement & Running Anomaly Heuristics...</p>
        </div>
      ) : activeTab === "reliability" ? (
        /* TAB 1: RELIABILITY OVERVIEW & ASSESSOR PAIR MATRIX */
        <div className="flex flex-col gap-6">
          {/* Key Metric Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Cohen's Weighted Kappa */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase">
                  Weighted Cohen’s Kappa (Quadratic)
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 font-bold">
                  k = 4
                </span>
              </div>
              <div>
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                  {overview?.weightedKappa?.isUndefined
                    ? "undefined"
                    : overview?.weightedKappa?.kappa ?? "—"}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  95% Bootstrap CI: [{overview?.bootstrapCI?.ciLower ?? "—"},{" "}
                  {overview?.bootstrapCI?.ciUpper ?? "—"}]
                </p>
              </div>
              <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                Formula: &kappa;<sub>w</sub> = 1 &minus; D<sub>o</sub> / D<sub>e</sub> with w<sub>ij</sub> = (i&minus;j)&sup2; / 9
              </div>
            </div>

            {/* 2. Krippendorff's Alpha */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase">
                  Krippendorff’s Alpha (Ordinal)
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-bold">
                  Multi-Rater
                </span>
              </div>
              <div>
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                  {overview?.krippendorffAlpha?.isUndefined
                    ? "undefined"
                    : overview?.krippendorffAlpha?.alpha ?? "—"}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Handles missing ratings across {overview?.clipsCount} units
                </p>
              </div>
              <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                Standard: $\alpha \ge 0.80$ (Tentative: $0.667$)
              </div>
            </div>

            {/* 3. Intraclass Correlation Coefficient (ICC) */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase">
                  ICC (Two-Way Random Absolute)
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-bold">
                  ICC(2,1)
                </span>
              </div>
              <div>
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                  {overview?.icc?.isUndefined ? "undefined" : overview?.icc?.icc ?? "—"}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  F-Ratio: {overview?.icc?.fRatio} ($df_R={overview?.icc?.dfSubjects}$)
                </p>
              </div>
              <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                Model: Shrout & Fleiss (1979) absolute agreement
              </div>
            </div>

            {/* 4. Percent & Adjacent Agreement */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase">
                  Raw & Adjacent Agreement
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 font-bold">
                  Ordinal
                </span>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                    {overview?.weightedKappa?.percentAgreement}%
                  </span>
                  <span className="text-xs text-slate-400">exact</span>
                </div>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                  Adjacent (&plusmn;1 level): {overview?.weightedKappa?.adjacentAgreement}%
                </p>
              </div>
              <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                Shown alongside Kappa to detect prevalence bias
              </div>
            </div>
          </div>

          {/* Prevalence & Bias Paradox Caveat Banner */}
          {overview?.weightedKappa?.hasPrevalenceCaveat && (
            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-900 dark:text-purple-200 text-xs flex items-center gap-3">
              <Info className="w-5 h-5 text-purple-600 shrink-0" />
              <div>
                <strong>Prevalence Paradox Detected (Feinstein & Cicchetti, 1990):</strong>
                <p className="text-[11px] mt-0.5 opacity-90">
                  Ratings are heavily clustered into high categories (Prevalence Index: {overview?.weightedKappa?.prevalenceIndex}). When category variance is low, chance agreement is inflated and Cohen’s kappa is artificially depressed despite {overview?.weightedKappa?.percentAgreement}% exact agreement. Evaluate adjacent agreement ({overview?.weightedKappa?.adjacentAgreement}%) alongside kappa.
                </p>
              </div>
            </div>
          )}

          {/* Assessor Pair Agreement Heatmap Matrix */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  <span>Assessor Pair Agreement Matrix (Pairwise $\kappa$)</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Inter-assessor agreement for each evaluator dyad. Color gradient with numerical text values for full accessibility.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-400">
                {pairMatrix.cells.length} Pairs Evaluated
              </span>
            </div>

            {pairMatrix.cells.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No overlapping ratings between distinct assessor pairs in selected data stream.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2.5 px-3 font-bold">Assessor 1</th>
                      <th className="py-2.5 px-3 font-bold">Assessor 2</th>
                      <th className="py-2.5 px-3 font-bold">Sample Pairs (n)</th>
                      <th className="py-2.5 px-3 font-bold">Quadratic Kappa ($\kappa$)</th>
                      <th className="py-2.5 px-3 font-bold">Exact Agreement</th>
                      <th className="py-2.5 px-3 font-bold">Reliability Classification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pairMatrix.cells.map((cell: any, idx: number) => {
                      const kappaVal = cell.isUndefined ? null : cell.kappa;
                      const isHigh = kappaVal !== null && kappaVal >= 0.70;
                      const isMed = kappaVal !== null && kappaVal >= 0.40 && kappaVal < 0.70;
                      const isLow = kappaVal !== null && kappaVal < 0.40;

                      return (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                            {cell.assessor1Name}
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                            {cell.assessor2Name}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                            n = {cell.n}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold">
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${
                                cell.isUndefined
                                  ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                  : isHigh
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : isMed
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                  : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                              }`}
                            >
                              {cell.isUndefined ? "undefined" : `κ = ${cell.kappa}`}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                            {cell.percentAgreement}%
                          </td>
                          <td className="py-3 px-3 text-xs">
                            {cell.isUndefined
                              ? "Invariant / Undefined"
                              : isHigh
                              ? "Substantial Agreement (Gate Passed)"
                              : isMed
                              ? "Moderate (Recalibration Recommended)"
                              : "Poor / Inconsistent Agreement"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Per-Criterion Breakdown Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Per-Criterion Reliability Breakdown (CON/Q0602)
                </h3>
                <p className="text-xs text-slate-500">
                  Performance criteria reliability metrics. Color is supplemented by exact text numbers for WCAG AA compliance.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 px-3 font-bold">Code</th>
                    <th className="py-2 px-3 font-bold">Description</th>
                    <th className="py-2 px-3 font-bold">NOS Unit</th>
                    <th className="py-2 px-3 font-bold">Sample</th>
                    <th className="py-2 px-3 font-bold">Weighted $\kappa$</th>
                    <th className="py-2 px-3 font-bold">Exact Agreement</th>
                    <th className="py-2 px-3 font-bold">Adjacent (&plusmn;1)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {perCriterion.map((item) => (
                    <tr key={item.criterionId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {item.criterionCode}
                      </td>
                      <td className="py-2.5 px-3 max-w-xs truncate text-slate-800 dark:text-slate-200">
                        {item.description}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {item.nosCode}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                        n = {item.n}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold">
                        {item.isUndefined ? (
                          <span className="text-slate-400">undefined</span>
                        ) : (
                          <span
                            className={
                              item.weightedKappa >= 0.70
                                ? "text-emerald-600 dark:text-emerald-400"
                                : item.weightedKappa >= 0.40
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-rose-600 dark:text-rose-400"
                            }
                          >
                            {item.weightedKappa}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {item.percentAgreement}%
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {item.adjacentAgreement}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === "comparison" ? (
        /* TAB 2: CONTROLLED A/B COMPARISON (WITH VS WITHOUT THE TOOL) */
        <div className="flex flex-col gap-6">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <span>Controlled Comparison: Condition A (Unassisted) vs Condition B (Assisted)</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Controlled trial comparing same candidate performance clips evaluated without assistance (Condition A) vs with SatyaRPL blind-first calibration workflow (Condition B).
                </p>
              </div>

              <span
                className={`text-xs font-bold px-3 py-1 rounded-full uppercase font-mono ${
                  comparison?.comparison?.conclusion === "improved"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : comparison?.comparison?.conclusion === "worse"
                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                {comparison?.comparison?.conclusion?.replace(/_/g, " ")}
              </span>
            </div>

            {/* Statistical Difference Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase">
                  Condition A (Unassisted Baseline)
                </span>
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                  $\kappa_A$ = {comparison?.conditionA?.kappa ?? "—"}
                </span>
                <span className="text-xs text-slate-400">
                  {comparison?.conditionA?.percentAgreement}% exact agreement (n={comparison?.conditionA?.n})
                </span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase">
                  Condition B (SatyaRPL Assisted)
                </span>
                <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  $\kappa_B$ = {comparison?.conditionB?.kappa ?? "—"}
                </span>
                <span className="text-xs text-slate-400">
                  {comparison?.conditionB?.percentAgreement}% exact agreement (n={comparison?.conditionB?.n})
                </span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase">
                  Paired Difference ($\Delta \kappa = \kappa_B - \kappa_A$)
                </span>
                <span
                  className={`text-2xl font-bold font-mono ${
                    (comparison?.comparison?.difference || 0) > 0
                      ? "text-emerald-600"
                      : (comparison?.comparison?.difference || 0) < 0
                      ? "text-rose-600"
                      : "text-slate-700"
                  }`}
                >
                  {(comparison?.comparison?.difference || 0) > 0 ? "+" : ""}
                  {comparison?.comparison?.difference ?? "—"}
                </span>
                <span className="text-xs text-slate-400">
                  95% Bootstrap CI: [{comparison?.comparison?.ciLower ?? "—"},{" "}
                  {comparison?.comparison?.ciUpper ?? "—"}]
                </span>
              </div>
            </div>

            {/* Note and Narrative Explanation */}
            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              <strong>Audit Evaluation:</strong> {comparison?.comparison?.note}
            </div>

            {/* CRITERION ACCURACY VS EXPERT REFERENCE SCORES */}
            <div className="mt-2 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-600" />
                <span>Agreement vs Validity: Accuracy Against Master Expert Benchmark</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 block">Condition A Accuracy vs Expert</span>
                    <strong className="text-lg font-mono font-bold text-slate-900 dark:text-white">
                      {comparison?.accuracyVsExpert?.conditionAAccuracy}% Match
                    </strong>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">Unassisted</span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 block">Condition B Accuracy vs Expert</span>
                    <strong className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {comparison?.accuracyVsExpert?.conditionBAccuracy}% Match
                    </strong>
                  </div>
                  <span className="text-xs text-emerald-600 font-mono font-bold">
                    +{comparison?.accuracyVsExpert?.difference}% gain
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                <Info className="w-4 h-4 inline mr-1 text-amber-600" />
                <strong>Methodological Imperative:</strong> {comparison?.accuracyVsExpert?.explanation}
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === "anomalies" ? (
        /* TAB 3: ASSESSOR ANOMALY PROMPTS (RULE-BASED + SIMPLE STATS) */
        <div className="flex flex-col gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Explainable Statistical & Rule-Based Review Prompts</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Flags are objective review prompts based on explicit mathematical thresholds, never automated accusations.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-amber-600">
                {anomalies.filter((a) => !a.resolvedAt).length} Unresolved Flags
              </span>
            </div>

            {anomalies.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No assessor anomalies detected across evaluated sessions.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {anomalies.map((anom) => {
                  const isResolved = Boolean(anom.resolvedAt);
                  return (
                    <div
                      key={anom.id}
                      className={`p-4 rounded-xl border flex flex-col gap-2 transition ${
                        isResolved
                          ? "bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 opacity-75"
                          : anom.severity === "high"
                          ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60"
                          : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                              anom.severity === "high"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                            }`}
                          >
                            {anom.ruleCode}
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            Assessor: {anom.assessorName}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {isResolved ? (
                            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Resolved</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => setSelectedAnomaly(anom)}
                              className="px-3 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                            >
                              Review & Resolve
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {anom.description}
                      </p>

                      {anom.metrics && Object.keys(anom.metrics).length > 0 && (
                        <div className="text-[10px] font-mono text-slate-500 bg-white/60 dark:bg-black/30 p-2 rounded-lg border border-slate-200/50 dark:border-slate-800">
                          Metrics: {JSON.stringify(anom.metrics)}
                        </div>
                      )}

                      {isResolved && anom.resolutionNote && (
                        <div className="text-[11px] text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-lg border border-emerald-200">
                          <strong>Resolution Note:</strong> {anom.resolutionNote}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TAB 4: EVIDENCE INTEGRITY PANEL */
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Total Evidence Flags</span>
              <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                {integritySummary?.totalFlags || 0}
              </span>
              <span className="text-xs text-rose-600 font-semibold">
                {integritySummary?.unresolvedCount || 0} requiring review
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase">pHash Video Reuse</span>
              <span className="text-2xl font-bold font-mono text-rose-600">
                {integritySummary?.flagsByType?.["reuse"] || 0}
              </span>
              <span className="text-xs text-slate-400">Cross-candidate duplicate visual hash</span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Clock Skew / Timing Drift</span>
              <span className="text-2xl font-bold font-mono text-amber-600">
                {integritySummary?.flagsByType?.["clock_skew"] || 0}
              </span>
              <span className="text-xs text-slate-400">Device vs server arrival drift</span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Geo / Travel Anomalies</span>
              <span className="text-2xl font-bold font-mono text-blue-600">
                {integritySummary?.flagsByType?.["geo_mismatch"] || 0}
              </span>
              <span className="text-xs text-slate-400">District coordinates mismatch</span>
            </div>
          </div>

          {/* Recent Flags List with Raw Access Gate */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
              Evidence Integrity Flags & Unmasking Gate
            </h3>

            {integritySummary?.recentFlags?.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Zero integrity anomalies recorded. All hash chains and visual fingerprints intact.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {integritySummary?.recentFlags?.map((flag: any) => (
                  <div
                    key={flag.id}
                    className="py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                          {flag.type}
                        </span>
                        <strong className="text-slate-900 dark:text-white">
                          Candidate: {flag.candidate_name || "Masked"} ({flag.aadhaar_masked})
                        </strong>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Details: {JSON.stringify(flag.details)}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setUnmaskSessionId(flag.session_id);
                        setUnmaskedData(null);
                        setUnmaskReason("");
                      }}
                      className="px-3 py-1.5 rounded-lg border border-purple-300 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950 font-semibold text-xs transition flex items-center gap-1 shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Unmask Raw Footage</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: RESOLVE ANOMALY PROMPT */}
      {selectedAnomaly && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Resolve Assessor Anomaly Prompt
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedAnomaly.ruleCode} · Assessor {selectedAnomaly.assessorName}
                </p>
              </div>
              <button
                onClick={() => setSelectedAnomaly(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300">
              {selectedAnomaly.description}
            </div>

            <form onSubmit={handleResolveAnomaly} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Mandatory Auditor Resolution Note (Min 10 characters)
                </label>
                <textarea
                  required
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="e.g. Reviewed 3 video recordings. Assessor demonstrated valid rationale despite fast completion time. Calibration active."
                  className="w-full mt-1 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedAnomaly(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolving || resolutionNote.trim().length < 10}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition disabled:opacity-50"
                >
                  {resolving ? "Logging to Audit Trail..." : "Log Resolution & Clear Prompt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: UNMASK RAW PII & FOOTAGE GATE */}
      {unmaskSessionId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-purple-600" />
                  <span>Auditor Access Barrier: Unmask Raw Evidence</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Auditors view aggregate statistics by default. Access to raw video footage requires an explicit logged justification.
                </p>
              </div>
              <button
                onClick={() => setUnmaskSessionId(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!unmaskedData ? (
              <form onSubmit={handleUnmaskRawPII} className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                    Mandatory Audit Justification (Min 8 characters)
                  </label>
                  <input
                    type="text"
                    required
                    value={unmaskReason}
                    onChange={(e) => setUnmaskReason(e.target.value)}
                    placeholder="e.g. Inspecting perceptual hash duplication flag for candidate verification."
                    className="w-full mt-1 p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setUnmaskSessionId(null)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={unmasking || unmaskReason.trim().length < 8}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition disabled:opacity-50"
                  >
                    {unmasking ? "Recording Access..." : "Log Justification & Unmask Footage"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-xs text-emerald-900 dark:text-emerald-200">
                  <strong>Access Logged:</strong> Your justification was recorded in <code>audit_log</code>.
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs flex flex-col gap-1">
                  <span>Candidate: <strong>{unmaskedData.session?.candidate_name}</strong></span>
                  <span>Aadhaar: <code>{unmaskedData.session?.aadhaar_masked}</code></span>
                  <span>District: {unmaskedData.session?.district}</span>
                  <span>Qualification: {unmaskedData.session?.qualification_name}</span>
                </div>

                {unmaskedData.evidence?.[0] && (
                  <div className="aspect-video bg-black rounded-xl overflow-hidden">
                    <video
                      src={unmaskedData.evidence[0].blob_ref}
                      controls
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
