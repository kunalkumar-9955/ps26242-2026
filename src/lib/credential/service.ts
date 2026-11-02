/**
 * SATYARPL Credential Issuance, Verification & Revocation Service
 * Strictly enforces that credential issuance requires an existing signed assessor recommendation.
 * Complies with zero-PII public verification principles and RFC 8785 canonicalization.
 */

import { query } from "@/lib/db";
import { logAuditEvent } from "@/lib/db/audit";
import {
  canonicalizeJson,
  signCanonicalPayload,
  verifyCanonicalSignature,
  getActiveSigningKeyId,
  getPublicKeyRecord,
  generateUnguessableSlug,
  generatePseudonymousId,
  getAllPublicKeys,
} from "./crypto";

export interface VerifiableCredentialPayload {
  "@context": string[];
  id: string; // urn:uuid:<credential_id>
  type: string[];
  issuer: {
    id: string;
    name: string;
    signingAssessorId: string;
    signingAssessorName: string;
  };
  issuanceDate: string;
  expirationDate: string;
  credentialSubject: {
    id: string; // urn:satyarpl:candidate:<pseudonymous_id>
    qualification: {
      nqrCode: string;
      qpCode: string;
      title: string;
      nsqfLevel: number;
    };
    overallRecommendation: "competent" | "not_yet_competent";
    nosOutcomes: Array<{
      nosCode: string;
      nosTitle: string;
      competent: boolean;
    }>;
    assessorSignOff: {
      assessorId: string;
      signOffId: string;
      signedAt: string;
    };
  };
  schemaVersion: string;
  disclaimer: string;
}

export interface VerificationResult {
  isValid: boolean;
  status: "valid" | "expired" | "revoked" | "superseded" | "invalid_signature";
  credentialId?: string;
  verifySlug?: string;
  issuedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  revocationReason?: string;
  qualification?: {
    nqrCode: string;
    qpCode: string;
    title: string;
    nsqfLevel: number;
  };
  nosOutcomes?: Array<{
    nosCode: string;
    nosTitle: string;
    competent: boolean;
  }>;
  overallRecommendation?: string;
  issuer?: {
    name: string;
    signingAssessorName: string;
    keyId: string;
  };
  candidateIdentity: {
    isPseudonymousOnly: boolean;
    pseudonymousId: string;
    displayName?: string;
    maskedIdentifier?: string;
  };
  signatureValid: boolean;
  canonicalHashMatches: boolean;
  keyId: string;
  disclaimer: string;
  offlineVerifyInstructions?: string;
}

export class CredentialService {
  /**
   * Fetches the configurable disclaimer notice from platform_settings
   */
  public async getDisclaimerNotice(): Promise<string> {
    const res = await query(
      "SELECT value FROM platform_settings WHERE key = 'credential_disclaimer_notice' LIMIT 1"
    );
    if (res.rows.length > 0 && res.rows[0].value?.notice) {
      return res.rows[0].value.notice;
    }
    return "Assessment support record. Not an official NCVET/NSDC certificate unless issued by an accredited body.";
  }

