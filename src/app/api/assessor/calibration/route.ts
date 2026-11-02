import { NextRequest, NextResponse } from "next/server";
import { calibrationService } from "@/lib/assessor/calibration-service";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const assessorId = req.headers.get("x-user-id") || "22222222-2222-2222-2222-222222222222";
    const status = await calibrationService.checkAssessorCertification(assessorId);

    const clipsRes = await query(`
      SELECT id, title, clip_ref, source, expert_name, criterion_scores, synthetic
      FROM gold_standard_clips
      ORDER BY created_at ASC;
    `);

    return NextResponse.json({
      assessorId,
      certification: status,
      goldClips: clipsRes.rows,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const assessorId = req.headers.get("x-user-id") || "22222222-2222-2222-2222-222222222222";
    const body = await req.json();
    const { goldClipId, submittedScores } = body;

    if (!goldClipId || !Array.isArray(submittedScores) || submittedScores.length === 0) {
      return NextResponse.json(
        { error: "goldClipId and submittedScores array are required" },
        { status: 400 }
      );
    }

    const result = await calibrationService.evaluateCalibration(
      assessorId,
      goldClipId,
      submittedScores
    );

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
