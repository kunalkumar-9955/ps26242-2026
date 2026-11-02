import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto"; // In-memory IndexedDB for Dexie testing
import { offlineDb, saveEncryptedDraft, getDecryptedDraft, getStorageQuota } from "@/lib/offline/db";
import { offlineChallengeManager } from "@/lib/offline/challenge-cache";
import { syncEngine } from "@/lib/offline/sync-engine";
import { serverVerificationPipeline } from "@/lib/evidence/server-verifier";
import { integrityService, EvidencePayload } from "@/lib/evidence/integrity";
import { challengeService } from "@/lib/evidence/challenge-service";
import { deviceAttestation } from "@/lib/offline/attestation";
import { query } from "@/lib/db";

describe("Phase 5: Offline / PWA Engine Tests", () => {
  let testSessionId: string;
  let testTaskId: string;

  beforeEach(async () => {
    // Clear Dexie tables
    await offlineDb.drafts.clear();
    await offlineDb.declarations.clear();
    await offlineDb.evidenceBlobs.clear();
    await offlineDb.syncQueue.clear();
    await offlineDb.challengesCache.clear();
    await offlineDb.hashChainState.clear();

    // Query an active session and task from the seeded PostgreSQL database
    const sessionRes = await query("SELECT id FROM assessment_sessions LIMIT 1");
    testSessionId = sessionRes.rows[0]?.id;

    const taskRes = await query("SELECT id FROM tasks LIMIT 1");
    testTaskId = taskRes.rows[0]?.id;
  });

  // 1. Tab close or crash loses no data (IndexedDB persistence across sessions)
  it("persists drafts and evidence across simulated tab close / app restarts", async () => {
    const draftKey = "candidate_declaration_draft_101";
    const draftData = {
      transcript: "मैं 4 साल से घरेलू वायरिंग करता हूँ",
      tools: ["1000V tester", "crimping tool"],
      timestamp: "2026-10-10T12:00:00Z",
    };

    // Save encrypted draft
    await saveEncryptedDraft(draftKey, "declaration", draftData, 1);

    // Verify draft exists in Dexie store
    const retrieved = await getDecryptedDraft(draftKey);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.content.transcript).toBe(draftData.transcript);
    expect(retrieved?.content.tools).toContain("crimping tool");
    expect(retrieved?.version).toBe(1);

    // Simulate Tab Close / Browser Restart: re-query database without memory state
    const rawRecord = await offlineDb.drafts.where("key").equals(draftKey).first();
    expect(rawRecord).toBeDefined();
    expect(rawRecord?.synced).toBe(false);
  });

  // 2. Offline capture with immediate on-device hash chain
  it("performs immediate on-device hash chaining for offline captures", async () => {
    const genesisPrevHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const captureTimestamp = new Date().toISOString();
    const nonce = "offline-nonce-xyz-123";

    // Compute block 0
    const block0Hash = integrityService.computeChainBlockHash(
      genesisPrevHash,
      "clip-blob-sha256-block-0",
      captureTimestamp,
      nonce,
      0
    );
    expect(block0Hash).toHaveLength(64);

    // Compute block 1 chained to block 0
    const block1Hash = integrityService.computeChainBlockHash(
      block0Hash,
      "clip-blob-sha256-block-1",
      captureTimestamp,
      nonce,
      1
    );
    expect(block1Hash).toHaveLength(64);
    expect(block1Hash).not.toEqual(block0Hash);
  });

  // 3. Challenge handling offline: pre-fetch batch, consume offline, expire unused
  it("pre-fetches batch challenges, consumes them single-use, and expires unused ones", async () => {
    const issuedAt = new Date().toISOString();
    const futureExpiry = new Date(Date.now() + 3600000).toISOString();
    const expiredTime = new Date(Date.now() - 60000).toISOString();

    // Seed offline challenge cache in Dexie
    await offlineDb.challengesCache.bulkPut([
      {
        id: "chal_offline_1",
        nonce: "NONCE-VALID-001",
        sessionId: testSessionId,
        taskId: testTaskId,
        type: "code_on_camera",
        issuedAt,
        expiresAt: futureExpiry,
        consumedAt: null,
        payload: { code: "7721" },
      },
      {
        id: "chal_offline_2",
        nonce: "NONCE-EXPIRED-002",
        sessionId: testSessionId,
        taskId: testTaskId,
        type: "code_on_camera",
        issuedAt: new Date(Date.now() - 120000).toISOString(),
        expiresAt: expiredTime,
        consumedAt: null,
        payload: { code: "9912" },
      },
    ]);

    // Check stats
    const statsBefore = await offlineChallengeManager.getStats(testSessionId);
    expect(statsBefore.available).toBe(1);
    expect(statsBefore.expired).toBe(1);

    // Consume the available challenge
    const res = await offlineChallengeManager.consumeChallenge(testSessionId, testTaskId);
    expect(res.challengeMissing).toBe(false);
    expect(res.challenge?.nonce).toBe("NONCE-VALID-001");

    // Attempt second consumption — should find NO available unconsumed challenge
    const res2 = await offlineChallengeManager.consumeChallenge(testSessionId, testTaskId);
    expect(res2.challengeMissing).toBe(true);
    expect(res2.challenge).toBeNull();

    // Clean up expired
    const deletedCount = await offlineChallengeManager.cleanupExpiredChallenges();
    expect(deletedCount).toBe(1);
  });

  // 4. Offline capture without valid challenge syncs as challenge_missing (NEVER silently accepted)
  it("flags offline capture without valid challenge as challenge_missing on sync", async () => {
    const payload: EvidencePayload = {
      sessionId: testSessionId,
      taskId: testTaskId,
      challengeNonce: "nonexistent-or-missing-challenge",
      blobRef: "test-offline-clip-unchallenged.mp4",
      deviceCapturedAt: new Date().toISOString(),
      chainIndex: 0,
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      latitude: 26.8467,
      longitude: 80.9462,
      accuracyMeters: 5.0,
      deviceFingerprint: "test-device-pwa",
      clientSyncMode: "offline",
      challengeMissing: true,
    };

    const result = await serverVerificationPipeline.verifyAndSealEvidence(payload, "worker");
    expect(result.sealed).toBe(true);

    const missingFlag = result.flags.find((f) => f.type === "challenge_missing");
    expect(missingFlag).toBeDefined();
    expect(missingFlag?.severity).toBe("critical");
    expect(missingFlag?.reason).toContain("challenge");
  });

  // 5. Large clock skew is flagged on server re-verification
  it("flags device timestamps set in the future or with large clock skew", async () => {
    // Issue a real challenge to isolate the clock skew check
    const challenge = await challengeService.issueChallenge(
      testSessionId,
      testTaskId,
      "code_on_camera",
      900
    );

    // Craft payload with device time set 15 minutes into the future
    const futureDeviceTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const payload: EvidencePayload = {
      sessionId: testSessionId,
      taskId: testTaskId,
      challengeNonce: challenge.nonce,
      blobRef: "test-clip-clock-skew.mp4",
      deviceCapturedAt: futureDeviceTime,
      chainIndex: 0,
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      latitude: 26.8467,
      longitude: 80.9462,
      accuracyMeters: 5.0,
      deviceFingerprint: "test-device-pwa",
      clientSyncMode: "offline",
    };

    const result = await serverVerificationPipeline.verifyAndSealEvidence(payload, "worker");
    const skewFlag = result.flags.find((f) => f.type === "clock_skew");
    expect(skewFlag).toBeDefined();
    expect(skewFlag?.severity).toBe("critical");
    expect(skewFlag?.reason).toContain("future relative to server time");
  });

  // 6. Duplicate upload retries are strictly idempotent
  it("guarantees idempotent retries when using idempotencyKey", async () => {
    const challenge = await challengeService.issueChallenge(
      testSessionId,
      testTaskId,
      "task_variant",
      900
    );

    const idempotencyKey = `test-idempotency-${Date.now()}-${Math.random()}`;
    const payload: EvidencePayload = {
      sessionId: testSessionId,
      taskId: testTaskId,
      challengeNonce: challenge.nonce,
      blobRef: "test-clip-idempotent.mp4",
      deviceCapturedAt: new Date().toISOString(),
      chainIndex: 0,
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      latitude: 26.8467,
      longitude: 80.9462,
      accuracyMeters: 5.0,
      deviceFingerprint: "test-device-pwa",
      idempotencyKey,
    };

    // First submission
    const firstResult = await serverVerificationPipeline.verifyAndSealEvidence(payload, "worker");
    expect(firstResult.evidenceId).toBeDefined();

    // Duplicate retry with exact same idempotencyKey
    const secondResult = await serverVerificationPipeline.verifyAndSealEvidence(payload, "worker");
    expect(secondResult.evidenceId).toEqual(firstResult.evidenceId);
    expect(secondResult.sealed).toBe(true);

    // Verify DB count: only ONE record exists with this idempotency key
    const dbCountRes = await query(
      "SELECT COUNT(*) as count FROM evidence_items WHERE idempotency_key = $1",
      [idempotencyKey]
    );
    expect(parseInt(dbCountRes.rows[0].count, 10)).toBe(1);
  });

  // 7. Interrupted chunked upload resumes from last saved chunk
  it("tracks resumable upload progress in IndexedDB sync queue", async () => {
    const queueId = "test_resumable_upload_01";
    await offlineDb.syncQueue.put({
      id: queueId,
      idempotencyKey: `idemp_${queueId}`,
      type: "evidence",
      payload: { sessionId: testSessionId, taskId: testTaskId },
      status: "queued",
      attempts: 0,
      lastError: null,
      priority: 1,
      chunkIndex: 2, // Resumes from chunk 2 of 5!
      totalChunks: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const item = await offlineDb.syncQueue.get(queueId);
    expect(item).toBeDefined();
    expect(item?.chunkIndex).toBe(2);
    expect(item?.totalChunks).toBe(5);

    // Simulate chunk 3 upload success
    if (item) {
      item.chunkIndex = 3;
      await offlineDb.syncQueue.put(item);
    }

    const updated = await offlineDb.syncQueue.get(queueId);
    expect(updated?.chunkIndex).toBe(3);
  });

  // 8. Storage quota calculation and full-storage warning
  it("calculates storage quota and handles storage pressure", async () => {
    const quota = await getStorageQuota();
    expect(quota).toBeDefined();
    expect(typeof quota.percentage).toBe("number");
    expect(typeof quota.isStorageFull).toBe("boolean");
  });

  // 9. Attestation interface returns NOT_CONFIGURED state honestly
  it("reports NOT_CONFIGURED state honestly through pluggable attestation provider", async () => {
    const result = await deviceAttestation.getAttestation("test-probe-nonce");
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(result.hardwareBacked).toBe(false);
    expect(result.token).toBeNull();
    expect(result.descriptionEn).toContain("NOT_CONFIGURED");
    expect(result.descriptionHi).toContain("NOT_CONFIGURED");
  });
});
