"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import Link from "next/link";
import {
  Mic,
  MicOff,
  Volume2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Edit3,
  Send,
  RotateCcw,
  BookOpen,
  HardHat,
  ShieldCheck,
  ChevronRight,
  WifiOff,
} from "lucide-react";
import { offlineDb } from "@/lib/offline/db";
import { syncEngine } from "@/lib/offline/sync-engine";

export default function WorkerDeclarationPage() {
  const { currentUser, setLanguage } = useAuth();
  const lang = currentUser.language;

  // Recording & Audio state
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMockSTT, setIsMockSTT] = useState(true);

  // Result state
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const [gapReport, setGapReport] = useState<any[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Canvas Waveform ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Audio Waveform Visualizer simulation / Web Audio
  useEffect(() => {
    let phase = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (isRecording) {
        // Draw active pulsating dynamic wave
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#D97706"; // Amber 600
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x++) {
          const y =
            canvas.height / 2 +
            Math.sin(x * 0.05 + phase) * 14 * Math.sin(x * 0.02 + phase * 0.5);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        phase += 0.15;
      } else {
        // Draw calm baseline wave
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#CBD5E1"; // Slate 300
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isRecording]);

  // Handle Voice Recording Toggle
  const handleToggleRecord = () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      // Generate sample transcript if empty
      if (!transcript) {
        if (lang === "hi") {
          setTranscript(
            "नमस्ते। मैं पिछले 4 साल से घरेलू बिजली वायरिंग का काम करता हूँ। मैं पाइप में तार दौड़ाने के लिए फिश टेप चलाता हूँ, स्विच बोर्ड कसता हूँ, और 1000V इंसुलेटेड पेचकस और प्लायर इस्तेमाल करता हूँ। 30mA आरसीसीबी और एमसीबी बैठाना भी आता है।"
          );
        } else {
          setTranscript(
            "Hello. I have 4 years of experience doing domestic residential wiring. I draw wires through conduits using fish tape, mount modular switchboards, handle 1000V insulated hand tools, and assemble MCB/RCCB distribution panels with proper earth grounding."
          );
        }
        setConfidence(0.94);
        setIsMockSTT(true);
      }
    } else {
      // Start recording
      setError(null);
      setIsRecording(true);
    }
  };

  // Submit Declaration to API
  const handleSubmitDeclaration = async () => {
    if (!transcript.trim()) {
      setError(
        lang === "hi"
          ? "कृपया बोलने के बाद विवरण सबमिट करें।"
          : "Please record or enter your experience before submitting."
      );
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      // Check if offline
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const declId = `decl_${Date.now()}`;
        await offlineDb.declarations.put({
          id: declId,
          candidateId: currentUser.id,
          rawTranscript: transcript,
          language: lang,
          status: "queued_offline",
          createdAt: new Date().toISOString(),
          synced: false,
        });

        await syncEngine.enqueueDeclaration({
          id: declId,
          candidateId: currentUser.id,
          rawTranscript: transcript,
          language: lang,
        });

        setError(null);
        alert(
          lang === "hi"
            ? "ऑफ़लाइन मोड: आपका वॉयस विवरण स्थानीय रूप से सहेज लिया गया है। पुनः कनेक्ट होने पर स्वचालित रूप से ट्रांसक्राइब और मूल्यांकित होगा।"
            : "Offline Mode: Your voice declaration has been saved locally in IndexedDB. It will automatically transcribe and evaluate upon reconnect."
        );
        setIsProcessing(false);
        return;
      }

      const res = await fetch("/api/worker/declaration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.id,
        },
        body: JSON.stringify({
          rawTranscript: transcript,
          language: lang,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to process declaration");
      }

      const data = await res.json();
      setExtractionResult(data.extraction);
      setGapReport(data.gapReport || []);
    } catch (err: any) {
      // If network error occurred, fallback to offline queue
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const declId = `decl_${Date.now()}`;
        await syncEngine.enqueueDeclaration({
          id: declId,
          candidateId: currentUser.id,
          rawTranscript: transcript,
          language: lang,
        });
        alert(
          lang === "hi"
            ? "नेटवर्क त्रुटि: आपका विवरण ऑफ़लाइन कतार में जोड़ दिया गया है।"
            : "Network disconnected: Declaration queued for sync upon reconnect."
        );
      } else {
        setError(err.message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // SpeechSynthesis Read-Aloud for Low-Literacy Workers
  const handleReadAloud = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported in this browser.");
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === "hi" ? "hi-IN" : "en-IN";
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const coveredCount = gapReport.filter((g) => g.status === "covered").length;
  const totalCount = gapReport.length;

  return (
    <div className="max-w-md mx-auto px-4 py-6 w-full flex-1 flex flex-col gap-5">
      {/* Worker Header & Trade Context */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
              <HardHat className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                  RPL Self-Declaration
                </span>
                <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[9px] rounded font-semibold">
                  CON/Q0602 Level 3
                </span>
              </div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {lang === "hi" ? "अपने काम के बारे में बोलकर बताएं" : "Declare Your Trade Experience by Voice"}
              </h1>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
          {lang === "hi"
            ? "अपनी भाषा में बोलें। आप क्या औजार इस्तेमाल करते हैं, किस तरह की वायरिंग करते हैं, और कितने साल का अनुभव है।"
            : "Speak in your own words. Mention the tools you handle, wiring tasks, panel work, and total years of field experience."}
        </p>

        {/* Honest Badges */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-[10px]">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-semibold">
            <Sparkles className="w-3 h-3 text-blue-600" />
            <span>MOCK STT / LLM ENGINE</span>
          </span>
          <span className="text-slate-400">
            {lang === "hi" ? "48px टच टारगेट सक्षम" : "Touch Target >= 48px"}
          </span>
        </div>
      </div>

      {/* Voice Recording Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col items-center text-center gap-4">
        {/* Live Audio Waveform Canvas */}
        <div className="w-full h-16 bg-slate-50 dark:bg-slate-800/50 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700/60 flex items-center justify-center relative">
          <canvas ref={canvasRef} width={340} height={64} className="w-full h-full" />
          {isRecording && (
            <div className="absolute top-2 right-3 flex items-center gap-1 text-[10px] text-rose-600 font-bold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-rose-600" />
              <span>RECORDING</span>
            </div>
          )}
        </div>

        {/* Large Accessible Microphone Button (Minimum 64px x 64px) */}
        <button
          onClick={handleToggleRecord}
          className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 touch-target ${
            isRecording
              ? "bg-rose-600 hover:bg-rose-700 text-white animate-pulse shadow-rose-600/30"
              : "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30"
          }`}
          aria-label={isRecording ? "Stop voice recording" : "Start voice recording"}
        >
          {isRecording ? <MicOff className="w-9 h-9" /> : <Mic className="w-9 h-9" />}
        </button>

        <div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
            {isRecording
              ? lang === "hi"
                ? "रिकॉर्डिंग जारी है... रोकने के लिए टैप करें"
                : "Recording active... Tap to stop"
              : lang === "hi"
              ? "माइक दबाकर बोलना शुरू करें"
              : "Tap microphone to speak"}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            {lang === "hi" ? "हिन्दी और अंग्रेजी दोनों समर्थित" : "Supports Hindi and English"}
          </span>
        </div>
      </div>

      {/* Transcript Review Card */}
      {transcript && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {lang === "hi" ? "पहचाना गया विवरण" : "Speech Transcript"}
              </span>
              {confidence && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {Math.round(confidence * 100)}% Confidence
                </span>
              )}
            </div>

            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition flex items-center gap-1 text-[11px]"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditing ? "Done" : "Edit"}</span>
            </button>
          </div>

          {isEditing ? (
            <textarea
              rows={4}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 leading-relaxed italic">
              &ldquo;{transcript}&rdquo;
            </p>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button (48px height minimum) */}
          <button
            onClick={handleSubmitDeclaration}
            disabled={isProcessing}
            className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 transition"
          >
            {isProcessing ? (
              <span>
                {lang === "hi"
                  ? "NOS मैपिंग और गैप एनालिसिस जारी है..."
                  : "Analyzing NSQF Competency..."}
              </span>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>
                  {lang === "hi" ? "कौशल गैप रिपोर्ट तैयार करें" : "Generate Competency Gap Report"}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* GAP REPORT RESULTS */}
      {gapReport.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* Plain-Language Overall Header */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-5 shadow-md flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                  Diagnostic Gap Report (Not Pass/Fail)
                </span>
                <h2 className="text-base font-bold mt-1.5">
                  {lang === "hi"
                    ? `आपने 7 में से ${coveredCount} क्षेत्रों का अनुभव दर्शाया है`
                    : `You cover ${coveredCount} of ${totalCount} Core Competency Areas`}
                </h2>
              </div>

              {/* Read Aloud Button */}
              <button
                onClick={() =>
                  handleReadAloud(
                    lang === "hi"
                      ? `आपने 7 में से ${coveredCount} क्षेत्रों का अनुभव दर्शाया है। यह कोई पास या फेल परीक्षा नहीं है। जो कौशल बाकी हैं, उनके लिए संक्षिप्त ब्रिज ट्रेनिंग दी जाएगी।`
                      : `You cover ${coveredCount} of ${totalCount} competency areas. This is not a pass fail test. Short bridge training is recommended for partial areas.`
                  )
                }
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition flex items-center gap-1.5 text-xs font-semibold shrink-0"
                title="बोलकर सुनाएं"
              >
                <Volume2 className="w-4 h-4" />
                <span>{isSpeaking ? "रोकें" : "बोलकर सुनाएं"}</span>
              </button>
            </div>

            <p className="text-xs text-blue-100 leading-relaxed">
              {lang === "hi"
                ? "यह प्रमाणन की अंतिम परीक्षा नहीं है। इसका उद्देश्य केवल यह जानना है कि आपका कौन सा कौशल पहले से पक्का है और किसमें थोड़े मार्गदर्शन की आवश्यकता है।"
                : "This is not a pass/fail judgment. It maps prior experience to NCVET standards and outlines optional bridge training."}
            </p>
          </div>

          {/* NOS-by-NOS Detailed Cards */}
          <div className="flex flex-col gap-3">
            {gapReport.map((item) => (
              <div
                key={item.nosCode}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col gap-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                      {item.nosCode}
                    </span>
                    <h3 className="font-semibold text-xs text-slate-900 dark:text-white mt-0.5">
                      {item.nosTitle}
                    </h3>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 flex items-center gap-1 ${
                      item.status === "covered"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300"
                        : item.status === "partial"
                        ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-purple-100 text-purple-800 border border-purple-300 dark:bg-purple-950 dark:text-purple-300"
                    }`}
                  >
                    {item.status === "covered" ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{lang === "hi" ? "कवर्ड (कौशल मौजूद)" : "Covered"}</span>
                      </>
                    ) : item.status === "partial" ? (
                      <>
                        <Clock className="w-3 h-3" />
                        <span>{lang === "hi" ? "आंशिक (16 घंटे ब्रिज)" : "Partial (16h)"}</span>
                      </>
                    ) : (
                      <>
                        <BookOpen className="w-3 h-3" />
                        <span>{lang === "hi" ? "गैप (32 घंटे ब्रिज)" : "Bridge Training (32h)"}</span>
                      </>
                    )}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {lang === "hi" ? item.plainLanguageSummaryHi : item.plainLanguageSummaryEn}
                </p>

                {item.recommendedBridgeHours > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                    {lang === "hi"
                      ? `अनुशंसित ब्रिज प्रशिक्षण: ${item.recommendedBridgeHours} घंटे`
                      : `Recommended Bridge Hours: ${item.recommendedBridgeHours} hrs`}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Action Step Forward */}
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                {lang === "hi" ? "अगला चरण: प्रायोगिक साक्ष्य रिकॉर्डिंग" : "Next: Practical Challenge Recording"}
              </span>
              <span className="text-[11px] text-amber-700 dark:text-amber-400 block mt-0.5">
                {lang === "hi"
                  ? "चैलेंज-रिस्पॉन्स कैमरे से अपने काम का 30 सेकंड का वीडियो बनाएं"
                  : "Record your challenge-response evidence clip using camera"}
              </span>
            </div>
            <Link
              href="/worker/capture"
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl shadow-sm shrink-0 min-h-[48px] flex items-center justify-center"
            >
              <span>{lang === "hi" ? "आगे बढ़ें (कैमरा)" : "Proceed to Camera"}</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
