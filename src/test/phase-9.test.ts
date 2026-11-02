import { describe, it, expect, beforeAll } from "vitest";
import { query } from "@/lib/db";
import { runIdempotentSeed } from "@/lib/db/seed";
import { redTeamRunner } from "@/lib/redteam/runner";
import { KNOWN_SECURITY_LIMITATIONS } from "@/lib/redteam/known-limitations";
import { POST as handleRunPost } from "@/app/api/redteam/run/route";
import { POST as handleStepPost } from "@/app/api/redteam/step/route";
import { GET as handleHistoryGet } from "@/app/api/redteam/history/route";
import { GET as handleExportGet } from "@/app/api/redteam/export/route";
import { NextRequest } from "next/server";

describe("Phase 9: Red-Team Mode, Adversarial Attack Harness & Defense Pipeline Verification", () => {
  const adminId = "44444444-4444-4444-4444-444444444444";
  const auditorId = "33333333-3333-3333-3333-333333333333";
  const assessorId = "22222222-2222-2222-2222-222222222222";
  const workerId = "11111111-1111-1111-1111-111111111111";

  let realCandidateSessionId: string;
  const syntheticSandboxSessionId = redTeamRunner.SANDBOX_SESSION_ID; // 99999999-9999-9999-9999-000000000001

  beforeAll(async () => {
    await runIdempotentSeed();

    // Verify sandbox synthetic session exists in database
    const sessionRes = await query("SELECT id, is_synthetic FROM assessment_sessions WHERE id = $1 LIMIT 1;", [
      syntheticSandboxSessionId,
    ]);
    expect(sessionRes.rows.length).toBe(1);
    expect(sessionRes.rows[0].is_synthetic).toBe(true);

    // Create a real (non-synthetic) candidate and assessment session to test safety boundaries
    const realCandRes = await query(`
      INSERT INTO candidates (profile_id, qualification_id, aadhaar_masked, state, district, is_synthetic)
      VALUES ('11111111-1111-1111-1111-111111111111', (SELECT id FROM qualifications WHERE qp_code = 'CON/Q0602' LIMIT 1), 'XXXX-XXXX-9999', 'Uttar Pradesh', 'Lucknow', false)
      RETURNING id;
    `);
    const realCandId = realCandRes.rows[0].id;

    const realSessRes = await query(`
      INSERT INTO assessment_sessions (candidate_id, assessor_id, status, is_synthetic)
      VALUES ($1, $2, 'in_progress', false)
      RETURNING id;
    `, [realCandId, assessorId]);
    realCandidateSessionId = realSessRes.rows[0].id;

    // Verify real session has is_synthetic = false
    const checkRes = await query("SELECT id, is_synthetic FROM assessment_sessions WHERE id = $1 LIMIT 1;", [
      realCandidateSessionId,
    ]);
    expect(checkRes.rows.length).toBe(1);
    expect(checkRes.rows[0].is_synthetic).toBe(false);
  });

  describe("1. Full Adversarial Suite Execution against Real Pipeline", () => {
    it("executes all 12 attacks and reports exact expected flag types and stages", async () => {
      const runRecord = await redTeamRunner.executeFullSuite(auditorId, "auditor", syntheticSandboxSessionId);

      expect(runRecord).toBeDefined();
      expect(runRecord.id).toBeDefined();
      expect(runRecord.runnerId).toBe(auditorId);
      expect(runRecord.runnerRole).toBe("auditor");
      expect(runRecord.totalAttacks).toBe(12);

      // Exactly 11 caught, 1 unconfigured, 0 failed
      expect(runRecord.caughtCount).toBe(11);
      expect(runRecord.notDetectedCount).toBe(1);
      expect(runRecord.failedCount).toBe(0);
      expect(runRecord.overallDetectionRate).toBe("11/12 (91.7%)");

      const resultsMap = new Map(runRecord.results.map((r) => [r.attackId, r]));

      // a) replay an old valid clip (same candidate)
      const replaySame = resultsMap.get("replay_clip_same_candidate")!;
      expect(replaySame.status).toBe("CAUGHT");
      expect(replaySame.verdict).toBe("PASS");
      expect(replaySame.pipelineStage).toBe("INTEGRITY_STAGE");
      expect(replaySame.flagTypes).toContain("reuse");

      // b) replay another candidate's clip (cross-candidate reuse)
      const replayCross = resultsMap.get("replay_clip_cross_candidate")!;
      expect(replayCross.status).toBe("CAUGHT");
      expect(replayCross.verdict).toBe("PASS");
      expect(replayCross.pipelineStage).toBe("INTEGRITY_STAGE");
      expect(replayCross.flagTypes).toContain("reuse");

      // c) edited or re-encoded clip
      const reencode = resultsMap.get("reencoded_clip")!;
      expect(reencode.status).toBe("CAUGHT");
      expect(reencode.verdict).toBe("PASS");
      expect(reencode.pipelineStage).toBe("INTEGRITY_STAGE");
      expect(reencode.flagTypes).toContain("edit_suspected");

      // d) GPS spoof (out-of-zone coordinates)
      const gps = resultsMap.get("gps_spoof")!;
      expect(gps.status).toBe("CAUGHT");
      expect(gps.verdict).toBe("PASS");
      expect(gps.pipelineStage).toBe("TELEMETRY_STAGE");
      expect(gps.flagTypes).toContain("geo_mismatch");

      // e) clock skew and back-dated capture
      const clock = resultsMap.get("clock_skew")!;
      expect(clock.status).toBe("CAUGHT");
      expect(clock.verdict).toBe("PASS");
      expect(clock.pipelineStage).toBe("TELEMETRY_STAGE");
      expect(clock.flagTypes).toContain("clock_skew");

      // f) expired challenge, reused challenge
      const challenge = resultsMap.get("expired_reused_challenge")!;
      expect(challenge.status).toBe("CAUGHT");
      expect(challenge.verdict).toBe("PASS");
      expect(challenge.pipelineStage).toBe("CHALLENGE_GATE");
      expect(challenge.flagTypes).toContain("challenge_missing");

      // g) hash-chain tamper
      const chain = resultsMap.get("chain_tamper")!;
      expect(chain.status).toBe("CAUGHT");
      expect(chain.verdict).toBe("PASS");
      expect(chain.pipelineStage).toBe("HASH_CHAIN_STAGE");
      expect(chain.flagTypes).toContain("chain_tampered");

      // h) different person doing the task (identity mismatch) -> MUST be NOT DETECTED
      const identity = resultsMap.get("identity_mismatch")!;
      expect(identity.status).toBe("NOT_DETECTED");
      expect(identity.verdict).toBe("NOT_DETECTED");
      expect(identity.actualOutcome).toBe("NOT DETECTED: provider not configured");
      expect(identity.detectionReason).toBe("NOT DETECTED: provider not configured");
      expect(identity.verdict).not.toBe("PASS"); // Strictly prohibited from reporting false PASS

      // i) prompt injection inside transcript
      const injection = resultsMap.get("prompt_injection_transcript")!;
      expect(injection.status).toBe("CAUGHT");
      expect(injection.verdict).toBe("PASS");
      expect(injection.pipelineStage).toBe("NLP_LLM_STAGE");
      expect(injection.flagTypes).toContain("injection_filtered");

      // j) attempt to read an AI suggestion before the blind score
      const eavesdrop = resultsMap.get("read_ai_suggestion_before_blind_score")!;
      expect(eavesdrop.status).toBe("CAUGHT");
      expect(eavesdrop.verdict).toBe("PASS");
      expect(eavesdrop.pipelineStage).toBe("SCORING_STAGE");
      expect(eavesdrop.detectionReason).toContain("BLIND_SCORE_REQUIRED");

      // k) attempt to UPDATE or DELETE a sealed evidence row
      const immutability = resultsMap.get("update_delete_sealed_evidence")!;
      expect(immutability.status).toBe("CAUGHT");
      expect(immutability.verdict).toBe("PASS");
      expect(immutability.pipelineStage).toBe("STORAGE_IMMUTABILITY_STAGE");
      expect(immutability.detectionReason).toContain("trg_sealed_evidence_immutable");

      // l) credential payload tamper and signature from the wrong key
      const credential = resultsMap.get("credential_tamper_wrong_key")!;
      expect(credential.status).toBe("CAUGHT");
      expect(credential.verdict).toBe("PASS");
      expect(credential.pipelineStage).toBe("CREDENTIAL_STAGE");
      expect(credential.detectionReason).toContain("invalid_signature");
    });
  });

  describe("2. Safety of the Runner (Strict Isolation)", () => {
    it("proves the runner CANNOT touch or run against real candidate data", async () => {
      // Attempting to execute attacks against real candidate session must throw
      await expect(
        redTeamRunner.executeFullSuite(auditorId, "auditor", realCandidateSessionId)
      ).rejects.toThrow(/CRITICAL SAFETY VIOLATION/);

      // Single attack execution against real candidate session must also throw
      await expect(
        redTeamRunner.executeSingleAttack("replay_clip_same_candidate", realCandidateSessionId)
      ).rejects.toThrow(/CRITICAL SAFETY VIOLATION/);
    });

    it("verifies synthetic test records remain marked is_synthetic = true", async () => {
      const res = await query(
        "SELECT id, is_synthetic FROM assessment_sessions WHERE id = $1;",
        [syntheticSandboxSessionId]
      );
      expect(res.rows[0].is_synthetic).toBe(true);
    });
  });

  describe("3. Role-Based Access Control Gates", () => {
    it("blocks worker and assessor roles from executing attack suites", async () => {
      // Worker blocked in code
      await expect(
        redTeamRunner.executeFullSuite(workerId, "worker", syntheticSandboxSessionId)
      ).rejects.toThrow(/Forbidden: Role 'worker' is not authorized/);

      // Assessor blocked in code
      await expect(
        redTeamRunner.executeFullSuite(assessorId, "assessor", syntheticSandboxSessionId)
      ).rejects.toThrow(/Forbidden: Role 'assessor' is not authorized/);

      // Worker blocked via API route
      const workerReq = new NextRequest("http://localhost:3000/api/redteam/run", {
        method: "POST",
        headers: {
          "x-user-role": "worker",
          "x-user-id": workerId,
        },
      });
      const workerRes = await handleRunPost(workerReq);
      expect(workerRes.status).toBe(403);
      const workerJson = await workerRes.json();
      expect(workerJson.error).toContain("Forbidden");

      // Assessor blocked via API route
      const assessorReq = new NextRequest("http://localhost:3000/api/redteam/run", {
        method: "POST",
        headers: {
          "x-user-role": "assessor",
          "x-user-id": assessorId,
        },
      });
      const assessorRes = await handleRunPost(assessorReq);
      expect(assessorRes.status).toBe(403);
    });

    it("allows auditor and admin roles to execute attack steps", async () => {
      const stepReq = new NextRequest("http://localhost:3000/api/redteam/step", {
        method: "POST",
        headers: {
          "x-user-role": "auditor",
          "x-user-id": auditorId,
        },
        body: JSON.stringify({ attackId: "gps_spoof" }),
      });
      const stepRes = await handleStepPost(stepReq);
      expect(stepRes.status).toBe(200);
      const stepJson = await stepRes.json();
      expect(stepJson.success).toBe(true);
      expect(stepJson.result.status).toBe("CAUGHT");
    });
  });

  describe("4. PostgreSQL Trigger Immutability on Sealed Evidence", () => {
    it("blocks direct SQL UPDATE on sealed evidence rows at database engine level", async () => {
      const taskId = await redTeamRunner.getDefaultTaskId();
      // Find or insert a sealed evidence item
      const sealedRes = await query(`
        INSERT INTO evidence_items (
          session_id, task_id, blob_ref, device_captured_at,
          chain_index, prev_hash, sha256, latitude, longitude,
          accuracy_meters, device_fingerprint, phash, sealed_at
        ) VALUES (
          '${syntheticSandboxSessionId}', '${taskId}', 'sample-sealed.mp4', NOW(),
          0, '0000000000000000000000000000000000000000000000000000000000000000',
          '1111111111111111111111111111111111111111111111111111111111111111',
          26.8467, 80.9462, 5.0, 'test-fingerprint', 'aaaabbbbccccdddd', NOW()
        ) RETURNING id;
      `);
      const sealedId = sealedRes.rows[0].id;

      // Attempt SQL UPDATE on sealed row
      await expect(
        query("UPDATE evidence_items SET blob_ref = 'tampered.mp4' WHERE id = $1;", [sealedId])
      ).rejects.toThrow(/IMMUTABILITY VIOLATION/);

      // Attempt SQL DELETE on sealed row
      await expect(
        query("DELETE FROM evidence_items WHERE id = $1;", [sealedId])
      ).rejects.toThrow(/IMMUTABILITY VIOLATION/);
    });
  });

  describe("5. Persistence and Audit Trail Verification", () => {
    it("persists run results to security_test_runs with coverage matrix and audit log", async () => {
      const historyReq = new NextRequest("http://localhost:3000/api/redteam/history", {
        headers: {
          "x-user-role": "auditor",
          "x-user-id": auditorId,
        },
      });
      const historyRes = await handleHistoryGet(historyReq);
      expect(historyRes.status).toBe(200);
      const historyJson = await historyRes.json();
      expect(historyJson.success).toBe(true);
      expect(historyJson.runs.length).toBeGreaterThan(0);

      const latestRun = historyJson.runs[0];
      expect(latestRun.overall_detection_rate).toBe("11/12 (91.7%)");
      expect(latestRun.caught_count).toBe(11);
      expect(latestRun.not_detected_count).toBe(1);

      // Verify audit_log entry exists
      const auditRes = await query(
        "SELECT * FROM audit_log WHERE entity_name = 'SECURITY_TEST_RUNS' AND entity_id = $1;",
        [latestRun.id]
      );
      expect(auditRes.rows.length).toBeGreaterThan(0);
      expect(auditRes.rows[0].curr_hash).toBeDefined();
    });
  });

  describe("6. Export Reporting & Known Limitations Disclosure", () => {
    it("exports comprehensive audit report as JSON with known limitations", async () => {
      const exportReq = new NextRequest("http://localhost:3000/api/redteam/export?format=json", {
        headers: {
          "x-user-role": "admin",
          "x-user-id": adminId,
        },
      });
      const exportRes = await handleExportGet(exportReq);
      expect(exportRes.status).toBe(200);
      const exportJson = await exportRes.json();

      expect(exportJson.reportType).toContain("Red-Team Security & Integrity Audit Report");
      expect(exportJson.attackResults).toHaveLength(12);
      expect(exportJson.knownLimitations.length).toBeGreaterThanOrEqual(5);

      // Verify known limitations content
      const helperLimitation = exportJson.knownLimitations.find((l: any) => l.id === "lim_01_offscreen_helper" || l.attackName?.includes("Helper"));
      expect(helperLimitation).toBeDefined();
      expect(helperLimitation.productionRequirement).toContain("in-person");
    });

    it("exports printable HTML report with proper headers and CSS formatting", async () => {
      const exportReq = new NextRequest("http://localhost:3000/api/redteam/export?format=html", {
        headers: {
          "x-user-role": "auditor",
          "x-user-id": auditorId,
        },
      });
      const exportRes = await handleExportGet(exportReq);
      expect(exportRes.status).toBe(200);
      const htmlText = await exportRes.text();

      expect(htmlText).toContain("SatyaRPL Adversarial Security & Verification Audit Report");
      expect(htmlText).toContain("Known Platform Limitations &amp; Mitigations");
      expect(htmlText).toContain("11/12");
    });
  });
});
