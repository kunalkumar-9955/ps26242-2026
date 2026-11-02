import Dexie, { type Table } from "dexie";
import { encryptSensitiveData, decryptSensitiveData } from "./crypto";

export interface OfflineDraft {
  id: string;
  key: string;
  type: "declaration" | "checklist" | "notes" | "profile";
  encryptedContent: string; // AES-GCM encrypted
  version: number;
  updatedAt: string;
  synced: boolean;
}

export interface OfflineDeclaration {
  id: string;
  candidateId: string;
  audioBlob?: Blob | string;
  rawTranscript: string;
  language: string;
  status: "queued_offline" | "transcribing" | "synced" | "failed";
  createdAt: string;
  synced: boolean;
  transcriptionError?: string;
}

export interface OfflineChecklistProgress {
  id: string; // taskId_stepIndex
  taskId: string;
  stepIndex: number;
  completed: boolean;
  note?: string;
  updatedAt: string;
}

export interface OfflineEvidenceBlob {
  id: string; // matches evidence id or temp uuid
  blob: Blob | string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface HashChainState {
  sessionId: string;
  chainIndex: number;
  lastHash: string;
  updatedAt: string;
}

export type SyncItemStatus =
  | "queued"
  | "syncing"
  | "synced"
  | "failed"
  | "needs_attention";

export interface SyncQueueItem {
  id: string;
  idempotencyKey: string;
  type: "evidence" | "declaration" | "checklist" | "draft";
  payload: any;
  status: SyncItemStatus;
  attempts: number;
  lastError: string | null;
  priority: number; // lower number = higher priority (0: declaration, 1: evidence, 2: checklist)
  chunkIndex: number;
  totalChunks: number;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineChallenge {
  id: string;
  nonce: string;
  sessionId: string;
  taskId: string;
  type: string;
  issuedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  payload: any;
}

export interface OfflineAssessorCache {
  id: string;
  candidateId: string;
  candidateName: string;
  qualificationId: string;
  rubricData: any;
  assignedAt: string;
  cachedAt: string;
}

export class SatyaRPLDatabase extends Dexie {
  drafts!: Table<OfflineDraft, string>;
  declarations!: Table<OfflineDeclaration, string>;
  checklistProgress!: Table<OfflineChecklistProgress, string>;
  evidenceBlobs!: Table<OfflineEvidenceBlob, string>;
  hashChainState!: Table<HashChainState, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  challengesCache!: Table<OfflineChallenge, string>;
  assessorCache!: Table<OfflineAssessorCache, string>;

  constructor() {
    super("SatyaRPL_OfflineDB");
    this.version(1).stores({
      drafts: "id, key, type, updatedAt, synced",
      declarations: "id, candidateId, status, createdAt, synced",
      checklistProgress: "id, taskId, stepIndex, completed, updatedAt",
      evidenceBlobs: "id, createdAt, mimeType",
      hashChainState: "sessionId, updatedAt",
      syncQueue: "id, idempotencyKey, type, status, priority, attempts, createdAt, updatedAt",
      challengesCache: "id, nonce, sessionId, taskId, type, issuedAt, expiresAt, consumedAt",
      assessorCache: "id, candidateId, qualificationId, assignedAt",
    });
  }
}

// Global Singleton instance
export const offlineDb = new SatyaRPLDatabase();

/**
 * Requests persistent storage from browser to prevent eviction under storage pressure
 */
export async function requestPersistentStorage(): Promise<{
  persisted: boolean;
  reason?: string;
}> {
  if (typeof window === "undefined" || !navigator.storage || !navigator.storage.persist) {
    return { persisted: false, reason: "Storage Persistence API not supported" };
  }

  try {
    const isAlreadyPersisted = await navigator.storage.persisted();
    if (isAlreadyPersisted) {
      return { persisted: true };
    }
    const persisted = await navigator.storage.persist();
    return {
      persisted,
      reason: persisted
        ? "Persistent storage granted"
        : "Browser denied persistence (may require user bookmarking or PWA installation)",
    };
  } catch (err: any) {
    return { persisted: false, reason: err.message };
  }
}

/**
 * Returns storage usage and quota estimate
 */
export async function getStorageQuota(): Promise<{
  usedBytes: number;
  totalBytes: number;
  percentage: number;
  isStorageFull: boolean;
}> {
  if (typeof window === "undefined" || !navigator.storage || !navigator.storage.estimate) {
    return { usedBytes: 0, totalBytes: 0, percentage: 0, isStorageFull: false };
  }

  try {
    const { usage, quota } = await navigator.storage.estimate();
    const usedBytes = usage || 0;
    const totalBytes = quota || 1;
    const percentage = Math.round((usedBytes / totalBytes) * 100);
    const isStorageFull = percentage >= 95;
    return { usedBytes, totalBytes, percentage, isStorageFull };
  } catch (err) {
    return { usedBytes: 0, totalBytes: 0, percentage: 0, isStorageFull: false };
  }
}

/**
 * Saves or updates a draft with WebCrypto encryption
 */
export async function saveEncryptedDraft(
  key: string,
  type: OfflineDraft["type"],
  content: any,
  version: number = 1
): Promise<OfflineDraft> {
  const encryptedContent = await encryptSensitiveData(content);
  const now = new Date().toISOString();
  const draft: OfflineDraft = {
    id: `draft_${key}`,
    key,
    type,
    encryptedContent,
    version,
    updatedAt: now,
    synced: false,
  };

  await offlineDb.drafts.put(draft);
  return draft;
}

/**
 * Retrieves and decrypts a draft
 */
export async function getDecryptedDraft<T = any>(key: string): Promise<{
  content: T;
  version: number;
  updatedAt: string;
} | null> {
  const draft = await offlineDb.drafts.where("key").equals(key).first();
  if (!draft) return null;

  try {
    const raw = await decryptSensitiveData(draft.encryptedContent);
    const parsed = JSON.parse(raw);
    return { content: parsed, version: draft.version, updatedAt: draft.updatedAt };
  } catch (err) {
    console.error("Failed to decrypt draft:", err);
    return null;
  }
}
