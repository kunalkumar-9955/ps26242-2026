import { NextRequest, NextResponse } from "next/server";
import { physicalVerificationService } from "@/lib/assessor/physical-service";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const criteria = await physicalVerificationService.getPhysicalCriteriaForSession(sessionId);
    return NextResponse.json({ criteria });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const assessorId = req.headers.get("x-user-id") || "22222222-2222-2222-2222-222222222222";
    const body = await req.json();
    const { sessionId, criterionId, level, passed, tactileNotes, photoEvidenceRef, hashChainedRef } = body;

    if (!sessionId || !criterionId || level === undefined || !tactileNotes) {
      return NextResponse.json(
        { error: "sessionId, criterionId, level, and tactileNotes are required" },
        { status: 400 }
      );
    }

    const record = await physicalVerificationService.recordPhysicalCheck({
      sessionId,
      assessorId,
      criterionId,
      level,
      passed: passed !== false,
      tactileNotes,
      photoEvidenceRef,
      hashChainedRef,
    });

    return NextResponse.json({ success: true, verification: record });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
