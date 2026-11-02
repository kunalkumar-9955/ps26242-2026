"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Video,
  Eye,
  Plus,
  Search,
  ShieldCheck,
  ShieldAlert,
  Server,
  Trash2,
  ExternalLink,
  ChevronRight,
  Lock,
  RefreshCw,
  Hash,
  Award,
} from "lucide-react";

export default function AdminPage() {
  const { currentUser, setRole } = useAuth();
  const [activeTab, setActiveTab] = useState<"qp" | "slang" | "audit" | "provenance" | "gold_clips" | "credentials">("qp");
  
  // Database data state
  const [qualification, setQualification] = useState<any>(null);
  const [selectedNos, setSelectedNos] = useState<any>(null);
  const [tradeTerms, setTradeTerms] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [goldClips, setGoldClips] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [searchTerm, setSearchTerm] = useState("");
  const [newVernacular, setNewVernacular] = useState("");
  const [newEnglishTask, setNewEnglishTask] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revocationReason, setRevocationReason] = useState("");

  // New Gold Clip Form State
  const [newClipTitle, setNewClipTitle] = useState("");
  const [newClipRef, setNewClipRef] = useState("");
  const [newClipExpert, setNewClipExpert] = useState("");
  const [newClipSource, setNewClipSource] = useState("CSDCI Master Assessor Benchmark Workshop 2025");
  const [newClipSynthetic, setNewClipSynthetic] = useState(true);

  // Fetch live DB data
  const loadDatabaseData = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch Qualification & NOS from Postgres
      const qpRes = await fetch("/api/admin/qualifications");
      const qpData = await qpRes.json();
      if (qpData.qualification) {
        setQualification(qpData.qualification);
        if (qpData.qualification.nosList?.length > 0) {
          setSelectedNos((prev: any) => prev || qpData.qualification.nosList[0]);
        }
      }

      // 2. Fetch Trade Terms from Postgres
      const ttRes = await fetch("/api/admin/trade-terms");
      const ttData = await ttRes.json();
      if (ttData.tradeTerms) {
        setTradeTerms(ttData.tradeTerms);
      }

      // 3. Fetch Gold Standard Clips
      const clipsRes = await fetch("/api/admin/gold-clips");
      const clipsData = await clipsRes.json();
      if (clipsData.goldClips) {
        setGoldClips(clipsData.goldClips);
      }

      // 4. Fetch Audit Logs from Postgres (if admin/auditor)
      if (["admin", "auditor"].includes(currentUser.role)) {
        const auditRes = await fetch("/api/admin/audit-log", {
          headers: { "x-user-role": currentUser.role, "x-user-id": currentUser.id },
        });
        const auditData = await auditRes.json();
        // 5. Fetch Issued Credentials from Postgres
        const credsRes = await fetch("/api/admin/credentials", {
          headers: { "x-user-role": currentUser.role, "x-user-id": currentUser.id },
        });
        const credsData = await credsRes.json();
        if (credsData.credentials) {
          setCredentials(credsData.credentials);
        }
      }
    } catch (err: any) {
      console.error("Error loading data from DB:", err);
      setError("Failed to connect to PostgreSQL backend. Ensure DB is seeded.");
    } finally {
      setLoading(false);
    }
  }, [currentUser.role, currentUser.id]);

  const handleRevoke = async (credentialId: string) => {
    if (!revocationReason || revocationReason.trim().length < 10) {
      alert("A detailed revocation reason of at least 10 characters is mandatory for audit trail.");
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await fetch("/api/credentials/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({ credentialId, reason: revocationReason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to revoke credential");
      }
      setRevokingId(null);
      setRevocationReason("");
      await loadDatabaseData();
    } catch (err: any) {
      alert(`Revocation error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    loadDatabaseData();
  }, [loadDatabaseData]);

  // Handle adding new trade term with DB persistence and audit log
  const handleAddTradeTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVernacular || !newEnglishTask) return;

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/admin/trade-terms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({
          qualificationId: qualification?.id,
          vernacularTerm: newVernacular,
          standardEnglishTask: newEnglishTask,
          language: "hi",
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        alert(`Error: ${errJson.error || "Failed to add trade term"}`);
        return;
      }

      setNewVernacular("");
      setNewEnglishTask("");
      await loadDatabaseData();
    } catch (err: any) {
      alert(`Database network error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete trade term
  const handleDeleteTradeTerm = async (id: string) => {
    if (!confirm("Are you sure you want to delete this trade term? Action will be audited.")) return;

    try {
      const res = await fetch(`/api/admin/trade-terms?id=${id}`, {
        method: "DELETE",
        headers: {
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.id,
        },
      });

      if (!res.ok) {
        const errJson = await res.json();
        alert(`Error: ${errJson.error}`);
        return;
      }

      await loadDatabaseData();
    } catch (err: any) {
      alert(`Error deleting: ${err.message}`);
    }
  };

  const handleAddGoldClip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClipTitle || !newClipRef || !newClipExpert || !qualification) return;

    try {
      setIsSubmitting(true);
      // Grab criteria from current qualification
      const criteriaList = qualification.nosList?.flatMap((n: any) => n.criteria) || [];
      const criterionScores = criteriaList.map((c: any) => ({
        criterion_id: c.id,
        criterion_code: c.criterion_code,
        expert_level: 3, // standard level
        expert_name: newClipExpert,
        notes: "Benchmark demonstration standard",
      }));

      const res = await fetch("/api/admin/gold-clips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({
          qualificationId: qualification.id,
          title: newClipTitle,
          clipRef: newClipRef,
          source: newClipSource,
          expertName: newClipExpert,
          criterionScores,
          synthetic: newClipSynthetic,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        alert(`Error: ${errJson.error}`);
        return;
      }

      setNewClipTitle("");
      setNewClipRef("");
      setNewClipExpert("");
      await loadDatabaseData();
      alert("Gold standard clip registered and expert benchmark saved.");
    } catch (err: any) {
      alert(`Error adding gold clip: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // GATE: 403 Forbidden if not admin
  if (currentUser.role !== "admin") {
    return (
      <div className="max-w-3xl mx-auto my-16 px-4">
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 shadow-lg text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-3 py-1 rounded-full border border-rose-200 dark:border-rose-800">
            HTTP 403 Forbidden · Role Restricted
          </span>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-4">
            Administrator Access Only
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mt-2">
            You are currently authenticated as <strong>{currentUser.name}</strong> with role{" "}
            <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-slate-800 dark:text-slate-200">
              {currentUser.role}
            </code>
            . Modifying qualifications, NOS definitions, and platform policies requires Administrator credentials.
          </p>

          <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <button
              onClick={() => setRole("admin")}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition"
            >
              Switch to Platform Admin Demo Role
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredTradeTerms = tradeTerms.filter(
    (t) =>
      t.vernacular_term.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.standard_english_task.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1 flex flex-col gap-6">
      {/* Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              <BookOpen className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Qualification Pack & Standards Registry
            </h1>
            <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-300">
              PostgreSQL Live DB
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Official NCVET NQR Standards, Draft Rubric Governance & Cryptographic Audit Trails
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("qp")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "qp"
                ? "bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            QP & NOS Hierarchy
          </button>
          <button
            onClick={() => setActiveTab("slang")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "slang"
                ? "bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            Vernacular Slang ({tradeTerms.length})
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "audit"
                ? "bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            Audit Log ({auditLogs.length})
          </button>
          <button
            onClick={() => setActiveTab("provenance")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "provenance"
                ? "bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            Provenance & Honesty
          </button>
          <button
            onClick={() => setActiveTab("gold_clips")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "gold_clips"
                ? "bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            Gold Benchmark Clips ({goldClips.length})
          </button>
          <button
            onClick={() => setActiveTab("credentials")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "credentials"
                ? "bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            Credentials & Revocation ({credentials.length})
          </button>
        </div>
      </div>

      {loading && (
        <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          <span>Synchronizing live records from PostgreSQL (satyarpl_db)...</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          <strong>Database Connection Error:</strong> {error}
        </div>
      )}

      {/* TAB 1: QP & NOS HIERARCHY */}
      {!loading && activeTab === "qp" && qualification && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: QP & NOS List (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* QP Banner Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      {qualification.qp_code} · v{qualification.version}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      NQR: {qualification.nqr_code}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                    {qualification.name}
                  </h2>
                </div>

                {/* Provenance Badge */}
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>NQR VERIFIED</span>
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex flex-col gap-2">
                <div>
                  <strong>Sector:</strong> {qualification.sector_name} ({qualification.sector_code})
                </div>
                <div className="flex items-center justify-between">
                  <span>
                    <strong>NSQF Level:</strong> {qualification.nsqf_level}
                  </span>
                  {/* Passing Threshold Setting */}
                  <span className="inline-flex items-center gap-1 text-[11px]">
                    <strong>Passing:</strong> {qualification.passThresholdSetting?.value?.threshold || 50}%
                    <span
                      title={qualification.passThresholdSetting?.note}
                      className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-semibold cursor-help"
                    >
                      UNVERIFIED (PMKVY draft)
                    </span>
                  </span>
                </div>
                <a
                  href={qualification.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1 mt-1 font-medium"
                >
                  <span>Official NQR Qualification Page</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* NOS List */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-1">
                Compulsory NOS Units ({qualification.nosList?.length || 0})
              </h3>
              <div className="flex flex-col gap-2">
                {qualification.nosList?.map((nos: any) => {
                  const isSelected = selectedNos?.id === nos.id;
                  return (
                    <button
                      key={nos.id}
                      onClick={() => setSelectedNos(nos)}
                      className={`text-left p-3 rounded-xl border text-xs transition flex items-start justify-between gap-3 ${
                        isSelected
                          ? "bg-blue-50 border-blue-300 text-blue-900 dark:bg-blue-950/40 dark:border-blue-700 dark:text-blue-200"
                          : "border-slate-200 hover:border-slate-300 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono text-[11px] text-blue-700 dark:text-blue-400">
                            {nos.code}
                          </span>
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] rounded font-semibold">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>NQR Title</span>
                          </span>
                        </div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100 mt-1 line-clamp-2">
                          {nos.title}
                        </p>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {nos.criteria?.length || 0} Criteria · Practical: {nos.practical_marks}m / Theory: {nos.theory_marks}m
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Selected NOS Performance Criteria (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {selectedNos && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                        {selectedNos.code}
                      </span>
                      <a
                        href={selectedNos.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                      >
                        <span>View Source</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                      {selectedNos.title}
                    </h2>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-6">
                  {selectedNos.criteria?.map((criterion: any) => (
                    <div
                      key={criterion.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-col gap-3"
                    >
                      {/* Criterion Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono font-bold text-xs text-slate-800 dark:text-slate-200">
                            {criterion.criterion_code}
                          </span>
                          <span className="text-xs text-slate-500">
                            Weight: {criterion.weight}
                          </span>
                          {/* Unverified Badge on Criteria */}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span>{criterion.status_label || "draft - needs assessor review"}</span>
                          </span>
                        </div>

                        {/* Modality Badges */}
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                            <Video className="w-3 h-3" />
                            <span>Video: {criterion.assessable_from_video}</span>
                          </span>
                          {criterion.requires_physical && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              <span>In-Person Check</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                        {criterion.description}
                      </p>

                      {/* 4-Level Rubric Table with Draft Watermark */}
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
                          <strong className="text-rose-800 dark:text-rose-400 block mb-1">
                            Level 1 (Unsafe / Needs Training):
                          </strong>
                          <span className="text-slate-700 dark:text-slate-300">
                            {criterion.rubric_level_1}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                          <strong className="text-amber-800 dark:text-amber-400 block mb-1">
                            Level 2 (Partial Skill / Assisted):
                          </strong>
                          <span className="text-slate-700 dark:text-slate-300">
                            {criterion.rubric_level_2}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                          <strong className="text-emerald-800 dark:text-emerald-400 block mb-1">
                            Level 3 (NSQF Competent Standard):
                          </strong>
                          <span className="text-slate-700 dark:text-slate-300">
                            {criterion.rubric_level_3}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                          <strong className="text-blue-800 dark:text-blue-400 block mb-1">
                            Level 4 (Mastery / Explains Safety):
                          </strong>
                          <span className="text-slate-700 dark:text-slate-300">
                            {criterion.rubric_level_4}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: VERNACULAR SLANG DICTIONARY (LIVE POSTGRES READ/WRITE) */}
      {!loading && activeTab === "slang" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Local Trade Slang & Vernacular Mappings
                </h2>
                <span className="text-[11px] font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-200">
                  Authored Draft (Survives Refresh in PostgreSQL)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Translates informal vernacular phrases into formal NSQF task descriptions during voice declarations.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search slang phrase or task..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Slang Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-y border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Vernacular Slang Phrase</th>
                  <th className="py-2.5 px-3">Standard English NSQF Competency</th>
                  <th className="py-2.5 px-3">Language</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTradeTerms.map((term) => (
                  <tr key={term.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                      {term.vernacular_term}
                    </td>
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-300">
                      {term.standard_english_task}
                    </td>
                    <td className="py-3 px-3 uppercase text-[11px] text-slate-500 font-mono">
                      {term.language}
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded border border-amber-200">
                        {term.status_label || "draft - needs assessor review"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => handleDeleteTradeTerm(term.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 transition"
                        title="Delete term (audited)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Slang Form */}
          <form
            onSubmit={handleAddTradeTerm}
            className="pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
          >
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Add Vernacular Phrase (e.g. &ldquo;पाइप मोड़ना&rdquo;)
              </label>
              <input
                type="text"
                required
                placeholder="Enter vernacular trade slang..."
                value={newVernacular}
                onChange={(e) => setNewVernacular(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-5">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mapped Standard Task
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Conduit pipe bending using mechanical bender"
                value={newEnglishTask}
                onChange={(e) => setNewEnglishTask(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>{isSubmitting ? "Writing to DB..." : "Add to DB"}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: AUDIT LOG (CRYPTOGRAPHIC CHAIN DISPLAY) */}
      {!loading && activeTab === "audit" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Append-Only Cryptographic Audit Log
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Every create, update, and delete in the platform is hash-chained and sealed by PostgreSQL triggers.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-y border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Log ID</th>
                  <th className="py-2.5 px-3">Entity & Action</th>
                  <th className="py-2.5 px-3">Actor Role</th>
                  <th className="py-2.5 px-3">SHA-256 Hash Chain</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3 text-slate-400">#{log.id}</td>
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 mr-2 text-[10px]">
                        {log.action}
                      </span>
                      {log.entity_name} ({log.entity_id})
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                      {log.actor_role}
                    </td>
                    <td className="py-3 px-3 text-slate-500 truncate max-w-xs" title={`Curr: ${log.curr_hash}\nPrev: ${log.prev_hash}`}>
                      <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold truncate">
                        curr: {log.curr_hash.substring(0, 16)}...
                      </div>
                      <div className="text-[9px] text-slate-400 truncate">
                        prev: {log.prev_hash.substring(0, 16)}...
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-[10px]">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PROVENANCE & HONEST DEMARCATION */}
      {!loading && activeTab === "provenance" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-2">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Official NQR Verified Sources
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Qualification <strong>CON/Q0602 v2.0</strong> (NQR Code: <code>QG-03-CO-03951-2025-V2-CSDCI</code>) and all 7 NOS codes/titles are fetched directly from{" "}
              <a href="https://www.nqr.gov.in/qualifications/13772" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                nqr.gov.in/qualifications/13772
              </a>
              .
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-emerald-700">
              ● verified = true
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-2">
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Authored Draft Criteria & Rubrics
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Performance criteria, 4-level rubric anchors, weights, video assessability flags, and vernacular trade slang were authored as engineering drafts and explicitly require Sector Skill Council assessor review.
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-amber-700">
              ● verified = false (draft - needs assessor review)
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-2">
            <div className="flex items-center gap-2 text-purple-600">
              <Server className="w-5 h-5" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Passing Threshold Provenance
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              The 50% passing threshold for NSQF Level 3 is stored in <code>platform_settings</code> as a configurable draft setting derived from PMKVY RPL guidelines, not from the base NQR document.
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-purple-700">
              ● configurable draft setting (UNVERIFIED)
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: GOLD STANDARD CLIPS (CALIBRATION BENCHMARKS) */}
      {!loading && activeTab === "gold_clips" && (
        <div className="flex flex-col gap-6">
          {/* Top Admin Controls & Add New Clip Form */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Video className="w-4 h-4 text-amber-600" />
              <span>Register New Gold-Standard Benchmark Clip</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Add master evaluation footage with expert baseline criterion scores for assessor Cohen’s quadratic kappa calibration.
            </p>

            <form onSubmit={handleAddGoldClip} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="font-bold text-slate-600 dark:text-slate-400">Clip Title</label>
                <input
                  type="text"
                  required
                  value={newClipTitle}
                  onChange={(e) => setNewClipTitle(e.target.value)}
                  placeholder="e.g. Master DB Termination Benchmark"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-slate-600 dark:text-slate-400">Clip URL / Ref</label>
                <input
                  type="url"
                  required
                  value={newClipRef}
                  onChange={(e) => setNewClipRef(e.target.value)}
                  placeholder="https://.../video.mp4"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-slate-600 dark:text-slate-400">Master Expert Name</label>
                <input
                  type="text"
                  required
                  value={newClipExpert}
                  onChange={(e) => setNewClipExpert(e.target.value)}
                  placeholder="e.g. Er. R. K. Mishra (Senior Master Trainer)"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none"
                />
              </div>

              <div className="flex flex-col gap-1 justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition flex items-center justify-center gap-1.5 shadow"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isSubmitting ? "Saving..." : "Add Gold Clip"}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Gold Clips List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {goldClips.map((clip) => (
              <div
                key={clip.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col gap-3 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {clip.title}
                      </span>
                      {clip.synthetic && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-1.5 py-0.2 rounded font-mono font-semibold">
                          SYNTHETIC
                        </span>
                      )}
                    </div>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Master Evaluator: <strong>{clip.expert_name}</strong> · {clip.source}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    Benchmark Criteria Scores ({clip.criterion_scores?.length || 0})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {clip.criterion_scores?.map((c: any, i: number) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                      >
                        {c.criterion_code}: L{c.expert_level}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 truncate font-mono">
                  Ref: {clip.clip_ref}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. CREDENTIALS & REVOCATION TAB */}
      {activeTab === "credentials" && (
        <div className="flex flex-col gap-6">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Award className="w-4 h-4 text-orange-600" />
              <span>Issued Verifiable Credentials & Live Revocation Registry</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              All credentials are cryptographically signed with Ed25519 and verifiable via public unguessable slugs. Revocations are permanently logged to the audit log.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-2">Candidate</th>
                    <th className="pb-2">Qualification</th>
                    <th className="pb-2">Verify Slug</th>
                    <th className="pb-2">Issued At</th>
                    <th className="pb-2">Key ID</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {credentials.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                        No credentials issued yet. Credentials require a completed assessor sign-off.
                      </td>
                    </tr>
                  ) : (
                    credentials.map((cred) => (
                      <tr key={cred.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 font-sans font-medium text-slate-900 dark:text-white">
                          {cred.candidate_name}
                          <span className="block text-[10px] text-slate-400 font-mono">
                            {cred.pseudonymous_id}
                          </span>
                        </td>
                        <td className="py-3 font-sans text-slate-600 dark:text-slate-300">
                          {cred.qp_code}
                        </td>
                        <td className="py-3 text-[11px] text-blue-600 dark:text-blue-400 truncate max-w-[140px]">
                          <a href={`/verify/${cred.verify_slug}`} target="_blank" rel="noreferrer" className="hover:underline">
                            {cred.verify_slug.slice(0, 12)}...
                          </a>
                        </td>
                        <td className="py-3 text-[11px] text-slate-500">
                          {cred.issued_at ? new Date(cred.issued_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-3 text-[10px] text-slate-400">
                          {cred.key_id}
                        </td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              cred.status === "valid"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : cred.status === "revoked"
                                ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            }`}
                          >
                            {cred.status}
                          </span>
                          {cred.revocation_reason && (
                            <span className="block text-[9px] text-red-500 truncate max-w-[140px] font-sans">
                              {cred.revocation_reason}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right font-sans">
                          {cred.status === "valid" ? (
                            <button
                              onClick={() => {
                                setRevokingId(cred.id);
                                setRevocationReason("");
                              }}
                              className="px-2.5 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 text-xs font-semibold"
                            >
                              Revoke
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Revocation Modal */}
            {revokingId && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
                  <div className="flex items-center gap-3 text-red-600">
                    <AlertTriangle className="w-6 h-6" />
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">
                      Confirm Formal Credential Revocation
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Revoking an issued vocational credential is an irreversible action permanently recorded in the cryptographic audit trail. Public verifications will immediately reflect the revoked status.
                  </p>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Mandatory Revocation Reason (&ge; 10 characters)
                    </label>
                    <textarea
                      required
                      value={revocationReason}
                      onChange={(e) => setRevocationReason(e.target.value)}
                      placeholder="e.g. Identity impersonation verified during post-assessment audit review..."
                      rows={3}
                      className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs outline-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setRevokingId(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting || revocationReason.trim().length < 10}
                      onClick={() => handleRevoke(revokingId)}
                      className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50"
                    >
                      {isSubmitting ? "Revoking..." : "Confirm Revocation"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
