import { query } from "@/lib/db";

export interface PhysicalVerificationInput {
  sessionId: string;
  assessorId: string;
  criterionId: string;
  level: number;
  passed: boolean;
  tactileNotes: string;
  photoEvidenceRef?: string;
  hashChainedRef?: string;
}

export class PhysicalVerificationService {
  /**
   * Retrieves all criteria for a session that require in-person physical inspection
   */
  public async getPhysicalCriteriaForSession(sessionId: string): Promise<any[]> {
    const res = await query(
      `
      SELECT 
        c.id,
        c.id as criterion_id,
        c.criterion_code,
        c.description,
        c.weight,
        c.rubric_level_1,
        c.rubric_level_2,
        c.rubric_level_3,
        c.rubric_level_4,
        n.code as nos_code,
        n.title as nos_title,
        pv.level as recorded_level,
        pv.passed as recorded_passed,
        pv.tactile_notes,
        pv.photo_evidence_ref,
        pv.verified_at
      FROM nos_criteria c
      JOIN nos n ON c.nos_id = n.id
      JOIN assessment_sessions s ON s.id = $1
      JOIN candidates cand ON s.candidate_id = cand.id
      JOIN qualifications q ON cand.qualification_id = q.id AND n.qualification_id = q.id
      LEFT JOIN physical_verifications pv ON pv.session_id = $1 AND pv.criterion_id = c.id
      WHERE c.requires_physical = true OR c.assessable_from_video = 'no'
      ORDER BY c.criterion_code ASC;
    `,
      [sessionId]
    );

    return res.rows;
  }

  /**
   * Records a physical verification check
   */
  public async recordPhysicalCheck(input: PhysicalVerificationInput): Promise<any> {
    if (input.level < 1 || input.level > 4) {
      throw new Error("Invalid level. Must be between 1 and 4.");
    }
    if (!input.tactileNotes || input.tactileNotes.trim().length < 5) {
      throw new Error("Tactile inspection notes (e.g. pull test feel, torque resistance) are required.");
    }

    const res = await query(
      `
      INSERT INTO physical_verifications (
        session_id, assessor_id, criterion_id, level, passed, tactile_notes,
        photo_evidence_ref, hash_chained_ref, verified_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (session_id, criterion_id) DO UPDATE SET
        level = EXCLUDED.level,
        passed = EXCLUDED.passed,
        tactile_notes = EXCLUDED.tactile_notes,
        photo_evidence_ref = EXCLUDED.photo_evidence_ref,
        hash_chained_ref = EXCLUDED.hash_chained_ref,
        verified_at = NOW()
      RETURNING *;
    `,
      [
        input.sessionId,
        input.assessorId,
        input.criterionId,
        input.level,
        input.passed,
        input.tactileNotes.trim(),
        input.photoEvidenceRef || null,
        input.hashChainedRef || null,
      ],
      "assessor"
    );

    return res.rows[0];
  }
}

export const physicalVerificationService = new PhysicalVerificationService();
