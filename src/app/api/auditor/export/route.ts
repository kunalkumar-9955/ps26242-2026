import { NextRequest, NextResponse } from "next/server";
import { auditorService } from "@/lib/analytics/auditor-service";

export async function GET(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "auditor";
    if (!["auditor", "admin"].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden: Auditor or Admin role required." }, { status: 403 });
    }

    const url = new URL(req.url);
    const format = (url.searchParams.get("format") as "json" | "csv") || "json";
    const dataSource = (url.searchParams.get("dataSource") as "real" | "synthetic" | "all") || "all";

    const exportResult = await auditorService.exportAuditorData(format, { dataSource });

    return new NextResponse(exportResult.data, {
      status: 200,
      headers: {
        "Content-Type": exportResult.contentType,
        "Content-Disposition": `attachment; filename="${exportResult.filename}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
