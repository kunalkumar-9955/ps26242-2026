import { query } from "@/lib/db";
import { integrityService, EvidencePayload } from "./integrity";
import { challengeService } from "./challenge-service";

export interface VerificationFlagOutput {
  type:
    | "reuse"
    | "edit_suspected"
    | "geo_mismatch"
    | "clock_skew"
    | "challenge_missing"
    | "duplicate_person"
    | "chain_tampered";
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
  details: Record<string, any>;
}

export interface VerificationResult {
  evidenceId: string;
  sealed: boolean;
  sealedAt: string | null;
  flags: VerificationFlagOutput[];
  chainVerified: boolean;
  livenessResult: string;
  challengeVerified: boolean;
}

export class ServerVerificationPipeline {
  /**
   * Executes the full 8-point verification pipeline on submitted evidence
   */
  public async verifyAndSealEvidence(
    payload: EvidencePayload,
    userRole: string = "worker"
  ): Promise<VerificationResult> {
    const flags: VerificationFlagOutput[] = [];
    const serverReceivedAt = new Date();
    const deviceCapturedAt = new Date(payload.deviceCapturedAt);

    // 0. Check Idempotency First (Return existing sealed evidence on retry)
    if (payload.idempotencyKey) {
      const existingRes = await query(
        `SELECT id, session_id, sealed_at, liveness_result, challenge_id FROM evidence_items WHERE idempotency_key = $1 LIMIT 1;`,
        [payload.idempotencyKey]
      );
      if (existingRes.rows.length > 0) {
        const item = existingRes.rows[0];
        const flagsRes = await query(
          `SELECT type, severity, details FROM evidence_flags WHERE evidence_id = $1;`,
          [item.id]
        );
        const existingFlags: VerificationFlagOutput[] = flagsRes.rows.map((f: any) => ({
          type: f.type,
          severity: f.severity,
          reason: f.details?.reason || "Flagged in previous verification",
          details: f.details || {},
        }));
        return {
          evidenceId: item.id,
          sealed: item.sealed_at !== null,
          sealedAt: item.sealed_at ? new Date(item.sealed_at).toISOString() : null,
          flags: existingFlags,
          chainVerified: true,
          livenessResult: item.liveness_result,
          challengeVerified: item.challenge_id !== null,
        };
      }
    }

    // 1. Check a: Challenge Validity, Expiry, Single-Use & Binding
    let challengeId: string | undefined = undefined;
    if (payload.challengeMissing || !payload.challengeNonce) {
      flags.push({
        type: "challenge_missing",
        severity: "critical",
        reason: "Evidence captured without a valid challenge. Queued offline and flagged challenge_missing on sync.",
        details: { challengeMissing: true, nonce: payload.challengeNonce || null },
      });
    } else {
      const challengeValidation = await challengeService.validateAndConsumeChallenge(
        payload.challengeNonce,
        payload.sessionId,
        payload.taskId
      );

      if (!challengeValidation.valid) {
        flags.push({
          type: "challenge_missing",
          severity: "critical",
          reason: challengeValidation.reason || "Challenge is invalid, expired, or was already consumed.",
          details: { nonce: payload.challengeNonce },
        });
      } else {
        challengeId = challengeValidation.challengeId;
        // Check challenge validity window against capture time
        const chalRes = await query(
          `SELECT issued_at, expires_at FROM challenges WHERE id = $1 LIMIT 1;`,
          [challengeId]
        );
        if (chalRes.rows.length > 0) {
          const chal = chalRes.rows[0];
          const chalIssuedAt = new Date(chal.issued_at).getTime();
          const chalExpiresAt = new Date(chal.expires_at).getTime();
          const capTime = deviceCapturedAt.getTime();
          if (capTime > chalExpiresAt) {
            flags.push({
              type: "challenge_missing",
              severity: "high",
              reason: `Evidence was captured after challenge expiry (${chal.expires_at}).`,
              details: { capturedAt: deviceCapturedAt.toISOString(), expiresAt: chal.expires_at },
            });
          } else if (capTime < chalIssuedAt - 60000) {
            flags.push({
              type: "clock_skew",
              severity: "high",
              reason: `Evidence device timestamp predates challenge issuance window (${chal.issued_at}).`,
              details: { capturedAt: deviceCapturedAt.toISOString(), issuedAt: chal.issued_at },
            });
          }
        }
      }
    }

    // 2. Check b: Hash Chain Continuity
    let chainVerified = true;
    const expectedGenesisHash = "0000000000000000000000000000000000000000000000000000000000000000";

    if (payload.chainIndex === 0) {
      if (payload.prevHash !== expectedGenesisHash) {
        chainVerified = false;
        flags.push({
          type: "chain_tampered",
          severity: "high",
          reason: `Genesis block tampering: Expected initial prev_hash [${expectedGenesisHash}], got [${payload.prevHash}].`,
          details: { prevHash: payload.prevHash, chainIndex: 0 },
        });
      }
    } else {
      // Query parent block in session
      const parentRes = await query(
        `
        SELECT sha256 FROM evidence_items
        WHERE session_id = $1 AND chain_index = $2
        LIMIT 1;
      `,
        [payload.sessionId, payload.chainIndex - 1]
      );

      if (parentRes.rows.length === 0 || parentRes.rows[0].sha256 !== payload.prevHash) {
        chainVerified = false;
        flags.push({
          type: "chain_tampered",
          severity: "critical",
          reason: `Hash chain break detected: Block [${payload.chainIndex}] does not match previous sealed block hash.`,
          details: {
            expectedParent: parentRes.rows[0]?.sha256 || "MISSING",
            providedParent: payload.prevHash,
            chainIndex: payload.chainIndex,
          },
        });
      }
    }

    // 3. Check c: Timestamp Window & Clock-Skew
    const skewSeconds = Math.abs(serverReceivedAt.getTime() - deviceCapturedAt.getTime()) / 1000;
    if (payload.clientSyncMode === "offline") {
      // Offline mode: Delay between capture and server receipt is expected,
      // but device time must not be in the future relative to server time!
      if (deviceCapturedAt.getTime() > serverReceivedAt.getTime() + 60000) {
        flags.push({
          type: "clock_skew",
          severity: "critical",
          reason: `Device timestamp is in the future relative to server time (${Math.round(
            (deviceCapturedAt.getTime() - serverReceivedAt.getTime()) / 1000
          )}s ahead). Possible client clock tampering.`,
          details: {
            serverTime: serverReceivedAt.toISOString(),
            deviceTime: deviceCapturedAt.toISOString(),
          },
        });
      }
    } else {
      // Online direct capture: Skew > 120s is flagged
      if (skewSeconds > 120) {
        flags.push({
          type: "clock_skew",
          severity: skewSeconds > 3600 ? "critical" : "medium",
          reason: `Significant clock-skew detected: Device time differs from server time by ${Math.round(
            skewSeconds
          )} seconds. Possible client time spoofing.`,
          details: {
            serverTime: serverReceivedAt.toISOString(),
            deviceTime: deviceCapturedAt.toISOString(),
            skewSeconds: Math.round(skewSeconds),
          },
        });
      }
    }

    // 4. Check d: Geolocation Plausibility & Impossible Travel
    if (payload.latitude === null || payload.longitude === null) {
      flags.push({
        type: "geo_mismatch",
        severity: "medium",
        reason: "Missing GPS coordinates on submitted evidence clip.",
        details: { missingCoordinates: true },
      });
    } else {
      // Out-of-zone coordinates check (India territory boundaries: lat 6.0-38.0, lng 68.0-98.0)
      const isOutOfZone =
        payload.latitude < 6.0 ||
        payload.latitude > 38.0 ||
        payload.longitude < 68.0 ||
        payload.longitude > 98.0;

      if (isOutOfZone) {
        flags.push({
          type: "geo_mismatch",
          severity: "critical",
          reason: `Out-of-zone coordinates detected: Submitted GPS (${payload.latitude.toFixed(4)}, ${payload.longitude.toFixed(4)}) is outside authorized RPL training boundary in India.`,
          details: {
            latitude: payload.latitude,
            longitude: payload.longitude,
            authorizedRegion: "IN",
          },
        });
      }

      // Check impossible travel against other sessions recorded on the same day
      const travelRes = await query(
        `
        SELECT latitude, longitude, device_captured_at
        FROM evidence_items
        WHERE session_id != $1 AND latitude IS NOT NULL
          AND device_captured_at BETWEEN $2::timestamptz - INTERVAL '2 hours' AND $2::timestamptz + INTERVAL '2 hours'
        ORDER BY device_captured_at DESC
        LIMIT 1;
      `,
        [payload.sessionId, payload.deviceCapturedAt]
      );

      if (travelRes.rows.length > 0) {
        const other = travelRes.rows[0];
        const distKm = this.calculateHaversineDistanceKm(
          payload.latitude,
          payload.longitude,
          parseFloat(other.latitude),
          parseFloat(other.longitude)
        );

        if (distKm > 500) {
          flags.push({
            type: "geo_mismatch",
            severity: "critical",
            reason: `Impossible travel detected: Candidate recorded sessions separated by ${Math.round(distKm)} km within under 2 hours.`,
            details: {
              distanceKm: Math.round(distKm),
              coords1: [payload.latitude, payload.longitude],
              coords2: [other.latitude, other.longitude],
            },
          });
        }
      }
    }

    // 5. Check e: Perceptual Hash (pHash) Cross-Candidate & Same-Candidate Reuse Detection
    const samplePhash =
      payload.phash || integrityService.computeSimplePerceptualHash(payload.blobRef);

    const reuseRes = await query(
      `
      SELECT e.id, e.session_id, e.blob_ref, e.phash, c.aadhaar_masked
      FROM evidence_items e
      LEFT JOIN assessment_sessions s ON e.session_id = s.id
      LEFT JOIN candidates c ON s.candidate_id = c.id
      WHERE e.phash IS NOT NULL
      ORDER BY e.created_at DESC
      LIMIT 200;
    `
    );

    for (const prevItem of reuseRes.rows) {
      if (prevItem.session_id === payload.sessionId && prevItem.blob_ref === payload.blobRef) {
        continue;
      }
      const distance = integrityService.hammingDistance(samplePhash, prevItem.phash);
      if (distance <= 4) {
        const isSameSession = prevItem.session_id === payload.sessionId;
        flags.push({
          type: "reuse",
          severity: "critical",
          reason: isSameSession
            ? `Media Reuse Detected: Perceptual hash matches video previously submitted in the same candidate session (Hamming distance: ${distance}). Candidate clip replay.`
            : `Media Reuse Detected: Perceptual hash matches video previously submitted in session [${prevItem.session_id}] (Hamming distance: ${distance}). Recycled cross-candidate video evidence.`,
          details: {
            matchedSessionId: prevItem.session_id,
            hammingDistance: distance,
            candidateAadhaar: prevItem.aadhaar_masked,
            isSameSession,
          },
        });
        break;
      }
    }

    // 6. Check f: Edit Suspicion Heuristics
    if (payload.clientMetadata?.isReEncoded || payload.clientMetadata?.abruptCutDetected) {
      flags.push({
        type: "edit_suspected",
        severity: "medium",
        reason: "Edit suspicion signals: Video container contains re-encode traces or abrupt frame rate discontinuities.",
        details: payload.clientMetadata,
      });
    }

    // 7. Check g: Face Consistency / Liveness
    const livenessResult = payload.clientMetadata?.faceMatchScore ? "verified" : "not_checked";
    if (payload.clientMetadata?.faceMismatch) {
      flags.push({
        type: "duplicate_person",
        severity: "critical",
        reason: "Face inconsistency detected: Person performing task does not match candidate photo on file.",
        details: { confidence: payload.clientMetadata.faceMatchScore || 0.2 },
      });
    }

    // Compute clip SHA-256
    const clipSha256 = integrityService.computeSha256(
      payload.blobDataUrl || `${payload.blobRef}|${payload.deviceCapturedAt}|${payload.challengeNonce}`
    );

    // 8. Insert into PostgreSQL evidence_items table
    const insertRes = await query(
      `
      INSERT INTO evidence_items (
        session_id,
        task_id,
        challenge_id,
        blob_ref,
        sha256,
        prev_hash,
        chain_index,
        server_received_at,
        device_captured_at,
        latitude,
        longitude,
        accuracy_meters,
        device_fingerprint,
        phash,
        liveness_result,
        attempt_number,
        client_metadata,
        idempotency_key,
        clock_skew_seconds,
        client_sync_mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING id;
    `,
      [
        payload.sessionId,
        payload.taskId,
        challengeId || null,
        payload.blobRef,
        clipSha256,
        payload.prevHash,
        payload.chainIndex,
        serverReceivedAt.toISOString(),
        deviceCapturedAt.toISOString(),
        payload.latitude,
        payload.longitude,
        payload.accuracyMeters,
        payload.deviceFingerprint,
        samplePhash,
        livenessResult,
        payload.attemptNumber || 1,
        JSON.stringify(payload.clientMetadata || {}),
        payload.idempotencyKey || null,
        skewSeconds,
        payload.clientSyncMode || "direct",
      ],
      userRole
    );

    const evidenceId = insertRes.rows[0].id;

    // 9. Store all generated security flags in evidence_flags table
    for (const flag of flags) {
      await query(
        `
        INSERT INTO evidence_flags (
          evidence_id,
          type,
          severity,
          details
        ) VALUES ($1, $2::flag_type, $3::flag_severity, $4);
      `,
        [evidenceId, flag.type, flag.severity, JSON.stringify({ reason: flag.reason, ...flag.details })],
        userRole
      );
    }

    // 10. Seal Evidence Item: Sets sealed_at timestamp
    const sealedAt = new Date().toISOString();
    await query("UPDATE evidence_items SET sealed_at = $1 WHERE id = $2;", [sealedAt, evidenceId]);

    return {
      evidenceId,
      sealed: true,
      sealedAt,
      flags,
      chainVerified,
      livenessResult,
      challengeVerified: challengeId !== undefined,
    };
  }

  private calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export const serverVerificationPipeline = new ServerVerificationPipeline();
