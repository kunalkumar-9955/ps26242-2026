import { NextRequest, NextResponse } from "next/server";
import { auditorService } from "@/lib/analytics/auditor-service";

export async function GET(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "auditor";
    if (!["auditor", "admin"].includes(userRole)) {
      return NextResponse.json(
        { error: "Forbidden: Auditor or Admin role required." },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const dataSource = (url.searchParams.get("dataSource") as "real" | "synthetic" | "all") || "all";

    const overview = await auditorService.getReliabilityOverview({ dataSource });
    const perCriterion = await auditorService.getPerCriterionReliability({ dataSource });
    const pairMatrix = await auditorService.getAssessorPairMatrix({ dataSource });
    const controlledComparison = await auditorService.getControlledComparison();

    return NextResponse.json({
      overview,
      perCriterion,
      pairMatrix,
      controlledComparison,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
