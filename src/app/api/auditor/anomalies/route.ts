import { NextRequest, NextResponse } from "next/server";
import { auditorService } from "@/lib/analytics/auditor-service";

export async function GET(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "auditor";
    if (!["auditor", "admin"].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden: Auditor or Admin role required." }, { status: 403 });
    }

    const anomalies = await auditorService.detectAssessorAnomalies();
    return NextResponse.json({ anomalies });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "auditor";
    const auditorId = req.headers.get("x-user-id") || "00000000-0000-0000-0000-000000000001";

    if (!["auditor", "admin"].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden: Auditor or Admin role required." }, { status: 403 });
    }

    const body = await req.json();
    const { anomalyId, resolutionNote } = body;

    if (!anomalyId || !resolutionNote) {
      return NextResponse.json(
        { error: "anomalyId and resolutionNote are required" },
        { status: 400 }
      );
    }

    const result = await auditorService.resolveAnomaly(anomalyId, auditorId, resolutionNote);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
