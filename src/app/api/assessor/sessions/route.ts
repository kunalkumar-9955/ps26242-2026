import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { scoringService } from "@/lib/assessor/scoring-service";
import { calibrationService } from "@/lib/assessor/calibration-service";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    const assessorId = req.headers.get("x-user-id") || "22222222-2222-2222-2222-222222222222";
    const userRole = req.headers.get("x-user-role") || "assessor";

    // Check calibration gate for this assessor
    const cert = await calibrationService.checkAssessorCertification(assessorId);

    // If specific session requested
    if (sessionId) {
      const sessionRes = await query(
        `
        SELECT 
          s.id,
          s.status,
          s.started_at,
          s.completed_at,
          s.is_synthetic,
          c.id as candidate_id,
          p.full_name as candidate_name,
          p.phone as candidate_phone,
          c.aadhaar_masked,
          c.state,
          c.district,
          q.id as qualification_id,
          q.qp_code,
          q.name as qualification_name
        FROM assessment_sessions s
        JOIN candidates c ON s.candidate_id = c.id
        JOIN profiles p ON c.profile_id = p.id
        JOIN qualifications q ON c.qualification_id = q.id
        WHERE s.id = $1 AND (s.assessor_id = $2 OR $3 IN ('admin', 'auditor'))
        LIMIT 1;
      `,
        [sessionId, assessorId, userRole]
      );

      if (sessionRes.rows.length === 0) {
        return NextResponse.json(
          { error: "Assessment session not found or not assigned to this assessor." },
          { status: 404 }
        );
      }

      const session = sessionRes.rows[0];

      // Fetch evidence items for video player
      const evidenceRes = await query(
        `
        SELECT id, blob_ref, chain_index, sha256, device_captured_at, liveness_result, sealed_at
        FROM evidence_items
        WHERE session_id = $1
        ORDER BY chain_index ASC;
      `,
        [sessionId]
      );

      // Fetch criteria
      const criteriaRes = await query(
        `
        SELECT 
          c.id,
          c.criterion_code,
          c.description,
          c.weight,
          c.assessable_from_video,
          c.requires_physical,
          c.rubric_level_1,
          c.rubric_level_2,
          c.rubric_level_3,
          c.rubric_level_4,
          n.code as nos_code,
          n.title as nos_title
        FROM nos_criteria c
        JOIN nos n ON c.nos_id = n.id
        WHERE n.qualification_id = $1
        ORDER BY n.code ASC, c.criterion_code ASC;
      `,
        [session.qualification_id]
      );

      // Fetch existing scores by this assessor
      const scoresRes = await query(
        `
        SELECT id, criterion_id, level, rationale, is_blind, revised_after_ai, override_reason, created_at
        FROM scores
        WHERE session_id = $1 AND assessor_id = $2
        ORDER BY created_at ASC;
      `,
        [sessionId, assessorId]
      );

      return NextResponse.json({
        session,
        evidence: evidenceRes.rows,
        criteria: criteriaRes.rows,
        scores: scoresRes.rows,
        certification: cert,
      });
    }

    // List all assigned sessions for this assessor
    const listRes = await query(
      `
      SELECT 
        s.id,
        s.status,
        s.started_at,
        s.completed_at,
        s.is_synthetic,
        c.id as candidate_id,
        p.full_name as candidate_name,
        c.aadhaar_masked,
        c.district,
        q.qp_code,
        q.name as qualification_name,
        r.final_assessor_outcome
      FROM assessment_sessions s
      JOIN candidates c ON s.candidate_id = c.id
      JOIN profiles p ON c.profile_id = p.id
      JOIN qualifications q ON c.qualification_id = q.id
      LEFT JOIN recommendations r ON r.session_id = s.id
      WHERE (s.assessor_id = $1 OR $2 IN ('admin', 'auditor'))
      ORDER BY s.started_at DESC;
    `,
      [assessorId, userRole]
    );

    const stats = await scoringService.getAssessorSelfViewStats(assessorId);

    return NextResponse.json({
      sessions: listRes.rows,
      certification: cert,
      stats,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
