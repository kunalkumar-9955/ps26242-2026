import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "admin";
    if (!["admin", "auditor"].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin or Auditor role required" }, { status: 403 });
    }

    const res = await query(`
      SELECT c.id, c.status, c.verify_slug, c.issued_at, c.expires_at, 
             c.revoked_at, c.revocation_reason, c.key_id, c.pseudonymous_id,
             c.worker_consent_public_display,
             q.name as qp_title, q.qp_code,
             p_cand.full_name as candidate_name,
             p_asst.full_name as assessor_name
      FROM credentials c
      JOIN qualifications q ON c.qualification_id = q.id
      JOIN candidates cand ON c.candidate_id = cand.id
      JOIN profiles p_cand ON cand.profile_id = p_cand.id
      JOIN assessment_sessions s ON c.session_id = s.id
      LEFT JOIN profiles p_asst ON s.assessor_id = p_asst.id
      ORDER BY c.issued_at DESC
      LIMIT 50;
    `);

    return NextResponse.json({ credentials: res.rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
