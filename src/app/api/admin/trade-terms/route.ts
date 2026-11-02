import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { logAuditEvent } from "@/lib/db/audit";

export async function GET(req: NextRequest) {
  try {
    const res = await query(`
      SELECT 
        id,
        qualification_id,
        vernacular_term,
        standard_english_task,
        language,
        verified,
        status_label,
        created_at
      FROM trade_terms
      ORDER BY created_at DESC;
    `);

    return NextResponse.json({ tradeTerms: res.rows });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch trade terms", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "anon";
    const actorId = req.headers.get("x-user-id") || undefined;

    // Role check: Only admin can insert/modify standards
    if (userRole !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Only platform administrators can add trade terms." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { qualificationId, vernacularTerm, standardEnglishTask, language } = body;

    if (!vernacularTerm || !standardEnglishTask) {
      return NextResponse.json(
        { error: "Both vernacularTerm and standardEnglishTask are required." },
        { status: 400 }
      );
    }

    // Default to first qualification if not specified
    let targetQpId = qualificationId;
    if (!targetQpId) {
      const qpRes = await query("SELECT id FROM qualifications LIMIT 1");
      if (qpRes.rows.length > 0) {
        targetQpId = qpRes.rows[0].id;
      }
    }

    // Insert into DB with verified = false (authored draft)
    const insertRes = await query(
      `
      INSERT INTO trade_terms (
        qualification_id,
        vernacular_term,
        standard_english_task,
        language,
        verified,
        status_label
      ) VALUES ($1, $2, $3, $4, false, 'draft - needs assessor review')
      ON CONFLICT (qualification_id, vernacular_term) DO UPDATE SET
        standard_english_task = EXCLUDED.standard_english_task,
        verified = false,
        status_label = 'draft - needs assessor review'
      RETURNING *;
    `,
      [targetQpId, vernacularTerm, standardEnglishTask, language || "hi"],
      userRole
    );

    const createdTerm = insertRes.rows[0];

    // Cryptographically record in audit_log
    await logAuditEvent({
      entityName: "TRADE_TERMS",
      entityId: createdTerm.id,
      action: "CREATE",
      actorId: actorId,
      actorRole: "admin",
      beforeState: null,
      afterState: createdTerm,
      metadata: { source: "admin_ui_slang_manager" },
    });

    return NextResponse.json({ term: createdTerm });
  } catch (error: any) {
    console.error("Failed to add trade term:", error);
    return NextResponse.json(
      { error: "Database error creating trade term", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "anon";
    const actorId = req.headers.get("x-user-id") || undefined;

    if (userRole !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Only platform administrators can delete trade terms." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing term id" }, { status: 400 });
    }

    // Fetch existing before state
    const existing = await query("SELECT * FROM trade_terms WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Term not found" }, { status: 404 });
    }
    const beforeState = existing.rows[0];

    // Delete row
    await query("DELETE FROM trade_terms WHERE id = $1", [id], userRole);

    // Cryptographically record in audit_log
    await logAuditEvent({
      entityName: "TRADE_TERMS",
      entityId: id,
      action: "DELETE",
      actorId: actorId,
      actorRole: "admin",
      beforeState,
      afterState: null,
      metadata: { source: "admin_ui_slang_manager" },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Database error deleting trade term", details: error.message },
      { status: 500 }
    );
  }
}
