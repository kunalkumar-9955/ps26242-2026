import { NextRequest, NextResponse } from "next/server";
import { challengeService, ChallengeKind } from "@/lib/evidence/challenge-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, taskId, type, batch, taskIds, countPerTask, ttlSeconds } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    // Support batch prefetching for offline use
    if (batch && Array.isArray(taskIds)) {
      const challenges = await challengeService.batchPrefetchChallenges(
        sessionId,
        taskIds,
        countPerTask || 2,
        ttlSeconds || 3600
      );
      return NextResponse.json({ challenges, isBatch: true });
    }

    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const challenge = await challengeService.issueChallenge(
      sessionId,
      taskId,
      (type as ChallengeKind) || "code_on_camera",
      ttlSeconds || 900
    );

    return NextResponse.json({ challenge });
  } catch (error: any) {
    console.error("Challenge issuance error:", error);
    return NextResponse.json(
      { error: "Failed to issue challenge", details: error.message },
      { status: 500 }
    );
  }
}
