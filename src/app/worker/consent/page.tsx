"use client";

import React, { useState } from "react";
import { Shield, CheckCircle, AlertTriangle, FileText, Lock, Globe, ArrowRight } from "lucide-react";

export default function WorkerConsentPage() {
  const [language, setLanguage] = useState<"hi" | "en">("hi");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [granted, setGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidateId = "d0000000-0000-0000-0000-000000000001"; // Mock active candidate

  const handleGrantConsent = async () => {
    if (!agreed) {
      setError(language === "hi" ? "कृपया आगे बढ़ने के लिए सहमति बॉक्स चेक करें।" : "Please check the consent box to proceed.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/privacy/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          scope: "voice_video_location_identity",
          language,
          version: "1.0",
          purpose:
            language === "hi"
              ? "कौशल मूल्यांकन एवं प्रमाणन (NSQF RPL CON/Q0602)"
              : "Skill evaluation and certification (NSQF RPL CON/Q0602)",
          dataCollected:
            language === "hi"
              ? "आवाज रिकॉर्डिंग, कार्यस्थल वीडियो, स्थान (जीपीएस), और कौशल घोषणा"
              : "Voice recording, practical task video, GPS location, and skill declaration",
          retentionNotice:
            language === "hi"
              ? "मूल्यांकन अवधि तक सुरक्षित रखा जाएगा, बाद में क्रिप्टो-श्रेडिंग द्वारा नष्ट किया जाएगा।"
              : "Stored securely during assessment audit window, then crypto-shredded per DPDP policy.",
          granted: true,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to record consent on server");
      }

      setGranted(true);
    } catch (err: any) {
      setError(err.message || "Failed to submit consent");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 font-sans">
      <header className="max-w-xl mx-auto w-full pt-4 pb-2 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Shield className="w-6 h-6 text-emerald-400" />
          <h1 className="text-lg font-bold tracking-tight">सत्यRPL • SatyaRPL</h1>
        </div>
        <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-1">
          <Globe className="w-4 h-4 text-slate-400 ml-1 mr-2" />
          <button
            onClick={() => setLanguage("hi")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              language === "hi" ? "bg-emerald-500 text-slate-950 shadow" : "text-slate-300 hover:text-white"
            }`}
          >
            हिंदी
          </button>
          <button
            onClick={() => setLanguage("en")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              language === "en" ? "bg-emerald-500 text-slate-950 shadow" : "text-slate-300 hover:text-white"
            }`}
          >
            English
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto w-full py-6 flex-1 flex flex-col justify-center">
        {granted ? (
          <div className="bg-slate-900/90 border border-emerald-500/40 rounded-2xl p-6 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold text-white">
              {language === "hi" ? "सहमति सफलतापूर्वक दर्ज की गई" : "Consent Successfully Recorded"}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {language === "hi"
                ? "आपकी सहमति DPDP अधिनियम 2023 के तहत टाइमस्टैम्प और संस्करण 1.0 के साथ सुरक्षित कर ली गई है। अब आप व्यावहारिक कार्य मूल्यांकन शुरू कर सकते हैं।"
                : "Your consent has been recorded with cryptographic timestamp and version 1.0 per DPDP Act 2023. You may now proceed with the practical assessment."}
            </p>
            <div className="pt-2">
              <a
                href="/worker/capture"
                className="inline-flex items-center justify-center w-full min-h-[48px] px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg"
              >
                {language === "hi" ? "प्रैक्टिकल टेस्ट शुरू करें" : "Proceed to Practical Test"}
                <ArrowRight className="w-5 h-5 ml-2" />
              </a>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl backdrop-blur-sm">
            <div>
              <div className="inline-flex items-center space-x-1.5 bg-emerald-500/10 text-emerald-400 text-xs font-semibold px-3 py-1 rounded-full mb-3">
                <Lock className="w-3.5 h-3.5" />
                <span>{language === "hi" ? "DPDP अधिनियम 2023 डेटा सुरक्षा" : "DPDP Act 2023 Privacy Notice"}</span>
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">
                {language === "hi" ? "डेटा संग्रह एवं सहमति पत्र" : "Candidate Consent & Privacy Notice"}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {language === "hi"
                  ? "सहायक इलेक्ट्रीशियन (CON/Q0602) कौशल प्रमाणन हेतु"
                  : "For Assistant Electrician (CON/Q0602) RPL Certification"}
              </p>
            </div>

            <div className="space-y-4 text-sm text-slate-300">
              <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center">
                  <FileText className="w-3.5 h-3.5 mr-1" />
                  {language === "hi" ? "1. उद्देश्य (Purpose)" : "1. Purpose"}
                </span>
                <p className="text-xs leading-relaxed text-slate-300">
                  {language === "hi"
                    ? "आपके पूर्व अनुभव और व्यावहारिक कौशल का निष्पक्ष, पारदर्शी मूल्यांकन करने हेतु।"
                    : "To evaluate your prior vocational experience and practical skill transparently."}
                </p>
              </div>

              <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center">
                  <Shield className="w-3.5 h-3.5 mr-1" />
                  {language === "hi" ? "2. क्या एकत्र किया जाएगा (Data Collected)" : "2. Data Collected"}
                </span>
                <p className="text-xs leading-relaxed text-slate-300">
                  {language === "hi"
                    ? "मौखिक घोषणा (आवाज), व्यावहारिक कार्य की छोटी वीडियो क्लिप, स्थान (GPS) एवं कार्य समय।"
                    : "Voice declaration audio, short practical task video clips, GPS coordinates, and task timing."}
                </p>
              </div>

              <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center">
                  <Lock className="w-3.5 h-3.5 mr-1" />
                  {language === "hi" ? "3. सुरक्षा एवं विलोपन (Retention & Deletion)" : "3. Retention & Deletion"}
                </span>
                <p className="text-xs leading-relaxed text-slate-300">
                  {language === "hi"
                    ? "आपका वीडियो केवल अधिकृत परीक्षक देख सकेंगे। ऑडिट अवधि के बाद वीडियो को क्रिप्टो-श्रेडिंग द्वारा स्थायी रूप से नष्ट किया जाएगा।"
                    : "Only authorized assessors inspect your video. Following the audit window, raw media blobs are permanently crypto-shredded."}
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-800">
              <label className="flex items-start space-x-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="w-5 h-5 mt-0.5 rounded text-emerald-500 focus:ring-emerald-400 bg-slate-950 border-slate-700"
                />
                <span className="text-xs text-slate-300 leading-normal">
                  {language === "hi"
                    ? "मैंने शर्तें पढ़ ली हैं और मैं अपने कौशल मूल्यांकन हेतु ऑडियो, वीडियो तथा स्थान साझा करने की सहमति देता/देती हूँ।"
                    : "I have read the terms and freely consent to sharing audio, video, and location telemetry for my vocational skill assessment."}
                </span>
              </label>
            </div>

            <button
              onClick={handleGrantConsent}
              disabled={submitting}
              className="w-full min-h-[48px] px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl transition-all shadow-lg flex items-center justify-center space-x-2 text-sm"
            >
              {submitting ? (
                <span>{language === "hi" ? "दर्ज किया जा रहा है..." : "Recording consent..."}</span>
              ) : (
                <>
                  <span>{language === "hi" ? "सहमति दें और आगे बढ़ें" : "Grant Consent & Continue"}</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </div>
        )}
      </main>

      <footer className="max-w-xl mx-auto w-full py-4 text-center text-xs text-slate-500">
        <p>SatyaRPL Platform • DPDP Act 2023 Compliant • Digital India / MSDE</p>
      </footer>
    </div>
  );
}
