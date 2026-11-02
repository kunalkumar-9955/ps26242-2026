import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "anon";

    // Strict role gating: Only admin and auditor can inspect audit_log
    if (!["admin", "auditor"].includes(userRole)) {
      return NextResponse.json(
        { error: "Forbidden: Only Administrators and Auditors may access the cryptographic audit log." },
        { status: 403 }
      );
    }

    const res = await query(
      `
      SELECT 
        id,
        entity_name,
        entity_id,
        action,
        actor_id,
        actor_role,
        before_state,
        after_state,
        prev_hash,
        curr_hash,
        metadata,
        created_at
      FROM audit_log
      ORDER BY id DESC
      LIMIT 25;
    `,
      [],
      userRole
    );

    return NextResponse.json({ auditLogs: res.rows });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch audit log", details: error.message },
      { status: 500 }
    );
  }
}
