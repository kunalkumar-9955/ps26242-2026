import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const candidateId = "11111111-1111-1111-1111-111111111111"; // Default candidate for worker UI

    const res = await query(
      `
      SELECT c.*, 
             q.name as qp_title, q.qp_code, q.nqr_code, q.nsqf_level,
             p_asst.full_name as signing_assessor_name
      FROM credentials c
      JOIN qualifications q ON c.qualification_id = q.id
      JOIN assessment_sessions s ON c.session_id = s.id
      LEFT JOIN profiles p_asst ON s.assessor_id = p_asst.id
      ORDER BY c.issued_at DESC
      LIMIT 1;
    `
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "No credentials found for worker" }, { status: 404 });
    }

    const row = res.rows[0];
    const payload = row.verifiable_payload || {};

    return NextResponse.json({
      credential: {
        id: row.id,
        verifySlug: row.verify_slug,
        status: row.status,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        qpTitle: row.qp_title || "Assistant Electrician",
        qpCode: row.qp_code || "CON/Q0602",
        nqrCode: row.nqr_code || "QG-03-CO-03951-2025-V2-CSDCI",
        nsqfLevel: row.nsqf_level || 3,
        overallRecommendation: payload.credentialSubject?.overallRecommendation || "competent",
        signingAssessorName: row.signing_assessor_name || "Er. Sunita Verma",
        workerConsent: row.worker_consent_public_display || false,
        disclaimerNotice:
          row.disclaimer_notice ||
          "Assessment support record. Not an official NCVET/NSDC certificate unless issued by an accredited body.",
        pseudonymousId: row.pseudonymous_id || "cand_pseudo_unknown",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