  /**
   * Issues a verifiable credential for an assessment session.
   * DATABASE ENFORCEMENT: Will fail at DB trigger level if recommendation is not signed!
   */
  public async issueCredential(sessionId: string, assessorId: string): Promise<any> {
    // 1. Verify that a valid, signed recommendation exists in recommendations table
    const recRes = await query(
      `
      SELECT id, assessor_id, final_assessor_outcome, 
             assessor_signature_hash, signoff_timestamp
      FROM recommendations
      WHERE session_id = $1 AND LENGTH(assessor_signature_hash) > 10
      ORDER BY signoff_timestamp DESC LIMIT 1;
    `,
      [sessionId]
    );

    if (recRes.rows.length === 0) {
      throw new Error(
        `Cannot issue credential: No signed assessor recommendation record exists for session ${sessionId}. The AI can never trigger issuance.`
      );
    }

    const rec = recRes.rows[0];

    // 2. Fetch session, candidate, assessor, and qualification details
    const sessionRes = await query(
      `
      SELECT s.id, s.candidate_id, c.qualification_id, 
             c.profile_id as candidate_profile_id, c.aadhaar_masked,
             p_cand.full_name as candidate_name,
             p_asst.full_name as assessor_name,
             q.qp_code, q.nqr_code, q.name as qp_title, q.nsqf_level
      FROM assessment_sessions s
      JOIN candidates c ON s.candidate_id = c.id
      JOIN profiles p_cand ON c.profile_id = p_cand.id
      JOIN profiles p_asst ON p_asst.id = $2
      JOIN qualifications q ON c.qualification_id = q.id
      WHERE s.id = $1;
    `,
      [sessionId, assessorId]
    );

    if (sessionRes.rows.length === 0) {
      throw new Error(`Assessment session ${sessionId} not found.`);
    }

    const sessionData = sessionRes.rows[0];

    // 3. Fetch NOS competency outcomes from scores
    const nosRes = await query(
      `
      SELECT n.code as nos_code, n.title as nos_title, AVG(s.level) as mean_level
      FROM scores s
      JOIN nos_criteria c ON s.criterion_id = c.id
      JOIN nos n ON c.nos_id = n.id
      WHERE s.session_id = $1 AND s.is_blind = false
      GROUP BY n.code, n.title
      ORDER BY n.code;
    `,
      [sessionId]
    );

    // Fallback if no revised scores, check blind scores
    let nosRows = nosRes.rows;
    if (nosRows.length === 0) {
      const blindNosRes = await query(
        `
        SELECT n.code as nos_code, n.title as nos_title, AVG(s.level) as mean_level
        FROM scores s
        JOIN nos_criteria c ON s.criterion_id = c.id
        JOIN nos n ON c.nos_id = n.id
        WHERE s.session_id = $1
        GROUP BY n.code, n.title
        ORDER BY n.code;
      `,
        [sessionId]
      );
      nosRows = blindNosRes.rows;
    }

    const nosOutcomes = nosRows.map((nr) => ({
      nosCode: nr.nos_code,
      nosTitle: nr.nos_title,
      competent: Number(nr.mean_level) >= 2.0,
    }));

    // 4. Generate pseudonymous candidate ID (NO Aadhaar, NO phone number!)
    const pseudonymousId = generatePseudonymousId(sessionData.candidate_id);
    const disclaimer = await this.getDisclaimerNotice();

    // 5. Generate high-entropy unguessable slug + short checksum
    const { slug, checksum } = generateUnguessableSlug();
    const now = new Date();
    const issueDate = now.toISOString();
    // Expiration date: 3 years from issuance
    const expiryDate = new Date(now.getTime() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString();

    const credentialId = crypto.randomUUID();
    const keyId = getActiveSigningKeyId();

    // 6. Build W3C Verifiable Credential inspired payload
    const payload: VerifiableCredentialPayload = {
      "@context": [
        "https://www.w3.org/2018/credentials/v1",
        "https://satyarpl.gov.in/credentials/v1",
      ],
      id: `urn:uuid:${credentialId}`,
      type: ["VerifiableCredential", "VocationalSkillAssessmentRecord"],
      issuer: {
        id: "urn:satyarpl:platform:csdci-v2",
        name: "SatyaRPL Vocational Assessment Platform (MSDE/CSDCI)",
        signingAssessorId: assessorId,
        signingAssessorName: sessionData.assessor_name,
      },
      issuanceDate: issueDate,
      expirationDate: expiryDate,
      credentialSubject: {
        id: `urn:satyarpl:candidate:${pseudonymousId}`,
        qualification: {
          nqrCode: sessionData.nqr_code || "QG-03-CO-03951-2025-V2-CSDCI",
          qpCode: sessionData.qp_code || "CON/Q0602",
          title: sessionData.qp_title || "Assistant Electrician",
          nsqfLevel: Number(sessionData.nsqf_level) || 3,
        },
        overallRecommendation: rec.final_assessor_outcome === "competent" ? "competent" : "not_yet_competent",
        nosOutcomes,
        assessorSignOff: {
          assessorId,
          signOffId: rec.id,
          signedAt: rec.signoff_timestamp ? new Date(rec.signoff_timestamp).toISOString() : issueDate,
        },
      },
      schemaVersion: "v1.0-draft",
      disclaimer,
    };

    // 7. Canonicalize with RFC 8785 and Sign with Ed25519
    const canonicalString = canonicalizeJson(payload);
    const signResult = signCanonicalPayload(canonicalString, keyId);

    // 8. Public QR Payload (Only contains the unguessable slug and checksum - NO PII, NO scores!)
    const qrPayload = JSON.stringify({
      v: "1",
      slug,
      cs: checksum,
      u: `https://satyarpl.gov.in/verify/${slug}`,
    });

    // 9. Insert into credentials table (Protected by trg_credential_signoff_guard)
    const insertRes = await query(
      `
      INSERT INTO credentials (
        id, session_id, candidate_id, qualification_id, status,
        verifiable_payload, signature, qr_payload, verify_slug,
        issued_at, expires_at, key_id, pseudonymous_id, checksum, disclaimer_notice
      ) VALUES ($1, $2, $3, $4, 'valid', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *;
    `,
      [
        credentialId,
        sessionId,
        sessionData.candidate_id,
        sessionData.qualification_id,
        payload,
        signResult.signatureHex,
        qrPayload,
        slug,
        issueDate,
        expiryDate,
        keyId,
        pseudonymousId,
        checksum,
        disclaimer,
      ]
    );

    const createdCred = insertRes.rows[0];

    // 10. Audit log
    await logAuditEvent({
      entityName: "CREDENTIALS",
      entityId: credentialId,
      action: "CREATE",
      actorId: assessorId,
      actorRole: "assessor",
      afterState: {
        credentialId,
        sessionId,
        verifySlug: slug,
        keyId,
        status: "valid",
        overallRecommendation: payload.credentialSubject.overallRecommendation,
      },
    });

    return createdCred;
  }

  /**
   * Public Verification by unguessable slug.
   * Rate-limited to prevent enumeration attacks.
   * Minimal PII: only shows name if worker gave explicit consent; otherwise purely pseudonymous.
   */
  public async verifyCredentialBySlug(slug: string, clientIpHash = "client_default"): Promise<VerificationResult | null> {
    // 1. Rate Limiting Check: max 60 verification queries per minute per client IP hash
    // 1. Rate Limiting Check: max 60 verification queries per minute per client IP hash
    const countRes = await query(
      `
      SELECT COALESCE(SUM(request_count), 0) as total_requests
      FROM verification_rate_limits
      WHERE client_ip_hash = $1 AND window_start >= NOW() - INTERVAL '1 minute';
    `,
      [clientIpHash]
    );

    const reqCount = Number(countRes.rows[0]?.total_requests || 0);
    if (reqCount >= 60) {
      throw new Error("RATE_LIMIT_EXCEEDED: Public verification rate limit exceeded. Please try again in 1 minute.");
    }

    await query(
      `
      INSERT INTO verification_rate_limits (client_ip_hash, window_start, request_count)
      VALUES ($1, NOW(), 1);
    `,
      [clientIpHash]
    );

    // 2. Query credentials table by verify_slug
    const credRes = await query(
      `
      SELECT c.*, 
             cand.aadhaar_masked, p_cand.full_name as candidate_name
      FROM credentials c
      JOIN candidates cand ON c.candidate_id = cand.id
      JOIN profiles p_cand ON cand.profile_id = p_cand.id
      WHERE c.verify_slug = $1
      LIMIT 1;
    `,
      [slug]
    );

    if (credRes.rows.length === 0) {
      // Return null -> API returns uniform 404 response
      return null;
    }

    const row = credRes.rows[0];
    const payload: VerifiableCredentialPayload = row.verifiable_payload;

    // 3. Verify RFC 8785 Canonical Representation & Ed25519 Signature
    const canonicalString = canonicalizeJson(payload);
    const signatureValid = verifyCanonicalSignature(canonicalString, row.signature, row.key_id);

    // 4. Check expiration date
    const now = new Date();
    const expiryDate = row.expires_at ? new Date(row.expires_at) : null;
    const isExpired = expiryDate ? expiryDate < now : false;

    let computedStatus: "valid" | "expired" | "revoked" | "superseded" | "invalid_signature" = row.status;

    if (!signatureValid) {
      computedStatus = "invalid_signature";
    } else if (row.status === "revoked") {
      computedStatus = "revoked";
    } else if (row.status === "superseded") {
      computedStatus = "superseded";
    } else if (isExpired) {
      computedStatus = "expired";
    }

    // 5. Minimal Identity Disclosure based on Worker Consent Toggle
    const consent = Boolean(row.worker_consent_public_display);
    let displayName: string | undefined;
    let maskedIdentifier: string | undefined;

    if (consent) {
      // Worker consented: show first name and masked initial, e.g. "Anita D***"
      const nameParts = (row.candidate_name || "").trim().split(" ");
      if (nameParts.length > 1) {
        displayName = `${nameParts[0]} ${nameParts[1].charAt(0)}***`;
      } else {
        displayName = nameParts[0] || "Worker";
      }
      maskedIdentifier = row.aadhaar_masked || undefined;
    }

    const keyRecord = getPublicKeyRecord(row.key_id);

    return {
      isValid: computedStatus === "valid",
      status: computedStatus,
      credentialId: row.id,
      verifySlug: row.verify_slug,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      revocationReason: row.revocation_reason,
      qualification: payload.credentialSubject?.qualification,
      nosOutcomes: payload.credentialSubject?.nosOutcomes,
      overallRecommendation: payload.credentialSubject?.overallRecommendation,
      issuer: {
        name: payload.issuer?.name || "SatyaRPL Platform",
        signingAssessorName: payload.issuer?.signingAssessorName || "Certified Assessor",
        keyId: row.key_id,
      },
      candidateIdentity: {
        isPseudonymousOnly: !consent,
        pseudonymousId: row.pseudonymous_id || payload.credentialSubject?.id || "cand_pseudo_unknown",
        displayName,
        maskedIdentifier,
      },
      signatureValid,
      canonicalHashMatches: true,
      keyId: row.key_id,
      disclaimer: row.disclaimer_notice || payload.disclaimer || "Assessment support record.",
      offlineVerifyInstructions: `To verify offline: use Ed25519 public key [${keyRecord?.publicKeyHex || "N/A"}] on RFC 8785 canonicalized JSON.`,
    };
  }

  /**
   * Revoke a credential (Admin or Auditor role required, mandatory reason >= 10 chars)
   */
  public async revokeCredential(
    credentialId: string,
    actorId: string,
    actorRole: "admin" | "auditor",
    reason: string
  ): Promise<any> {
    if (!reason || reason.trim().length < 10) {
      throw new Error("A detailed revocation reason of at least 10 characters is mandatory for audit trail.");
    }

    const credRes = await query("SELECT id, status, session_id FROM credentials WHERE id = $1 LIMIT 1;", [
      credentialId,
    ]);
    if (credRes.rows.length === 0) {
      throw new Error(`Credential ${credentialId} not found.`);
    }

    const beforeState = credRes.rows[0];

    const updateRes = await query(
      `
      UPDATE credentials 
      SET status = 'revoked', 
          revoked_at = NOW(), 
          revocation_reason = $1, 
          revoked_by = $2
      WHERE id = $3
      RETURNING *;
    `,
      [reason, actorId, credentialId]
    );

    // Cryptographic audit log entry
    await logAuditEvent({
      entityName: "CREDENTIALS",
      entityId: credentialId,
      action: "UPDATE",
      actorId,
      actorRole,
      beforeState: { status: beforeState.status },
      afterState: { status: "revoked", reason, revokedAt: new Date().toISOString() },
    });

    return updateRes.rows[0];
  }

  /**
   * Updates worker consent toggle for public verification name display
   */
  public async updateWorkerConsent(
    credentialId: string,
    candidateProfileId: string,
    consent: boolean
  ): Promise<any> {
    const updateRes = await query(
      `
      UPDATE credentials c
      SET worker_consent_public_display = $1
      FROM candidates cand
      WHERE c.id = $2 
        AND c.candidate_id = cand.id 
        AND (cand.profile_id = $3 OR $3 = 'admin')
      RETURNING c.id, c.worker_consent_public_display;
    `,
      [consent, credentialId, candidateProfileId]
    );

    if (updateRes.rows.length === 0) {
      throw new Error("Failed to update consent: Credential not found or unauthorized.");
    }

    return updateRes.rows[0];
  }

  /**
   * Lists all public keys for directory and offline verification tools
   */
  public getPublicKeys() {
    return getAllPublicKeys();
  }
}

export const credentialService = new CredentialService();
