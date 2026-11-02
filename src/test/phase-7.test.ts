import { describe, it, expect, beforeAll } from "vitest";
import { query } from "@/lib/db";
import { runIdempotentSeed } from "@/lib/db/seed";
import {
  computeWeightedKappa,
  computeKrippendorffAlpha,
  computeICC,
  computeBootstrapCI,
  computePairedComparison,
} from "@/lib/analytics/agreement";
import { auditorService } from "@/lib/analytics/auditor-service";
import { GET as handleAnalyticsGet } from "@/app/api/auditor/analytics/route";
import { POST as handleAccessLogPost } from "@/app/api/auditor/access-log/route";
import { POST as handleAnomaliesPost } from "@/app/api/auditor/anomalies/route";
import { NextRequest } from "next/server";

describe("Phase 7: Auditor Analytics, Reliability Statistics & Anomaly Detection", () => {
  const auditorId = "33333333-3333-3333-3333-333333333333"; // Dr. Arvind Rao
  const assessorId = "22222222-2222-2222-2222-222222222222"; // Er. Sunita Verma
  const testSessionId = "a0000000-0000-0000-0000-000000000002"; // Anita Devi session 2

  beforeAll(async () => {
    // Ensure clean and fully populated database state
    await runIdempotentSeed();
  });

  // ==========================================================================
  // 1. AGREEMENT STATISTICS LIBRARY: REFERENCE VALUES & MATHEMATICAL RIGOR
  // ==========================================================================

  describe("1. Pure Agreement Statistics Library", () => {
    it("matches known reference values for Cohen's quadratic weighted kappa", () => {
      // Reference Case: Hand-calculated ordinal 4-point rating pairs (k=4)
      // Quadratic weights: w_ij = (i - j)^2 / 9
      const r1 = [1, 2, 3, 4, 1, 2, 3, 4, 2, 3];
      const r2 = [1, 2, 3, 4, 1, 2, 3, 4, 3, 2];

      const res = computeWeightedKappa(r1, r2, 4);

      expect(res.isUndefined).toBe(false);
      expect(res.n).toBe(10);
      expect(res.percentAgreement).toBe(80.0); // 8 out of 10 match exactly
      expect(res.adjacentAgreement).toBe(100.0); // all within |r1 - r2| <= 1
      expect(res.kappa).toBeGreaterThan(0.7); // High weighted agreement
      expect(res.kappa).toBeLessThan(0.95);

      // Verify perfect agreement case yields 1.0
      const perfect1 = [1, 2, 3, 4, 2, 3, 1, 4];
      const perfect2 = [1, 2, 3, 4, 2, 3, 1, 4];
      const perfRes = computeWeightedKappa(perfect1, perfect2, 4);
      expect(perfRes.kappa).toBe(1.0);
      expect(perfRes.percentAgreement).toBe(100.0);
      expect(perfRes.adjacentAgreement).toBe(100.0);
    });

    it("handles zero variance correctly by returning undefined (NOT 0 or 1)", () => {
      // Edge Case: Invariant scores across all items (all raters give Level 3)
      const r1 = [3, 3, 3, 3, 3, 3, 3];
      const r2 = [3, 3, 3, 3, 3, 3, 3];

      const res = computeWeightedKappa(r1, r2, 4);

      expect(res.kappa).toBeUndefined();
      expect(res.isUndefined).toBe(true);
      expect(res.undefinedReason).toContain("Zero variance");
      expect(res.percentAgreement).toBe(100.0);
      expect(res.adjacentAgreement).toBe(100.0);
      expect(res.hasPrevalenceCaveat).toBe(true);
    });

    it("displays prevalence/bias caveats and adjacent agreement when distributions are skewed", () => {
      // Feinstein & Cicchetti (1990) Prevalence Paradox:
      // High agreement (90%), but 95% of ratings are concentrated in level 3
      const r1 = [3, 3, 3, 3, 3, 3, 3, 3, 3, 2];
      const r2 = [3, 3, 3, 3, 3, 3, 3, 3, 2, 2];

      const res = computeWeightedKappa(r1, r2, 4);

      expect(res.percentAgreement).toBe(90.0);
      expect(res.adjacentAgreement).toBe(100.0);
      expect(res.hasPrevalenceCaveat).toBe(true);
      expect(res.prevalenceCaveatNote).toBeDefined();
      expect(res.prevalenceIndex).toBeGreaterThan(0.5);
    });

    it("computes Krippendorff's alpha (ordinal metric) handling multi-raters and missing data", () => {
      // Reference Matrix: 6 items x 3 raters with missing values (represented as null)
      const matrix = [
        [1, 1, null],
        [2, 2, 2],
        [3, null, 3],
        [4, 4, 4],
        [1, 2, 1],
        [3, 3, 3],
      ];

      const res = computeKrippendorffAlpha(matrix, "ordinal");

      expect(res.isUndefined).toBe(false);
      expect(res.unitsCount).toBe(6);
      expect(res.metric).toBe("ordinal");
      expect(res.alpha).toBeDefined();
      expect(res.alpha!).toBeGreaterThan(0.7); // Strong agreement
      expect(res.alpha!).toBeLessThanOrEqual(1.0);

      // Invariant data check: when all ratings are identical
      const invariantMatrix = [
        [2, 2],
        [2, 2],
        [2, 2],
      ];
      const invRes = computeKrippendorffAlpha(invariantMatrix, "ordinal");
      expect(invRes.alpha).toBeUndefined();
      expect(invRes.isUndefined).toBe(true);
      expect(invRes.undefinedReason).toContain("Zero variance");
    });

    it("computes ICC(2,1) two-way random absolute agreement matching reference ANOVA principles", () => {
      // Classic Shrout & Fleiss (1979) Table 4 data: 6 targets (rows) x 4 judges (cols)
      const sfData = [
        [9, 2, 5, 8],
        [6, 1, 3, 2],
        [8, 4, 6, 8],
        [7, 1, 2, 6],
        [10, 5, 6, 9],
        [6, 2, 4, 7],
      ];

      const res = computeICC(sfData);

      expect(res.isUndefined).toBe(false);
      expect(res.model).toContain("Two-Way Random Effects, Absolute Agreement");
      expect(res.nSubjects).toBe(6);
      expect(res.nRaters).toBe(4);
      // Published Shrout & Fleiss (1979) Table 4 ICC(2,1) value is 0.29
      expect(res.icc).toBeCloseTo(0.29, 1);

      // Invariant data check
      const invariantICC = [
        [3, 3],
        [3, 3],
      ];
      const invRes = computeICC(invariantICC);
      expect(invRes.icc).toBeUndefined();
      expect(invRes.isUndefined).toBe(true);
    });

    it("computes deterministic bootstrap confidence intervals with fixed seed", () => {
      const data = [
        { s1: 1, s2: 1 },
        { s1: 2, s2: 2 },
        { s1: 3, s2: 3 },
        { s1: 4, s2: 4 },
        { s1: 2, s2: 3 },
        { s1: 3, s2: 4 },
        { s1: 1, s2: 1 },
        { s1: 4, s2: 4 },
      ];

      const res1 = computeBootstrapCI(
        data,
        (sample) => computeWeightedKappa(sample.map((p) => p.s1), sample.map((p) => p.s2)).kappa,
        { resamples: 500, seed: 42, confidence: 0.95 }
      );

      const res2 = computeBootstrapCI(
        data,
        (sample) => computeWeightedKappa(sample.map((p) => p.s1), sample.map((p) => p.s2)).kappa,
        { resamples: 500, seed: 42, confidence: 0.95 }
      );

      expect(res1.pointEstimate).toBeDefined();
      expect(res1.ciLower).toBeDefined();
      expect(res1.ciUpper).toBeDefined();
      // Reproducibility test: seed 42 must yield identical lower and upper bounds
      expect(res1.ciLower).toBe(res2.ciLower);
      expect(res1.ciUpper).toBe(res2.ciUpper);
      expect(res1.ciLower!).toBeLessThanOrEqual(res1.pointEstimate!);
      expect(res1.ciUpper!).toBeGreaterThanOrEqual(res1.pointEstimate!);
    });
  });

  // ==========================================================================
  // 2. HONEST DATA LABELLING & SPLIT SYNTHETIC VS REAL DATA
  // ==========================================================================

  describe("2. Honest Data Labelling & Real vs Synthetic Separation", () => {
    it("correctly identifies small-n banner and data source badges", async () => {
      const overview = await auditorService.getReliabilityOverview({ dataSource: "all" });

      expect(overview).toBeDefined();
      expect(overview.n).toBeGreaterThan(0);
      expect(overview.clipsCount).toBeGreaterThan(0);
      expect(overview.assessorsCount).toBeGreaterThan(0);
      expect(overview.smallNThreshold).toBe(30);

      // When n < 30, small-n flag and explicit warning banner must be returned
      if (overview.n < 30) {
        expect(overview.isSmallN).toBe(true);
        expect(overview.smallNWarning).toContain("below the required n=30");
      }
    });

    it("splits real and synthetic data strictly without silent blending", async () => {
      // Query real only
      const realOverview = await auditorService.getReliabilityOverview({ dataSource: "real" });
      expect(realOverview.dataSource).toBe("real");
      expect(realOverview.isSynthetic).toBe(false);

      // Query synthetic only
      const syntheticOverview = await auditorService.getReliabilityOverview({ dataSource: "synthetic" });
      expect(syntheticOverview.dataSource).toBe("synthetic");
      expect(syntheticOverview.isSynthetic).toBe(true);

      // Verify that per-criterion reliability returns distinct subsets
      const realCriteria = await auditorService.getPerCriterionReliability({ dataSource: "real" });
      const syntheticCriteria = await auditorService.getPerCriterionReliability({ dataSource: "synthetic" });

      expect(Array.isArray(realCriteria)).toBe(true);
      expect(Array.isArray(syntheticCriteria)).toBe(true);
    });
  });

  // ==========================================================================
  // 3. WITH VS WITHOUT THE TOOL: CONTROLLED COMPARISON MODE
  // ==========================================================================

  describe("3. Controlled Comparison (Condition A vs Condition B)", () => {
    it("computes paired comparison and can report 'no improvement' or 'worse'", () => {
      // Test Case 1: When Condition B is worse than Condition A
      const pairsA = [
        { rater1: 1, rater2: 1, gold: 1 },
        { rater1: 2, rater2: 2, gold: 2 },
        { rater1: 3, rater2: 3, gold: 3 },
        { rater1: 4, rater2: 4, gold: 4 },
        { rater1: 2, rater2: 2, gold: 2 },
        { rater1: 3, rater2: 3, gold: 3 },
        { rater1: 1, rater2: 1, gold: 1 },
        { rater1: 4, rater2: 4, gold: 4 },
        { rater1: 2, rater2: 2, gold: 2 },
        { rater1: 3, rater2: 3, gold: 3 },
        { rater1: 1, rater2: 1, gold: 1 },
        { rater1: 2, rater2: 2, gold: 2 },
        { rater1: 3, rater2: 3, gold: 3 },
        { rater1: 4, rater2: 4, gold: 4 },
        { rater1: 1, rater2: 1, gold: 1 },
      ];

      // Pairs B has discordant ratings
      const pairsB = [
        { rater1: 1, rater2: 3, gold: 1 },
        { rater1: 2, rater2: 4, gold: 2 },
        { rater1: 3, rater2: 1, gold: 3 },
        { rater1: 4, rater2: 2, gold: 4 },
        { rater1: 2, rater2: 3, gold: 2 },
        { rater1: 3, rater2: 4, gold: 3 },
        { rater1: 1, rater2: 2, gold: 1 },
        { rater1: 4, rater2: 1, gold: 4 },
        { rater1: 2, rater2: 4, gold: 2 },
        { rater1: 3, rater2: 1, gold: 3 },
        { rater1: 1, rater2: 3, gold: 1 },
        { rater1: 2, rater2: 4, gold: 2 },
        { rater1: 3, rater2: 2, gold: 3 },
        { rater1: 4, rater2: 3, gold: 4 },
        { rater1: 1, rater2: 4, gold: 1 },
      ];

      const resWorse = computePairedComparison(pairsA, pairsB, 10);
      expect(resWorse.conclusion).toBe("worse");
      expect(resWorse.difference!).toBeLessThan(0);
      expect(resWorse.note).toContain("performed worse than unassisted baseline");

      // Test Case 2: When sample size is small (< 10)
      const smallA = pairsA.slice(0, 5);
      const smallB = pairsB.slice(0, 5);
      const resSmall = computePairedComparison(smallA, smallB, 10);
      expect(resSmall.conclusion).toBe("sample_too_small");
      expect(resSmall.note).toContain("below the required");
    });

    it("evaluates stored controlled comparison in the database including accuracy vs expert standards", async () => {
      const comp = await auditorService.getControlledComparison();

      expect(comp).toBeDefined();
      expect(comp.conditionA).toBeDefined();
      expect(comp.conditionB).toBeDefined();
      expect(comp.accuracyVsExpert).toBeDefined();
      expect(comp.accuracyVsExpert.explanation).toContain("Inter-assessor agreement alone does not establish measurement validity");
    });
  });

  // ==========================================================================
  // 4. ASSESSOR ANOMALY DETECTION & RESOLUTION WORKFLOW
  // ==========================================================================

  describe("4. Explainable Assessor Anomaly Detection", () => {
    it("detects statistical and behavioral anomalies with explicit rule codes and numbers", async () => {
      const anomalies = await auditorService.detectAssessorAnomalies();

      expect(Array.isArray(anomalies)).toBe(true);
      expect(anomalies.length).toBeGreaterThan(0);

      // Verify that anomaly items contain rule codes, thresholds, and severity
      const rulesFound = anomalies.map((a) => a.ruleCode);
      expect(rulesFound.some((r) => ["SPEED_SCORING", "STRAIGHT_LINING", "LENIENCY_ZSCORE", "HARSHNESS_ZSCORE"].includes(r))).toBe(true);

      const speedAnomaly = anomalies.find((a) => a.ruleCode === "SPEED_SCORING");
      if (speedAnomaly) {
        expect(speedAnomaly.metrics.thresholdSeconds).toBe(180);
        expect(speedAnomaly.description).toContain("< 180s");
      }
    });

    it("enforces mandatory resolution note (>= 10 chars) and logs to cryptographic audit trail", async () => {
      const anomalies = await auditorService.detectAssessorAnomalies();
      const target = anomalies[0];

      // Rejection when note is too brief
      await expect(
        auditorService.resolveAnomaly(target.id, auditorId, "too short")
      ).rejects.toThrow("at least 10 characters");

      // Successful resolution with comprehensive audit note
      const res = await auditorService.resolveAnomaly(
        target.id,
        auditorId,
        "Reviewed assessment video timeline; candidate demonstrated fast mastery and prompt adherence."
      );
      expect(res.success).toBe(true);

      // Verify cryptographic audit_log entry
      const auditRes = await query(`
        SELECT entity_name, action, actor_role 
        FROM audit_log 
        WHERE entity_name = 'ASSESSOR_ANOMALIES' 
        ORDER BY id DESC LIMIT 1;
      `);
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].actor_role).toBe("auditor");
    });
  });

  // ==========================================================================
  // 5. EVIDENCE INTEGRITY PANEL
  // ==========================================================================

  describe("5. Evidence Integrity Panel", () => {
    it("summarizes evidence flags by type and severity", async () => {
      const summary = await auditorService.getEvidenceIntegritySummary();

      expect(summary).toBeDefined();
      expect(summary.totalFlags).toBeGreaterThanOrEqual(1);
      expect(summary.flagsByType).toBeDefined();
      expect(summary.flagsBySeverity).toBeDefined();
      expect(Array.isArray(summary.recentFlags)).toBe(true);
    });
  });

  // ==========================================================================
  // 6. AUDITOR ACCESS RULES (RLS) & RAW PII UNMASKING AUDIT LOG
  // ==========================================================================

  describe("6. Auditor Access Control & Raw PII Logging", () => {
    it("enforces role-based security: rejects unauthorized roles on auditor API routes", async () => {
      const reqUnauthorized = new NextRequest("http://localhost:3000/api/auditor/analytics", {
        headers: {
          "x-user-role": "candidate",
          "x-user-id": "11111111-1111-1111-1111-111111111111",
        },
      });

      const res = await handleAnalyticsGet(reqUnauthorized);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("Forbidden");
    });

    it("requires explicit justification (>= 8 chars) before unmasking raw candidate PII and logs to audit_log", async () => {
      // Rejection with empty or short justification
      await expect(
        auditorService.logAuditorRawAccess(auditorId, testSessionId, "short")
      ).rejects.toThrow("at least 8 characters");

      // Successful access logging with formal justification
      const logged = await auditorService.logAuditorRawAccess(
        auditorId,
        testSessionId,
        "Formal investigation into flagged visual replay anomaly"
      );

      expect(logged.id).toBeDefined();

      // Verify insertion in auditor_access_logs
      const dbRes = await query("SELECT reason FROM auditor_access_logs WHERE id = $1;", [logged.id]);
      expect(dbRes.rows.length).toBe(1);
      expect(dbRes.rows[0].reason).toContain("Formal investigation");

      // Verify insertion in immutable audit_log
      const auditRes = await query(`
        SELECT entity_name, action, actor_role 
        FROM audit_log 
        WHERE entity_name = 'AUDITOR_ACCESS_RAW_PII' 
        ORDER BY id DESC LIMIT 1;
      `);
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].actor_role).toBe("auditor");
    });
  });

  // ==========================================================================
  // 7. EXPORT: CSV & JSON WITH METHODOLOGY NOTES
  // ==========================================================================

  describe("7. Export with Full Methodology Notes", () => {
    it("exports JSON including complete methodology notes, formulas, and versioning", async () => {
      const exportRes = await auditorService.exportAuditorData("json", { dataSource: "all" });

      expect(exportRes.contentType).toBe("application/json");
      expect(exportRes.filename).toContain("satyarpl-auditor-analytics");

      const parsed = JSON.parse(exportRes.data);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.formulas.weightedKappa).toContain("Cohen's Quadratic Weighted Kappa");
      expect(parsed.metadata.formulas.krippendorffAlpha).toContain("Krippendorff's Alpha (Ordinal)");
      expect(parsed.metadata.formulas.icc).toContain("Intraclass Correlation Coefficient ICC(2,1)");
      expect(parsed.metadata.appVersion).toBe("v2.0.0-phase7");
      expect(parsed.metadata.interpretationGuidelines.length).toBeGreaterThan(0);
      expect(parsed.reliabilityOverview).toBeDefined();
      expect(parsed.perCriterionReliability).toBeDefined();
    });

    it("exports CSV with methodology header comments before tabular data", async () => {
      const exportRes = await auditorService.exportAuditorData("csv", { dataSource: "all" });

      expect(exportRes.contentType).toBe("text/csv");
      expect(exportRes.filename).toContain(".csv");

      const lines = exportRes.data.split("\n");
      // Methodology headers must start with #
      expect(lines[0]).toContain("# SATYARPL AUDITOR ANALYTICS EXPORT");
      expect(lines[1]).toContain("# Version:");
      expect(lines[2]).toContain("# Quadratic Weights:");
      expect(lines[3]).toContain("# Small-N Threshold:");

      // Followed by CSV table columns
      expect(lines[5]).toContain("Criterion_Code,NOS_Code,Sample_N,Weighted_Kappa");
    });
  });
});
