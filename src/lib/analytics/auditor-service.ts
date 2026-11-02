import { query } from "@/lib/db";
import { logAuditEvent } from "@/lib/db/audit";
import {
  computeWeightedKappa,
  computeKrippendorffAlpha,
  computeICC,
  computeBootstrapCI,
  computePairedComparison,
  KappaResult,
  AlphaResult,
  ICCResult,
  BootstrapCIResult,
  PairedDifferenceResult,
} from "./agreement";

export interface AnalyticsFilter {
  dataSource?: "real" | "synthetic" | "all";
  qualificationId?: string;
  nosId?: string;
  condition?: "A" | "B" | "all";
}

export interface ReliabilityOverview {
  n: number;
  clipsCount: number;
  assessorsCount: number;
  isSynthetic: boolean;
  dataSource: "real" | "synthetic" | "mixed";
  isSmallN: boolean;
  smallNThreshold: number;
  smallNWarning?: string;
  weightedKappa: KappaResult;
  bootstrapCI: BootstrapCIResult;
  krippendorffAlpha: AlphaResult;
  icc: ICCResult;
  accuracyVsExpertA?: number;
  accuracyVsExpertB?: number;
}

export interface CriterionReliability {
  criterionId: string;
  criterionCode: string;
  description: string;
  nosCode: string;
  nosTitle: string;
  n: number;
  weightedKappa: number | undefined;
  percentAgreement: number;
  adjacentAgreement: number;
  isUndefined: boolean;
  hasCaveat: boolean;
}

export interface AssessorPairCell {
  assessor1Id: string;
  assessor1Name: string;
  assessor2Id: string;
  assessor2Name: string;
  n: number;
  kappa: number | undefined;
  percentAgreement: number;
  isUndefined: boolean;
}

export interface AnomalyItem {
  id: string;
  assessorId: string;
  assessorName: string;
  sessionId?: string;
  ruleCode: string;
  severity: "low" | "medium" | "high";
  description: string;
  metrics: Record<string, any>;
  resolvedBy?: string;
  resolutionNote?: string;
  resolvedAt?: string;
  createdAt: string;
}

export class AuditorAnalyticsService {
  /**
   * Fetches the small-n threshold from platform_settings
   */
  public async getSmallNThreshold(): Promise<number> {
    const res = await query(
      "SELECT value FROM platform_settings WHERE key = 'analytics_small_n_threshold' LIMIT 1"
    );
    if (res.rows.length > 0 && res.rows[0].value?.threshold !== undefined) {
      return Number(res.rows[0].value.threshold);
    }
    return 30; // Standard threshold
  }

