import { NextRequest, NextResponse } from "next/server";
import { serverVerificationPipeline } from "@/lib/evidence/server-verifier";
import { EvidencePayload } from "@/lib/evidence/integrity";
import { query } from "@/lib/db";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "worker";
    const body = await req.json();

    const { action, idempotencyKey, payload, chunkIndex, totalChunks, uploadId, chunkData } = body;

    // 1. Resumable Chunk Staging
    if (action === "upload_chunk") {
      if (!uploadId || chunkIndex === undefined || !totalChunks || !chunkData) {
        return NextResponse.json(
          { error: "uploadId, chunkIndex, totalChunks, and chunkData are required for chunked upload" },
          { status: 400 }
        );
      }

      const chunkHash = crypto.createHash("sha256").update(chunkData).digest("hex");

      // Save chunk
      await query(
        `
        INSERT INTO evidence_chunks (upload_id, chunk_index, total_chunks, chunk_hash, chunk_data)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (upload_id, chunk_index) DO UPDATE
        SET chunk_hash = EXCLUDED.chunk_hash, chunk_data = EXCLUDED.chunk_data;
      `,
        [uploadId, chunkIndex, totalChunks, chunkHash, chunkData]
      );

      // Check how many chunks have been received
      const chunksCountRes = await query(
        `SELECT COUNT(*) as count FROM evidence_chunks WHERE upload_id = $1`,
        [uploadId]
      );
      const receivedCount = parseInt(chunksCountRes.rows[0].count, 10);

      const isComplete = receivedCount >= totalChunks;
      return NextResponse.json({
        success: true,
        uploadId,
        chunkIndex,
        receivedCount,
        totalChunks,
        isComplete,
      });
    }

    // 2. Declaration Sync
    if (body.type === "declaration") {
      const decl = body.payload;
      if (!decl || !decl.candidateId) {
        return NextResponse.json({ error: "Invalid declaration payload" }, { status: 400 });
      }

      const existingDecl = await query(
        `SELECT id, created_at FROM declarations WHERE id = $1 LIMIT 1`,
        [decl.id]
      );

      if (existingDecl.rows.length > 0) {
        return NextResponse.json({
          success: true,
          id: existingDecl.rows[0].id,
          idempotent: true,
        });
      }

      const insertDecl = await query(
        `
        INSERT INTO declarations (id, candidate_id, raw_transcript, language, audio_ref, structured_extraction)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
        RETURNING id;
      `,
        [
          decl.id,
          decl.candidateId,
          decl.rawTranscript || "",
          decl.language || "hi",
          decl.audioRef || null,
          JSON.stringify(decl.structuredExtraction || {}),
        ]
      );

      return NextResponse.json({
        success: true,
        id: insertDecl.rows[0]?.id || decl.id,
        idempotent: false,
      });
    }

    // 3. Evidence Sync (with Idempotency Key)
    const evidencePayload: EvidencePayload = payload || body;

    if (!evidencePayload.sessionId || !evidencePayload.taskId) {
      return NextResponse.json(
        { error: "sessionId and taskId are mandatory fields" },
        { status: 400 }
      );
    }

    // Check Idempotency Key Store
    const effectiveIdempotencyKey =
      idempotencyKey || evidencePayload.idempotencyKey;

    if (effectiveIdempotencyKey) {
      const cachedRes = await query(
        `SELECT response_payload FROM idempotency_keys WHERE key = $1 LIMIT 1`,
        [effectiveIdempotencyKey]
      );

      if (cachedRes.rows.length > 0) {
        return NextResponse.json({
          success: true,
          result: cachedRes.rows[0].response_payload,
          idempotent: true,
        });
      }
    }

    // If resumable chunked upload completed, assemble blob data if needed
    if (uploadId) {
      const allChunks = await query(
        `SELECT chunk_data FROM evidence_chunks WHERE upload_id = $1 ORDER BY chunk_index ASC`,
        [uploadId]
      );
      if (allChunks.rows.length > 0) {
        const fullData = allChunks.rows.map((r) => r.chunk_data).join("");
        evidencePayload.blobDataUrl = fullData;
        // Clean up staged chunks
        await query(`DELETE FROM evidence_chunks WHERE upload_id = $1`, [uploadId]);
      }
    }

    // Pass through 8-point verification pipeline
    evidencePayload.idempotencyKey = effectiveIdempotencyKey;
    const verificationResult = await serverVerificationPipeline.verifyAndSealEvidence(
      evidencePayload,
      userRole
    );

    // Cache in idempotency_keys table
    if (effectiveIdempotencyKey) {
      const reqHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(evidencePayload))
        .digest("hex");

      await query(
        `
        INSERT INTO idempotency_keys (key, endpoint, request_hash, response_payload)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (key) DO NOTHING;
      `,
        [
          effectiveIdempotencyKey,
          "/api/evidence/sync",
          reqHash,
          JSON.stringify(verificationResult),
        ]
      );
    }

    return NextResponse.json({
      success: true,
      result: verificationResult,
      idempotent: false,
    });
  } catch (error: any) {
    console.error("Sync API error:", error);
    return NextResponse.json(
      { error: "Sync pipeline error", details: error.message },
      { status: 500 }
    );
  }
}
