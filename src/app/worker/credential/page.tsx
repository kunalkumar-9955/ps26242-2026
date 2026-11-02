"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Award,
  QrCode,
  Share2,
  Download,
  CheckCircle,
  Copy,
  ExternalLink,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertTriangle,
  ArrowLeft,
  Printer,
} from "lucide-react";

interface WorkerCredential {
  id: string;
  verifySlug: string;
  status: string;
  issuedAt: string;
  expiresAt: string;
  qpTitle: string;
  qpCode: string;
  nqrCode: string;
  nsqfLevel: number;
  overallRecommendation: string;
  signingAssessorName: string;
  workerConsent: boolean;
  disclaimerNotice: string;
  pseudonymousId: string;
}

export default function WorkerCredentialPage() {
  const [credential, setCredential] = useState<WorkerCredential | null>(null);
  const [loading, setLoading] = useState(true);
  const [consent, setConsent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);

  useEffect(() => {
    async function loadCredential() {
      setLoading(true);
      try {
        // Fetch candidate credential or latest credential for demo session
        const res = await fetch("/api/worker/credential");
        if (res.ok) {
          const json = await res.json();
          setCredential(json.credential);
          setConsent(json.credential.workerConsent || false);
        } else {
          // Fallback mock credential state if not yet scored in current session
          setCredential({
            id: "cred-demo-2026",
            verifySlug: "d83f129e01bc89a42f618a9947c01b22",
            status: "valid",
            issuedAt: "2026-10-11T05:00:00Z",
            expiresAt: "2029-10-11T05:00:00Z",
            qpTitle: "Assistant Electrician (सहायक इलेक्ट्रीशियन)",
            qpCode: "CON/Q0602",
            nqrCode: "QG-03-CO-03951-2025-V2-CSDCI",
            nsqfLevel: 3,
            overallRecommendation: "competent",
            signingAssessorName: "Er. Sunita Verma",
            workerConsent: false,
            disclaimerNotice:
              "Assessment support record. Not an official NCVET/NSDC certificate unless issued by an accredited body.",
            pseudonymousId: "cand_pseudo_89a42f61",
          });
        }
      } catch (err) {
        console.error("Failed to load credential", err);
      } finally {
        setLoading(false);
      }
    }

    loadCredential();
  }, []);

  const handleToggleConsent = async () => {
    if (!credential) return;
    const newConsent = !consent;
    setSavingConsent(true);
    try {
      const res = await fetch("/api/credentials/consent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "11111111-1111-1111-1111-111111111111", // Worker Anita Devi
        },
        body: JSON.stringify({
          credentialId: credential.id,
          consent: newConsent,
        }),
      });
      if (res.ok) {
        setConsent(newConsent);
      }
    } catch (err) {
      console.error("Failed to toggle consent", err);
    } finally {
      setSavingConsent(false);
    }
  };

  const verifyUrl = credential
    ? `${typeof window !== "undefined" ? window.location.origin : "https://satyarpl.gov.in"}/verify/${credential.verifySlug}`
    : "";

  const handleCopy = () => {
    if (!verifyUrl) return;
    navigator.clipboard.writeText(verifyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsAppShare = () => {
    if (!verifyUrl || !credential) return;
    const text = encodeURIComponent(
      `नमस्ते! मैंने SatyaRPL पर ${credential.qpTitle} (Level ${credential.nsqfLevel}) का कौशल मूल्यांकन पूरा कर लिया है। मेरा डिजिटल सत्यापन देखें: ${verifyUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 md:p-8 flex flex-col items-center">
      <div className="max-w-xl w-full flex flex-col gap-6">
        {/* Top App Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/worker"
            className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>पीछे जाएं / Back to Home</span>
          </Link>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold">
            PWA Offline Ready
          </span>
        </div>

        {/* 1. Mandatory Honest Labelling Disclaimer */}
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">महत्वपूर्ण सूचना (Notice): </span>
            {credential?.disclaimerNotice}
          </div>
        </div>

        {/* 2. Visual Digital Credential Card (Printable) */}
        <div
          id="credential-card"
          className="p-6 md:p-8 rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-800 shadow-xl flex flex-col gap-6 relative overflow-hidden"
        >
          {/* Header Strip with Ashoka / Satya Mark */}
          <div className="flex items-center justify-between border-b-2 border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center font-bold text-lg shadow-md">
                सत्य
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                  SatyaRPL कौशल मूल्यांकन अभिलेख
                </h1>
                <p className="text-[11px] text-slate-500">
                  Vocational Skill Assessment Record &bull; MSDE / CSDCI
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>सत्यापित / VERIFIED</span>
            </div>
          </div>

          {/* Qualification Name */}
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              व्यावसायिक योग्यता (Qualification)
            </span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              {credential?.qpTitle}
            </h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-300">
                {credential?.qpCode}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                NQR: {credential?.nqrCode}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                NSQF Level {credential?.nsqfLevel}
              </span>
            </div>
          </div>

          {/* QR Code and Verification Slug Box */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-center gap-4">
            <div className="p-3 bg-white rounded-xl shadow-md border border-slate-200 flex flex-col items-center justify-center">
              {/* Simulated high-contrast QR display */}
              <div className="w-24 h-24 bg-slate-900 rounded flex flex-col items-center justify-center text-white text-[9px] text-center font-mono p-1">
                <QrCode className="w-12 h-12 text-white" />
                <span className="text-[8px] text-slate-300 mt-1">SCAN TO VERIFY</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 text-center md:text-left flex-1">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                सार्वजनिक सत्यापन कोड (Verification Nonce)
              </span>
              <p className="text-[11px] font-mono text-slate-500 break-all">
                {credential?.verifySlug}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                कोई भी नियोक्ता इस QR कोड को स्कैन करके आपके कौशल की प्रामाणिकता तुरंत सत्यापित कर सकता है।
              </p>
            </div>
          </div>

          {/* Assessor Sign-Off & Dates */}
          <div className="grid grid-cols-2 gap-4 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase">मूल्यांकनकर्ता (Assessor)</span>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                {credential?.signingAssessorName}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase">जारी दिनांक (Issued At)</span>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                {credential?.issuedAt ? new Date(credential.issuedAt).toLocaleDateString() : "11/10/2026"}
              </p>
            </div>
          </div>
        </div>

        {/* 3. Worker Privacy & Public Display Consent Toggle */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {consent ? (
              <Eye className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <EyeOff className="w-5 h-5 text-slate-400 flex-shrink-0" />
            )}
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                सार्वजनिक पृष्ठ पर नाम दिखाएं (Display Name Publicly)
              </h3>
              <p className="text-[11px] text-slate-500">
                {consent
                  ? "स्वीकृत: सत्यापन करने वाले को आपका नाम दिखेगा।"
                  : "निजी: आपका नाम छुपा रहेगा (केवल छद्म आईडी दिखेगी)।"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleConsent}
            disabled={savingConsent}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors touch-target min-h-[44px] ${
              consent
                ? "bg-emerald-600 text-white"
                : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            {savingConsent ? "..." : consent ? "दिखाएं (ON)" : "छुपाएं (OFF)"}
          </button>
        </div>

        {/* 4. Action Buttons (WhatsApp, Copy Link, Print/PDF) */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleWhatsAppShare}
            className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm min-h-[48px] touch-target"
          >
            <Share2 className="w-4 h-4" />
            <span>व्हाट्सएप पर साझा करें (WhatsApp)</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="py-3 px-4 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2 min-h-[48px] touch-target"
          >
            <Copy className="w-4 h-4" />
            <span>{copied ? "कॉपी हो गया!" : "सत्यापन लिंक कॉपी करें"}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="py-3 px-4 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2 min-h-[48px] touch-target"
          >
            <Printer className="w-4 h-4" />
            <span>प्रिंट / PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
}
