"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import Link from "next/link";
import {
  UserCheck,
  Award,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  FileCheck2,
  HardHat,
  Shield,
  Layers,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

export default function AssessorDashboardPage() {
  const { currentUser } = useAuth();
  const lang = currentUser.language;

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [certification, setCertification] = useState<any>(null);
  const [stats, setStats] = useState<any>({
    agreementRatePercent: 84,
    overrideRatePercent: 12,
    averageScoringMinutes: 18.5,
    totalSessionsAssessed: 0,
  });

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/assessor/sessions", {
        headers: {
          "x-user-id": currentUser.id,
          "x-user-role": currentUser.role,
        },
      });
      const data = await res.json();
      if (data.sessions) setSessions(data.sessions);
      if (data.certification) setCertification(data.certification);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      console.error("Failed to load assessor dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [currentUser.id]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1 flex flex-col gap-6">
      {/* Assessor Header & Identity */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              <UserCheck className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>{lang === "hi" ? "मूल्यांकनकर्ता वर्कस्पेस" : "Assessor Workspace"}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Staff Portal
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === "hi"
                  ? "ब्लाइंड-फर्स्ट निष्पक्ष मूल्यांकन, गोल्ड-स्टैंडर्ड कैलिब्रेशन एवं भौतिक सत्यापन"
                  : "Blind-first scoring, gold-standard calibration & hands-on physical verification"}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Refresh */}
        <button
          onClick={loadDashboard}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition text-slate-700 dark:text-slate-300"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>{lang === "hi" ? "ताज़ा करें" : "Refresh Queue"}</span>
        </button>
      </div>

      {/* 1. CALIBRATION GATE BANNER */}
      {certification && (
        <div
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition shadow-sm ${
            certification.certified
              ? "bg-emerald-50 border-emerald-200 text-emerald-950 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-200"
              : "bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                certification.certified
                  ? "bg-emerald-600 text-white"
                  : "bg-amber-600 text-white"
              }`}
            >
              {certification.certified ? (
                <Award className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">
                  {certification.certified
                    ? lang === "hi"
                      ? "कैलिब्रेशन प्रमाणित (Certified Assessor)"
                      : "Calibration Certified & Active"
                    : lang === "hi"
                    ? "कैलिब्रेशन आवश्यक (Recalibration Required)"
                    : "Calibration Gate: Recalibration Mandatory"}
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                    certification.certified
                      ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
                      : "bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-100"
                  }`}
                >
                  {certification.certified ? "GATE PASSED" : "GATE BLOCKED"}
                </span>
              </div>

              <p className="text-xs mt-0.5 opacity-90">
                {certification.certified
                  ? `Quadratic Weighted Kappa: ${certification.kappa} (Threshold: ${certification.threshold}) · Valid until ${new Date(
                      certification.certifiedUntil
                    ).toLocaleDateString()}`
                  : certification.reason ||
                    "Assessor agreement score is below the required 0.70 benchmark or has expired. You must score gold-standard clips before accessing candidate sessions."}
              </p>
            </div>
          </div>

          <Link
            href="/assessor/calibrate"
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 shadow-sm min-h-[44px] ${
              certification.certified
                ? "bg-white text-emerald-800 hover:bg-emerald-100 border border-emerald-300 dark:bg-slate-900 dark:text-emerald-200 dark:border-emerald-700"
                : "bg-amber-600 text-white hover:bg-amber-700"
            }`}
          >
            <span>{certification.certified ? "Retake Calibration Test" : "Complete Calibration Test"}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* 2. ASSESSOR SELF-VIEW METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
            {lang === "hi" ? "गोल्ड सहमति दर" : "Gold / AI Agreement Rate"}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {stats.agreementRatePercent}%
            </span>
            <span className="text-xs text-emerald-600 font-semibold flex items-center">
              <TrendingUp className="w-3 h-3 inline mr-0.5" /> High
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Weighted kappa agreement</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
            {lang === "hi" ? "AI ओवरराइड दर" : "Post-AI Override Rate"}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {stats.overrideRatePercent}%
            </span>
            <span className="text-xs text-blue-600 font-semibold">Independent</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Assessor changed score</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
            {lang === "hi" ? "औसत मूल्यांकन समय" : "Avg. Scoring Duration"}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {stats.averageScoringMinutes}m
            </span>
            <span className="text-xs text-slate-400">per candidate</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Review + physical checks</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
            {lang === "hi" ? "पूर्ण मूल्यांकन" : "Completed Sessions"}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono">
              {stats.totalSessionsAssessed}
            </span>
            <span className="text-xs text-emerald-600 font-semibold">Certified</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Signed digital credentials</p>
        </div>
      </div>

      {/* 3. ASSIGNMENT QUEUE */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>{lang === "hi" ? "असाइन किए गए उम्मीदवार" : "Assigned Candidate Assessment Queue"}</span>
            </h2>
            <p className="text-xs text-slate-500">
              {lang === "hi"
                ? "मूल्यांकनकर्ता को केवल आवंटित उम्मीदवार ही दिखाई देते हैं (RLS सुरक्षित)"
                : "Assessor sees only assigned candidates under active Row-Level Security policies"}
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {sessions.length} Assigned
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            {lang === "hi"
              ? "वर्तमान में कोई उम्मीदवार कतार में नहीं हैं।"
              : "No candidate assessment sessions currently assigned to your profile."}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center font-bold">
                    <HardHat className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {sess.candidate_name}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {sess.aadhaar_masked}
                      </span>
                      {sess.is_synthetic && (
                        <span className="text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-1.5 py-0.2 rounded">
                          SYNTHETIC
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      <strong>{sess.qp_code}</strong> · {sess.qualification_name} ({sess.district || "Lucknow"})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase ${
                      sess.status === "completed"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 animate-pulse"
                    }`}
                  >
                    {sess.status === "completed" ? "Signed Off" : "Ready to Score"}
                  </span>

                  <Link
                    href={`/assessor/session/${sess.id}`}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 min-h-[44px] ${
                      certification?.certified
                        ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                        : "bg-slate-200 text-slate-500 cursor-not-allowed pointer-events-none"
                    }`}
                    title={
                      !certification?.certified
                        ? "Calibration test required before scoring candidate sessions"
                        : "Open Blind Scoring Workspace"
                    }
                  >
                    <span>{lang === "hi" ? "मूल्यांकन शुरू करें" : "Score Session"}</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
