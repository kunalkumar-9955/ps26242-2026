"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Clock,
  Sparkles,
  HelpCircle,
  ShieldAlert,
  ChevronRight,
  HardHat,
  FileCheck2,
  Wrench,
  Lock,
  Eye,
  RefreshCw,
  Send,
  Cpu,
  BadgeAlert,
  Layers,
  History,
  Info,
  Check,
} from "lucide-react";

export default function AssessorScoringWorkspace() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.id as string;
  const { currentUser } = useAuth();
  const lang = currentUser.language;

  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"video_rubric" | "physical" | "signoff">("video_rubric");
  const [activeCriterionIdx, setActiveCriterionIdx] = useState(0);

  // Video player state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoTime, setVideoTime] = useState(0);

  // Scoring states
  const [blindScore, setBlindScore] = useState<number | null>(null);
  const [rationale, setRationale] = useState<string>("");
  const [scoresMap, setScoresMap] = useState<Record<string, any>>({});
  const [aiSuggestionsMap, setAiSuggestionsMap] = useState<Record<string, any>>({});
  const [submittingScore, setSubmittingScore] = useState(false);

  // Revision state
  const [isRevising, setIsRevising] = useState(false);
  const [revisedScore, setRevisedScore] = useState<number | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  // Physical checklist state
  const [physicalChecks, setPhysicalChecks] = useState<any[]>([]);
  const [physicalForm, setPhysicalForm] = useState<Record<string, { level: number; passed: boolean; notes: string }>>({});

  // Sign-off state
  const [outcomeDraft, setOutcomeDraft] = useState<any>(null);
  const [finalOutcomeChoice, setFinalOutcomeChoice] = useState<string>("competent");
  const [signoffReason, setSignoffReason] = useState<string>("");
  const [signedOff, setSignedOff] = useState(false);
  const [signingOff, setSigningOff] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Fetch Session Details, Evidence, Criteria & Existing Scores
  const fetchSessionWorkspace = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const res = await fetch(`/api/assessor/sessions?sessionId=${sessionId}`, {
        headers: {
          "x-user-id": currentUser.id,
          "x-user-role": currentUser.role,
        },
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to load session");
      }

      setSessionData(data);

      // Check if calibration is certified
      if (!data.certification?.certified && currentUser.role === "assessor") {
        setErrorMessage("Your assessor calibration has expired or is unverified. Scoring is locked.");
      }

      // Populate scores map
      const map: Record<string, any> = {};
      for (const s of data.scores || []) {
        if (!map[s.criterion_id]) {
          map[s.criterion_id] = { blind: null, revised: null };
        }
        if (s.is_blind) {
          map[s.criterion_id].blind = s;
        } else if (s.revised_after_ai) {
          map[s.criterion_id].revised = s;
        }
      }
      setScoresMap(map);

      // Check recommendations
      const recRes = await fetch(`/api/assessor/recommendations?sessionId=${sessionId}`);
      const recData = await recRes.json();
      if (recData.outcome) {
        setOutcomeDraft(recData.outcome);
        setFinalOutcomeChoice(recData.outcome.recommendedOutcome || "competent");
      }
      if (recData.recommendation) {
        setSignedOff(true);
        setFinalOutcomeChoice(recData.recommendation.final_assessor_outcome);
      }

      // Load physical checks
      const physRes = await fetch(`/api/assessor/physical?sessionId=${sessionId}`);
      const physData = await physRes.json();
      if (physData.criteria) {
        setPhysicalChecks(physData.criteria);
        const pForm: Record<string, any> = {};
        for (const item of physData.criteria) {
          pForm[item.id] = {
            level: item.verification?.level || 3,
            passed: item.verification?.passed ?? true,
            notes: item.verification?.tactile_notes || "",
          };
        }
        setPhysicalForm(pForm);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load workspace data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      fetchSessionWorkspace();
    }
  }, [sessionId, currentUser.id]);

  // Current active criterion
  const currentCriterion = sessionData?.criteria?.[activeCriterionIdx];
  const existingScoresForCriterion = currentCriterion ? scoresMap[currentCriterion.id] : null;
  const hasBlindScore = Boolean(existingScoresForCriterion?.blind);

  // Sync inputs when active criterion changes
  useEffect(() => {
    if (currentCriterion) {
      const existing = scoresMap[currentCriterion.id];
      if (existing?.blind) {
        setBlindScore(existing.blind.level);
        setRationale(existing.blind.rationale);
        // Fetch AI suggestion safely since blind score exists
        fetchAiSuggestion(currentCriterion.id);
      } else {
        setBlindScore(null);
        setRationale("");
      }

      if (existing?.revised) {
        setIsRevising(true);
        setRevisedScore(existing.revised.level);
        setOverrideReason(existing.revised.override_reason || "");
      } else {
        setIsRevising(false);
        setRevisedScore(null);
        setOverrideReason("");
      }
    }
  }, [activeCriterionIdx, sessionData, scoresMap]);

  // Fetch AI suggestion for criterion
  const fetchAiSuggestion = async (criterionId: string) => {
    try {
      const res = await fetch(
        `/api/assessor/suggestions?sessionId=${sessionId}&criterionId=${criterionId}`,
        {
          headers: {
            "x-user-id": currentUser.id,
            "x-user-role": currentUser.role,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setAiSuggestionsMap((prev) => ({
          ...prev,
          [criterionId]: data.suggestion,
        }));
      }
    } catch (err) {
      console.warn("Could not fetch AI suggestion:", err);
    }
  };

  // Keyboard shortcut listener for rapid 1, 2, 3, 4 scoring
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing inside input or textarea
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (["1", "2", "3", "4"].includes(e.key)) {
        const num = parseInt(e.key, 10);
        if (hasBlindScore) {
          setIsRevising(true);
          setRevisedScore(num);
        } else {
          setBlindScore(num);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasBlindScore]);

  // Seek video to timestamp
  const seekVideo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  };

  // Submit Blind Score
  const handleCommitBlindScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCriterion || blindScore === null) return;

    if (!rationale || rationale.trim().length < 10) {
      alert("A detailed technical rationale of at least 10 characters is mandatory for audit trail.");
      return;
    }

    try {
      setSubmittingScore(true);
      setErrorMessage(null);

      const res = await fetch("/api/assessor/scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUser.id,
          "x-user-role": currentUser.role,
        },
        body: JSON.stringify({
          sessionId,
          criterionId: currentCriterion.id,
          level: blindScore,
          rationale: rationale.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to commit blind score");
      }

      // Update local scores map
      setScoresMap((prev) => ({
        ...prev,
        [currentCriterion.id]: {
          ...prev[currentCriterion.id],
          blind: data.score,
        },
      }));

      // Immediately fetch newly unblocked AI suggestion
      await fetchAiSuggestion(currentCriterion.id);
    } catch (err: any) {
      setErrorMessage(err.message || "Blind score submission failed");
    } finally {
      setSubmittingScore(false);
    }
  };

  // Submit Revised Score with Override Reason
  const handleCommitRevisedScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCriterion || revisedScore === null) return;

    if (!overrideReason || overrideReason.trim().length < 5) {
      alert("An override reason (minimum 5 characters) is required when altering your original score.");
      return;
    }

    try {
      setSubmittingScore(true);
      setErrorMessage(null);

      const res = await fetch("/api/assessor/scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUser.id,
          "x-user-role": currentUser.role,
        },
        body: JSON.stringify({
          sessionId,
          criterionId: currentCriterion.id,
          level: revisedScore,
          isRevised: true,
          overrideReason: overrideReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to save revised score");
      }

      setScoresMap((prev) => ({
        ...prev,
        [currentCriterion.id]: {
          ...prev[currentCriterion.id],
          revised: data.score,
        },
      }));
    } catch (err: any) {
      setErrorMessage(err.message || "Revision submission failed");
    } finally {
      setSubmittingScore(false);
    }
  };

  // Submit Physical Verification Item
  const handleSavePhysicalCheck = async (criterionId: string) => {
    const check = physicalForm[criterionId];
    if (!check) return;

    if (!check.notes || check.notes.trim().length < 5) {
      alert("Please provide tactile observation notes (e.g., crimp pull test result).");
      return;
    }

    try {
      const res = await fetch("/api/assessor/physical", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUser.id,
          "x-user-role": currentUser.role,
        },
        body: JSON.stringify({
          sessionId,
          criterionId,
          level: check.level,
          passed: check.passed,
          tactileNotes: check.notes,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to record physical check");
      }

      alert("Physical verification check recorded successfully.");
    } catch (err: any) {
      alert(err.message || "Could not record physical check");
    }
  };

  // Submit Final Recommendation Sign-Off
  const handleFinalSignoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcomeDraft) return;

    try {
      setSigningOff(true);
      setErrorMessage(null);

      const res = await fetch("/api/assessor/recommendations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUser.id,
          "x-user-role": currentUser.role,
        },
        body: JSON.stringify({
          sessionId,
          systemDraftOutcome: outcomeDraft.recommendedOutcome,
          finalOutcome: finalOutcomeChoice,
          overrideReason:
            outcomeDraft.recommendedOutcome !== finalOutcomeChoice ? signoffReason : "",
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Sign-off failed");
      }

      setSignedOff(true);
      alert("Session officially signed off and sealed. Audit hash written to ledger.");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to complete sign-off");
    } finally {
      setSigningOff(false);
    }
  };

  const aiSuggestion = currentCriterion ? aiSuggestionsMap[currentCriterion.id] : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 flex flex-col gap-5">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/assessor"
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
            aria-label="Back to queue"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                {sessionData?.session?.candidate_name || "Candidate Assessment"}
              </h1>
              <span className="text-xs font-mono text-slate-500">
                ({sessionData?.session?.aadhaar_masked})
              </span>
              {sessionData?.session?.is_synthetic && (
                <span className="text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-1.5 py-0.2 rounded font-mono">
                  SYNTHETIC
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <strong>{sessionData?.session?.qp_code}</strong> · {sessionData?.session?.qualification_name} · {sessionData?.session?.district || "Lucknow"}
            </p>
          </div>
        </div>

        {/* Workspace Mode Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-stretch sm:self-auto">
          <button
            onClick={() => setActiveTab("video_rubric")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === "video_rubric"
                ? "bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Blind Video Scoring</span>
          </button>

          <button
            onClick={() => setActiveTab("physical")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === "physical"
                ? "bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Physical Checklist</span>
            {physicalChecks.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-200 dark:bg-amber-900 font-mono">
                {physicalChecks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("signoff")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === "signoff"
                ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Recommendation & Sign-off</span>
          </button>
        </div>
      </div>

      {/* Calibration Warning if not certified */}
      {sessionData?.certification && !sessionData?.certification?.certified && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <span>
              <strong>Calibration Gate Blocked:</strong> Your inter-rater reliability is below 0.70 or expired. Scoring changes will be rejected until recalibrated.
            </span>
          </div>
          <Link
            href="/assessor/calibrate"
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shrink-0"
          >
            Take Calibration Test
          </Link>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <p className="text-xs font-semibold">Loading assessment session data & rubrics...</p>
        </div>
      ) : activeTab === "video_rubric" ? (
        /* TAB 1: BLIND VIDEO & CRITERIA SCORING WORKSPACE */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* LEFT: Video Player & Evidence Timeline (6 cols) */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <div className="bg-black rounded-2xl overflow-hidden shadow-lg border border-slate-800 flex flex-col">
              <div className="relative aspect-video bg-slate-950 flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={
                    sessionData?.evidence?.[0]?.blob_ref ||
                    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
                  }
                  controls
                  onTimeUpdate={(e) => setVideoTime((e.target as HTMLVideoElement).currentTime)}
                  className="w-full h-full object-contain"
                >
                  Your browser does not support video playback.
                </video>
              </div>

              {/* Video Timeline & Evidence Metadata */}
              <div className="p-3 bg-slate-900 text-slate-300 border-t border-slate-800 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-mono text-emerald-400 text-[11px]">
                      Chain Index #
                      {sessionData?.evidence?.[0]?.chain_index ?? "1"}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="font-mono text-[10px] text-slate-400 truncate max-w-[140px]">
                      SHA: {sessionData?.evidence?.[0]?.sha256?.substring(0, 12)}...
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400">
                    Timestamp: {Math.floor(videoTime)}s
                  </span>
                </div>

                {/* Evidence timeline quick markers */}
                <div className="flex items-center gap-1.5 pt-1 overflow-x-auto text-[11px]">
                  <span className="text-slate-500 shrink-0 text-[10px] uppercase font-bold">
                    Markers:
                  </span>
                  {[
                    { label: "0:05 Safety Check", sec: 5 },
                    { label: "0:12 Wire Strip", sec: 12 },
                    { label: "0:24 Conduit Entry", sec: 24 },
                    { label: "0:38 MCB Mount", sec: 38 },
                  ].map((m) => (
                    <button
                      key={m.sec}
                      type="button"
                      onClick={() => seekVideo(m.sec)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono shrink-0 border border-slate-700 flex items-center gap-1"
                    >
                      <Play className="w-2.5 h-2.5 text-blue-400" />
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Criteria Navigation List */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 block">
                CON/Q0602 Criteria Checklist ({sessionData?.criteria?.length || 0})
              </label>
              <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                {sessionData?.criteria?.map((crit: any, idx: number) => {
                  const isCurrent = idx === activeCriterionIdx;
                  const scored = scoresMap[crit.id]?.blind;
                  const revised = scoresMap[crit.id]?.revised;

                  return (
                    <button
                      key={crit.id}
                      type="button"
                      onClick={() => setActiveCriterionIdx(idx)}
                      className={`text-left p-2.5 rounded-xl border text-xs transition flex items-center justify-between ${
                        isCurrent
                          ? "bg-blue-50/80 border-blue-500 text-blue-900 dark:bg-blue-950/40 dark:border-blue-500 dark:text-blue-100 ring-2 ring-blue-500/20"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono text-[10px] font-bold text-slate-500">
                          {crit.criterion_code}
                        </span>
                        <span className="truncate">{crit.description}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {crit.requires_physical && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 font-semibold">
                            PHYSICAL
                          </span>
                        )}
                        {scored ? (
                          <span
                            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                              revised
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                            }`}
                          >
                            L{revised ? revised.level : scored.level}
                            {revised ? " (rev)" : ""}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Unscored</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: Rubric Anchors Side-by-Side & Blind Scoring Card (6 cols) */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            {currentCriterion ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
                {/* Criterion Header */}
                <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                        {currentCriterion.criterion_code}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        Weight: {currentCriterion.weight}
                      </span>
                      {currentCriterion.requires_physical && (
                        <span className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold">
                          Requires Physical Inspection
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1.5">
                      {currentCriterion.description}
                    </h3>
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    [{activeCriterionIdx + 1} / {sessionData?.criteria?.length}]
                  </span>
                </div>

                {/* Rubric Anchors 1-4 Side-by-Side */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                    Rubric Level Descriptions (IS 732 / NQR Standard)
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      {
                        lvl: 1,
                        label: "Level 1: Beginner",
                        desc: currentCriterion.rubric_level_1,
                        color: "border-rose-200 bg-rose-50/50 dark:bg-rose-950/20",
                      },
                      {
                        lvl: 2,
                        label: "Level 2: Developing",
                        desc: currentCriterion.rubric_level_2,
                        color: "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20",
                      },
                      {
                        lvl: 3,
                        label: "Level 3: Competent",
                        desc: currentCriterion.rubric_level_3,
                        color: "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20",
                      },
                      {
                        lvl: 4,
                        label: "Level 4: Master",
                        desc: currentCriterion.rubric_level_4,
                        color: "border-blue-200 bg-blue-50/50 dark:bg-blue-950/20",
                      },
                    ].map((item) => (
                      <div
                        key={item.lvl}
                        className={`p-2.5 rounded-xl border text-[11px] leading-relaxed flex flex-col gap-0.5 ${item.color}`}
                      >
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {item.label}
                        </span>
                        <p className="text-slate-600 dark:text-slate-400">
                          {item.desc || "Standard criteria adherence"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* STEP 1: BLIND SCORE INPUT */}
                <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800/60 bg-blue-50/30 dark:bg-blue-950/20 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Assessor Blind Assessment (Score 1-4)</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Keys: 1, 2, 3, 4
                    </span>
                  </div>

                  {/* Level Radio selector */}
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map((num) => {
                      const isSel = blindScore === num;
                      return (
                        <button
                          key={num}
                          type="button"
                          disabled={hasBlindScore}
                          onClick={() => setBlindScore(num)}
                          className={`py-2 text-center rounded-lg border text-xs font-bold transition flex flex-col items-center gap-0.5 min-h-[44px] ${
                            isSel
                              ? "bg-blue-600 border-blue-600 text-white shadow ring-2 ring-blue-500/20"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                          } ${hasBlindScore ? "cursor-default opacity-85" : ""}`}
                        >
                          <span>L{num}</span>
                          <span className="text-[9px] font-normal opacity-80">
                            {num === 1 ? "Beginner" : num === 2 ? "Developing" : num === 3 ? "Standard" : "Master"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                      Mandatory Technical Rationale (Min 10 characters)
                    </label>
                    <textarea
                      value={rationale}
                      disabled={hasBlindScore}
                      onChange={(e) => setRationale(e.target.value)}
                      placeholder="e.g., Worker used insulated screw driver correctly, verified zero voltage on busbar before crimping."
                      className="w-full mt-1 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-75 disabled:bg-slate-100 dark:disabled:bg-slate-800"
                      rows={2}
                    />
                  </div>

                  {!hasBlindScore && (
                    <button
                      type="button"
                      onClick={handleCommitBlindScore}
                      disabled={submittingScore || blindScore === null || !rationale || rationale.length < 10}
                      className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow flex items-center justify-center gap-1.5 disabled:opacity-50 min-h-[44px]"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>{submittingScore ? "Committing..." : "Commit Blind Score & Unlock AI Suggestion"}</span>
                    </button>
                  )}
                </div>

                {/* STEP 2: REVEALED AI ADVISORY OBSERVATION (Accessible only AFTER blind score) */}
                {hasBlindScore ? (
                  <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/30 dark:bg-purple-950/20 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <span className="text-xs font-bold text-purple-900 dark:text-purple-200">
                          AI Evidence Observation (Advisory Only)
                        </span>
                      </div>
                      <span className="text-[10px] bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 font-mono px-2 py-0.5 rounded font-bold">
                        NON-BINDING
                      </span>
                    </div>

                    {aiSuggestion ? (
                      aiSuggestion.abstained ? (
                        /* FIRST-CLASS ABSTENTION STATE */
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex flex-col gap-1 text-xs">
                          <div className="flex items-center gap-1.5 font-bold">
                            <BadgeAlert className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>AI Abstained: Physical Inspection Mandatory</span>
                          </div>
                          <p className="text-[11px] text-amber-800 dark:text-amber-300">
                            Reason: <code>{aiSuggestion.abstain_reason || "needs_physical_verification"}</code>. Not assessable from camera footage. Complete tactile checks in the Physical Checklist tab.
                          </p>
                        </div>
                      ) : (
                        /* AI OBSERVATION WITH LEVEL & TIMESTAMPS */
                        <div className="flex flex-col gap-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600 dark:text-slate-400">
                              Suggested: <strong className="text-purple-700 dark:text-purple-300">Level {aiSuggestion.suggested_level}</strong>
                            </span>
                            <span className="text-slate-500 font-mono text-[11px]">
                              Confidence: {Math.round((aiSuggestion.confidence || 0) * 100)}%
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded-lg border border-purple-100 dark:border-purple-900">
                            {aiSuggestion.ai_rationale}
                          </p>

                          {aiSuggestion.cited_evidence && aiSuggestion.cited_evidence.length > 0 && (
                            <div className="flex items-center gap-1.5 text-[10px] font-mono">
                              <span className="text-slate-500">Cited Footage:</span>
                              {aiSuggestion.cited_evidence.map((c: any, i: number) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => seekVideo(c.timestamp_seconds || 10)}
                                  className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800"
                                >
                                  @{c.timestamp_seconds || 10}s
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="text-xs text-slate-400 italic">
                        Fetching AI advisory observation...
                      </div>
                    )}

                    {/* STEP 3: OPTIONAL SCORE REVISION / OVERRIDE */}
                    <div className="border-t border-purple-200 dark:border-purple-800/60 pt-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          Revise Score Post-AI Observation?
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsRevising(!isRevising)}
                          className="text-[11px] text-blue-600 dark:text-blue-400 underline font-semibold"
                        >
                          {isRevising ? "Cancel Revision" : "Modify Score"}
                        </button>
                      </div>

                      {isRevising && (
                        <div className="flex flex-col gap-2 bg-white dark:bg-slate-900 p-3 rounded-lg border border-purple-200 dark:border-purple-800">
                          <label className="text-[10px] font-bold uppercase text-slate-500">
                            Select Revised Level
                          </label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[1, 2, 3, 4].map((num) => (
                              <button
                                key={num}
                                type="button"
                                onClick={() => setRevisedScore(num)}
                                className={`py-1.5 text-center rounded text-xs font-bold border ${
                                  revisedScore === num
                                    ? "bg-purple-600 text-white border-purple-600"
                                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 text-slate-700 dark:text-slate-300"
                                }`}
                              >
                                L{num}
                              </button>
                            ))}
                          </div>

                          <label className="text-[10px] font-bold uppercase text-slate-500 mt-1">
                            Mandatory Override Reason (Min 5 chars)
                          </label>
                          <input
                            type="text"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="e.g., Re-verified crimp alignment at 0:14 timestamp."
                            className="p-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none"
                          />

                          <button
                            type="button"
                            onClick={handleCommitRevisedScore}
                            disabled={submittingScore || revisedScore === null || !overrideReason || overrideReason.length < 5}
                            className="mt-1 py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition disabled:opacity-50"
                          >
                            Save Revision (Preserves Blind Score L{blindScore})
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-slate-400" />
                    <span>AI advisory suggestions remain strictly server-locked until you commit your blind evaluation.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                Select a criterion from the checklist to begin scoring.
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "physical" ? (
        /* TAB 2: PHYSICAL VERIFICATION CHECKLIST */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
          <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-600" />
                <span>Hands-on Physical Verification Checklist</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Criteria requiring tactile testing (insulation resistance megger test, crimp tensile pull, terminal torque, finish).
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Offline-Capable Cache
            </span>
          </div>

          {physicalChecks.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No physical inspection criteria assigned to this qualification.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {physicalChecks.map((item) => {
                const formState = physicalForm[item.id] || { level: 3, passed: true, notes: "" };
                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                          {item.criterion_code}
                        </span>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                          {item.description}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPhysicalForm((prev) => ({
                              ...prev,
                              [item.id]: { ...formState, passed: !formState.passed },
                            }))
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                            formState.passed
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200"
                          }`}
                        >
                          {formState.passed ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Pass (Tactile OK)</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Fail (Defect Found)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-4">
                        <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">
                          Proficiency Rating (1-4)
                        </label>
                        <div className="grid grid-cols-4 gap-1">
                          {[1, 2, 3, 4].map((lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              onClick={() =>
                                setPhysicalForm((prev) => ({
                                  ...prev,
                                  [item.id]: { ...formState, level: lvl },
                                }))
                              }
                              className={`py-1.5 text-center text-xs font-bold rounded border ${
                                formState.level === lvl
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white dark:bg-slate-900 border-slate-200 text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              L{lvl}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="sm:col-span-6">
                        <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">
                          Tactile Observation Notes & Measurements
                        </label>
                        <input
                          type="text"
                          value={formState.notes}
                          onChange={(e) =>
                            setPhysicalForm((prev) => ({
                              ...prev,
                              [item.id]: { ...formState, notes: e.target.value },
                            }))
                          }
                          placeholder="e.g. 500V Megger showed 45 MΩ (> 1 MΩ minimum per IS 732)."
                          className="w-full p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2 flex items-end">
                        <button
                          type="button"
                          onClick={() => handleSavePhysicalCheck(item.id)}
                          className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition"
                        >
                          Record Check
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* TAB 3: DETERMINISTIC RECOMMENDATION & FINAL SIGN-OFF */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-emerald-600" />
              <span>Assessor Recommendation & Cryptographic Sign-Off</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Deterministic score arithmetic: LLM writes explanation only. Assessor retains full legal responsibility.
            </p>
          </div>

          {outcomeDraft && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col gap-1">
                <span className="text-[11px] text-slate-500 uppercase font-bold">
                  Total Weighted Score
                </span>
                <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                  {outcomeDraft.totalWeightedScore} / {outcomeDraft.maxWeightedScore}
                </span>
                <span className="text-xs text-slate-400">
                  {outcomeDraft.percentageScore}% computed grade
                </span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col gap-1">
                <span className="text-[11px] text-slate-500 uppercase font-bold">
                  Passing Threshold
                </span>
                <span className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  {outcomeDraft.passingThreshold}%
                </span>
                <span className="text-xs text-slate-400">From platform_settings</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col gap-1">
                <span className="text-[11px] text-slate-500 uppercase font-bold">
                  Deterministic System Draft
                </span>
                <span
                  className={`text-lg font-bold uppercase font-mono ${
                    outcomeDraft.recommendedOutcome === "competent"
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }`}
                >
                  {outcomeDraft.recommendedOutcome.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-slate-400">Strict arithmetic computation</span>
              </div>
            </div>
          )}

          {/* Sign-off Form */}
          <form onSubmit={handleFinalSignoff} className="flex flex-col gap-5">
            <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/20 dark:bg-emerald-950/20 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Final Assessor Determination
              </h3>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "competent", label: "Competent (Issue Credential)" },
                  { id: "gap_training_required", label: "Gap Training Required" },
                  { id: "not_yet_competent", label: "Not Yet Competent" },
                ].map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={signedOff}
                    onClick={() => setFinalOutcomeChoice(choice.id)}
                    className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                      finalOutcomeChoice === choice.id
                        ? "bg-emerald-600 text-white border-emerald-600 shadow"
                        : "bg-white dark:bg-slate-900 border-slate-200 text-slate-700 dark:text-slate-300"
                    } ${signedOff ? "opacity-75 cursor-default" : ""}`}
                  >
                    <span>{choice.label}</span>
                  </button>
                ))}
              </div>

              {outcomeDraft && outcomeDraft.recommendedOutcome !== finalOutcomeChoice && (
                <div>
                  <label className="text-[10px] font-bold text-rose-600 uppercase">
                    Mandatory Override Rationale (Overriding System Draft)
                  </label>
                  <textarea
                    value={signoffReason}
                    disabled={signedOff}
                    onChange={(e) => setSignoffReason(e.target.value)}
                    placeholder="Explain why you are overriding the deterministic score (e.g., exceptional workplace safety demeanor observed during conduit install)..."
                    className="w-full mt-1 p-2 text-xs rounded border border-rose-300 bg-white dark:bg-slate-900"
                    rows={2}
                    required
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-500">
                {signedOff ? (
                  <span className="text-emerald-600 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Digitally signed and sealed into immutable evidence chain.</span>
                  </span>
                ) : (
                  <span>
                    Signing commits this session permanently and enables verifiable credential issuance.
                  </span>
                )}
              </div>

              {!signedOff && (
                <button
                  type="submit"
                  disabled={signingOff}
                  className="py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition flex items-center gap-2 min-h-[48px] disabled:opacity-50"
                >
                  <FileCheck2 className="w-4 h-4" />
                  <span>{signingOff ? "Signing & Sealing..." : "Digitally Sign & Complete Assessment"}</span>
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
