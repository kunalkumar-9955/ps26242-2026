import { NextRequest, NextResponse } from "next/server";
import { serverVerificationPipeline } from "@/lib/evidence/server-verifier";
import { EvidencePayload } from "@/lib/evidence/integrity";

export async function POST(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "worker";
    const body: EvidencePayload = await req.json();

    if (!body.sessionId || !body.taskId || !body.challengeNonce) {
      return NextResponse.json(
        { error: "sessionId, taskId, and challengeNonce are mandatory fields" },
        { status: 400 }
      );
    }

    const verificationResult = await serverVerificationPipeline.verifyAndSealEvidence(
      body,
      userRole
    );

    return NextResponse.json({
      success: true,
      result: verificationResult,
    });
  } catch (error: any) {
    console.error("Evidence verification & sealing error:", error);
    return NextResponse.json(
      { error: "Evidence pipeline error", details: error.message },
      { status: 500 }
    );
  }
}
