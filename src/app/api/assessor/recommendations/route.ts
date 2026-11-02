import { NextRequest, NextResponse } from "next/server";
import { scoringService } from "@/lib/assessor/scoring-service";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const outcome = await scoringService.calculateSessionOutcome(sessionId);

    const recRes = await query(
      "SELECT * FROM recommendations WHERE session_id = $1 LIMIT 1",
      [sessionId]
    );

    return NextResponse.json({
      outcome,
      recommendation: recRes.rows[0] || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const assessorId = req.headers.get("x-user-id") || "22222222-2222-2222-2222-222222222222";
    const body = await req.json();
    const { sessionId, systemDraftOutcome, finalOutcome, overrideReason } = body;

    if (!sessionId || !systemDraftOutcome || !finalOutcome) {
      return NextResponse.json(
        { error: "sessionId, systemDraftOutcome, and finalOutcome are required" },
        { status: 400 }
      );
    }

    const record = await scoringService.signoffRecommendation(
      sessionId,
      assessorId,
      systemDraftOutcome,
      finalOutcome,
      overrideReason
    );

    return NextResponse.json({
      success: true,
      recommendation: record,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
