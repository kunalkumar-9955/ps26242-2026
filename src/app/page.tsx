import Link from "next/link";
import {
  ShieldCheck,
  HardHat,
  UserCheck,
  BarChart3,
  Terminal,
  Lock,
  Mic,
  Video,
  FileCheck2,
  ChevronRight,
  Fingerprint,
  AlertTriangle,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 py-16 sm:py-24 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100/80 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-xs font-semibold mb-6">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
            SIH 2026 · Problem Statement PS 26242 · MSDE / NCVET Compliant
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white max-w-4xl mx-auto leading-tight">
            Fraud-Resistant & Assessor-Auditable{" "}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              RPL Certification Platform
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
            <em>&ldquo;We don&apos;t make AI judge workers. We make RPL assessments fraud-resistant and assessor-auditable.&rdquo;</em>
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
            Addressing PMKVY CAG audit vulnerabilities: preventing recycled video proofs, stopping clock & GPS tampering with challenge-response nonces, and enforcing blind-first assessor scoring.
          </p>

          {/* Quick Role CTA Bar */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/worker"
              className="px-6 py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm shadow-md shadow-amber-600/20 flex items-center gap-2 transition"
            >
              <HardHat className="w-5 h-5" />
              <span>Launch Worker App (Voice & Camera)</span>
            </Link>
            <Link
              href="/assessor"
              className="px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-600/20 flex items-center gap-2 transition"
            >
              <UserCheck className="w-5 h-5" />
              <span>Assessor Workspace (Blind Scoring)</span>
            </Link>
            <Link
              href="/auditor"
              className="px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold text-sm shadow-sm flex items-center gap-2 transition"
            >
              <BarChart3 className="w-5 h-5" />
              <span>Auditor Dashboard (Agreement Kappa)</span>
            </Link>
            <Link
              href="/red-team"
              className="px-6 py-3.5 rounded-xl bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800 font-semibold text-sm flex items-center gap-2 transition"
            >
              <Terminal className="w-5 h-5" />
              <span>Red-Team Attack Harness</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Core Security & Workflow Architecture Pillars */}
      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              The 4 Uncompromising Architectural Guarantees
            </h2>
            <p className="mt-2 text-slate-500 text-sm">
              Enforced strictly through cryptographic triggers and server-side state machines
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Guarantee 1 */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center mb-4">
                <Mic className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                1. Voice-to-NOS Extraction
              </h3>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed flex-1">
                Workers express their informal experience in their own language (Hindi/English). Real NOS codes mapped deterministically from NQR standards—never hallucinated.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-amber-700 font-medium">
                Plain-Language Gap Report
              </div>
            </div>

            {/* Guarantee 2 */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center mb-4">
                <Fingerprint className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                2. Challenge-Response Proof
              </h3>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed flex-1">
                Dynamic single-use nonces, random task sequences, and hash chaining (SHA-256) prevent media replay, deepfakes, and reused stock footage.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-blue-700 font-medium">
                Immutable Hash Chaining
              </div>
            </div>

            {/* Guarantee 3 */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center mb-4">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                3. Blind-First Scoring Gate
              </h3>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed flex-1">
                Assessors must submit independent rubric scores before AI suggestions are unveiled. The API literally masks suggestions until the blind score row exists.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-emerald-700 font-medium">
                Server-Enforced Isolation
              </div>
            </div>

            {/* Guarantee 4 */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col">
              <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                4. Live Assessor Auditing
              </h3>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed flex-1">
                Cohen&apos;s Weighted Kappa and Krippendorff&apos;s Alpha computed in real time. Flags leniency bias, impossible travel, and speed anomalies.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-purple-700 font-medium">
                Weighted Kappa & Alpha Metrics
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Reference Trade Context Banner */}
      <section className="bg-slate-100 dark:bg-slate-900 py-10 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              Deep Reference Trade Implementation
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              CON/Q0602: Assistant Electrician (NSQF Level 3)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Construction Skill Development Council of India (CSDCI) · 7 Compulsory National Occupational Standards (NOS)
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            <span>View Seeded QP/NOS Registry</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
