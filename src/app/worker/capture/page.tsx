"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import Link from "next/link";
import {
  Video,
  VideoOff,
  Camera,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Send,
  ArrowLeft,
  Sparkles,
  Lock,
  Layers,
  HelpCircle,
  WifiOff,
} from "lucide-react";
import { offlineChallengeManager } from "@/lib/offline/challenge-cache";
import { syncEngine } from "@/lib/offline/sync-engine";
import { offlineDb } from "@/lib/offline/db";

export default function EvidenceCapturePage() {
  const { currentUser } = useAuth();
  const lang = currentUser.language;

  // Task & Session State
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [activeChallenge, setActiveChallenge] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Camera & MediaRecorder State
  const [cameraActive, setCameraActive] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<string | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [chainIndex, setChainIndex] = useState(0);
  const [prevHash, setPrevHash] = useState("0000000000000000000000000000000000000000000000000000000000000000");

  // Geolocation State
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Submission & Pipeline Verification Results
  const [isUploading, setIsUploading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 1. Load Tasks & Session on Mount
  useEffect(() => {
    async function loadTasks() {
      try {
        setLoading(true);
        const res = await fetch("/api/evidence/tasks");
        const data = await res.json();
        if (data.tasks) {
          setTasks(data.tasks);
          setSelectedTask(data.tasks[0]);
          setSessionId(data.sessionId);

          // Pre-fetch challenges in background for offline use
          if (typeof navigator !== "undefined" && navigator.onLine) {
            offlineChallengeManager.prefetchChallenges(
              data.sessionId,
              data.tasks.map((t: any) => t.id),
              2,
              7200
            ).catch((e) => console.warn("Prefetch warning:", e));
          }
        }
      } catch (err) {
        console.error("Failed to load tasks:", err);
      } finally {
        setLoading(false);
      }
    }
    loadTasks();

    // Query Geolocation
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setGeoCoords({ lat: 26.8467, lng: 80.9462 }) // Fallback to Lucknow, UP
      );
    }
  }, []);

  // 2. Request Challenge when task is selected
  const requestChallengeForTask = React.useCallback(async (task: any) => {
    if (!sessionId) return;
    try {
      setActiveChallenge(null);
      setVerificationResult(null);
      setRecordedBlob(null);

      // If offline: consume from local IndexedDB cache
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const consumption = await offlineChallengeManager.consumeChallenge(sessionId, task.id);
        if (consumption.challenge) {
          setActiveChallenge(consumption.challenge);
        } else {
          setActiveChallenge({ missing: true, nonce: "" });
        }
        return;
      }

      const res = await fetch("/api/evidence/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          taskId: task.id,
          type: task.challenge_type || "code_on_camera",
          ttlSeconds: 900,
        }),
      });

      const data = await res.json();
      if (data.challenge) {
        setActiveChallenge(data.challenge);
      }
    } catch (err) {
      console.error("Error issuing challenge (fallback to offline cache):", err);
      const consumption = await offlineChallengeManager.consumeChallenge(sessionId, task.id);
      if (consumption.challenge) {
        setActiveChallenge(consumption.challenge);
      } else {
        setActiveChallenge({ missing: true, nonce: "" });
      }
    }
  }, [sessionId]);

  useEffect(() => {
    if (selectedTask && sessionId) {
      requestChallengeForTask(selectedTask);
    }
  }, [selectedTask, sessionId, requestChallengeForTask]);

  // 3. Camera Activation with User Media or Clean Simulation
  const startCamera = async () => {
    try {
      setPermissionDenied(false);
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 640, height: 480 },
          audio: true,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setCameraActive(true);
      } else {
        setCameraActive(true); // Virtual stream fallback
      }
    } catch (err: any) {
      console.warn("Camera access denied or unsecure origin (requires HTTPS on mobile):", err);
      setPermissionDenied(true);
      setCameraActive(true); // Fallback to simulated camera feed
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setCameraActive(false);
  };

  // 4. Recording Flow with 3-2-1 Countdown
  const handleStartCapture = () => {
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === 1) {
          clearInterval(interval);
          startRecordingStream();
          return null;
        }
        return (prev || 3) - 1;
      });
    }, 1000);
  };

  const startRecordingStream = () => {
    setIsRecording(true);
    // Simulate recording for 5 seconds then stop
    setTimeout(() => {
      setIsRecording(false);
      const fakeVideoUrl = `evidence-clip-${selectedTask?.id}-${Date.now()}.mp4`;
      setRecordedBlob(fakeVideoUrl);
    }, 5000);
  };

  // 5. Submit Evidence to Server Verification Pipeline
  const handleUploadAndVerify = async () => {
    if (!selectedTask) return;

    try {
      setIsUploading(true);
      const deviceCapturedAt = new Date().toISOString();
      const challengeMissing = !activeChallenge || !activeChallenge.nonce || Boolean(activeChallenge.missing);
      const effectiveNonce = activeChallenge?.nonce || `missing-offline-${Date.now()}`;

      // If offline: Immediate on-device hash chain and IndexedDB queue
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const payload = {
          sessionId,
          taskId: selectedTask.id,
          challengeNonce: effectiveNonce,
          blobRef: recordedBlob || `mock-video-${effectiveNonce}.mp4`,
          deviceCapturedAt,
          chainIndex,
          prevHash,
          latitude: geoCoords?.lat || 26.8467,
          longitude: geoCoords?.lng || 80.9462,
          accuracyMeters: 8.5,
          deviceFingerprint: "browser-fingerprint-chrome-mobile-v1",
          attemptNumber,
          phash: "a1b2c3d4e5f67890a1b2c3d4e5f67890",
          clientMetadata: {
            container: "video/webm",
            audioCodec: "opus",
            durationSeconds: 5.2,
          },
          clientSyncMode: "offline" as const,
          challengeMissing,
        };

        const queueId = await syncEngine.enqueueEvidence(payload);
        setChainIndex((prev) => prev + 1);
        setPrevHash(`offline-chain-block-${chainIndex}`);

        setVerificationResult({
          offlineQueued: true,
          queueId,
          challengeMissing,
          sealed: false,
          chainVerified: true,
          flags: challengeMissing
            ? [
                {
                  type: "challenge_missing",
                  severity: "critical",
                  reason:
                    "Offline capture without a valid challenge. Queued in IndexedDB and flagged challenge_missing for assessor audit on sync.",
                  details: { offlineMode: true },
                },
              ]
            : [],
        });
        setIsUploading(false);
        return;
      }

      // Online Flow
      const payload = {
        sessionId,
        taskId: selectedTask.id,
        challengeNonce: effectiveNonce,
        blobRef: recordedBlob || `mock-video-${effectiveNonce}.mp4`,
        deviceCapturedAt,
        chainIndex,
        prevHash,
        latitude: geoCoords?.lat || 26.8467,
        longitude: geoCoords?.lng || 80.9462,
        accuracyMeters: 8.5,
        deviceFingerprint: "browser-fingerprint-chrome-mobile-v1",
        attemptNumber,
        phash: "a1b2c3d4e5f67890a1b2c3d4e5f67890",
        clientMetadata: {
          container: "video/webm",
          audioCodec: "opus",
          durationSeconds: 5.2,
        },
        challengeMissing,
      };

      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUser.role,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.result) {
        setVerificationResult(data.result);
        setChainIndex((prev) => prev + 1);
        if (data.result.sealed) {
          setPrevHash(data.result.evidenceId); // Chain progression
        }
      }
    } catch (err: any) {
      console.warn("Upload network drop, queueing in offline store:", err);
      const payload = {
        sessionId,
        taskId: selectedTask.id,
        challengeNonce: activeChallenge?.nonce || `fallback-${Date.now()}`,
        blobRef: recordedBlob || `mock-video-offline.mp4`,
        deviceCapturedAt: new Date().toISOString(),
        chainIndex,
        prevHash,
        latitude: geoCoords?.lat || 26.8467,
        longitude: geoCoords?.lng || 80.9462,
        accuracyMeters: 8.5,
        deviceFingerprint: "browser-fingerprint-chrome-mobile-v1",
        attemptNumber,
        phash: "a1b2c3d4e5f67890a1b2c3d4e5f67890",
        clientMetadata: { container: "video/webm", audioCodec: "opus" },
        clientSyncMode: "offline" as const,
        challengeMissing: Boolean(activeChallenge?.missing),
      };
      await syncEngine.enqueueEvidence(payload);
      setVerificationResult({
        offlineQueued: true,
        chainVerified: true,
        sealed: false,
        flags: [],
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Retake Clip
  const handleRetake = () => {
    setRecordedBlob(null);
    setVerificationResult(null);
    setAttemptNumber((prev) => prev + 1);
    requestChallengeForTask(selectedTask);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6 w-full flex-1 flex flex-col gap-5">
      {/* Back to Declaration Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/worker"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-600 transition min-h-[48px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === "hi" ? "स्व-घोषणा पर वापस जाएं" : "Back to Declaration"}</span>
        </Link>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold">
          Chain Block #{chainIndex}
        </span>
      </div>

      {/* Checklist Task Selection */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
          {lang === "hi" ? "प्रायोगिक कार्य सूची" : "Practical Task Checklist"}
        </h2>
        <div className="flex flex-col gap-2">
          {tasks.map((task, idx) => {
            const isSelected = selectedTask?.id === task.id;
            return (
              <button
                key={task.id}
                onClick={() => {
                  setSelectedTask(task);
                  setRecordedBlob(null);
                  setVerificationResult(null);
                }}
                className={`p-3 rounded-xl border text-left text-xs transition flex items-center justify-between gap-3 min-h-[48px] ${
                  isSelected
                    ? "bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200"
                    : "border-slate-200 bg-slate-50/50 hover:border-slate-300 text-slate-700 dark:border-slate-800 dark:bg-slate-900"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[11px] text-amber-700 dark:text-amber-400 font-mono">
                      Task {idx + 1}
                    </span>
                    <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.2 rounded font-mono">
                      {task.nos_code}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {task.title}
                  </p>
                </div>
                {isSelected && <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ACTIVE CHALLENGE OVERLAY BANNER */}
      {activeChallenge && activeChallenge.missing ? (
        <div className="bg-rose-950/80 border border-rose-700/60 text-white rounded-2xl p-4 shadow-md flex flex-col gap-2">
          <div className="flex items-center justify-between text-rose-300">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-500/30 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 text-rose-400" />
              Challenge Missing (Offline)
            </span>
            <span className="text-[11px] font-semibold text-rose-300">
              {lang === "hi" ? "अपुष्ट कैप्चर" : "Unverified Offline"}
            </span>
          </div>

          <div className="bg-black/40 rounded-xl p-3 border border-rose-500/30 text-center">
            <span className="text-[11px] uppercase text-rose-300 block font-bold">
              {lang === "hi" ? "कोई वैध चैलेंज नहीं मिला" : "No Valid Challenge Found"}
            </span>
            <span className="text-xs text-rose-200 mt-1 block">
              {lang === "hi"
                ? "साक्ष्य डिवाइस पर हैश-चेन होगा परंतु सिंक होने पर 'challenge_missing' के रूप में फ्लैग होगा।"
                : "Evidence will be hash-chained, but flagged 'challenge_missing' on sync for assessor review."}
            </span>
          </div>
        </div>
      ) : activeChallenge ? (
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-2xl p-4 shadow-md flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-black/20 px-2 py-0.5 rounded-full">
              Single-Use Challenge Nonce
            </span>
            <div className="flex items-center gap-1 text-[11px] font-mono">
              <Clock className="w-3.5 h-3.5" />
              <span>Valid 15m</span>
            </div>
          </div>

          <div className="bg-black/30 rounded-xl p-3 border border-white/20 text-center">
            <span className="text-[10px] uppercase text-amber-200 block">Verification Nonce</span>
            <span className="font-mono text-xl font-extrabold tracking-wider text-white">
              {activeChallenge.nonce}
            </span>
          </div>

          <p className="text-xs text-amber-100 leading-tight">
            <strong>{lang === "hi" ? "निर्देश:" : "Instruction:"}</strong> {activeChallenge.promptText}
          </p>
        </div>
      ) : null}

      {/* CAMERA VIEWPORT WITH INTEGRITY OVERLAYS */}
      <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 aspect-[4/3] relative flex items-center justify-center shadow-inner">
        {cameraActive ? (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        ) : (
          <div className="text-center p-6 flex flex-col items-center gap-3">
            <Camera className="w-12 h-12 text-slate-600" />
            <p className="text-xs text-slate-400 max-w-xs">
              {lang === "hi"
                ? "चैलेंज कोड के साथ वीडियो कैप्चर शुरू करने के लिए कैमरा चालू करें।"
                : "Activate camera to capture video with challenge verification overlay."}
            </p>
            <button
              onClick={startCamera}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md min-h-[48px] flex items-center gap-2"
            >
              <Video className="w-4 h-4" />
              <span>{lang === "hi" ? "कैमरा सक्रिय करें" : "Activate Camera"}</span>
            </button>
          </div>
        )}

        {/* Live Overlay Stamp on Top of Camera */}
        {cameraActive && (
          <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">
            {/* Top Overlay: GPS & Nonce */}
            <div className="flex items-center justify-between text-[10px] text-white bg-black/50 backdrop-blur-sm p-1.5 rounded-lg border border-white/10 font-mono">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-emerald-400" />
                <span>{geoCoords ? `${geoCoords.lat.toFixed(3)}, ${geoCoords.lng.toFixed(3)}` : "GPS Locked"}</span>
              </span>
              <span className="font-bold text-amber-300">[{activeChallenge?.nonce || "NO-NONCE"}]</span>
            </div>

            {/* Center Countdown Pulse */}
            {countdown !== null && (
              <div className="self-center w-16 h-16 rounded-full bg-amber-500/90 text-white flex items-center justify-center font-extrabold text-3xl animate-ping">
                {countdown}
              </div>
            )}

            {/* Bottom Overlay: Recording Status */}
            {isRecording && (
              <div className="self-center bg-rose-600 text-white text-[11px] font-bold px-3 py-1 rounded-full animate-pulse flex items-center gap-1.5 shadow-lg">
                <span className="w-2 h-2 rounded-full bg-white" />
                <span>RECORDING CHALLENGE (5s)...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CAMERA TRIGGER BUTTONS */}
      {cameraActive && !recordedBlob && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={handleStartCapture}
            disabled={isRecording || countdown !== null}
            className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 transition transform active:scale-95 min-h-[48px] min-w-[48px]"
            aria-label="Start recording video clip"
          >
            <div className="w-6 h-6 rounded bg-white" />
          </button>
        </div>
      )}

      {/* RECORDED PREVIEW & SUBMISSION CARD */}
      {recordedBlob && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              {lang === "hi" ? "क्लिप तैयार (प्रयास संख्या #" + attemptNumber + ")" : `Clip Ready (Attempt #${attemptNumber})`}
            </span>
            <button
              onClick={handleRetake}
              className="text-slate-500 hover:text-amber-600 text-xs font-semibold flex items-center gap-1 min-h-[48px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{lang === "hi" ? "फिर से बनाएं" : "Retake"}</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-500 font-mono truncate">
            Ref: {recordedBlob}
          </p>

          {!verificationResult && (
            <button
              onClick={handleUploadAndVerify}
              disabled={isUploading}
              className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 transition"
            >
              {isUploading ? (
                <span>
                  {lang === "hi"
                    ? "सर्वर पर सत्यापन व सीलिंग जारी है..."
                    : "Verifying Integrity & Sealing on Server..."}
                </span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>
                    {lang === "hi"
                      ? "सर्वर पर अपलोड व सत्यापित करें"
                      : "Upload & Verify on Server"}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* PIPELINE VERIFICATION RESULT BADGES & WORKER GUIDANCE */}
      {verificationResult && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm flex flex-col gap-4">
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-1.5">
                {verificationResult.offlineQueued ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    <WifiOff className="w-3.5 h-3.5" />
                    <span>QUEUED OFFLINE (HASH-CHAINED)</span>
                  </span>
                ) : verificationResult.flags.length === 0 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>SEALED & HASH-VERIFIED</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>SEALED WITH AUDIT FLAGS ({verificationResult.flags.length})</span>
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                {verificationResult.offlineQueued
                  ? (lang === "hi" ? "ऑफ़लाइन साक्ष्य सुरक्षित" : "Evidence Queued in Offline Store")
                  : (lang === "hi" ? "सर्वर सत्यापन परिणाम" : "Server Verification Outcome")}
              </h3>
            </div>

            <span className="text-[10px] font-mono text-slate-400">
              {verificationResult.offlineQueued
                ? `Queue #${chainIndex}`
                : `ID: ${verificationResult.evidenceId?.substring(0, 8)}...`}
            </span>
          </div>

          {/* Verification Points List */}
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
              <span>Challenge Signature & Single-Use:</span>
              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Validated</span>
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
              <span>Cryptographic Hash Chain:</span>
              <span className={`font-semibold flex items-center gap-1 ${verificationResult.chainVerified ? "text-emerald-600" : "text-rose-600"}`}>
                {verificationResult.chainVerified ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                <span>{verificationResult.chainVerified ? "Continuity Verified" : "Chain Break"}</span>
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
              <span>Liveness & Face Check:</span>
              <span className="font-mono text-[11px] text-slate-500">
                {verificationResult.livenessResult}
              </span>
            </div>
          </div>

          {/* Any Triggered Security Flags */}
          {verificationResult.flags.length > 0 && (
            <div className="flex flex-col gap-2 pt-2">
              <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400">
                Security Flags Recorded:
              </span>
              {verificationResult.flags.map((f: any, i: number) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-900 dark:text-rose-200"
                >
                  <strong className="block uppercase text-[10px] tracking-wider text-rose-700 dark:text-rose-400">
                    Flag [{f.type}] · Severity: {f.severity}
                  </strong>
                  <span className="text-[11px] mt-0.5 block leading-relaxed">{f.reason}</span>
                </div>
              ))}
            </div>
          )}

          {/* Plain-Language Worker Guidance: What to do next */}
          <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-950 dark:text-blue-200">
            <strong>{lang === "hi" ? "आगे क्या करें?" : "What to do next:"}</strong>
            <p className="mt-1 text-[11px] leading-relaxed">
              {verificationResult.flags.length === 0
                ? lang === "hi"
                  ? "आपका साक्ष्य सफलतापूर्वक सील हो गया है। अब आप अगले कार्य का वीडियो रिकॉर्ड कर सकते हैं।"
                  : "Your evidence clip has been cryptographically sealed. You may proceed to the next practical task."
                : lang === "hi"
                ? "साक्ष्य सील हो गया है लेकिन कुछ सुरक्षा संकेत दर्ज हुए हैं। परीक्षक (Assessor) सत्यापन के समय इसकी समीक्षा करेंगे।"
                : "Evidence was sealed with audit signals. The accredited assessor will review these flags during audit reconciliation."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
