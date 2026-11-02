import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { logAuditEvent } from "@/lib/db/audit";

export async function GET(req: NextRequest) {
  try {
    const res = await query(`
      SELECT 
        g.id,
        g.qualification_id,
        g.title,
        g.clip_ref,
        g.source,
        g.expert_name,
        g.criterion_scores,
        g.synthetic,
        g.created_at,
        q.qp_code,
        q.name as qualification_name
      FROM gold_standard_clips g
      LEFT JOIN qualifications q ON g.qualification_id = q.id
      ORDER BY g.created_at DESC;
    `);

    return NextResponse.json({ goldClips: res.rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "admin";
    const actorId = req.headers.get("x-user-id") || undefined;

    if (!["admin", "auditor"].includes(userRole)) {
      return NextResponse.json({ error: "Unauthorized: Admin privileges required." }, { status: 403 });
    }

    const body = await req.json();
    const { qualificationId, title, clipRef, source, expertName, criterionScores, synthetic } = body;

    if (!qualificationId || !title || !clipRef || !expertName || !Array.isArray(criterionScores)) {
      return NextResponse.json(
        { error: "qualificationId, title, clipRef, expertName, and criterionScores array are required" },
        { status: 400 }
      );
    }

    const insertRes = await query(
      `
      INSERT INTO gold_standard_clips (
        qualification_id, title, clip_ref, source, expert_name, criterion_scores, synthetic
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `,
      [
        qualificationId,
        title,
        clipRef,
        source || "MSDE / CSDCI Benchmark Workshop",
        expertName,
        JSON.stringify(criterionScores),
        synthetic ?? false,
      ]
    );

    const newClip = insertRes.rows[0];

    // Audit log entry
    await logAuditEvent({
      entityName: "GOLD_STANDARD_CLIPS",
      entityId: newClip.id,
      action: "CREATE",
      actorId: actorId,
      actorRole: "admin",
      beforeState: null,
      afterState: newClip,
    });

    return NextResponse.json({ success: true, goldClip: newClip });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
