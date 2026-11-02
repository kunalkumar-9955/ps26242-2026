import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role");

    // Enforce role authorization: Auditor and Admin only
    if (!userRole || !["admin", "auditor"].includes(userRole)) {
      return NextResponse.json(
        {
          error: "Forbidden: Only auditors and administrators can view security test run logs.",
        },
        { status: 403 }
      );
    }

    const runsRes = await query(`
      SELECT 
        id,
        run_number,
        runner_id,
        runner_role,
        scope,
        app_version,
        git_commit,
        overall_detection_rate,
        total_attacks,
        caught_count,
        not_detected_count,
        failed_count,
        duration_ms,
        summary_notes,
        created_at
      FROM security_test_runs
      ORDER BY run_number DESC
      LIMIT 50;
    `);

    return NextResponse.json({
      success: true,
      runs: runsRes.rows,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
