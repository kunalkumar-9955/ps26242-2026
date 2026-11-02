import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordCandidateConsent, getCandidateConsents } from "@/lib/privacy/retention-service";

const ConsentPostSchema = z.object({
  candidateId: z.string().uuid("Invalid candidate UUID format"),
  scope: z.string().min(3),
  language: z.enum(["hi", "en"]).default("hi"),
  version: z.string().default("1.0"),
  purpose: z.string().min(5),
  dataCollected: z.string().min(5),
  retentionNotice: z.string().min(5),
  granted: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = ConsentPostSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const consent = await recordCandidateConsent(parsed.data);
    return NextResponse.json({ success: true, consent }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Internal server error", message: err.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const candidateId = req.nextUrl.searchParams.get("candidateId");
    if (!candidateId) {
      return NextResponse.json({ error: "candidateId parameter is required" }, { status: 400 });
    }

    const consents = await getCandidateConsents(candidateId);
    return NextResponse.json({ candidateId, consents });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Internal server error", message: err.message },
      { status: 500 }
    );
  }
}
