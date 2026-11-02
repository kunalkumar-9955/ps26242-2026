import { query } from "@/lib/db";

export interface GoldClipCriterionScore {
  criterion_id: string;
  criterion_code: string;
  expert_level: number;
  expert_name: string;
  notes?: string;
}

export interface CalibrationResult {
  assessorId: string;
  goldClipId: string;
  weightedKappa: number;
  threshold: number;
  passed: boolean;
  certifiedUntil: string;
  scoresCompared: number;
}

export class CalibrationService {
  /**
   * Computes Cohen's quadratic weighted kappa between assessor scores and expert gold standard.
   * Levels: 1 to 4 (k = 4)
   * Weights: w_ij = ((i - j)^2) / ((k - 1)^2) = ((i - j)^2) / 9
   */
  public computeQuadraticWeightedKappa(
    assessorLevels: number[],
    goldLevels: number[]
  ): number {
    if (assessorLevels.length === 0 || assessorLevels.length !== goldLevels.length) {
      return 0.0;
    }

    const n = assessorLevels.length;
    const k = 4; // levels 1 to 4

    // If all scores match identically, kappa is 1.0
    let identical = true;
    for (let i = 0; i < n; i++) {
      if (assessorLevels[i] !== goldLevels[i]) {
        identical = false;
        break;
      }
    }
    if (identical) return 1.0;

    // Build confusion matrix O (k x k)
    const O: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
    const rMargin: number[] = Array(k).fill(0); // assessor distribution
    const cMargin: number[] = Array(k).fill(0); // gold distribution

    for (let idx = 0; idx < n; idx++) {
      const a = Math.max(1, Math.min(k, assessorLevels[idx])) - 1;
      const g = Math.max(1, Math.min(k, goldLevels[idx])) - 1;
      O[a][g] += 1;
      rMargin[a] += 1;
      cMargin[g] += 1;
    }

    // Expected matrix E under chance
    const E: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        E[i][j] = (rMargin[i] * cMargin[j]) / n;
      }
    }

    // Quadratic weights w_ij
    let num = 0;
    let den = 0;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        const w = Math.pow(i - j, 2) / Math.pow(k - 1, 2);
        num += w * O[i][j];
        den += w * E[i][j];
      }
    }

    if (den === 0) return 1.0;
    const kappa = 1 - num / den;
    return Math.round(kappa * 10000) / 10000;
  }

  /**
   * Retrieves the configured calibration kappa threshold from platform_settings
   */
  public async getCalibrationThreshold(): Promise<number> {
    const res = await query(
      "SELECT value FROM platform_settings WHERE key = 'assessor_calibration_kappa_threshold' LIMIT 1"
    );
    if (res.rows.length > 0 && res.rows[0].value?.threshold !== undefined) {
      return Number(res.rows[0].value.threshold);
    }
    return 0.7; // UNVERIFIED default from draft PMKVY guidelines
  }

  /**
   * Evaluates and records assessor calibration against a gold standard clip
   */
  public async evaluateCalibration(
    assessorId: string,
    goldClipId: string,
    submittedScores: Array<{ criterion_id: string; score: number }>
  ): Promise<CalibrationResult> {
    const clipRes = await query(
      "SELECT criterion_scores FROM gold_standard_clips WHERE id = $1 LIMIT 1",
      [goldClipId]
    );

    if (clipRes.rows.length === 0) {
      throw new Error(`Gold standard clip [${goldClipId}] not found.`);
    }

    const goldScores: GoldClipCriterionScore[] = clipRes.rows[0].criterion_scores || [];
    const goldMap = new Map<string, number>();
    for (const g of goldScores) {
      goldMap.set(g.criterion_id, g.expert_level);
    }

    const assessorLevels: number[] = [];
    const goldLevels: number[] = [];

    for (const s of submittedScores) {
      const expertLevel = goldMap.get(s.criterion_id);
      if (expertLevel !== undefined) {
        assessorLevels.push(s.score);
        goldLevels.push(expertLevel);
      }
    }

    if (assessorLevels.length === 0) {
      throw new Error("No matching criteria scores between assessor submission and gold standard clip.");
    }

    const weightedKappa = this.computeQuadraticWeightedKappa(assessorLevels, goldLevels);
    const threshold = await this.getCalibrationThreshold();
    const passed = weightedKappa >= threshold;

    const validityDays = 30;
    const certifiedUntil = passed
      ? new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() - 1000).toISOString(); // expired if failed

    // Store in assessor_calibration
    const firstCriterionId = submittedScores[0]?.criterion_id;
    await query(
      `
      INSERT INTO assessor_calibration (
        assessor_id, gold_clip_id, criterion_id, assessor_score, gold_score,
        weighted_kappa, passed, threshold, certified_until, summary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
      [
        assessorId,
        goldClipId,
        firstCriterionId,
        assessorLevels[0] || 3,
        goldLevels[0] || 3,
        weightedKappa,
        passed,
        threshold,
        certifiedUntil,
        JSON.stringify({
          scoresCompared: assessorLevels.length,
          assessorLevels,
          goldLevels,
          submittedAt: new Date().toISOString(),
        }),
      ]
    );

    return {
      assessorId,
      goldClipId,
      weightedKappa,
      threshold,
      passed,
      certifiedUntil,
      scoresCompared: assessorLevels.length,
    };
  }

  /**
   * Verifies if an assessor is currently calibrated and certified
   */
  public async checkAssessorCertification(assessorId: string): Promise<{
    certified: boolean;
    kappa?: number;
    threshold?: number;
    certifiedUntil?: string;
    reason?: string;
  }> {
    const res = await query(
      `
      SELECT weighted_kappa, threshold, passed, certified_until
      FROM assessor_calibration
      WHERE assessor_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [assessorId]
    );

    if (res.rows.length === 0) {
      return {
        certified: false,
        reason: "NO_CALIBRATION_RECORD: Assessor has never completed calibration against gold-standard clips.",
      };
    }

    const row = res.rows[0];
    const now = new Date();
    const expiry = new Date(row.certified_until);

    if (expiry <= now) {
      return {
        certified: false,
        kappa: Number(row.weighted_kappa),
        threshold: Number(row.threshold),
        certifiedUntil: row.certified_until,
        reason: `CERTIFICATION_EXPIRED: Assessor calibration expired on ${expiry.toLocaleDateString()}. Recalibration is mandatory.`,
      };
    }

    if (!row.passed || Number(row.weighted_kappa) < Number(row.threshold)) {
      return {
        certified: false,
        kappa: Number(row.weighted_kappa),
        threshold: Number(row.threshold),
        certifiedUntil: row.certified_until,
        reason: `BELOW_THRESHOLD: Assessor agreement (kappa ${row.weighted_kappa}) is below required benchmark (${row.threshold}).`,
      };
    }

    return {
      certified: true,
      kappa: Number(row.weighted_kappa),
      threshold: Number(row.threshold),
      certifiedUntil: row.certified_until,
    };
  }
}

export const calibrationService = new CalibrationService();
