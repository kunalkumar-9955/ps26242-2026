import { serverVerificationPipeline, VerificationResult } from "./server-verifier";
import { challengeService } from "./challenge-service";
import { integrityService, EvidencePayload } from "./integrity";

export interface AttackTestReport {
  attackType:
    | "replay_clip"
    | "reencoded_clip"
    | "gps_spoof"
    | "reused_challenge"
    | "expired_challenge"
    | "chain_tamper"
    | "face_mismatch";
  targetNonce: string;
  detected: boolean;
  flagTypesFound: string[];
  rejectionReason: string;
  result: VerificationResult;
}

export class AttackSimulationHelpers {
  /**
   * Attack 1: Replay an old valid clip previously used by another candidate
   */
  public async simulateReplayAttack(
    sessionId: string,
    taskId: string,
    originalPhash: string
  ): Promise<AttackTestReport> {
    const challenge = await challengeService.issueChallenge(sessionId, taskId, "code_on_camera", 900);

    const payload: EvidencePayload = {
      sessionId,
      taskId,
      challengeNonce: challenge.nonce,
      blobRef: "replayed-stock-clip.mp4",
      deviceCapturedAt: new Date().toISOString(),
      chainIndex: 0,
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      latitude: 26.8467,
      longitude: 80.9462,
      accuracyMeters: 5.0,
      deviceFingerprint: "adversary-bot-fingerprint",
      phash: originalPhash, // Injected exact perceptual hash of earlier clip
    };

    const result = await serverVerificationPipeline.verifyAndSealEvidence(payload);
    const flagTypes = result.flags.map((f) => f.type);
    const detected = flagTypes.includes("reuse");

    return {
      attackType: "replay_clip",
      targetNonce: challenge.nonce,
      detected,
      flagTypesFound: flagTypes,
      rejectionReason: result.flags.find((f) => f.type === "reuse")?.reason || "Not detected",
      result,
    };
  }

  /**
   * Attack 2: Submit a re-encoded / edited clip with metadata inconsistencies
   */
  public async simulateReEncodedClipAttack(sessionId: string, taskId: string): Promise<AttackTestReport> {
    const challenge = await challengeService.issueChallenge(sessionId, taskId, "task_variant", 900);

    const payload: EvidencePayload = {
      sessionId,
      taskId,
      challengeNonce: challenge.nonce,
      blobRef: "edited-synthetic-splice.mp4",
      deviceCapturedAt: new Date().toISOString(),
      chainIndex: 0,
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      latitude: 26.8467,
      longitude: 80.9462,
      accuracyMeters: 5.0,
      deviceFingerprint: "browser-ffmpeg-splice",
      phash: "b9c8d7e6f5a43210b9c8d7e6f5a43210",
      clientMetadata: {
        isReEncoded: true,
        abruptCutDetected: true,
      },
    };

    const result = await serverVerificationPipeline.verifyAndSealEvidence(payload);
    const flagTypes = result.flags.map((f) => f.type);
    const detected = flagTypes.includes("edit_suspected");

    return {
      attackType: "reencoded_clip",
      targetNonce: challenge.nonce,
      detected,
      flagTypesFound: flagTypes,
      rejectionReason: result.flags.find((f) => f.type === "edit_suspected")?.reason || "Not detected",
      result,
    };
  }

  /**
   * Attack 3: Spoof GPS coordinates showing impossible travel
   */
  public async simulateGpsSpoofAttack(
    sessionId: string,
    taskId: string,
    impossibleLat: number,
    impossibleLng: number
  ): Promise<AttackTestReport> {
    const challenge = await challengeService.issueChallenge(sessionId, taskId, "code_on_camera", 900);

    const payload: EvidencePayload = {
      sessionId,
      taskId,
      challengeNonce: challenge.nonce,
      blobRef: "spoofed-gps-clip.mp4",
      deviceCapturedAt: new Date().toISOString(),
      chainIndex: 0,
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      latitude: impossibleLat, // E.g., London coords while another session is in Lucknow
      longitude: impossibleLng,
      accuracyMeters: 2.0,
      deviceFingerprint: "fake-gps-app-mock",
      phash: "c1c2c3c4c5c6c7c8c1c2c3c4c5c6c7c8",
    };

    const result = await serverVerificationPipeline.verifyAndSealEvidence(payload);
    const flagTypes = result.flags.map((f) => f.type);
    const detected = flagTypes.includes("geo_mismatch");

    return {
      attackType: "gps_spoof",
      targetNonce: challenge.nonce,
      detected,
      flagTypesFound: flagTypes,
      rejectionReason: result.flags.find((f) => f.type === "geo_mismatch")?.reason || "Not detected",
      result,
    };
  }