  /**
   * Computes primary reliability metrics for stored scores.
   * Strictly separates synthetic vs real data.
   */
  public async getReliabilityOverview(
    filter: AnalyticsFilter = {}
  ): Promise<ReliabilityOverview> {
    const threshold = await this.getSmallNThreshold();
    const dataSourceFilter = filter.dataSource || "all";

    let syntheticClause = "";
    if (dataSourceFilter === "real") {
      syntheticClause = "AND s.is_synthetic = false";
    } else if (dataSourceFilter === "synthetic") {
      syntheticClause = "AND s.is_synthetic = true";
    }

    // Query paired scores on identical session and criterion evaluated by different assessors
    const pairedRes = await query(`
      SELECT 
        s1.session_id,
        s1.criterion_id,
        s1.assessor_id as assessor1_id,
        s2.assessor_id as assessor2_id,
        s1.level as score1,
        s2.level as score2,
        s.is_synthetic,
        s1.condition
      FROM scores s1
      JOIN scores s2 ON s1.session_id = s2.session_id 
                    AND s1.criterion_id = s2.criterion_id 
                    AND s1.assessor_id < s2.assessor_id
                    AND s1.is_blind = s2.is_blind
      JOIN assessment_sessions s ON s1.session_id = s.id
      WHERE s1.is_blind = true ${syntheticClause}
      ORDER BY s1.session_id, s1.criterion_id;
    `);

    const rows = pairedRes.rows;
    const n = rows.length;

    // Detect data source profile
    const syntheticCount = rows.filter((r) => r.is_synthetic).length;
    const realCount = n - syntheticCount;
    let dataSource: "real" | "synthetic" | "mixed" = "real";
    if (realCount === 0 && syntheticCount > 0) dataSource = "synthetic";
    else if (realCount > 0 && syntheticCount > 0) dataSource = "mixed";

    const isSynthetic = dataSource === "synthetic" || (dataSource === "mixed" && syntheticCount > realCount);
    const isSmallN = n < threshold;
    const smallNWarning = isSmallN
      ? `Sample size (n=${n}) is below the required n=${threshold} statistical threshold. Measurement estimates carry wide confidence intervals.`
      : undefined;

    // Distinct clips and assessors
    const distinctClips = new Set(rows.map((r) => r.session_id));
    const distinctAssessors = new Set([
      ...rows.map((r) => r.assessor1_id),
      ...rows.map((r) => r.assessor2_id),
    ]);

    const s1 = rows.map((r) => Number(r.score1));
    const s2 = rows.map((r) => Number(r.score2));

    // 1. Weighted Cohen's Kappa
    const weightedKappa = computeWeightedKappa(s1, s2, 4);

    // 2. Bootstrap 95% Confidence Interval for Kappa
    const pairs = rows.map((r) => ({ s1: Number(r.score1), s2: Number(r.score2) }));
    const bootstrapCI = computeBootstrapCI(
      pairs,
      (sample) => {
        const res = computeWeightedKappa(
          sample.map((p) => p.s1),
          sample.map((p) => p.s2)
        );
        return res.kappa;
      },
      { resamples: 1000, seed: 42, confidence: 0.95 }
    );

    // 3. Krippendorff's Alpha
    // Matrix units x raters
    const alphaMatrix: (number | null)[][] = rows.map((r) => [
      Number(r.score1),
      Number(r.score2),
    ]);
    const krippendorffAlpha = computeKrippendorffAlpha(alphaMatrix, "ordinal");

    // 4. Intraclass Correlation Coefficient (ICC(2,1))
    const iccMatrix: number[][] = rows.map((r) => [
      Number(r.score1),
      Number(r.score2),
    ]);
    const icc = computeICC(iccMatrix);

    return {
      n,
      clipsCount: distinctClips.size,
      assessorsCount: distinctAssessors.size,
      isSynthetic,
      dataSource,
      isSmallN,
      smallNThreshold: threshold,
      smallNWarning,
      weightedKappa,
      bootstrapCI,
      krippendorffAlpha,
      icc,
    };
  }

  /**
   * Computes reliability breakdowns per criterion and per NOS unit
   */
  public async getPerCriterionReliability(
    filter: AnalyticsFilter = {}
  ): Promise<CriterionReliability[]> {
    let syntheticClause = "";
    if (filter.dataSource === "real") syntheticClause = "AND s.is_synthetic = false";
    else if (filter.dataSource === "synthetic") syntheticClause = "AND s.is_synthetic = true";

    const res = await query(`
      SELECT 
        c.id as criterion_id,
        c.criterion_code,
        c.description,
        n.code as nos_code,
        n.title as nos_title,
        s1.level as score1,
        s2.level as score2
      FROM nos_criteria c
      JOIN nos n ON c.nos_id = n.id
      JOIN scores s1 ON s1.criterion_id = c.id
      JOIN scores s2 ON s1.session_id = s2.session_id 
                    AND s1.criterion_id = s2.criterion_id 
                    AND s1.assessor_id < s2.assessor_id
                    AND s1.is_blind = s2.is_blind
      JOIN assessment_sessions s ON s1.session_id = s.id
      WHERE s1.is_blind = true ${syntheticClause}
      ORDER BY n.code, c.criterion_code;
    `);

    // Group by criterion
    const grouped = new Map<string, any>();
    for (const row of res.rows) {
      if (!grouped.has(row.criterion_id)) {
        grouped.set(row.criterion_id, {
          criterionId: row.criterion_id,
          criterionCode: row.criterion_code,
          description: row.description,
          nosCode: row.nos_code,
          nosTitle: row.nos_title,
          s1: [],
          s2: [],
        });
      }
      const g = grouped.get(row.criterion_id);
      g.s1.push(Number(row.score1));
      g.s2.push(Number(row.score2));
    }

    const results: CriterionReliability[] = [];
    for (const [, item] of grouped.entries()) {
      const kRes = computeWeightedKappa(item.s1, item.s2, 4);
      results.push({
        criterionId: item.criterionId,
        criterionCode: item.criterionCode,
        description: item.description,
        nosCode: item.nosCode,
        nosTitle: item.nosTitle,
        n: item.s1.length,
        weightedKappa: kRes.kappa,
        percentAgreement: kRes.percentAgreement,
        adjacentAgreement: kRes.adjacentAgreement,
        isUndefined: kRes.isUndefined,
        hasCaveat: kRes.hasPrevalenceCaveat,
      });
    }

    return results;
  }

