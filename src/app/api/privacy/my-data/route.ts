import { NextRequest, NextResponse } from "next/server";
import { exportCandidateData } from "@/lib/privacy/retention-service";

export async function GET(req: NextRequest) {
  try {
    const candidateId = req.nextUrl.searchParams.get("candidateId");
    if (!candidateId) {
      return NextResponse.json({ error: "candidateId parameter is required" }, { status: 400 });
    }

    const dataExport = await exportCandidateData(candidateId);
    return NextResponse.json(dataExport);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to generate data export", message: err.message },
      { status: 500 }
    );
  }
}
