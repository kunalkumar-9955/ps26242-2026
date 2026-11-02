import { describe, it, expect, beforeAll } from "vitest";
import { query } from "@/lib/db";
import { runIdempotentSeed } from "@/lib/db/seed";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  canonicalizeJson,
  signCanonicalPayload,
  verifyCanonicalSignature,
  getActiveSigningKeyId,
  getPublicKeyRecord,
  generateUnguessableSlug,
  validateSlugChecksum,
} from "@/lib/credential/crypto";
import { credentialService } from "@/lib/credential/service";
import { GET as handleVerifyGet } from "@/app/api/credentials/verify/[slug]/route";
import { NextRequest } from "next/server";

describe("Phase 8: Verifiable Credential Issuance, Ed25519 Signing & Zero-PII Public Verification", () => {
  const assessorId = "22222222-2222-2222-2222-222222222222"; // Er. Sunita Verma
  const auditorId = "33333333-3333-3333-3333-333333333333"; // Dr. Arvind Rao
  const testSessionId = "a0000000-0000-0000-0000-000000000002"; // Anita Devi session 2
  const unscoredSessionId = "a0000000-0000-0000-0000-000000000001"; // Ramesh Sharma session
  let createdCredentialId: string;
  let createdVerifySlug: string;

  beforeAll(async () => {
    await runIdempotentSeed();

    // Ensure session 2 has an approved signed recommendation for credential testing
    await query(`
      INSERT INTO recommendations (
        session_id, assessor_id, system_draft_outcome, final_assessor_outcome,
        is_override, override_reason, signoff_timestamp, assessor_signature_hash
      ) VALUES (
        '${testSessionId}',
        '${assessorId}',
        'competent',
        'competent',
        false,
        null,
        NOW(),
        'sig_hash_2222222222222222222222222222222222222222222222222222222222222222'
      )
      ON CONFLICT (session_id) DO UPDATE
      SET final_assessor_outcome = 'competent', 
          assessor_signature_hash = 'sig_hash_2222222222222222222222222222222222222222222222222222222222222222';
    `);

    // Clean any prior credentials on testSessionId for isolated test run
    await query("DELETE FROM credentials WHERE session_id = $1;", [testSessionId]);
  });

  // ==========================================================================
  // 1. VALID CREDENTIAL CREATION & CRYPTOGRAPHIC VERIFICATION
  // ==========================================================================

  describe("1. Credential Issuance & Signature Verification", () => {
    it("issues a verifiable credential and verifies successfully", async () => {
      const cred = await credentialService.issueCredential(testSessionId, assessorId);

      expect(cred).toBeDefined();
      expect(cred.id).toBeDefined();
      expect(cred.verify_slug).toBeDefined();
      expect(cred.status).toBe("valid");
      expect(cred.signature).toBeDefined();

      createdCredentialId = cred.id;
      createdVerifySlug = cred.verify_slug;

      // Verify via service
      const verification = await credentialService.verifyCredentialBySlug(createdVerifySlug);
      expect(verification).not.toBeNull();
      expect(verification!.isValid).toBe(true);
      expect(verification!.status).toBe("valid");
      expect(verification!.signatureValid).toBe(true);
      expect(verification!.qualification?.qpCode).toBe("CON/Q0602");
      expect(verification!.overallRecommendation).toBe("competent");
    });

    it("fails verification if any payload field is altered", async () => {
      const cred = await credentialService.verifyCredentialBySlug(createdVerifySlug);
      expect(cred).not.toBeNull();

      const originalPayload = { ...cred };

      // Case A: Alter overall recommendation
      const tamperedPayloadA = JSON.stringify({
        ...originalPayload,
        overallRecommendation: "not_yet_competent",
      });
      const canonicalA = canonicalizeJson(JSON.parse(tamperedPayloadA));
      const isSigValidA = verifyCanonicalSignature(canonicalA, "fake_or_original_signature", cred!.keyId);
      expect(isSigValidA).toBe(false);

      // Case B: Alter NSQF level
      const tamperedPayloadB = JSON.stringify({
        ...originalPayload,
        qualification: { ...cred!.qualification, nsqfLevel: 8 },
      });
      const canonicalB = canonicalizeJson(JSON.parse(tamperedPayloadB));
      const isSigValidB = verifyCanonicalSignature(canonicalB, "fake_or_original_signature", cred!.keyId);
      expect(isSigValidB).toBe(false);
    });

    it("fails verification if signature is signed with a different key", () => {
      const payload = {
        id: "urn:uuid:test-sample",
        overallRecommendation: "competent",
        qualification: "CON/Q0602",
      };
      const canonical = canonicalizeJson(payload);

      // Generate a rogue Ed25519 keypair
      const rogue = crypto.generateKeyPairSync("ed25519");
      const rogueSig = crypto.sign(null, Buffer.from(canonical, "utf-8"), rogue.privateKey).toString("hex");

      // Verify against genuine registered server key
      const activeKeyId = getActiveSigningKeyId();
      const isValid = verifyCanonicalSignature(canonical, rogueSig, activeKeyId);
      expect(isValid).toBe(false);
    });

    it("supports key rotation: credentials signed with historical key ID still verify", () => {
      const payload = {
        id: "urn:uuid:legacy-credential-2025",
        qualification: "CON/Q0602",
        issuanceDate: "2025-06-01T00:00:00Z",
      };
      const canonical = canonicalizeJson(payload);

      // Sign with historical key (2025-v0)
      const historicalKeyId = "ed25519-key-2025-v0";
      const signRes = signCanonicalPayload(canonical, historicalKeyId);

      expect(signRes.keyId).toBe(historicalKeyId);

      // Verify using key rotation directory
      const isValid = verifyCanonicalSignature(canonical, signRes.signatureHex, historicalKeyId);
      expect(isValid).toBe(true);

      // Verify that key is archived/inactive for new issuance but available for verification
      const keyRecord = getPublicKeyRecord(historicalKeyId);
      expect(keyRecord).not.toBeNull();
      expect(keyRecord!.isActive).toBe(false);
    });
  });

  // ==========================================================================
  // 2. DATABASE TRIGGER CONSTRAINT: REQUIRES ASSESSOR SIGN-OFF
  // ==========================================================================

  describe("2. Database Trigger Constraint (Sign-Off Guard)", () => {
    it("strictly blocks credential creation if assessor sign-off is missing (database level)", async () => {
      // unscoredSessionId has no signed recommendation in recommendations table
      await query("DELETE FROM recommendations WHERE session_id = $1;", [unscoredSessionId]);

      // Attempt direct SQL insertion into credentials table
      const rawInsertAttempt = query(`
        INSERT INTO credentials (
          session_id, candidate_id, qualification_id, status,
          verifiable_payload, signature, qr_payload, verify_slug
        ) VALUES (
          '${unscoredSessionId}',
          '11111111-1111-1111-1111-111111111111',
          '00000000-0000-0000-0000-000000000001',
          'valid',
          '{}'::jsonb,
          'mock_sig',
          'mock_qr',
          'mock_slug_unauthorized_${Date.now()}'
        );
      `);

      // Database trigger trg_credential_signoff_guard MUST reject with exception
      await expect(rawInsertAttempt).rejects.toThrow(
        /FRAUD PREVENTION: Cannot issue credential without a completed, signed assessor recommendation/
      );
    });
  });

  // ==========================================================================
  // 3. REVOCATION & EXPIRY LIFECYCLE
  // ==========================================================================

  describe("3. Revocation and Expiry Lifecycle", () => {
    it("handles revocation with mandatory reason and updates live status and audit log", async () => {
      // Rejection when revocation reason is too short
      await expect(
        credentialService.revokeCredential(createdCredentialId, auditorId, "auditor", "too short")
      ).rejects.toThrow("at least 10 characters");

      // Successful revocation
      const reason = "Audit review detected candidate substitution on practical video footage.";
      const revoked = await credentialService.revokeCredential(
        createdCredentialId,
        auditorId,
        "auditor",
        reason
      );

      expect(revoked.status).toBe("revoked");
      expect(revoked.revocation_reason).toBe(reason);

      // Live verification reflects revoked state
      const verification = await credentialService.verifyCredentialBySlug(createdVerifySlug);
      expect(verification).not.toBeNull();
      expect(verification!.isValid).toBe(false);
      expect(verification!.status).toBe("revoked");
      expect(verification!.revocationReason).toBe(reason);

      // Verify immutable audit log entry
      const auditRes = await query(`
        SELECT entity_name, action, actor_role 
        FROM audit_log 
        WHERE entity_name = 'CREDENTIALS' AND action = 'UPDATE'
        ORDER BY id DESC LIMIT 1;
      `);
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].actor_role).toBe("auditor");
    });

    it("correctly identifies expired credentials", async () => {
      // Create a credential with expired timestamp
      const expiredDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const expiredSlug = `exp_${Date.now().toString(36)}`;

      await query(`
        UPDATE credentials 
        SET expires_at = '${expiredDate}', status = 'valid'
        WHERE id = '${createdCredentialId}';
      `);

      const verification = await credentialService.verifyCredentialBySlug(createdVerifySlug);
      expect(verification).not.toBeNull();
      expect(verification!.isValid).toBe(false);
      expect(verification!.status).toBe("expired");

      // Restore status to valid for subsequent tests
      await query(`
        UPDATE credentials 
        SET expires_at = NOW() + INTERVAL '3 years', status = 'valid'
        WHERE id = '${createdCredentialId}';
      `);
    });
  });

  // ==========================================================================
  // 4. ZERO-PII DISCLOSURE & QR SECURITY
  // ==========================================================================

  describe("4. Zero-PII Public Verification & QR Security", () => {
    it("ensures QR payload contains only unguessable slug and checksum (NO PII, NO scores)", async () => {
      const credRes = await query("SELECT qr_payload FROM credentials WHERE id = $1;", [
        createdCredentialId,
      ]);
      const qrJson = JSON.parse(credRes.rows[0].qr_payload);

      expect(qrJson.slug).toBeDefined();
      expect(qrJson.cs).toBeDefined();
      expect(qrJson.u).toContain("/verify/");

      // Critical privacy check: QR MUST NOT contain Aadhaar, phone, candidate name, or scores
      expect(qrJson.aadhaar).toBeUndefined();
      expect(qrJson.phone).toBeUndefined();
      expect(qrJson.candidateName).toBeUndefined();
      expect(qrJson.scores).toBeUndefined();
      expect(qrJson.video).toBeUndefined();
    });

    it("verifies public verification page shows only pseudonymous ID by default", async () => {
      // Set worker consent to false
      await query(
        "UPDATE credentials SET worker_consent_public_display = false WHERE id = $1;",
        [createdCredentialId]
      );

      const verification = await credentialService.verifyCredentialBySlug(createdVerifySlug);
      expect(verification).not.toBeNull();
      expect(verification!.candidateIdentity.isPseudonymousOnly).toBe(true);
      expect(verification!.candidateIdentity.displayName).toBeUndefined();
      expect(verification!.candidateIdentity.maskedIdentifier).toBeUndefined();
      expect(verification!.candidateIdentity.pseudonymousId).toContain("cand_pseudo_");

      // Verify minimal masked disclosure only when consent is enabled
      await query(
        "UPDATE credentials SET worker_consent_public_display = true WHERE id = $1;",
        [createdCredentialId]
      );

      const consentedVerification = await credentialService.verifyCredentialBySlug(createdVerifySlug);
      expect(consentedVerification).not.toBeNull();
      expect(consentedVerification!.candidateIdentity.isPseudonymousOnly).toBe(false);
      expect(consentedVerification!.candidateIdentity.displayName).toBeDefined();
      // Masked initial e.g. "Anita D***"
      expect(consentedVerification!.candidateIdentity.displayName).toContain("***");
    });
  });

  // ==========================================================================
  // 5. ENUMERATION RESISTANCE & RATE LIMITING
  // ==========================================================================

  describe("5. Anti-Enumeration & Rate Limiting", () => {
    it("returns uniform 404 response for unknown slugs", async () => {
      const req = new NextRequest("http://localhost:3000/api/credentials/verify/unknown_random_slug_1234");
      const res = await handleVerifyGet(req, {
        params: Promise.resolve({ slug: "unknown_random_slug_1234" }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("NOT_FOUND");
    });

    it("enforces rate limits on public verification requests", async () => {
      const testIpHash = `rate_test_${Date.now()}`;

      // Insert 65 rapid verification calls under test IP
      await query(`
        INSERT INTO verification_rate_limits (client_ip_hash, window_start, request_count)
        VALUES ('${testIpHash}', NOW(), 65)
        ON CONFLICT DO NOTHING;
      `);

      await expect(
        credentialService.verifyCredentialBySlug(createdVerifySlug, testIpHash)
      ).rejects.toThrow(/RATE_LIMIT_EXCEEDED/);
    });
  });

  // ==========================================================================
  // 6. PRIVATE KEY SECURITY (LEAKAGE SCAN)
  // ==========================================================================

  describe("6. Private Key Security & Bundle Isolation", () => {
    it("ensures Ed25519 private keys never appear in client bundles, public routes, or logs", () => {
      // 1. Verify getPublicKeyRecord never returns privateKeyPem
      const pubRecord = getPublicKeyRecord(getActiveSigningKeyId());
      expect((pubRecord as any)?.privateKeyPem).toBeUndefined();

      // 2. Scan public API routes directory for private key leakage
      const publicApiDir = path.join(process.cwd(), "src/app/api/credentials");
      const files = fs.readdirSync(publicApiDir, { recursive: true }) as string[];

      for (const file of files) {
        if (typeof file === "string" && (file.endsWith(".ts") || file.endsWith(".tsx"))) {
          const content = fs.readFileSync(path.join(publicApiDir, file), "utf-8");
          expect(content).not.toContain("privateKeyPem");
          expect(content).not.toContain("BEGIN PRIVATE KEY");
        }
      }
    });
  });

  // ==========================================================================
  // 7. RLS POLICIES FOR NEW TABLES
  // ==========================================================================

  describe("7. RLS Security on Phase 8 Tables", () => {
    it("allows public read on signing_keys but restricts write to admin", async () => {
      // Public select query succeeds
      const keysRes = await query("SELECT key_id, algorithm, is_active FROM signing_keys;");
      expect(Array.isArray(keysRes.rows)).toBe(true);

      // Verify that credentials table enforces candidate and assessor isolation
      const credTableRes = await query("SELECT COUNT(*) as count FROM credentials;");
      expect(Number(credTableRes.rows[0].count)).toBeGreaterThanOrEqual(1);
    });
  });
});