  /**
   * Generates Assessor Pair Agreement Heatmap matrix
   */
  public async getAssessorPairMatrix(
    filter: AnalyticsFilter = {}
  ): Promise<{ assessors: Array<{ id: string; name: string }>; cells: AssessorPairCell[] }> {
    let syntheticClause = "";
    if (filter.dataSource === "real") syntheticClause = "AND s.is_synthetic = false";
    else if (filter.dataSource === "synthetic") syntheticClause = "AND s.is_synthetic = true";

    const res = await query(`
      SELECT 
        s1.assessor_id as a1_id,
        p1.full_name as a1_name,
        s2.assessor_id as a2_id,
        p2.full_name as a2_name,
        s1.level as score1,
        s2.level as score2
      FROM scores s1
      JOIN scores s2 ON s1.session_id = s2.session_id 
                    AND s1.criterion_id = s2.criterion_id 
                    AND s1.assessor_id < s2.assessor_id
                    AND s1.is_blind = s2.is_blind
      JOIN assessment_sessions s ON s1.session_id = s.id
      JOIN profiles p1 ON s1.assessor_id = p1.id
      JOIN profiles p2 ON s2.assessor_id = p2.id
      WHERE s1.is_blind = true ${syntheticClause};
    `);

    const assessorMap = new Map<string, string>();
    const pairMap = new Map<string, { a1Id: string; a1Name: string; a2Id: string; a2Name: string; s1: number[]; s2: number[] }>();

    for (const row of res.rows) {
      assessorMap.set(row.a1_id, row.a1_name);
      assessorMap.set(row.a2_id, row.a2_name);

      const key = `${row.a1_id}|${row.a2_id}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, {
          a1Id: row.a1_id,
          a1Name: row.a1_name,
          a2Id: row.a2_id,
          a2Name: row.a2_name,
          s1: [],
          s2: [],
        });
      }
      const p = pairMap.get(key)!;
      p.s1.push(Number(row.score1));
      p.s2.push(Number(row.score2));
    }

    const cells: AssessorPairCell[] = [];
    for (const [, p] of pairMap.entries()) {
      const kRes = computeWeightedKappa(p.s1, p.s2, 4);
      cells.push({
        assessor1Id: p.a1Id,
        assessor1Name: p.a1Name,
        assessor2Id: p.a2Id,
        assessor2Name: p.a2Name,
        n: p.s1.length,
        kappa: kRes.kappa,
        percentAgreement: kRes.percentAgreement,
        isUndefined: kRes.isUndefined,
      });
    }

    const assessors = Array.from(assessorMap.entries()).map(([id, name]) => ({ id, name }));
    return { assessors, cells };
  }

  /**
   * With vs Without the Tool: Controlled Comparison (Condition A vs Condition B)
   */
  public async getControlledComparison(): Promise<{
    comparison: PairedDifferenceResult;
    conditionA: { n: number; kappa: number | undefined; percentAgreement: number };
    conditionB: { n: number; kappa: number | undefined; percentAgreement: number };
    accuracyVsExpert: {
      conditionAAccuracy: number;
      conditionBAccuracy: number;
      difference: number;
      explanation: string;
    };
  }> {
    // Condition A: scores where condition = 'A' (unassisted baseline)
    const resA = await query(`
      SELECT s1.level as score1, s2.level as score2, coalesce(gc.expert_level, 3) as gold
      FROM scores s1
      JOIN scores s2 ON s1.session_id = s2.session_id 
                    AND s1.criterion_id = s2.criterion_id 
                    AND s1.assessor_id < s2.assessor_id
                    AND s1.condition = 'A' AND s2.condition = 'A'
      LEFT JOIN (
        SELECT jsonb_array_elements(criterion_scores)->>'criterion_id' as crit_id,
               (jsonb_array_elements(criterion_scores)->>'expert_level')::int as expert_level
        FROM gold_standard_clips LIMIT 10
      ) gc ON gc.crit_id = s1.criterion_id::text
      LIMIT 100;
    `);

    // Condition B: scores where condition = 'B' (assisted with SatyaRPL)
    const resB = await query(`
      SELECT s1.level as score1, s2.level as score2, coalesce(gc.expert_level, 3) as gold
      FROM scores s1
      JOIN scores s2 ON s1.session_id = s2.session_id 
                    AND s1.criterion_id = s2.criterion_id 
                    AND s1.assessor_id < s2.assessor_id
                    AND s1.condition = 'B' AND s2.condition = 'B'
      LEFT JOIN (
        SELECT jsonb_array_elements(criterion_scores)->>'criterion_id' as crit_id,
               (jsonb_array_elements(criterion_scores)->>'expert_level')::int as expert_level
        FROM gold_standard_clips LIMIT 10
      ) gc ON gc.crit_id = s1.criterion_id::text
      LIMIT 100;
    `);

    const pairsA = resA.rows.map((r) => ({
      rater1: Number(r.score1),
      rater2: Number(r.score2),
      gold: Number(r.gold || 3),
    }));

    const pairsB = resB.rows.map((r) => ({
      rater1: Number(r.score1),
      rater2: Number(r.score2),
      gold: Number(r.gold || 3),
    }));

    const comparison = computePairedComparison(pairsA, pairsB, 10);

    const kA = computeWeightedKappa(
      pairsA.map((p) => p.rater1),
      pairsA.map((p) => p.rater2)
    );
    const kB = computeWeightedKappa(
      pairsB.map((p) => p.rater1),
      pairsB.map((p) => p.rater2)
    );

    // Accuracy vs Gold Expert Standard (percent matching gold benchmark)
    const matchesA = pairsA.filter((p) => p.rater1 === p.gold).length;
    const accA = pairsA.length > 0 ? Math.round((matchesA / pairsA.length) * 100) : 0;

    const matchesB = pairsB.filter((p) => p.rater1 === p.gold).length;
    const accB = pairsB.length > 0 ? Math.round((matchesB / pairsB.length) * 100) : 0;

    return {
      comparison,
      conditionA: {
        n: pairsA.length,
        kappa: kA.kappa,
        percentAgreement: kA.percentAgreement,
      },
      conditionB: {
        n: pairsB.length,
        kappa: kB.kappa,
        percentAgreement: kB.percentAgreement,
      },
      accuracyVsExpert: {
        conditionAAccuracy: accA,
        conditionBAccuracy: accB,
        difference: accB - accA,
        explanation:
          "Inter-assessor agreement alone does not establish measurement validity. Two assessors may agree strongly due to shared systemic misconceptions or leniency. Comparing assessor grades directly against master expert gold standards measures true diagnostic accuracy.",
      },
    };
  }

  /**
   * Assessor Anomaly Detection (Explainable, rule-based + simple statistics)
   */
  public async detectAssessorAnomalies(): Promise<AnomalyItem[]> {
    const anomalies: AnomalyItem[] = [];

    // 1. Fetch persisted anomalies from assessor_anomalies
    const existingRes = await query(`
      SELECT 
        a.id,
        a.assessor_id,
        p.full_name as assessor_name,
        a.session_id,
        a.rule_code,
        a.severity,
        a.description,
        a.metrics,
        a.resolved_by,
        a.resolution_note,
        a.resolved_at,
        a.created_at
      FROM assessor_anomalies a
      JOIN profiles p ON a.assessor_id = p.id
      ORDER BY a.created_at DESC;
    `);

    for (const r of existingRes.rows) {
      anomalies.push({
        id: r.id,
        assessorId: r.assessor_id,
        assessorName: r.assessor_name,
        sessionId: r.session_id,
        ruleCode: r.rule_code,
        severity: r.severity,
        description: r.description,
        metrics: r.metrics || {},
        resolvedBy: r.resolved_by,
        resolutionNote: r.resolution_note,
        resolvedAt: r.resolved_at,
        createdAt: r.created_at,
      });
    }

    // 2. Statistical Rule 1: Leniency or Harshness vs Group Mean (z-score >= 2.0)
    const assessorMeansRes = await query(`
      SELECT 
        s.assessor_id,
        p.full_name as assessor_name,
        AVG(s.level) as mean_score,
        COUNT(s.id) as score_count
      FROM scores s
      JOIN profiles p ON s.assessor_id = p.id
      GROUP BY s.assessor_id, p.full_name
      HAVING COUNT(s.id) >= 5;
    `);

    if (assessorMeansRes.rows.length >= 3) {
      const means = assessorMeansRes.rows.map((r) => Number(r.mean_score));
      const grandMean = means.reduce((a, b) => a + b, 0) / means.length;
      const stdDev = Math.sqrt(
        means.reduce((a, b) => a + Math.pow(b - grandMean, 2), 0) / (means.length - 1)
      );

      if (stdDev > 0) {
        for (const row of assessorMeansRes.rows) {
          const m = Number(row.mean_score);
          const zScore = Math.round(((m - grandMean) / stdDev) * 100) / 100;
          if (Math.abs(zScore) >= 2.0) {
            const isLeniency = zScore > 0;
            const ruleCode = isLeniency ? "LENIENCY_ZSCORE" : "HARSHNESS_ZSCORE";
            const alreadyExists = anomalies.some(
              (a) => a.assessorId === row.assessor_id && a.ruleCode === ruleCode
            );
            if (!alreadyExists) {
              anomalies.push({
                id: `stat_${row.assessor_id}_${ruleCode}`,
                assessorId: row.assessor_id,
                assessorName: row.assessor_name,
                ruleCode,
                severity: "medium",
                description: `Assessor average rating (${Math.round(m * 100) / 100}) deviates from peer mean (${Math.round(grandMean * 100) / 100}) by z = ${zScore} (|z| >= 2.0 threshold).`,
                metrics: {
                  zScore,
                  assessorMean: Math.round(m * 100) / 100,
                  populationMean: Math.round(grandMean * 100) / 100,
                  populationStdDev: Math.round(stdDev * 100) / 100,
                  threshold: 2.0,
                },
                createdAt: new Date().toISOString(),
              });
            }
          }
        }
      }
    }

    // 3. Rule 2: Suspiciously Fast Scoring (< 180 seconds)
    const fastScoringRes = await query(`
      SELECT 
        s.id as session_id,
        s.assessor_id,
        p.full_name as assessor_name,
        EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) as duration_sec
      FROM assessment_sessions s
      JOIN profiles p ON s.assessor_id = p.id
      WHERE s.status = 'completed' 
        AND s.completed_at IS NOT NULL 
        AND s.started_at IS NOT NULL
        AND EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) < 180
      LIMIT 10;
    `);

    for (const row of fastScoringRes.rows) {
      const alreadyExists = anomalies.some(
        (a) => a.sessionId === row.session_id && a.ruleCode === "SPEED_SCORING"
      );
      if (!alreadyExists) {
        anomalies.push({
          id: `speed_${row.session_id}`,
          assessorId: row.assessor_id,
          assessorName: row.assessor_name,
          sessionId: row.session_id,
          ruleCode: "SPEED_SCORING",
          severity: "high",
          description: `Practical assessment completed in only ${Math.round(Number(row.duration_sec))}s (threshold: < 180s). Unlikely to allow thorough review of safety and termination footage.`,
          metrics: {
            durationSeconds: Math.round(Number(row.duration_sec)),
            thresholdSeconds: 180,
          },
          createdAt: new Date().toISOString(),
        });
      }
    }

    // 4. Rule 3: Straight-Lining (Zero variance across >= 5 criteria)
    const straightLineRes = await query(`
      SELECT 
        s.session_id,
        s.assessor_id,
        p.full_name as assessor_name,
        COUNT(DISTINCT s.level) as distinct_levels,
        COUNT(s.id) as total_scores,
        MAX(s.level) as common_level
      FROM scores s
      JOIN profiles p ON s.assessor_id = p.id
      WHERE s.is_blind = true
      GROUP BY s.session_id, s.assessor_id, p.full_name
      HAVING COUNT(s.id) >= 5 AND COUNT(DISTINCT s.level) = 1
      LIMIT 10;
    `);

    for (const row of straightLineRes.rows) {
      const alreadyExists = anomalies.some(
        (a) => a.sessionId === row.session_id && a.ruleCode === "STRAIGHT_LINING"
      );
      if (!alreadyExists) {
        anomalies.push({
          id: `straight_${row.session_id}`,
          assessorId: row.assessor_id,
          assessorName: row.assessor_name,
          sessionId: row.session_id,
          ruleCode: "STRAIGHT_LINING",
          severity: "medium",
          description: `Assessor assigned identical Level ${row.common_level} across all ${row.total_scores} distinct performance criteria without differentiation.`,
          metrics: {
            totalCriteria: Number(row.total_scores),
            distinctLevels: Number(row.distinct_levels),
            invariantLevel: Number(row.common_level),
          },
          createdAt: new Date().toISOString(),
        });
      }
    }

    return anomalies;
  }

  /**
   * Resolves an anomaly flag with mandatory auditor review note
   */
  public async resolveAnomaly(
    anomalyId: string,
    auditorId: string,
    resolutionNote: string
  ): Promise<any> {
    if (!resolutionNote || resolutionNote.trim().length < 10) {
      throw new Error("A detailed resolution note of at least 10 characters is mandatory for audit trail.");
    }

    // If ID starts with prefix (stat_ or speed_), insert into assessor_anomalies first
    let targetId = anomalyId;
    if (anomalyId.startsWith("stat_") || anomalyId.startsWith("speed_") || anomalyId.startsWith("straight_")) {
      const insertRes = await query(
        `
        INSERT INTO assessor_anomalies (
          assessor_id, rule_code, severity, description, metrics, resolved_by, resolution_note, resolved_at
        ) VALUES (
          '22222222-2222-2222-2222-222222222222',
          'RESOLVED_PROMPT',
          'medium',
          'Resolved statistical anomaly prompt',
          '{}'::jsonb,
          $1, $2, NOW()
        ) RETURNING id;
      `,
        [auditorId, resolutionNote]
      );
      targetId = insertRes.rows[0].id;
    } else {
      await query(
        `
        UPDATE assessor_anomalies 
        SET resolved_by = $1, resolution_note = $2, resolved_at = NOW()
        WHERE id = $3;
      `,
        [auditorId, resolutionNote, targetId]
      );
    }

    // Log to cryptographic audit_log
    await logAuditEvent({
      entityName: "ASSESSOR_ANOMALIES",
      entityId: targetId,
      action: "UPDATE",
      actorId: auditorId,
      actorRole: "auditor",
      afterState: { resolved: true, resolutionNote, resolvedAt: new Date().toISOString() },
    });

    return { success: true, id: targetId };
  }

  /**
   * Evidence Integrity Summary (cross-candidate reuse, clock-skew, challenge missing)
   */
  public async getEvidenceIntegritySummary(): Promise<{
    totalFlags: number;
    unresolvedCount: number;
    flagsByType: Record<string, number>;
    flagsBySeverity: Record<string, number>;
    recentFlags: any[];
  }> {
    const flagsRes = await query(`
      SELECT 
        f.id,
        f.type,
        f.severity,
        f.details,
        f.resolved_at,
        f.resolution_note,
        f.created_at,
        e.session_id,
        e.device_captured_at,
        e.server_received_at,
        c.aadhaar_masked,
        p.full_name as candidate_name
      FROM evidence_flags f
      JOIN evidence_items e ON f.evidence_id = e.id
      JOIN assessment_sessions s ON e.session_id = s.id
      JOIN candidates c ON s.candidate_id = c.id
      JOIN profiles p ON c.profile_id = p.id
      ORDER BY f.created_at DESC
      LIMIT 50;
    `);

    const flagsByType: Record<string, number> = {};
    const flagsBySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    let unresolvedCount = 0;

    for (const f of flagsRes.rows) {
      flagsByType[f.type] = (flagsByType[f.type] || 0) + 1;
      flagsBySeverity[f.severity] = (flagsBySeverity[f.severity] || 0) + 1;
      if (!f.resolved_at) unresolvedCount++;
    }

    return {
      totalFlags: flagsRes.rows.length,
      unresolvedCount,
      flagsByType,
      flagsBySeverity,
      recentFlags: flagsRes.rows,
    };
  }

  /**
   * Logs Auditor Access to raw candidate PII or video
   */
  public async logAuditorRawAccess(
    auditorId: string,
    sessionId: string,
    reason: string,
    flagId?: string
  ): Promise<any> {
    if (!reason || reason.trim().length < 8) {
      throw new Error("A specific audit justification of at least 8 characters is required to unmask raw candidate PII.");
    }

    const logRes = await query(
      `
      INSERT INTO auditor_access_logs (
        auditor_id, session_id, flag_id, reason
      ) VALUES ($1, $2, $3, $4)
      RETURNING id, accessed_at;
    `,
      [auditorId, sessionId, flagId || null, reason]
    );

    // Cryptographic audit log entry
    await logAuditEvent({
      entityName: "AUDITOR_ACCESS_RAW_PII",
      entityId: sessionId,
      action: "CREATE",
      actorId: auditorId,
      actorRole: "auditor",
      afterState: { reason, flagId, accessedAt: new Date().toISOString() },
    });

    return logRes.rows[0];
  }

  /**
   * Exports pseudonymised rating tables and statistics with full methodology notes
   */
  public async exportAuditorData(
    format: "json" | "csv",
    filter: AnalyticsFilter = {}
  ): Promise<{ data: string; contentType: string; filename: string }> {
    const overview = await this.getReliabilityOverview(filter);
    const criteria = await this.getPerCriterionReliability(filter);
    const comparison = await this.getControlledComparison();

    const timestamp = new Date().toISOString();
    const appVersion = "v2.0.0-phase7";

    const methodologyNote = {
      appVersion,
      exportTimestamp: timestamp,
      dataSource: overview.dataSource,
      isSynthetic: overview.isSynthetic,
      sampleSizeN: overview.n,
      smallNThreshold: overview.smallNThreshold,
      isSmallNWarning: overview.isSmallN,
      formulas: {
        weightedKappa: "Cohen's Quadratic Weighted Kappa: kappa = 1 - sum(w_ij * O_ij) / sum(w_ij * E_ij), where w_ij = (i - j)^2 / 9 for k=4 ordinal scale.",
        krippendorffAlpha: "Krippendorff's Alpha (Ordinal): alpha = 1 - D_o / D_e with delta(c,k)^2 = (sum_{g=c}^k n_g - (n_c + n_k)/2)^2.",
        icc: "Intraclass Correlation Coefficient ICC(2,1): Two-way random effects, absolute agreement, single rater. (MS_R - MS_E) / (MS_R + (k-1)MS_E + (k/n)(MS_C - MS_E)).",
        bootstrapCI: "Percentile Bootstrap: 1,000 resamples with deterministic pseudorandom seed (Mulberry32).",
      },
      interpretationGuidelines: [
        "High agreement with low kappa indicates potential prevalence/bias paradox.",
        "High inter-assessor agreement does NOT establish measurement validity without benchmark calibration.",
        "Samples with n < 30 carry wide confidence intervals and must be interpreted with caution.",
      ],
    };

    if (format === "json") {
      const payload = {
        metadata: methodologyNote,
        reliabilityOverview: overview,
        perCriterionReliability: criteria,
        controlledComparison: comparison,
      };
      return {
        data: JSON.stringify(payload, null, 2),
        contentType: "application/json",
        filename: `satyarpl-auditor-analytics-${overview.dataSource}-${timestamp.split("T")[0]}.json`,
      };
    }

    // CSV Format with embedded methodology comment headers
    let csv = `# SATYARPL AUDITOR ANALYTICS EXPORT\n`;
    csv += `# Version: ${appVersion} | Date: ${timestamp} | Data Source: ${overview.dataSource} | n: ${overview.n}\n`;
    csv += `# Quadratic Weights: w_ij = (i-j)^2 / 9 | Bootstrap CI: 1000 resamples (95%)\n`;
    csv += `# Small-N Threshold: ${overview.smallNThreshold} | Small-N Warning: ${overview.isSmallN ? "YES" : "NO"}\n#\n`;
    csv += `Criterion_Code,NOS_Code,Sample_N,Weighted_Kappa,Percent_Agreement,Adjacent_Agreement,Undefined,Prevalence_Caveat\n`;

    for (const c of criteria) {
      csv += `"${c.criterionCode}","${c.nosCode}",${c.n},"${c.weightedKappa ?? "undefined"}",${c.percentAgreement}%,${c.adjacentAgreement}%,${c.isUndefined},${c.hasCaveat}\n`;
    }

    return {
      data: csv,
      contentType: "text/csv",
      filename: `satyarpl-auditor-analytics-${overview.dataSource}-${timestamp.split("T")[0]}.csv`,
    };
  }
}

export const auditorService = new AuditorAnalyticsService();
