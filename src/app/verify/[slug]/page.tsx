"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Key,
  Calendar,
  Award,
  User,
  Info,
  Terminal,
  Download,
  Lock,
} from "lucide-react";

interface VerificationData {
  isValid: boolean;
  status: "valid" | "expired" | "revoked" | "superseded" | "invalid_signature";
  credentialId?: string;
  verifySlug?: string;
  issuedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  revocationReason?: string;
  qualification?: {
    nqrCode: string;
    qpCode: string;
    title: string;
    nsqfLevel: number;
  };
  nosOutcomes?: Array<{
    nosCode: string;
    nosTitle: string;
    competent: boolean;
  }>;
  overallRecommendation?: string;
  issuer?: {
    name: string;
    signingAssessorName: string;
    keyId: string;
  };
  candidateIdentity: {
    isPseudonymousOnly: boolean;
    pseudonymousId: string;
    displayName?: string;
    maskedIdentifier?: string;
  };
  signatureValid: boolean;
  canonicalHashMatches: boolean;
  keyId: string;
  disclaimer: string;
  offlineVerifyInstructions?: string;
}

export default function PublicVerifyPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VerificationData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOfflineTool, setShowOfflineTool] = useState(false);

  useEffect(() => {
    if (!slug) return;

    async function verify() {
      setLoading(true);
      setNotFound(false);
      setRateLimited(false);
      setError(null);

      try {
        const res = await fetch(`/api/credentials/verify/${slug}`);
        if (res.status === 404) {
          setNotFound(true);
          setData(null);
        } else if (res.status === 429) {
          setRateLimited(true);
          setData(null);
        } else if (!res.ok) {
          throw new Error(`Verification service returned status ${res.status}`);
        } else {
          const json = await res.json();
          setData(json);
        }
      } catch (err: any) {
        setError(err.message || "Network error during verification");
      } finally {
        setLoading(false);
      }
    }

    verify();
  }, [slug]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 md:p-8 flex flex-col items-center">
      <div className="max-w-2xl w-full flex flex-col gap-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-600 text-white font-bold tracking-tight shadow-md">
              सत्य
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                SatyaRPL Public Verification Portal
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Independent Digital Assessment Record Verification (MSDE / CSDCI)
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
            Zero-PII Gateway
          </span>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Verifying Ed25519 cryptographic signature and live status...
            </p>
          </div>
        )}

        {/* Rate Limited State */}
        {rateLimited && (
          <div className="p-8 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 shadow-sm flex flex-col items-center text-center gap-3">
            <AlertTriangle className="w-12 h-12 text-amber-600 dark:text-amber-400" />
            <h2 className="text-lg font-bold text-amber-900 dark:text-amber-200">
              Verification Rate Limit Exceeded
            </h2>
            <p className="text-sm text-amber-800 dark:text-amber-300 max-w-md">
              Too many verification requests were received from your network. Please wait 60 seconds before retrying.
            </p>
          </div>
        )}

        {/* Not Found / Uniform 404 State */}
        {notFound && (
          <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center gap-3">
            <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Credential Record Not Found
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md">
              No active or historical assessment record matches the provided verification identifier ({slug}). This identifier may be invalid or has not yet been issued.
            </p>
            <span className="text-[11px] font-mono text-slate-400 mt-2">
              Status Code: 404 (Uniform Enumeration-Resistant Response)
            </span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-6 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 shadow-sm flex items-center gap-3">
            <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-red-900 dark:text-red-200">Verification Error</h3>
              <p className="text-xs text-red-800 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        {/* Verification Success View */}
        {data && !loading && (
          <div className="flex flex-col gap-6">
            {/* 1. Status Shield Banner */}
            <div
              className={`p-6 rounded-2xl border shadow-sm flex items-center justify-between gap-4 ${
                data.status === "valid"
                  ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800"
                  : data.status === "revoked"
                  ? "bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-800"
                  : data.status === "expired"
                  ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800"
                  : "bg-purple-50/70 dark:bg-purple-950/30 border-purple-300 dark:border-purple-800"
              }`}
            >
              <div className="flex items-center gap-4">
                {data.status === "valid" && (
                  <div className="p-3 rounded-2xl bg-emerald-600 text-white shadow-md">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                )}
                {data.status === "revoked" && (
                  <div className="p-3 rounded-2xl bg-red-600 text-white shadow-md">
                    <ShieldAlert className="w-8 h-8" />
                  </div>
                )}
                {data.status === "expired" && (
                  <div className="p-3 rounded-2xl bg-amber-600 text-white shadow-md">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                )}
                {data.status === "invalid_signature" && (
                  <div className="p-3 rounded-2xl bg-purple-600 text-white shadow-md">
                    <XCircle className="w-8 h-8" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                      {data.status === "valid" && "VERIFIED VALID"}
                      {data.status === "revoked" && "RECORD REVOKED"}
                      {data.status === "expired" && "RECORD EXPIRED"}
                      {data.status === "invalid_signature" && "SIGNATURE TAMPERED / INVALID"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {data.status === "valid" && "Ed25519 signature is cryptographically valid and recorded in live database."}
                    {data.status === "revoked" && `Revoked on ${data.revokedAt?.split("T")[0]}. Reason: ${data.revocationReason}`}
                    {data.status === "expired" && `This credential expired on ${data.expiresAt?.split("T")[0]}.`}
                    {data.status === "invalid_signature" && "Cryptographic signature does not match canonical payload."}
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-full font-bold bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800">
                {data.status.toUpperCase()}
              </span>
            </div>

            {/* 2. Mandatory Honest Labelling Disclaimer */}
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                <span className="font-bold">Official Governance Notice: </span>
                {data.disclaimer}
              </div>
            </div>

            {/* 3. Credential Details Card */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-6">
              {/* Qualification & NSQF Level */}
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Qualification Pack (QP)
                </span>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {data.qualification?.title}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300">
                    {data.qualification?.qpCode}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
                    NQR: {data.qualification?.nqrCode}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">
                    NSQF Level {data.qualification?.nsqfLevel}
                  </span>
                </div>
              </div>

              {/* Subject Identity (Honest Zero-PII disclosure) */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Candidate Subject Identity
                </span>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {data.candidateIdentity.displayName || "Pseudonymous Candidate"}
                    </span>
                    {data.candidateIdentity.maskedIdentifier && (
                      <span className="text-xs text-slate-400 font-mono">
                        ({data.candidateIdentity.maskedIdentifier})
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                    {data.candidateIdentity.isPseudonymousOnly
                      ? "Pseudonymous (Consent: Private)"
                      : "Name Disclosed (Worker Consented)"}
                  </span>
                </div>
                <div className="mt-1 text-[11px] font-mono text-slate-500">
                  Subject Identifier: {data.candidateIdentity.pseudonymousId}
                </div>
              </div>

              {/* Assessment Competency Summary */}
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Overall Outcome
                </span>
                <div className="mt-2 flex items-center gap-3">
                  <span
                    className={`text-sm font-bold px-3 py-1 rounded-full uppercase ${
                      data.overallRecommendation === "competent"
                        ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300"
                        : "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300"
                    }`}
                  >
                    {data.overallRecommendation?.replace("_", " ")}
                  </span>
                  <span className="text-xs text-slate-500">
                    Assessor sign-off validated by certified assessor ({data.issuer?.signingAssessorName})
                  </span>
                </div>
              </div>

              {/* Key Issuance Details Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Issue Date</span>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {data.issuedAt ? new Date(data.issuedAt).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Expiry Date</span>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {data.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Signing Key ID</span>
                  <p className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {data.keyId}
                  </p>
                </div>
              </div>
            </div>

            {/* 4. Cryptographic Proof & Offline Verification Drawer */}
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Ed25519 Cryptographic Proof Details
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOfflineTool(!showOfflineTool)}
                  className="text-xs text-orange-600 dark:text-orange-400 hover:underline font-semibold"
                >
                  {showOfflineTool ? "Hide Offline Tool" : "Open Offline Verification Tool"}
                </button>
              </div>

              <div className="text-[11px] font-mono text-slate-500 flex flex-col gap-1">
                <div>Algorithm: Ed25519 (RFC 8032) | Canonicalization: RFC 8785 (JCS)</div>
                <div>Signature Validity: {data.signatureValid ? "VALID" : "INVALID"}</div>
                <div>Slug Nonce: {slug}</div>
              </div>

              {showOfflineTool && (
                <div className="mt-3 p-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Terminal className="w-4 h-4 text-emerald-600" />
                    Client-Side Offline Mathematical Verification
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    You can verify this credential without network connectivity by exporting the verifiable JSON and checking the Ed25519 signature against our published public key.
                  </p>
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-900 text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto">
                    {data.offlineVerifyInstructions}
                  </div>
                  <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    * Note: Offline mathematical verification confirms cryptographic signature integrity, but cannot detect real-time revocation without network access.
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-slate-400 pb-8">
              SatyaRPL Platform &bull; Ministry of Skill Development and Entrepreneurship &bull; SIH 2026
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
