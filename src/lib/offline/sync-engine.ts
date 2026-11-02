import { offlineDb, SyncQueueItem, SyncItemStatus } from "./db";
import { EvidencePayload } from "../evidence/integrity";

/**
 * CONFLICT RESOLUTION POLICY (CRITICAL ARCHITECTURAL GUARANTEE):
 * 1. Evidence items are APPEND-ONLY. Each capture generates an immutable block
 *    with an independent UUID and hash-chain sequence index. Evidence items
 *    NEVER overwrite each other, guaranteeing zero merge conflicts.
 * 2. Drafts (candidate text / declaration drafts) follow LAST-WRITER-WINS (LWW).
 *    When a newer local draft synchronizes, it supersedes the previous draft,
 *    and a visible merge notification displays the timestamp difference.
 */

export type SyncEngineEventListener = (status: {
  isOnline: boolean;
  isPaused: boolean;
  isSyncing: boolean;
  queuedCount: number;
  syncedCount: number;
  failedCount: number;
  needsAttentionCount: number;
}) => void;

export class SyncEngine {
  private isPaused: boolean = false;
  private isSyncing: boolean = false;
  private listeners: Set<SyncEngineEventListener> = new Set();
  private foregroundInterval: NodeJS.Timeout | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.initListeners();
    }
  }

  /**
   * Initializes network and visibility listeners (Foreground fallback for iOS Safari)
   */
  private initListeners() {
    window.addEventListener("online", () => {
      console.log("[SyncEngine] Network reconnected (online event). Triggering sync...");
      this.notifyListeners();
      this.processQueue();
    });

    window.addEventListener("offline", () => {
      console.log("[SyncEngine] Network disconnected (offline event).");
      this.notifyListeners();
    });

    // iOS Safari Fallback: Safari does not support the Background Sync API.
    // Sync triggers whenever the app becomes visible again or is reopened.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        console.log("[SyncEngine] App became visible (iOS Safari fallback). Checking sync queue...");
        this.processQueue();
      }
    });

    // Foreground interval check every 20 seconds while active
    this.foregroundInterval = setInterval(() => {
      if (navigator.onLine && !this.isPaused && !this.isSyncing) {
        this.processQueue();
      }
    }, 20000);
  }

  public subscribe(listener: SyncEngineEventListener): () => void {
    this.listeners.add(listener);
    this.notifyListeners();
    return () => this.listeners.delete(listener);
  }

  private async notifyListeners() {
    const counts = await this.getQueueCounts();
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    for (const listener of this.listeners) {
      listener({
        isOnline,
        isPaused: this.isPaused,
        isSyncing: this.isSyncing,
        ...counts,
      });
    }
  }

  public async getQueueCounts(): Promise<{
    queuedCount: number;
    syncedCount: number;
    failedCount: number;
    needsAttentionCount: number;
  }> {
    const all = await offlineDb.syncQueue.toArray();
    let queuedCount = 0;
    let syncedCount = 0;
    let failedCount = 0;
    let needsAttentionCount = 0;

    for (const item of all) {
      if (item.status === "queued" || item.status === "syncing") queuedCount++;
      else if (item.status === "synced") syncedCount++;
      else if (item.status === "failed") failedCount++;
      else if (item.status === "needs_attention") needsAttentionCount++;
    }

    return { queuedCount, syncedCount, failedCount, needsAttentionCount };
  }

  public async getAllItems(): Promise<SyncQueueItem[]> {
    return offlineDb.syncQueue.orderBy("createdAt").reverse().toArray();
  }

  public pause() {
    this.isPaused = true;
    this.notifyListeners();
  }

  public resume() {
    this.isPaused = false;
    this.notifyListeners();
    this.processQueue();
  }

  /**
   * Enqueues an evidence capture item with an idempotency key
   */
  public async enqueueEvidence(
    evidence: EvidencePayload,
    blobData?: string
  ): Promise<string> {
    const id = `ev_queue_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const idempotencyKey = `satyarpl-evidence-${evidence.sessionId}-${evidence.chainIndex}-${id}`;

    const queueItem: SyncQueueItem = {
      id,
      idempotencyKey,
      type: "evidence",
      payload: {
        ...evidence,
        idempotencyKey,
        blobDataUrl: blobData,
        clientSyncMode: "offline",
      },
      status: "queued",
      attempts: 0,
      lastError: null,
      priority: 1, // Evidence priority 1
      chunkIndex: 0,
      totalChunks: blobData && blobData.length > 500000 ? Math.ceil(blobData.length / 250000) : 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await offlineDb.syncQueue.put(queueItem);
    this.notifyListeners();

    // Register Background Sync if supported (Chromium / Chrome Android)
    this.requestBackgroundSync();

    // Attempt immediate sync if online
    if (navigator.onLine && !this.isPaused) {
      this.processQueue();
    }

    return id;
  }

  /**
   * Enqueues a voice declaration
   */
  public async enqueueDeclaration(declarationPayload: {
    id: string;
    candidateId: string;
    rawTranscript: string;
    language: string;
    audioRef?: string;
    structuredExtraction?: any;
  }): Promise<string> {
    const queueId = `decl_queue_${declarationPayload.id}`;
    const idempotencyKey = `satyarpl-decl-${declarationPayload.id}`;

    const queueItem: SyncQueueItem = {
      id: queueId,
      idempotencyKey,
      type: "declaration",
      payload: declarationPayload,
      status: "queued",
      attempts: 0,
      lastError: null,
      priority: 0, // High priority
      chunkIndex: 0,
      totalChunks: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await offlineDb.syncQueue.put(queueItem);
    this.notifyListeners();
    this.requestBackgroundSync();

    if (navigator.onLine && !this.isPaused) {
      this.processQueue();
    }

    return queueId;
  }

  /**
   * Registers Chrome Android Background Sync
   */
  private async requestBackgroundSync() {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "SyncManager" in window
    ) {
      try {
        const reg = await navigator.serviceWorker.ready;
        // @ts-ignore
        if (reg.sync) {
          // @ts-ignore
          await reg.sync.register("satyarpl-evidence-sync");
          console.log("[SyncEngine] Background Sync registered successfully");
        }
      } catch (err) {
        console.warn("[SyncEngine] Background Sync registration error:", err);
      }
    }
  }

  /**
   * Exponential backoff calculation with decorrelated jitter
   */
  private computeBackoffDelay(attempts: number): number {
    const base = Math.min(30000, 1000 * Math.pow(2, attempts));
    const jitter = Math.floor(Math.random() * 800);
    return base + jitter;
  }

  /**
   * Processes all queued items in order of priority and creation
   */
  public async processQueue(): Promise<void> {
    if (this.isPaused || this.isSyncing) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    this.isSyncing = true;
    this.notifyListeners();

    try {
      const pendingItems = await offlineDb.syncQueue
        .where("status")
        .equals("queued")
        .sortBy("priority");

      for (const item of pendingItems) {
        if (this.isPaused || (typeof navigator !== "undefined" && !navigator.onLine)) {
          break;
        }

        await this.syncItem(item);
      }
    } catch (err) {
      console.error("[SyncEngine] Queue processing error:", err);
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  /**
   * Synchronizes a single item with chunking and idempotency
   */
  public async syncItem(item: SyncQueueItem): Promise<boolean> {
    item.status = "syncing";
    item.updatedAt = new Date().toISOString();
    await offlineDb.syncQueue.put(item);
    this.notifyListeners();

    try {
      if (item.type === "evidence") {
        await this.syncEvidenceItem(item);
      } else if (item.type === "declaration") {
        await this.syncDeclarationItem(item);
      }

      item.status = "synced";
      item.lastError = null;
      item.updatedAt = new Date().toISOString();
      await offlineDb.syncQueue.put(item);
      this.notifyListeners();
      return true;
    } catch (err: any) {
      console.warn(`[SyncEngine] Item ${item.id} sync failed:`, err);
      item.attempts += 1;
      item.lastError = err.message || "Network / verification failure";

      // If attempts reach 5, flag as needs_attention
      if (item.attempts >= 5) {
        item.status = "needs_attention";
      } else {
        item.status = "failed";
        // Schedule retry with exponential backoff
        const delay = this.computeBackoffDelay(item.attempts);
        setTimeout(() => {
          if (item.status === "failed") {
            item.status = "queued";
            offlineDb.syncQueue.put(item);
            this.notifyListeners();
          }
        }, delay);
      }

      item.updatedAt = new Date().toISOString();
      await offlineDb.syncQueue.put(item);
      this.notifyListeners();
      return false;
    }
  }

  /**
   * Resumable Chunked Evidence Upload
   */
  private async syncEvidenceItem(item: SyncQueueItem): Promise<void> {
    const payload = item.payload;
    const blobData: string = payload.blobDataUrl || "";

    // Chunk size: 250,000 chars (~180KB base64 chunk)
    const chunkSize = 250000;
    const totalChunks = Math.max(1, Math.ceil(blobData.length / chunkSize));
    const uploadId = `upload_${item.id}`;

    // If multi-chunk, send chunks sequentially from current chunkIndex
    if (totalChunks > 1 && blobData.length > 0) {
      for (let i = item.chunkIndex; i < totalChunks; i++) {
        const chunkData = blobData.slice(i * chunkSize, (i + 1) * chunkSize);

        const chunkRes = await fetch("/api/evidence/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "upload_chunk",
            uploadId,
            chunkIndex: i,
            totalChunks,
            chunkData,
          }),
        });

        if (!chunkRes.ok) {
          throw new Error(`Chunk upload failed at index ${i}/${totalChunks}: HTTP ${chunkRes.status}`);
        }

        // Save progress for resumability!
        item.chunkIndex = i + 1;
        await offlineDb.syncQueue.put(item);
      }
    }

    // Now finalize evidence verification & sealing
    const verifyRes = await fetch("/api/evidence/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "verify_and_seal",
        idempotencyKey: item.idempotencyKey,
        uploadId: totalChunks > 1 ? uploadId : undefined,
        payload: {
          ...payload,
          idempotencyKey: item.idempotencyKey,
        },
      }),
    });

    if (!verifyRes.ok) {
      const errJson = await verifyRes.json().catch(() => ({}));
      throw new Error(errJson.details || errJson.error || `Server verification rejected (HTTP ${verifyRes.status})`);
    }

    const data = await verifyRes.json();
    if (!data.success) {
      throw new Error(data.error || "Evidence verification failed");
    }
  }

  /**
   * Voice declaration sync
   */
  private async syncDeclarationItem(item: SyncQueueItem): Promise<void> {
    const res = await fetch("/api/evidence/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "declaration",
        idempotencyKey: item.idempotencyKey,
        payload: item.payload,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Declaration sync failed (HTTP ${res.status})`);
    }
  }

  /**
   * User-triggered manual retry of a failed or needs_attention item
   */
  public async retryItem(id: string): Promise<void> {
    const item = await offlineDb.syncQueue.get(id);
    if (!item) return;

    item.status = "queued";
    item.lastError = null;
    item.updatedAt = new Date().toISOString();
    await offlineDb.syncQueue.put(item);
    this.notifyListeners();

    if (navigator.onLine && !this.isPaused) {
      this.processQueue();
    }
  }

  /**
   * Clears synced items to free IndexedDB space
   */
  public async clearSyncedItems(): Promise<number> {
    const synced = await offlineDb.syncQueue.where("status").equals("synced").toArray();
    await offlineDb.syncQueue.bulkDelete(synced.map((s) => s.id));
    this.notifyListeners();
    return synced.length;
  }
}

// Global Singleton
export const syncEngine = new SyncEngine();
