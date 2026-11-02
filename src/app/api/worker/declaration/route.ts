import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { llmExtractionService } from "@/lib/llm";

export async function POST(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "worker";
    const body = await req.json();
    const { rawTranscript, language, candidateId: explicitCandidateId } = body;

    if (!rawTranscript || typeof rawTranscript !== "string") {
      return NextResponse.json(
        { error: "Valid raw transcript string is required" },
        { status: 400 }
      );
    }

    // Resolve or create a demo candidate row in PostgreSQL if explicitCandidateId not provided
    let candidateId = explicitCandidateId;
    if (!candidateId) {
      // Find candidate linked to Ramesh Sharma (or first candidate)
      const candRes = await query("SELECT id FROM candidates LIMIT 1;");
      if (candRes.rows.length > 0) {
        candidateId = candRes.rows[0].id;
      } else {
        // Create candidate row for CON/Q0602
        const qpRes = await query("SELECT id FROM qualifications WHERE qp_code = 'CON/Q0602' LIMIT 1;");
        const profRes = await query("SELECT id FROM profiles WHERE role = 'worker' LIMIT 1;");
        if (qpRes.rows.length > 0 && profRes.rows.length > 0) {
          const newCand = await query(
            `
            INSERT INTO candidates (profile_id, qualification_id, aadhaar_masked, state, district, is_synthetic)
            VALUES ($1, $2, 'XXXX-XXXX-1234', 'Uttar Pradesh', 'Lucknow', true)
            RETURNING id;
          `,
            [profRes.rows[0].id, qpRes.rows[0].id]
          );
          candidateId = newCand.rows[0].id;
        }
      }
    }

    // Run LLM Extraction with strict anti-hallucination and Zod validation
    const { extraction, gapReport, aiEventId, isMock } =
      await llmExtractionService.extractNOSCoverage(rawTranscript, candidateId);

    // Save declaration in declarations table
    let declarationId = null;
    if (candidateId) {
      const declRes = await query(
        `
        INSERT INTO declarations (
          candidate_id,
          raw_transcript,
          language,
          structured_extraction,
          per_nos_coverage,
          ai_event_id
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id;
      `,
        [
          candidateId,
          rawTranscript,
          language || "hi",
          JSON.stringify(extraction),
          JSON.stringify(extraction.nosCoverage),
          aiEventId,
        ],
        userRole
      );
      declarationId = declRes.rows[0].id;

      // Save or update gap_reports rows in PostgreSQL
      for (const item of gapReport) {
        await query(
          `
          INSERT INTO gap_reports (
            candidate_id,
            nos_id,
            status,
            recommended_bridge_hours,
            rationale_text
          ) VALUES ($1, $2, $3, $4, $5);
        `,
          [
            candidateId,
            item.nosId,
            item.status,
            item.recommendedBridgeHours,
            item.rationaleText,
          ],
          userRole
        );
      }
    }

    return NextResponse.json({
      declarationId,
      candidateId,
      extraction,
      gapReport,
      isMock,
      aiEventId,
    });
  } catch (error: any) {
    console.error("Worker declaration error:", error);
    return NextResponse.json(
      { error: "Failed to process voice declaration", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "worker";
    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get("candidateId");

    // Fetch latest declaration and gap report
    const declRes = await query(
      `
      SELECT 
        d.id,
        d.raw_transcript,
        d.language,
        d.structured_extraction,
        d.per_nos_coverage,
        d.created_at
      FROM declarations d
      ${candidateId ? "WHERE d.candidate_id = $1" : ""}
      ORDER BY d.created_at DESC
      LIMIT 1;
    `,
      candidateId ? [candidateId] : [],
      userRole
    );

    const gapRes = await query(
      `
      SELECT 
        gr.id,
        gr.status,
        gr.recommended_bridge_hours,
        gr.rationale_text,
        n.code as nos_code,
        n.title as nos_title
      FROM gap_reports gr
      JOIN nos n ON gr.nos_id = n.id
      ${candidateId ? "WHERE gr.candidate_id = $1" : ""}
      ORDER BY n.code ASC;
    `,
      candidateId ? [candidateId] : [],
      userRole
    );

    return NextResponse.json({
      latestDeclaration: declRes.rows[0] || null,
      gapReports: gapRes.rows,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch declaration data", details: error.message },
      { status: 500 }
    );
  }
}
