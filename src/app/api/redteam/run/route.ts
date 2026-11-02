import { NextRequest, NextResponse } from "next/server";
import { redTeamRunner } from "@/lib/redteam/runner";

// Simple rate limiter tracking last execution per runner
const lastRunTimestamps = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 5000; // 5 seconds cooldown

export async function POST(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role");
    const userId = req.headers.get("x-user-id") || "33333333-3333-3333-3333-333333333333";

    // Enforce role authorization: Auditor and Admin only
    if (!userRole || !["admin", "auditor"].includes(userRole)) {
      return NextResponse.json(
        {
          error: "Forbidden: Red-Team Mode requires authenticated 'admin' or 'auditor' role.",
          roleReceived: userRole || "anonymous",
        },
        { status: 403 }
      );
    }

    // Rate limiting check
    const now = Date.now();
    const lastRun = lastRunTimestamps.get(userId) || 0;
    if (now - lastRun < RATE_LIMIT_WINDOW_MS) {
      const waitSeconds = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - lastRun)) / 1000);
      return NextResponse.json(
        {
          error: `Rate limit exceeded: Please wait ${waitSeconds}s before initiating another full Red-Team execution.`,
          retryAfterSeconds: waitSeconds,
        },
        { status: 429 }
      );
    }
    lastRunTimestamps.set(userId, now);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is allowed, default sandbox session is used
    }

    const sessionId = body?.sessionId || redTeamRunner.SANDBOX_SESSION_ID;

    // Safety guard is internally enforced within executeFullSuite
    const runRecord = await redTeamRunner.executeFullSuite(
      userId,
      userRole as "admin" | "auditor",
      sessionId
    );

    return NextResponse.json({
      success: true,
      run: runRecord,
    });
  } catch (error: any) {
    const status = error.message?.includes("Forbidden") || error.message?.includes("Real candidate") ? 403 : 500;
    return NextResponse.json(
      {
        error: error.message || "Red-Team execution failed.",
      },
      { status }
    );
  }
}
