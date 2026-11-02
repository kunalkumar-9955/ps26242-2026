import { NextRequest, NextResponse } from "next/server";
import { auditorService } from "@/lib/analytics/auditor-service";

export async function POST(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "auditor";
    const auditorId = req.headers.get("x-user-id") || "00000000-0000-0000-0000-000000000001";

    if (!["auditor", "admin"].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden: Auditor or Admin role required." }, { status: 403 });
    }

    const body = await req.json();
    const { sessionId, reason, flagId } = body;

    if (!sessionId || !reason) {
      return NextResponse.json(
        { error: "sessionId and mandatory reason justification are required" },
        { status: 400 }
      );
    }

    const logEntry = await auditorService.logAuditorRawAccess(auditorId, sessionId, reason, flagId);
    return NextResponse.json({ success: true, logEntry });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