  /**
   * Attack 4: Submit evidence with an already consumed challenge (Replay/Reuse Nonce)
   */
  public async simulateReusedChallengeAttack(
    sessionId: string,
    taskId: string,
    alreadyConsumedNonce: string
  ): Promise<AttackTestReport> {
    const payload: EvidencePayload = {
      sessionId,
      taskId,
      challengeNonce: alreadyConsumedNonce,
      blobRef: "second-use-attempt.mp4",
      deviceCapturedAt: new Date().toISOString(),
      chainIndex: 0,
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      latitude: 26.8467,
      longitude: 80.9462,
      accuracyMeters: 5.0,
      deviceFingerprint: "browser-client-v1",
      phash: "d1d2d3d4d5d6d7d8d1d2d3d4d5d6d7d8",
    };

    const result = await serverVerificationPipeline.verifyAndSealEvidence(payload);
    const flagTypes = result.flags.map((f) => f.type);
    const detected = flagTypes.includes("challenge_missing");

    return {
      attackType: "reused_challenge",
      targetNonce: alreadyConsumedNonce,
      detected,
      flagTypesFound: flagTypes,
      rejectionReason: result.flags.find((f) => f.type === "challenge_missing")?.reason || "Not detected",
      result,
    };
  }

  /**
   * Attack 5: Tamper with hash chain continuity (swap prev_hash)
   */
  public async simulateChainTamperAttack(sessionId: string, taskId: string): Promise<AttackTestReport> {
    const challenge = await challengeService.issueChallenge(sessionId, taskId, "sequence_prompt", 900);

    const payload: EvidencePayload = {
      sessionId,
      taskId,
      challengeNonce: challenge.nonce,
      blobRef: "swapped-block-clip.mp4",
      deviceCapturedAt: new Date().toISOString(),
      chainIndex: 1, // Block 1
      prevHash: "BAD_DEADBEEF_TAMPERED_PREV_HASH_12345678901234567890123456789012", // Broken parent
      latitude: 26.8467,
      longitude: 80.9462,
      accuracyMeters: 5.0,
      deviceFingerprint: "adversary-chain-tamper",
      phash: "e1e2e3e4e5e6e7e8e1e2e3e4e5e6e7e8",
    };

    const result = await serverVerificationPipeline.verifyAndSealEvidence(payload);
    const flagTypes = result.flags.map((f) => f.type);
    const detected = flagTypes.includes("chain_tampered");

    return {
      attackType: "chain_tamper",
      targetNonce: challenge.nonce,
      detected,
      flagTypesFound: flagTypes,
      rejectionReason: result.flags.find((f) => f.type === "chain_tampered")?.reason || "Not detected",
      result,
    };
  }

  /**
   * Attack 6: Face mismatch / duplicate person proxy
   */
  public async simulateFaceMismatchAttack(sessionId: string, taskId: string): Promise<AttackTestReport> {
    const challenge = await challengeService.issueChallenge(sessionId, taskId, "code_on_camera", 900);

    const payload: EvidencePayload = {
      sessionId,
      taskId,
      challengeNonce: challenge.nonce,
      blobRef: "proxy-person-video.mp4",
      deviceCapturedAt: new Date().toISOString(),
      chainIndex: 0,
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      latitude: 26.8467,
      longitude: 80.9462,
      accuracyMeters: 5.0,
      deviceFingerprint: "proxy-helper-device",
      phash: "f1f2f3f4f5f6f7f8f1f2f3f4f5f6f7f8",
      clientMetadata: {
        faceMismatch: true,
        faceMatchScore: 0.18,
      },
    };

    const result = await serverVerificationPipeline.verifyAndSealEvidence(payload);
    const flagTypes = result.flags.map((f) => f.type);
    const detected = flagTypes.includes("duplicate_person");

    return {
      attackType: "face_mismatch",
      targetNonce: challenge.nonce,
      detected,
      flagTypesFound: flagTypes,
      rejectionReason: result.flags.find((f) => f.type === "duplicate_person")?.reason || "Not detected",
      result,
    };
  }
}

export const attackSimulationHelpers = new AttackSimulationHelpers();
