import { NextRequest, NextResponse } from "next/server";
import { scoringService } from "@/lib/assessor/scoring-service";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    const criterionId = url.searchParams.get("criterionId");
    const assessorId = req.headers.get("x-user-id") || "22222222-2222-2222-2222-222222222222";
    const userRole = req.headers.get("x-user-role") || "assessor";

    if (!sessionId || !criterionId) {
      return NextResponse.json(
        { error: "sessionId and criterionId query parameters are required" },
        { status: 400 }
      );
    }

    // scoringService.getAiSuggestion enforces server-side that blind score must exist
    const suggestion = await scoringService.getAiSuggestion(
      sessionId,
      assessorId,
      criterionId,
      userRole
    );

    return NextResponse.json({
      success: true,
      suggestion,
    });
  } catch (error: any) {
    if (error.message.includes("BLIND_SCORE_REQUIRED")) {
      return NextResponse.json(
        {
          error: "BLIND_SCORE_REQUIRED",
          message: error.message,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
