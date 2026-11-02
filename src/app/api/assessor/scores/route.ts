import { NextRequest, NextResponse } from "next/server";
import { scoringService } from "@/lib/assessor/scoring-service";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    const assessorId = req.headers.get("x-user-id") || "22222222-2222-2222-2222-222222222222";

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const res = await query(
      `
      SELECT id, criterion_id, level, rationale, is_blind, revised_after_ai, override_reason, created_at
      FROM scores
      WHERE session_id = $1 AND assessor_id = $2
      ORDER BY created_at ASC;
    `,
      [sessionId, assessorId]
    );

    return NextResponse.json({ scores: res.rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const assessorId = req.headers.get("x-user-id") || "22222222-2222-2222-2222-222222222222";
    const body = await req.json();
    const { sessionId, criterionId, level, rationale, isRevised, overrideReason } = body;

    if (!sessionId || !criterionId || level === undefined) {
      return NextResponse.json(
        { error: "sessionId, criterionId, and level are required" },
        { status: 400 }
      );
    }

    if (isRevised) {
      const record = await scoringService.submitRevisedScore({
        sessionId,
        assessorId,
        criterionId,
        revisedLevel: level,
        overrideReason: overrideReason || "",
      });
      return NextResponse.json({ success: true, score: record, type: "revised" });
    }

    const record = await scoringService.submitBlindScore({
      sessionId,
      assessorId,
      criterionId,
      level,
      rationale: rationale || "",
    });

    return NextResponse.json({ success: true, score: record, type: "blind" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
