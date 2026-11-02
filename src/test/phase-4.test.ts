import { describe, it, expect, beforeAll } from "vitest";
import { runIdempotentSeed } from "@/lib/db/seed";
import { query } from "@/lib/db";
import { challengeService } from "@/lib/evidence/challenge-service";
import { serverVerificationPipeline } from "@/lib/evidence/server-verifier";
import { attackSimulationHelpers } from "@/lib/evidence/attack-helpers";
import { EvidencePayload } from "@/lib/evidence/integrity";

describe("Phase 4: Evidence Engine, Challenge-Response & Immutable Seals", () => {
  let sessionId: string;
  let taskId: string;

  beforeAll(async () => {
    await runIdempotentSeed();

    // Get or create test session & task
    const taskRes = await query("SELECT id FROM tasks LIMIT 1;");
    taskId = taskRes.rows[0].id;

    const candRes = await query("SELECT id FROM candidates LIMIT 1;");
    const candId = candRes.rows[0].id;

    const sessRes = await query(
      "INSERT INTO assessment_sessions (candidate_id, status, is_synthetic) VALUES ($1, 'in_progress', true) RETURNING id;",
      [candId]
    );
    sessionId = sessRes.rows[0].id;
  });

  // 1. CHALLENGE INTEGRITY: SINGLE-USE, BOUND, EXPIRING
  it("enforces single-use challenge consumption and rejects replay attacks", async () => {
    const challenge = await challengeService.issueChallenge(sessionId, taskId, "code_on_camera", 900);
    expect(challenge.nonce).toContain("RPL-");
    expect(challenge.signature.length).toBe(64); // HMAC-SHA256

    // First consumption: MUST succeed
    const firstUse = await challengeService.validateAndConsumeChallenge(challenge.nonce, sessionId, taskId);
    expect(firstUse.valid).toBe(true);

    // Second consumption: MUST be rejected as replay attack
    const secondUse = await challengeService.validateAndConsumeChallenge(challenge.nonce, sessionId, taskId);
    expect(secondUse.valid).toBe(false);
    expect(secondUse.reason).toContain("Replay Attack Detected");
  });

  it("rejects challenge presented with mismatched session or task binding", async () => {
    const challenge = await challengeService.issueChallenge(sessionId, taskId, "task_variant", 900);

    const wrongSession = "99999999-9999-9999-9999-999999999999";
    const result = await challengeService.validateAndConsumeChallenge(challenge.nonce, wrongSession, taskId);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Session mismatch");
  });

  // 2. CRYPTOGRAPHIC HASH CHAIN VERIFICATION
  it("verifies hash chain continuity and flags tampered parent blocks", async () => {
    const attack = await attackSimulationHelpers.simulateChainTamperAttack(sessionId, taskId);
    expect(attack.detected).toBe(true);
    expect(attack.flagTypesFound).toContain("chain_tampered");
    expect(attack.result.chainVerified).toBe(false);
  });

  // 3. REPLAY DETECTION VIA PERCEPTUAL HASH (pHash)
  it("detects and flags recycled / replayed video clips using perceptual hash", async () => {
    // 1. Submit original valid clip in session 1
    const originalChallenge = await challengeService.issueChallenge(sessionId, taskId, "code_on_camera", 900);
    const originalPhash = "1234567890abcdef1234567890abcdef";

    await serverVerificationPipeline.verifyAndSealEvidence({
      sessionId,
      taskId,
      challengeNonce: originalChallenge.nonce,
      blobRef: "original-candidate-video.mp4",
      deviceCapturedAt: new Date().toISOString(),
      chainIndex: 0,
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      latitude: 26.8467,
      longitude: 80.9462,
      accuracyMeters: 5.0,
      deviceFingerprint: "original-device-fp",
      phash: originalPhash,
    });

    // 2. Create another candidate session
    const candRes = await query("SELECT id FROM candidates LIMIT 1;");
    const session2Res = await query(
      "INSERT INTO assessment_sessions (candidate_id, status, is_synthetic) VALUES ($1, 'in_progress', true) RETURNING id;",
      [candRes.rows[0].id]
    );
    const session2Id = session2Res.rows[0].id;

    // 3. Attack: Replay the same clip in session 2
    const attack = await attackSimulationHelpers.simulateReplayAttack(session2Id, taskId, originalPhash);
    expect(attack.detected).toBe(true);
    expect(attack.flagTypesFound).toContain("reuse");
    expect(attack.rejectionReason).toContain("Media Reuse Detected");
  });

  // 4. CLOCK SKEW AND GEOLOCATION FLAGS
  it("flags clock-skew exceeding 120 seconds and impossible travel", async () => {
    // Clock skew test: 2 hours in the past
    const challenge = await challengeService.issueChallenge(sessionId, taskId, "code_on_camera", 900);
    const skewedDeviceTime = new Date(Date.now() - 7200 * 1000).toISOString();

    const payload: EvidencePayload = {
      sessionId,
      taskId,
      challengeNonce: challenge.nonce,
      blobRef: "skewed-clip.mp4",
      deviceCapturedAt: skewedDeviceTime,
      chainIndex: 0,
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      latitude: 26.8467,
      longitude: 80.9462,
      accuracyMeters: 5.0,
      deviceFingerprint: "device-with-skewed-clock",
      phash: "77777777777777777777777777777777",
    };

    const result = await serverVerificationPipeline.verifyAndSealEvidence(payload);
    const flagTypes = result.flags.map((f) => f.type);
    expect(flagTypes).toContain("clock_skew");

    // Impossible travel attack: coordinates in London (> 6000 km away)
    const attackGeo = await attackSimulationHelpers.simulateGpsSpoofAttack(sessionId, taskId, 51.5074, -0.1278);
    expect(attackGeo.detected).toBe(true);
    expect(attackGeo.flagTypesFound).toContain("geo_mismatch");
  });

  // 5. HARD GUARANTEE: DATABASE TRIGGER PREVENTS EDIT/DELETE ON SEALED EVIDENCE
  it("strictly enforces immutability via database trigger: UPDATE and DELETE on sealed evidence fail", async () => {
    // 1. Issue and seal evidence
    const challenge = await challengeService.issueChallenge(sessionId, taskId, "code_on_camera", 900);
    const result = await serverVerificationPipeline.verifyAndSealEvidence({
      sessionId,
      taskId,
      challengeNonce: challenge.nonce,
      blobRef: "sealed-immutable-clip.mp4",
      deviceCapturedAt: new Date().toISOString(),
      chainIndex: 0,
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      latitude: 26.8467,
      longitude: 80.9462,
      accuracyMeters: 5.0,
      deviceFingerprint: "immutable-test-device",
      phash: "99999999999999999999999999999999",
    });

    expect(result.sealed).toBe(true);
    const evidenceId = result.evidenceId;

    // 2. Attempt UPDATE on sealed row -> MUST FAIL via trigger
    let updateFailed = false;
    try {
      await query("UPDATE evidence_items SET blob_ref = 'tampered-url.mp4' WHERE id = $1;", [evidenceId]);
    } catch (err: any) {
      updateFailed = true;
      expect(err.message).toContain("Sealed evidence is immutable");
    }
    expect(updateFailed).toBe(true);

    // 3. Attempt DELETE on sealed row -> MUST FAIL via trigger
    let deleteFailed = false;
    try {
      await query("DELETE FROM evidence_items WHERE id = $1;", [evidenceId]);
    } catch (err: any) {
      deleteFailed = true;
      expect(err.message).toContain("Sealed evidence is immutable");
    }
    expect(deleteFailed).toBe(true);
  });
});
