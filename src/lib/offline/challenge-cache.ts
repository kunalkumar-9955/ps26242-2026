import { offlineDb, OfflineChallenge } from "./db";

export interface ChallengeConsumptionResult {
  challenge: OfflineChallenge | null;
  challengeMissing: boolean;
  reason?: string;
}

export class OfflineChallengeManager {
  /**
   * Pre-fetches a batch of challenges while online and stores them in IndexedDB
   */
  public async prefetchChallenges(
    sessionId: string,
    taskIds: string[],
    countPerTask: number = 2,
    ttlSeconds: number = 7200
  ): Promise<{ fetched: number; errors?: string }> {
    if (typeof window === "undefined" || !navigator.onLine) {
      return { fetched: 0, errors: "Device is offline. Cannot pre-fetch challenges." };
    }

    try {
      const res = await fetch("/api/evidence/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          batch: true,
          taskIds,
          countPerTask,
          ttlSeconds,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to prefetch: HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.challenges || !Array.isArray(data.challenges)) {
        return { fetched: 0, errors: "Invalid response from challenges API" };
      }

      // Store in Dexie
      const records: OfflineChallenge[] = data.challenges.map((c: any) => ({
        id: c.id,
        nonce: c.nonce,
        sessionId: c.session_id || sessionId,
        taskId: c.task_id,
        type: c.type,
        issuedAt: c.issued_at,
        expiresAt: c.expires_at,
        consumedAt: null,
        payload: c.payload,
      }));

      await offlineDb.challengesCache.bulkPut(records);
      return { fetched: records.length };
    } catch (err: any) {
      console.warn("[ChallengeManager] Prefetch error:", err);
      return { fetched: 0, errors: err.message };
    }
  }

  /**
   * Consumes an unexpired, unconsumed challenge for the specific task offline.
   * If NONE is available, returns challengeMissing: true (CRITICAL AUDIT REQUIREMENT).
   */
  public async consumeChallenge(
    sessionId: string,
    taskId: string
  ): Promise<ChallengeConsumptionResult> {
    const now = new Date().toISOString();

    // Query candidate challenges
    const candidates = await offlineDb.challengesCache
      .where("taskId")
      .equals(taskId)
      .toArray();

    // Filter in JS for session, consumedAt === null, and unexpired
    const available = candidates.find(
      (c) =>
        c.sessionId === sessionId &&
        c.consumedAt === null &&
        new Date(c.expiresAt).getTime() > Date.now()
    );

    if (!available) {
      return {
        challenge: null,
        challengeMissing: true,
        reason: "No valid, unexpired challenge found in offline store.",
      };
    }

    // Mark consumed in IndexedDB immediately to prevent offline replay
    available.consumedAt = now;
    await offlineDb.challengesCache.put(available);

    return {
      challenge: available,
      challengeMissing: false,
    };
  }

  /**
   * Removes expired challenges from local store
   */
  public async cleanupExpiredChallenges(): Promise<number> {
    const all = await offlineDb.challengesCache.toArray();
    const now = Date.now();
    const toDelete = all.filter((c) => new Date(c.expiresAt).getTime() < now);
    if (toDelete.length > 0) {
      await offlineDb.challengesCache.bulkDelete(toDelete.map((c) => c.id));
    }
    return toDelete.length;
  }

  /**
   * Returns current challenge cache statistics for a session
   */
  public async getStats(sessionId: string): Promise<{
    available: number;
    consumed: number;
    expired: number;
    total: number;
  }> {
    const all = await offlineDb.challengesCache
      .where("sessionId")
      .equals(sessionId)
      .toArray();

    const now = Date.now();
    let available = 0;
    let consumed = 0;
    let expired = 0;

    for (const c of all) {
      if (c.consumedAt !== null) {
        consumed++;
      } else if (new Date(c.expiresAt).getTime() < now) {
        expired++;
      } else {
        available++;
      }
    }

    return {
      available,
      consumed,
      expired,
      total: all.length,
    };
  }
}

export const offlineChallengeManager = new OfflineChallengeManager();
