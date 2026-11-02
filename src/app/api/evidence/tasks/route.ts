import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const res = await query(`
      SELECT 
        id,
        qualification_id,
        title,
        nos_code,
        description,
        instructions_hi,
        instructions_en,
        challenge_type,
        duration_seconds,
        variants,
        verified,
        status_label
      FROM tasks
      ORDER BY id ASC;
    `);

    // Also get or create active demo assessment session
    let sessionRes = await query("SELECT id, candidate_id, status FROM assessment_sessions LIMIT 1;");
    let sessionId = sessionRes.rows[0]?.id;

    if (!sessionId) {
      const candRes = await query("SELECT id FROM candidates LIMIT 1;");
      const candId = candRes.rows[0]?.id;
      if (candId) {
        const newSession = await query(
          "INSERT INTO assessment_sessions (candidate_id, status, is_synthetic) VALUES ($1, 'in_progress', true) RETURNING id;",
          [candId]
        );
        sessionId = newSession.rows[0].id;
      }
    }

    return NextResponse.json({
      tasks: res.rows,
      sessionId: sessionId || "00000000-0000-0000-0000-000000000001",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch task templates", details: error.message },
      { status: 500 }
    );
  }
}
