"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import Link from "next/link";
import {
  Award,
  AlertTriangle,
  Play,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  RefreshCw,
  Info,
  ShieldAlert,
  Sparkles,
  HelpCircle,
  ExternalLink,
} from "lucide-react";

export default function AssessorCalibratePage() {
  const { currentUser } = useAuth();
  const lang = currentUser.language;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [goldClips, setGoldClips] = useState<any[]>([]);
  const [selectedClip, setSelectedClip] = useState<any>(null);
  const [certification, setCertification] = useState<any>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [evalResult, setEvalResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchCalibrationData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch("/api/assessor/calibration", {
        headers: {
          "x-user-id": currentUser.id,
          "x-user-role": currentUser.role,
        },
      });
      const data = await res.json();
      if (data.error) {
        setErrorMsg(data.error);
        return;
      }
      setCertification(data.certification);
      setGoldClips(data.goldClips || []);
      if (data.goldClips && data.goldClips.length > 0) {
        setSelectedClip(data.goldClips[0]);
        // Initialize scores with empty/neutral
        const initial: Record<string, number> = {};
        for (const c of data.goldClips[0].criterion_scores || []) {
          initial[c.criterion_id] = 3; // sensible default starter
        }
        setScores(initial);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load calibration data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalibrationData();
  }, [currentUser.id]);

  const handleClipSelect = (clip: any) => {
    setSelectedClip(clip);
    setEvalResult(null);
    const initial: Record<string, number> = {};
    for (const c of clip.criterion_scores || []) {
      initial[c.criterion_id] = 3;
    }
    setScores(initial);
  };

  const handleScoreChange = (criterionId: string, level: number) => {
    setScores((prev) => ({
      ...prev,
      [criterionId]: level,
    }));
  };

  const handleSubmitCalibration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClip) return;

    try {
      setSubmitting(true);
      setErrorMsg(null);

      const submittedScores = Object.entries(scores).map(([criterion_id, score]) => ({
        criterion_id,
        score,
      }));

      const res = await fetch("/api/assessor/calibration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentUser.id,
          "x-user-role": currentUser.role,
        },
        body: JSON.stringify({
          goldClipId: selectedClip.id,
          submittedScores,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Calibration evaluation failed");
      }

      setEvalResult(data.result);
      // Re-fetch certification status
      const certRes = await fetch("/api/assessor/calibration", {
        headers: {
          "x-user-id": currentUser.id,
          "x-user-role": currentUser.role,
        },
      });
      const certData = await certRes.json();
      if (certData.certification) {
        setCertification(certData.certification);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Submission error");
    } finally {
      setSubmitting(false);
    }
  };

  const rubricLevels = [
    { level: 1, label: "Beginner / Unsafe", desc: "Violates safety codes, incorrect tool handling" },
    { level: 2, label: "Developing / Hesitant", desc: "Needs guidance, imperfect bends or loose terminations" },
    { level: 3, label: "Competent (Industry Standard)", desc: "Adheres to IS 732, secure torque, safe technique" },
    { level: 4, label: "Master Craftsman", desc: "Flawless conduit geometry, pristine dressing, zero flaw" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1 flex flex-col gap-6">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/assessor"
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
            aria-label="Back to Assessor Workspace"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-600" />
              <span>{lang === "hi" ? "मूल्यांकनकर्ता कैलिब्रेशन गेट" : "Assessor Calibration Gate"}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                Inter-Rater Reliability
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === "hi"
                ? "गोल्ड-स्टैंडर्ड वीडियो क्लिप्स के विरुद्ध कोहेन वेटेड कापा (Quadratic Weighted Kappa) स्कोरिंग"
                : "Objective benchmark scoring vs expert gold standard clips. Quadratic Weighted Kappa ≥ 0.70 required."}
            </p>
          </div>
        </div>

        {certification && (
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-3 py-1.5 rounded-xl font-bold border flex items-center gap-1.5 ${
                certification.certified
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300"
              }`}
            >
              {certification.certified ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              )}
              <span>
                {certification.certified
                  ? `Active (κ = ${certification.kappa})`
                  : "Gate Blocked (Uncalibrated)"}
              </span>
            </span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <p className="text-sm font-semibold">Loading Gold Benchmark Clips & Rubrics...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: Benchmark Clips Selection & Video Player (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            {/* Clip Selector Tabs */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 block">
                Select Gold-Standard Benchmark Clip
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {goldClips.map((clip) => {
                  const isSelected = selectedClip?.id === clip.id;
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      onClick={() => handleClipSelect(clip)}
                      className={`text-left p-3 rounded-xl border text-xs transition flex flex-col gap-1 ${
                        isSelected
                          ? "bg-blue-50/80 border-blue-500 text-blue-900 dark:bg-blue-950/40 dark:border-blue-500 dark:text-blue-100 ring-2 ring-blue-500/20"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold truncate">{clip.title}</span>
                        {clip.synthetic && (
                          <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-1 py-0.2 rounded font-mono">
                            SYNTHETIC
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Master: {clip.expert_name}
                      </p>
                      <p className="text-[10px] text-slate-400 italic truncate">
                        {clip.source}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Video Player */}
            {selectedClip && (
              <div className="bg-black rounded-2xl overflow-hidden shadow-lg border border-slate-800 flex flex-col">
                <div className="relative aspect-video bg-slate-950 flex items-center justify-center">
                  <video
                    src={selectedClip.clip_ref}
                    controls
                    className="w-full h-full object-contain"
                    poster="/assets/video-poster-placeholder.jpg"
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>

                <div className="p-4 bg-slate-900 text-slate-200 border-t border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      {selectedClip.title}
                    </span>
                    <span className="text-[11px] font-mono text-amber-400">
                      Standard: IS 732:2019
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Source: <span className="text-slate-300">{selectedClip.source}</span> · Master Evaluator: <strong className="text-white">{selectedClip.expert_name}</strong>
                  </p>
                </div>
              </div>
            )}

            {/* Evaluation Results Banner (if evaluated) */}
            {evalResult && (
              <div
                className={`p-5 rounded-2xl border flex flex-col gap-3 shadow-md ${
                  evalResult.passed
                    ? "bg-emerald-50 border-emerald-300 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-100"
                    : "bg-rose-50 border-rose-300 text-rose-950 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-100"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {evalResult.passed ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                    )}
                    <div>
                      <h3 className="text-base font-bold">
                        {evalResult.passed
                          ? "Calibration Successful — Certified for 30 Days"
                          : "Calibration Below Threshold — Scoring Locked"}
                      </h3>
                      <p className="text-xs opacity-90">
                        {evalResult.passed
                          ? "Your inter-rater agreement meets the rigorous statistical threshold. Workspace unlocked."
                          : "Agreement with master expert benchmark is below required reliability standard. Review rubric & retry."}
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-white/80 dark:bg-black/40 border">
                    κ = {evalResult.weightedKappa}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50 text-xs">
                  <div>
                    <span className="text-[11px] opacity-75 block">Computed Kappa</span>
                    <strong className="font-mono text-sm">{evalResult.weightedKappa}</strong>
                  </div>
                  <div>
                    <span className="text-[11px] opacity-75 block">Threshold</span>
                    <strong className="font-mono text-sm">{evalResult.threshold} (UNVERIFIED)</strong>
                  </div>
                  <div>
                    <span className="text-[11px] opacity-75 block">Valid Until</span>
                    <strong className="font-mono text-sm">
                      {new Date(evalResult.certifiedUntil).toLocaleDateString()}
                    </strong>
                  </div>
                </div>

                {evalResult.passed && (
                  <div className="pt-2">
                    <Link
                      href="/assessor"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow"
                    >
                      <span>Proceed to Candidate Scoring Queue</span>
                      <ArrowLeft className="w-4 h-4 rotate-180" />
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Scoring Form & Rubric Anchor Benchmarks (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Gold-Standard Calibration Rubric
                  </h2>
                  <p className="text-xs text-slate-500">
                    Grade each demonstrated criterion on levels 1 to 4
                  </p>
                </div>
                <span className="text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300">
                  Cohen’s Quadratic w_ij
                </span>
              </div>

              <form onSubmit={handleSubmitCalibration} className="flex flex-col gap-5 mt-4">
                {selectedClip?.criterion_scores?.map((criterion: any, idx: number) => {
                  const currentScore = scores[criterion.criterion_id] || 3;
                  return (
                    <div
                      key={criterion.criterion_id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">
                            {criterion.criterion_code}
                          </span>
                          <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                            Criterion {idx + 1}: Practical Performance & Tool Safety
                          </h4>
                          {criterion.notes && (
                            <p className="text-[11px] text-slate-500 italic mt-0.5">
                              {criterion.notes}
                            </p>
                          )}
                        </div>
                        <span className="text-xs font-mono font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                          L{currentScore}
                        </span>
                      </div>

                      {/* Score Level Radio Group (1-4) */}
                      <div className="grid grid-cols-4 gap-1.5 pt-1">
                        {[1, 2, 3, 4].map((level) => {
                          const isSelected = currentScore === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => handleScoreChange(criterion.criterion_id, level)}
                              className={`py-2 px-1 text-center rounded-lg border text-xs font-bold transition flex flex-col items-center gap-0.5 min-h-[44px] ${
                                isSelected
                                  ? "bg-blue-600 border-blue-600 text-white shadow-sm ring-2 ring-blue-500/30"
                                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              }`}
                            >
                              <span>Level {level}</span>
                              <span className="text-[9px] font-normal opacity-80">
                                {level === 1 ? "Beginner" : level === 2 ? "Developing" : level === 3 ? "Standard" : "Master"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-md flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Evaluating Statistical Agreement...</span>
                      </>
                    ) : (
                      <>
                        <Award className="w-4 h-4" />
                        <span>Calculate Cohen’s Kappa & Certify</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Statistical Explainer Card */}
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-400 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                <Info className="w-4 h-4 text-blue-500" />
                <span>Inter-Rater Reliability Rules</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Under MSDE SIH 2026 rules, quadratic weighting penalizes large disagreements severely (e.g. grading Level 1 when benchmark is Level 4 has penalty weight w_(1,4) = (1-4)^2/9 = 1.0).
              </p>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 font-mono text-[10px] text-slate-700 dark:text-slate-300">
                Formula: κ = 1 - [Σ(w_ij · O_ij) / Σ(w_ij · E_ij)]
                <br />
                Target Threshold: ≥ 0.70 (Marked UNVERIFIED in platform_settings)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
