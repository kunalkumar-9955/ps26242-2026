import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { executeRetentionPurgeJob } from "@/lib/privacy/retention-service";

const UpdatePolicySchema = z.object({
  dataType: z.string(),
  retentionDays: z.number().int().min(1).max(3650),
  cryptoShredMedia: z.boolean().default(true),
  preserveChainHashes: z.boolean().default(true),
  legalNotes: z.string().optional(),
});

export async function GET() {
  try {
    const res = await query(
      `SELECT * FROM data_retention_policies ORDER BY data_type ASC`
    );
    return NextResponse.json({
      policies: res.rows,
      legalDisclaimer:
        "CRITICAL NOTICE: Default retention schedules are UNVERIFIED pending legal and compliance sign-off by MeitY / MSDE data protection committee. This system does not constitute legal counsel.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch retention policies", message: err.message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = UpdatePolicySchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { dataType, retentionDays, cryptoShredMedia, preserveChainHashes, legalNotes } =
      parsed.data;

    const res = await query(
      `UPDATE data_retention_policies
       SET retention_days = $1,
           crypto_shred_media = $2,
           preserve_chain_hashes = $3,
           legal_notes = COALESCE($4, legal_notes),
           updated_at = now()
       WHERE data_type = $5
       RETURNING *`,
      [retentionDays, cryptoShredMedia, preserveChainHashes, legalNotes, dataType]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, policy: res.rows[0] });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to update retention policy", message: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  // Purge trigger endpoint
  try {
    const result = await executeRetentionPurgeJob();
    return NextResponse.json({
      success: true,
      message: "Scheduled retention purge job completed",
      result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Purge execution failed", message: err.message },
      { status: 500 }
    );
  }
}
