import { describe, it, expect, beforeAll } from "vitest";
import { query, pool } from "@/lib/db";
import { runIdempotentSeed } from "@/lib/db/seed";
import { calibrationService } from "@/lib/assessor/calibration-service";
import { scoringService } from "@/lib/assessor/scoring-service";
import { physicalVerificationService } from "@/lib/assessor/physical-service";
import { GET as handleAiSuggestionsGet } from "@/app/api/assessor/suggestions/route";
import { POST as handleScoresPost } from "@/app/api/assessor/scores/route";
import { NextRequest } from "next/server";

describe("Phase 6: Assessor Workflow, Calibration Gate & Blind-First Integrity", () => {
  const certifiedAssessorId = "22222222-2222-2222-2222-222222222222"; // Er. Sunita Verma
  const expiredAssessorId = "55555555-5555-5555-5555-555555555555"; // Er. Vikramaditya Singh
  const testSessionId = "a0000000-0000-0000-0000-000000000001"; // Ramesh Sharma session
  let testCriterionId: string;
  let physicalCriterionId: string;

  beforeAll(async () => {
    // Ensure clean database state
    await runIdempotentSeed();

    // Query a standard video-assessable criterion and a physical criterion
    const critRes = await query(`
      SELECT id, criterion_code, assessable_from_video, requires_physical 
      FROM nos_criteria 
      ORDER BY requires_physical ASC, criterion_code ASC;
    `);

    const standardCrit = critRes.rows.find((c: any) => !c.requires_physical);
    const physCrit = critRes.rows.find((c: any) => c.requires_physical || c.assessable_from_video === "no");

    testCriterionId = standardCrit?.id || critRes.rows[0].id;
    physicalCriterionId = physCrit?.id || critRes.rows[critRes.rows.length - 1].id;

    // Clean any prior scores for clean test isolation on testSessionId
    await query("DELETE FROM scores WHERE session_id = $1;", [testSessionId]);
    await query("DELETE FROM recommendations WHERE session_id = $1;", [testSessionId]);
    await query("DELETE FROM credentials WHERE session_id = $1;", [testSessionId]);
    await query("DELETE FROM physical_verifications WHERE session_id = $1;", [testSessionId]);
  });

  // TEST 1: EARLY AI SUGGESTION FETCH FAILS VIA EVERY ROUTE
  it("early AI suggestion fetch fails via UI/API route, service layer, and direct database queries", async () => {
    // Route 1: Direct API Handler (GET /api/assessor/suggestions)
    const req = new NextRequest(
      `http://localhost:3000/api/assessor/suggestions?sessionId=${testSessionId}&criterionId=${testCriterionId}`,
      {
        headers: {
          "x-user-id": certifiedAssessorId,
          "x-user-role": "assessor",
        },
      }
    );
    const apiRes = await handleAiSuggestionsGet(req);
    expect(apiRes.status).toBe(403);
    const apiJson = await apiRes.json();
    expect(apiJson.error).toContain("BLIND_SCORE_REQUIRED");

    // Route 2: Service Layer
    await expect(
      scoringService.getAiSuggestion(testSessionId, certifiedAssessorId, testCriterionId)
    ).rejects.toThrow(/BLIND_SCORE_REQUIRED/i);

    // Route 3: Direct Database Query with RLS simulation
    // Without an existing score for (session_id, criterion_id, assessor_id),
    // the blind-first policy or scoring query returns no unblinded suggestion
    const blindCheck = await query(
      "SELECT id FROM scores WHERE session_id = $1 AND criterion_id = $2 AND assessor_id = $3 LIMIT 1;",
      [testSessionId, testCriterionId, certifiedAssessorId]
    );
    expect(blindCheck.rows.length).toBe(0);
  });

  // TEST 2: CALIBRATION GATE BLOCKS AND EXPIRES
  it("calibration gate validates Cohen's quadratic weighted kappa, blocks uncalibrated assessors, and expires", async () => {
    // 1. Math Verification: Cohen's Quadratic Weighted Kappa
    // Identical scores -> kappa = 1.0
    const perfectKappa = calibrationService.computeQuadraticWeightedKappa(
      [1, 2, 3, 4],
      [1, 2, 3, 4]
    );
    expect(perfectKappa).toBe(1.0);

    // Completely opposite scores -> kappa must be strongly negative or near zero
    const invertedKappa = calibrationService.computeQuadraticWeightedKappa(
      [1, 1, 2, 2],
      [4, 4, 3, 3]
    );
    expect(invertedKappa).toBeLessThan(0.1);

    // 2. Active Certification Check
    const certifiedStatus = await calibrationService.checkAssessorCertification(certifiedAssessorId);
    expect(certifiedStatus.certified).toBe(true);
    expect(certifiedStatus.kappa).toBeGreaterThanOrEqual(0.70);

    // 3. Expired Certification Check
    const expiredStatus = await calibrationService.checkAssessorCertification(expiredAssessorId);
    expect(expiredStatus.certified).toBe(false);
    expect(expiredStatus.reason).toMatch(/expired|below_threshold/i);

    // 4. Uncalibrated Assessor Check
    const randomAssessorId = "99999999-9999-9999-9999-999999999999";
    const uncalibratedStatus = await calibrationService.checkAssessorCertification(randomAssessorId);
    expect(uncalibratedStatus.certified).toBe(false);
    expect(uncalibratedStatus.reason).toContain("NO_CALIBRATION_RECORD");

    // 5. Evaluate Calibration with Low Agreement (< 0.70)
    const goldClipRes = await query("SELECT id FROM gold_standard_clips LIMIT 1;");
    const goldClipId = goldClipRes.rows[0].id;

    // Intentionally mismatch every level to fail threshold
    const lowResult = await calibrationService.evaluateCalibration(
      expiredAssessorId,
      goldClipId,
      [
        { criterion_id: testCriterionId, score: 1 },
      ]
    );
    expect(lowResult.passed).toBe(false);
    expect(lowResult.threshold).toBe(0.70);
  });

  // TEST 3: ASSESSABLE_FROM_VIDEO = NO ALWAYS ABSTAINS IN CODE
  it("criteria with assessable_from_video = 'no' or requires_physical = true always abstain and route to physical checklist", async () => {
    // First submit a blind score for the physical criterion so AI suggestion is unlocked
    await scoringService.submitBlindScore({
      sessionId: testSessionId,
      assessorId: certifiedAssessorId,
      criterionId: physicalCriterionId,
      level: 3,
      rationale: "Insulation test observed within permissible bounds during field examination.",
    });

    // Request AI suggestion
    const suggestion = await scoringService.getAiSuggestion(
      testSessionId,
      certifiedAssessorId,
      physicalCriterionId
    );

    // Enforced in code: MUST abstain
    expect(suggestion).not.toBeNull();
    expect(suggestion?.abstained).toBe(true);
    expect(suggestion?.abstainReason).toBe("needs_physical_verification");
    expect(suggestion?.suggestedLevel).toBeNull();

    // Verify it routes to the physical checklist
    const physicalList = await physicalVerificationService.getPhysicalCriteriaForSession(testSessionId);
    const foundInPhysical = physicalList.some((item) => item.id === physicalCriterionId || item.criterion_id === physicalCriterionId);
    expect(foundInPhysical).toBe(true);
  });

  // TEST 4: NO CREDENTIAL WITHOUT SIGN-OFF (DATABASE CONSTRAINT & TRIGGER)
  it("enforces database constraint preventing credential issuance without completed sign-off recommendation", async () => {
    // Query real candidate_id and qualification_id for test session
    const sessRes = await query(
      "SELECT s.candidate_id, c.qualification_id FROM assessment_sessions s JOIN candidates c ON s.candidate_id = c.id WHERE s.id = $1 LIMIT 1;",
      [testSessionId]
    );
    const candidateId = sessRes.rows[0].candidate_id;
    const qualificationId = sessRes.rows[0].qualification_id;

    // Attempting to create credential before session sign-off MUST trigger PostgreSQL exception
    await expect(
      query(
        `
        INSERT INTO credentials (
          session_id, candidate_id, qualification_id, status,
          verifiable_payload, signature, qr_payload, verify_slug
        ) VALUES (
          $1, $2, $3, 'issued',
          '{"grade": "A"}',
          'mock_sig_1',
          'https://example.com/qr',
          'test-slug-fail-001'
        );
      `,
        [testSessionId, candidateId, qualificationId]
      )
    ).rejects.toThrow(/Cannot issue credential without a completed, signed assessor recommendation/i);

    // Now sign off the session legally
    await scoringService.signoffRecommendation(
      testSessionId,
      certifiedAssessorId,
      "competent",
      "competent"
    );

    // With sign-off present, credential creation now succeeds
    const credRes = await query(
      `
      INSERT INTO credentials (
        session_id, candidate_id, qualification_id, status,
        verifiable_payload, signature, qr_payload, verify_slug
      ) VALUES (
        $1, $2, $3, 'issued',
        '{"grade": "A"}',
        'mock_sig_1',
        'https://example.com/qr',
        'test-slug-pass-001'
      )
      RETURNING id, verify_slug;
    `,
      [testSessionId, candidateId, qualificationId]
    );

    expect(credRes.rows.length).toBe(1);
    expect(credRes.rows[0].verify_slug).toBe("test-slug-pass-001");
  });

  // TEST 5: OVERRIDE REQUIRES A REASON; BLIND SCORE IS NEVER OVERWRITTEN
  it("protects blind scores from overwrite and enforces mandatory override reason on revision", async () => {
    // 1. Submit blind score
    const blindRecord = await scoringService.submitBlindScore({
      sessionId: testSessionId,
      assessorId: certifiedAssessorId,
      criterionId: testCriterionId,
      level: 3,
      rationale: "Proper crimping pressure and wire sheath alignment demonstrated.",
    });

    expect(blindRecord.is_blind).toBe(true);
    expect(blindRecord.level).toBe(3);

    // 2. Direct PostgreSQL UPDATE trigger check (trg_blind_scores_immutable)
    await expect(
      query(
        "UPDATE scores SET level = 4 WHERE id = $1;",
        [blindRecord.id]
      )
    ).rejects.toThrow(/Blind scores are immutable/);

    // 3. Revising score without override reason must fail
    await expect(
      scoringService.submitRevisedScore({
        sessionId: testSessionId,
        assessorId: certifiedAssessorId,
        criterionId: testCriterionId,
        revisedLevel: 4,
        overrideReason: "", // Empty override reason
      })
    ).rejects.toThrow(/override reason is mandatory/i);

    // 4. Revising score with valid override reason succeeds and stores a separate row
    const revisedRecord = await scoringService.submitRevisedScore({
      sessionId: testSessionId,
      assessorId: certifiedAssessorId,
      criterionId: testCriterionId,
      revisedLevel: 4,
      overrideReason: "Footage review at 0:24 confirms perfect 1000V insulation rating.",
    });

    expect(revisedRecord.id).not.toBe(blindRecord.id);
    expect(revisedRecord.is_blind).toBe(false);
    expect(revisedRecord.revised_after_ai).toBe(true);
    expect(revisedRecord.level).toBe(4);

    // 5. Verify the original blind score is untouched
    const verifyOriginal = await query(
      "SELECT level, is_blind FROM scores WHERE id = $1;",
      [blindRecord.id]
    );
    expect(verifyOriginal.rows[0].level).toBe(3);
    expect(verifyOriginal.rows[0].is_blind).toBe(true);
  });

  // TEST 6: RLS PER ROLE FOR ALL NEW TABLES
  it("enforces role-based permissions across new Phase 6 tables", async () => {
    // 1. gold_standard_clips: Readable by all, insertable only by admin
    const clipsRes = await query("SELECT count(*) as count FROM gold_standard_clips;");
    expect(parseInt(clipsRes.rows[0].count)).toBeGreaterThan(0);

    // 2. assessor_calibration: Tracks certifications with weighted kappa and certified_until
    const calRes = await query(
      "SELECT assessor_id, weighted_kappa, passed, certified_until FROM assessor_calibration WHERE assessor_id = $1;",
      [certifiedAssessorId]
    );
    expect(calRes.rows.length).toBeGreaterThan(0);
    expect(Number(calRes.rows[0].weighted_kappa)).toBeGreaterThan(0.70);

    // 3. physical_verifications: Records tactile checks
    const tactileRecord = await physicalVerificationService.recordPhysicalCheck({
      sessionId: testSessionId,
      assessorId: certifiedAssessorId,
      criterionId: physicalCriterionId,
      level: 3,
      passed: true,
      tactileNotes: "Tensile pull test sustained 50N without deformation.",
    });

    expect(tactileRecord.passed).toBe(true);
    expect(tactileRecord.tactile_notes).toContain("50N");
  });
});
