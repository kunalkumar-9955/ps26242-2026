"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  HardDrive,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Pause,
  Play,
  Trash2,
  X,
  ChevronUp,
  Layers,
  ArrowUpRight,
  Info,
} from "lucide-react";
import { syncEngine, SyncEngineEventListener } from "@/lib/offline/sync-engine";
import {
  getStorageQuota,
  requestPersistentStorage,
  SyncQueueItem,
} from "@/lib/offline/db";
import { deviceAttestation, AttestationResult } from "@/lib/offline/attestation";

export function OfflineSyncBar() {
  const { currentUser } = useAuth();
  const lang = currentUser.language;

  // Sync state
  const [isOnline, setIsOnline] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);

  // Storage state
  const [storageInfo, setStorageInfo] = useState<{
    usedBytes: number;
    totalBytes: number;
    percentage: number;
    isStorageFull: boolean;
  }>({ usedBytes: 0, totalBytes: 0, percentage: 0, isStorageFull: false });
  const [persistenceGranted, setPersistenceGranted] = useState<boolean | null>(null);

  // Attestation state
  const [attestation, setAttestation] = useState<AttestationResult | null>(null);

  // Drawer / Details modal state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Service Worker Update Available state
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  // 1. Listen to Sync Engine
  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unsubscribe = syncEngine.subscribe((state) => {
      setIsOnline(state.isOnline);
      setIsPaused(state.isPaused);
      setIsSyncing(state.isSyncing);
      setQueuedCount(state.queuedCount);
      setSyncedCount(state.syncedCount);
      setFailedCount(state.failedCount);
      setNeedsAttentionCount(state.needsAttentionCount);
    });

    // Check storage & attestation
    refreshStorage();
    deviceAttestation.getAttestation("init-probe").then(setAttestation);

    // Register Service Worker and monitor updates
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          if (reg.waiting) {
            setSwUpdateAvailable(true);
            setWaitingWorker(reg.waiting);
          }
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  setSwUpdateAvailable(true);
                  setWaitingWorker(newWorker);
                }
              });
            }
          });
        })
        .catch((err) => console.warn("[PWA] Service Worker registration failed:", err));
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
    };
  }, []);

  const refreshStorage = async () => {
    const quota = await getStorageQuota();
    setStorageInfo(quota);
  };

  const handleRequestPersistence = async () => {
    const res = await requestPersistentStorage();
    setPersistenceGranted(res.persisted);
  };

  const openDrawer = async () => {
    setIsDrawerOpen(true);
    await refreshQueueItems();
  };

  const refreshQueueItems = async () => {
    const items = await syncEngine.getAllItems();
    setQueueItems(items);
  };

  const handleRetryItem = async (id: string) => {
    setRetryingId(id);
    await syncEngine.retryItem(id);
    await refreshQueueItems();
    setRetryingId(null);
  };

  const handleClearSynced = async () => {
    await syncEngine.clearSyncedItems();
    await refreshQueueItems();
    await refreshStorage();
  };

  const handleApplyUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <>
      {/* 1. App Update Banner if new version available */}
      {swUpdateAvailable && (
        <aside
          role="status"
          aria-label="Application update alert"
          className="bg-indigo-600 text-white px-4 py-2 text-xs flex items-center justify-between border-b border-indigo-700 z-40 animate-pulse"
        >
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>
              {lang === "hi"
                ? "नया संस्करण उपलब्ध है (New Version Available)"
                : "A new version of SatyaRPL is available."}
            </span>
          </div>
          <button
            onClick={handleApplyUpdate}
            className="bg-white text-indigo-700 px-2.5 py-1 rounded font-semibold text-[11px] hover:bg-indigo-50 shadow-sm"
          >
            {lang === "hi" ? "अपडेट करें / Reload" : "Update Now"}
          </button>
        </aside>
      )}

      {/* 2. Global Offline / Storage Warning Banner */}
      {!isOnline && (
        <aside
          role="status"
          aria-label="Offline mode alert"
          className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-medium flex items-center justify-between border-b border-amber-600 z-40 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-slate-950 animate-bounce" />
            <span>
              <strong>{lang === "hi" ? "ऑफ़लाइन मोड सक्रिय:" : "OFFLINE MODE ACTIVE:"}</strong>{" "}
              {lang === "hi"
                ? "साक्ष्य डिवाइस पर सुरक्षित हैश-चेन हो रहे हैं। इंटरनेट आने पर स्वतः सिंक होंगे।"
                : "Captures and hash-chains are recorded locally. Will sync automatically upon reconnect."}
            </span>
          </div>
          <button
            onClick={openDrawer}
            className="underline font-bold text-[11px] hover:text-black ml-2 whitespace-nowrap"
          >
            {lang === "hi" ? "कतार देखें" : "View Queue"} ({queuedCount})
          </button>
        </aside>
      )}

      {/* Storage Pressure Warning */}
      {storageInfo.isStorageFull && (
        <aside
          role="alert"
          aria-label="Storage full warning"
          className="bg-rose-600 text-white px-4 py-1.5 text-xs flex items-center justify-between z-40"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>
              {lang === "hi"
                ? "डिवाइस स्टोरेज लगभग भरा हुआ है (>95%)! कृपया पुराने सिंक किए गए डेटा को हटाएं।"
                : "Local storage almost full (>95%)! Please clear synced items to prevent capture loss."}
            </span>
          </div>
          <button
            onClick={openDrawer}
            className="bg-white text-rose-700 px-2 py-0.5 rounded text-[11px] font-bold"
          >
            {lang === "hi" ? "स्टोरेज खाली करें" : "Manage"}
          </button>
        </aside>
      )}

      {/* 3. Persistent Bottom-Right Sync Status Pill */}
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
        <button
          onClick={openDrawer}
          data-testid="sync-status-pill"
          aria-label="Offline sync status and storage"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-full text-xs font-medium shadow-lg backdrop-blur-md border transition-all ${
            !isOnline
              ? "bg-amber-950/80 text-amber-200 border-amber-600/50 hover:bg-amber-900/90"
              : failedCount > 0 || needsAttentionCount > 0
              ? "bg-rose-950/80 text-rose-200 border-rose-600/50 hover:bg-rose-900/90"
              : isSyncing
              ? "bg-blue-950/80 text-blue-200 border-blue-600/50 hover:bg-blue-900/90"
              : "bg-slate-900/85 text-slate-200 border-slate-700 hover:bg-slate-800"
          }`}
        >
          {/* Online / Offline status */}
          <div className="flex items-center gap-1.5">
            {isOnline ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="font-semibold text-[11px]">
              {isOnline ? (lang === "hi" ? "ऑनलाइन" : "Online") : lang === "hi" ? "ऑफ़लाइन" : "Offline"}
            </span>
          </div>

          {/* Queued Count */}
          {queuedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-blue-500/30 text-blue-300 text-[10px] font-bold border border-blue-500/40">
              {queuedCount} {lang === "hi" ? "लंबित" : "Queued"}
            </span>
          )}

          {/* Attention needed count */}
          {needsAttentionCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500/30 text-rose-300 text-[10px] font-bold border border-rose-500/40">
              {needsAttentionCount} {lang === "hi" ? "समीक्षा" : "Attention"}
            </span>
          )}

          {/* Syncing spinner */}
          {isSyncing && <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />}

          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* 4. Slide-Out Sync Queue & Storage Drawer */}
      {isDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex justify-end"
        >
          <div className="bg-slate-900 text-slate-100 border-l border-slate-800 w-full max-w-md h-full flex flex-col shadow-2xl overflow-hidden">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div>
                <h2 id="drawer-title" className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-400" />
                  {lang === "hi" ? "सिंक कतार एवं स्टोरेज" : "Offline Sync & Storage"}
                </h2>
                <p className="text-[11px] text-slate-400">
                  {lang === "hi"
                    ? "अपेंड-ओनली साक्ष्य कतार और स्थानीय स्थिति"
                    : "Append-only cryptographic evidence queue"}
                </p>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions & Status Strip */}
            <div className="px-4 py-3 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                    isOnline
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {isOnline ? "Online" : "Offline"}
                </span>

                {isPaused ? (
                  <span className="text-amber-400 text-[11px] font-medium flex items-center gap-1">
                    <Pause className="w-3 h-3" /> {lang === "hi" ? "रोका गया" : "Paused"}
                  </span>
                ) : isSyncing ? (
                  <span className="text-blue-400 text-[11px] font-medium flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> {lang === "hi" ? "सिंक जारी..." : "Syncing..."}
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">
                    {lang === "hi" ? "सक्रिय" : "Idle"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {isPaused ? (
                  <button
                    onClick={() => syncEngine.resume()}
                    className="p-1.5 rounded bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50 text-[11px] flex items-center gap-1"
                    title="Resume Sync"
                  >
                    <Play className="w-3 h-3" />
                    <span>{lang === "hi" ? "शुरू करें" : "Resume"}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => syncEngine.pause()}
                    className="p-1.5 rounded bg-amber-600/30 text-amber-300 hover:bg-amber-600/50 text-[11px] flex items-center gap-1"
                    title="Pause Sync"
                  >
                    <Pause className="w-3 h-3" />
                    <span>{lang === "hi" ? "रोकें" : "Pause"}</span>
                  </button>
                )}

                <button
                  onClick={() => syncEngine.processQueue()}
                  disabled={!isOnline || isPaused || isSyncing}
                  className="p-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 text-[11px] flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
                  <span>{lang === "hi" ? "सिंक करें" : "Sync Now"}</span>
                </button>
              </div>
            </div>

            {/* Storage Usage & Persistence Card */}
            <div className="p-4 bg-slate-950/40 border-b border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-slate-300" />
                  {lang === "hi" ? "स्थानीय स्टोरेज (IndexedDB):" : "Local Storage (IndexedDB):"}
                </span>
                <span className="font-semibold text-slate-200">
                  {formatBytes(storageInfo.usedBytes)} / {formatBytes(storageInfo.totalBytes)} ({storageInfo.percentage}%)
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    storageInfo.percentage > 85 ? "bg-rose-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, storageInfo.percentage))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>
                  {persistenceGranted === true ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Persistent Storage Active
                    </span>
                  ) : (
                    <button
                      onClick={handleRequestPersistence}
                      className="text-blue-400 hover:underline flex items-center gap-1"
                    >
                      Request Persistent Storage
                    </button>
                  )}
                </span>

                {syncedCount > 0 && (
                  <button
                    onClick={handleClearSynced}
                    className="text-slate-400 hover:text-rose-300 flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3 h-3" /> Clear Synced ({syncedCount})
                  </button>
                )}
              </div>
            </div>

            {/* Device Attestation Status Strip */}
            <div className="p-3 bg-slate-900/90 border-b border-slate-800 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-semibold text-slate-300">
                    Hardware Attestation:
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {attestation?.status || "NOT_CONFIGURED"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                {lang === "hi"
                  ? attestation?.descriptionHi
                  : attestation?.descriptionEn}
              </p>
            </div>

            {/* Queue Item List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>{lang === "hi" ? "कतार में आइटम" : "Queue Items"} ({queueItems.length})</span>
                <button
                  onClick={refreshQueueItems}
                  className="hover:text-white flex items-center gap-1 text-[11px]"
                >
                  <RefreshCw className="w-3 h-3" /> {lang === "hi" ? "रिफ्रेश" : "Refresh"}
                </button>
              </div>

              {queueItems.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  <p className="font-medium text-slate-400">
                    {lang === "hi" ? "कोई लंबित आइटम नहीं" : "All items synchronized"}
                  </p>
                  <p className="text-[11px] mt-1">
                    {lang === "hi"
                      ? "आपके सभी ऑफ़लाइन साक्ष्य सर्वर से सिंक हो चुके हैं।"
                      : "No items waiting in local IndexedDB sync queue."}
                  </p>
                </div>
              ) : (
                queueItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-lg border text-xs transition ${
                      item.status === "synced"
                        ? "bg-slate-950/40 border-slate-800 text-slate-400"
                        : item.status === "needs_attention"
                        ? "bg-rose-950/30 border-rose-800/60 text-rose-200"
                        : item.status === "failed"
                        ? "bg-amber-950/30 border-amber-800/60 text-amber-200"
                        : item.status === "syncing"
                        ? "bg-blue-950/30 border-blue-800/60 text-blue-200"
                        : "bg-slate-800/50 border-slate-700 text-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold capitalize text-white">
                          {item.type}
                        </span>
                        {item.totalChunks > 1 && (
                          <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded text-slate-400 border border-slate-700">
                            Chunk {item.chunkIndex}/{item.totalChunks}
                          </span>
                        )}
                      </div>

                      {/* Status badge */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          item.status === "synced"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : item.status === "syncing"
                            ? "bg-blue-500/20 text-blue-300 animate-pulse"
                            : item.status === "needs_attention"
                            ? "bg-rose-500/30 text-rose-300"
                            : item.status === "failed"
                            ? "bg-amber-500/30 text-amber-300"
                            : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 truncate">
                      Key: <code className="text-slate-300">{item.idempotencyKey.slice(0, 32)}...</code>
                    </div>

                    {item.lastError && (
                      <div className="mt-1 text-[11px] text-rose-300 bg-rose-950/50 p-1.5 rounded border border-rose-900/50">
                        {item.lastError}
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/60">
                      <span className="text-slate-500">
                        Attempts: {item.attempts} · {new Date(item.createdAt).toLocaleTimeString()}
                      </span>

                      {(item.status === "failed" || item.status === "needs_attention") && (
                        <button
                          onClick={() => handleRetryItem(item.id)}
                          disabled={retryingId === item.id}
                          className="px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-500 font-semibold text-[10px] flex items-center gap-1"
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${retryingId === item.id ? "animate-spin" : ""}`} />
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
