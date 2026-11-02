import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const qpResult = await query(`
      SELECT 
        q.id,
        q.qp_code,
        q.nqr_code,
        q.name,
        q.nsqf_level,
        q.version,
        q.source_url,
        q.verified,
        q.is_synthetic,
        s.name as sector_name,
        s.code as sector_code
      FROM qualifications q
      LEFT JOIN sectors s ON q.sector_id = s.id
      ORDER BY q.qp_code ASC;
    `);

    if (qpResult.rows.length === 0) {
      return NextResponse.json({ qualifications: [] });
    }

    const qp = qpResult.rows[0];

    const nosResult = await query(
      `
      SELECT 
        id,
        code,
        title,
        is_core,
        theory_marks,
        practical_marks,
        source_url,
        verified
      FROM nos
      WHERE qualification_id = $1
      ORDER BY code ASC;
    `,
      [qp.id]
    );

    const criteriaResult = await query(
      `
      SELECT 
        nc.id,
        nc.nos_id,
        nc.criterion_code,
        nc.description,
        nc.assessable_from_video,
        nc.requires_physical,
        nc.weight,
        nc.rubric_level_1,
        nc.rubric_level_2,
        nc.rubric_level_3,
        nc.rubric_level_4,
        nc.verified,
        nc.status_label
      FROM nos_criteria nc
      JOIN nos n ON nc.nos_id = n.id
      WHERE n.qualification_id = $1
      ORDER BY nc.criterion_code ASC;
    `,
      [qp.id]
    );

    const settingsResult = await query(
      `SELECT key, value, verified, note FROM platform_settings WHERE key = 'pass_threshold_percent';`
    );

    // Map into structure
    const nosList = nosResult.rows.map((n) => ({
      ...n,
      criteria: criteriaResult.rows.filter((c) => c.nos_id === n.id),
    }));

    return NextResponse.json({
      qualification: {
        ...qp,
        passThresholdSetting: settingsResult.rows[0] || null,
        nosList,
      },
    });
  } catch (error: any) {
    console.error("Failed to fetch qualifications:", error);
    return NextResponse.json(
      { error: "Internal Server Error fetching qualifications", details: error.message },
      { status: 500 }
    );
  }
}
