import { NextRequest, NextResponse } from "next/server";
import { auditorService } from "@/lib/analytics/auditor-service";

export async function GET(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "auditor";
    if (!["auditor", "admin"].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden: Auditor or Admin role required." }, { status: 403 });
    }

    const summary = await auditorService.getEvidenceIntegritySummary();
    return NextResponse.json(summary);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
