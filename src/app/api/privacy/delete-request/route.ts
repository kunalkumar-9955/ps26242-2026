import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { executeDataDeletionCryptoShredding } from "@/lib/privacy/retention-service";

const DeleteRequestSchema = z.object({
  candidateId: z.string().uuid("Invalid candidate UUID format"),
  reason: z.string().min(3).default("Worker requested erasure under DPDP Act 2023"),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = DeleteRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await executeDataDeletionCryptoShredding(
      parsed.data.candidateId,
      parsed.data.reason
    );

    return NextResponse.json({
      success: true,
      message: "Data deletion executed via crypto-shredding. Media blobs wiped; immutable hashes preserved.",
      result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to execute deletion request", message: err.message },
      { status: 500 }
    );
  }
}
