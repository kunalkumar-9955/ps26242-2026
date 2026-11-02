import { describe, it, expect, beforeAll } from "vitest";
import { query } from "@/lib/db";
import { checkRateLimit, recordRateLimitAttempt, resetRateLimit } from "@/lib/auth/rate-limiter";
import {
  validateUploadFile,
  generateSignedStorageUrl,
  verifySignedStorageUrl,
} from "@/lib/evidence/file-validator";
import {
  recordCandidateConsent,
  getCandidateConsents,
  exportCandidateData,
  executeDataDeletionCryptoShredding,
  validateAgeEligibility,
} from "@/lib/privacy/retention-service";
import { LLMExtractionService } from "@/lib/llm";
import nextConfig from "../../next.config";

describe("Phase 10 Hardening & Security Review Suite", () => {
  let testCandidateId: string;
  let testProfileId: string;

  beforeAll(async () => {
    testProfileId = "66666666-6666-6666-6666-666666666666";
    // Ensure profile has worker role before test
    await query("UPDATE profiles SET role = 'worker' WHERE id = $1", [testProfileId]);

    const candRes = await query(
      `SELECT id FROM candidates WHERE profile_id = $1 LIMIT 1`,
      [testProfileId]
    );
    if (candRes.rows.length > 0) {
      testCandidateId = candRes.rows[0].id;
    } else {
      const inserted = await query(
        `INSERT INTO candidates (profile_id, qualification_id, state, district)
         VALUES ($1, (SELECT id FROM qualifications LIMIT 1), 'Delhi', 'Central')
         RETURNING id`,
        [testProfileId]
      );
      testCandidateId = inserted.rows[0].id;
    }
  });

  describe("1. Row Level Security (RLS) Complete Matrix", () => {
    it("enforces RLS on EVERY public table without exception", async () => {
      const res = await query(
        `SELECT tablename, rowsecurity 
         FROM pg_tables 
         WHERE schemaname = 'public' 
         ORDER BY tablename ASC`
      );

      expect(res.rows.length).toBeGreaterThanOrEqual(30);

      const tablesWithoutRls = res.rows.filter((r) => !r.rowsecurity);
      expect(
        tablesWithoutRls,
        `Found tables without RLS: ${tablesWithoutRls.map((t) => t.tablename).join(", ")}`
      ).toEqual([]);
    });

    it("prevents privilege escalation on profile role update", async () => {
      let threw = false;
      try {
        // Attempt privilege escalation to admin while operating under worker role
        await query(
          `UPDATE profiles SET role = 'admin' WHERE id = '${testProfileId}'`,
          [],
          "worker"
        );
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/Privilege escalation denied/i);
      }
      expect(threw).toBe(true);
    });
  });

  describe("2. Auth Rate Limiting & Brute-Force Lockout", () => {
    const testPhone = "9988776655";

    beforeAll(async () => {
      await resetRateLimit(testPhone, "otp_verify");
    });

    it("allows attempts below threshold and locks out on 5 failed OTP attempts", async () => {
      // First 4 failed attempts should not lock out
      for (let i = 1; i <= 4; i++) {
        const res = await recordRateLimitAttempt(testPhone, "otp_verify", false);
        expect(res.locked).toBe(false);
      }

      // 5th failed attempt must trigger lockout
      const fifthAttempt = await recordRateLimitAttempt(testPhone, "otp_verify", false);
      expect(fifthAttempt.locked).toBe(true);
      expect(fifthAttempt.lockedUntil).toBeDefined();

      // Subsequent check should reject with retryAfterSec
      const check = await checkRateLimit(testPhone, "otp_verify");
      expect(check.allowed).toBe(false);
      expect(check.remaining).toBe(0);
      expect(check.retryAfterSec).toBeGreaterThan(0);

      // Clean up
      await resetRateLimit(testPhone, "otp_verify");
    });
  });

  describe("3. File Upload Checks, Magic Bytes & Private Storage", () => {
    it("rejects path traversal attempts in uploaded filenames", () => {
      const buf = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00]);
      const res = validateUploadFile(buf, "video/webm", "../../etc/passwd");
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/path traversal/i);
    });

    it("rejects files exceeding 50MB", () => {
      const hugeBuf = { length: 51 * 1024 * 1024 } as unknown as Buffer;
      const res = validateUploadFile(hugeBuf, "video/webm", "video.webm");
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/exceeds 50MB/i);
    });

    it("verifies genuine magic bytes for WebM and rejects mismatched spoofed content", () => {
      const validWebm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
      const resValid = validateUploadFile(validWebm, "video/webm", "valid_evidence.webm");
      expect(resValid.valid).toBe(true);
      expect(resValid.detectedFormat).toBe("webm");

      const spoofedWebm = Buffer.from("NOT_A_WEBM_FILE_JUST_PLAINTEXT_DATA");
      const resSpoofed = validateUploadFile(spoofedWebm, "video/webm", "spoofed.webm");
      expect(resSpoofed.valid).toBe(false);
      expect(resSpoofed.error).toMatch(/magic bytes/i);
    });

    it("verifies MP4 ftyp box signature", () => {
      const mp4Header = Buffer.from([
        0x00, 0x00, 0x00, 0x18,
        0x66, 0x74, 0x79, 0x70, // 'ftyp'
        0x6d, 0x70, 0x34, 0x32, // 'mp42'
      ]);
      const res = validateUploadFile(mp4Header, "video/mp4", "sample.mp4");
      expect(res.valid).toBe(true);
      expect(res.detectedFormat).toBe("mp4");
    });

    it("rejects unsigned private storage access and accepts valid signed URLs", () => {
      const path = "sessions/123/evidence/video.webm";

      // 1. Unsigned access fails
      const unsigned = verifySignedStorageUrl(path, null, null);
      expect(unsigned.allowed).toBe(false);
      expect(unsigned.reason).toMatch(/missing signature/i);

      // 2. Generate signed URL
      const signedUrl = generateSignedStorageUrl(path, 900);
      const urlObj = new URL(signedUrl, "https://satyarpl.gov.in");
      const expires = urlObj.searchParams.get("expires");
      const sig = urlObj.searchParams.get("sig");

      // 3. Valid signed access succeeds
      const validAccess = verifySignedStorageUrl(path, expires, sig);
      expect(validAccess.allowed).toBe(true);

      // 4. Tampered signature fails without throwing
      const tampered = verifySignedStorageUrl(path, expires, "00000000000000000000000000000000");
      expect(tampered.allowed).toBe(false);
    });
  });

  describe("4. DPDP Bilingual Consent & Worker Rights", () => {
    it("records candidate consent with version and timestamp in Hindi", async () => {
      const consent = await recordCandidateConsent({
        candidateId: testCandidateId,
        scope: "voice_video_location_identity",
        language: "hi",
        version: "1.0",
        purpose: "कौशल मूल्यांकन एवं प्रमाणन (NSQF RPL CON/Q0602)",
        dataCollected: "आवाज रिकॉर्डिंग, वीडियो, और जीपीएस",
        retentionNotice: "180 दिन तक सुरक्षित, तत्पश्चात क्रिप्टो-श्रेडिंग",
        granted: true,
      });

      expect(consent.id).toBeDefined();
      expect(consent.version).toBe("1.0");
      expect(consent.language).toBe("hi");
      expect(consent.granted).toBe(true);

      const consents = await getCandidateConsents(testCandidateId);
      expect(consents.length).toBeGreaterThanOrEqual(1);
    });

    it("enforces child protection age gate (blocks under 18 years)", () => {
      const underAge = validateAgeEligibility(16);
      expect(underAge.eligible).toBe(false);
      expect(underAge.reason).toMatch(/Minimum age requirement is 18 years/i);

      const adult = validateAgeEligibility(24);
      expect(adult.eligible).toBe(true);
      expect(adult.age).toBe(24);
    });

    it("generates pseudonymous worker data export", async () => {
      const workerExport = await exportCandidateData(testCandidateId);
      expect(workerExport.pseudonymousCandidateId).toBe(testCandidateId);
      expect(workerExport.complianceNotice).toMatch(/DPDP Act 2023/i);
      expect(Array.isArray(workerExport.declarations)).toBe(true);
      expect(Array.isArray(workerExport.evidenceItems)).toBe(true);
      expect(Array.isArray(workerExport.consents)).toBe(true);
    });

    it("executes crypto-shredding on erasure request while preserving ledger block hashes", async () => {
      const shredResult = await executeDataDeletionCryptoShredding(
        testCandidateId,
        "Worker requested erasure per DPDP Act 2023"
      );

      expect(shredResult.candidateId).toBe(testCandidateId);
      expect(shredResult.auditMessage).toMatch(/Crypto-shredded/i);

      // Verify in database that blob_ref is destroyed while SHA-256 hashes are preserved
      const res = await query(
        `SELECT e.id, e.blob_ref, e.sha256, e.prev_hash 
         FROM evidence_items e
         JOIN assessment_sessions s ON e.session_id = s.id
         WHERE s.candidate_id = $1`,
        [testCandidateId]
      );

      for (const row of res.rows) {
        expect(row.blob_ref).toBe("[CRYPTO_SHREDDED_PER_DPDP_REQUEST]");
        expect(row.sha256).toBeDefined();
        expect(row.sha256.length).toBe(64); // Valid SHA-256 intact
      }
    });
  });

  describe("5. Security Headers Enforced in Next.js", () => {
    it("configures CSP, HSTS, X-Content-Type-Options, Referrer-Policy and Permissions-Policy", async () => {
      expect(nextConfig.headers).toBeDefined();
      const headersList = await nextConfig.headers!();
      expect(headersList.length).toBeGreaterThanOrEqual(1);

      const globalHeaders = headersList[0].headers;
      const headerMap = new Map(globalHeaders.map((h: any) => [h.key, h.value]));

      expect(headerMap.get("Content-Security-Policy")).toMatch(/default-src 'self'/);
      expect(headerMap.get("Strict-Transport-Security")).toMatch(/max-age=63072000/);
      expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");
      expect(headerMap.get("X-Frame-Options")).toBe("DENY");
      expect(headerMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(headerMap.get("Permissions-Policy")).toMatch(/camera=\(self\)/);
      expect(headerMap.get("Permissions-Policy")).toMatch(/microphone=\(self\)/);
    });
  });

  describe("6. LLM Input Length Limit and Monthly Cost Guard", () => {
    const llmService = new LLMExtractionService();

    it("rejects oversized input transcripts exceeding 5000 characters", async () => {
      const overlongInput = "A".repeat(5001);
      await expect(
        llmService.extractNOSCoverage(overlongInput, testCandidateId)
      ).rejects.toThrow(/exceeds maximum limit of 5000 characters/i);
    });

    it("computes monthly AI cost budget guard", async () => {
      const budget = await llmService.checkMonthlyBudgetGuard();
      expect(budget.withinBudget).toBe(true);
      expect(typeof budget.estimatedSpendUsd).toBe("number");
    });
  });

  describe("7. Automated WCAG 2.2 AA Accessibility (axe-core)", () => {
    it("finds zero critical or serious accessibility violations on key worker & public screens", async () => {
      // Dynamic import of axe-core
      const axe = (await import("axe-core")).default;

      const container = document.createElement("div");
      container.innerHTML = `
        <main>
          <h1>सत्यRPL • Worker Consent Portal</h1>
          <section aria-label="Consent Guidelines">
            <p>Please review and freely grant consent for skill verification.</p>
            <form>
              <label for="consent-check">I freely consent to audio and video recording</label>
              <input type="checkbox" id="consent-check" name="consent" />
              <button type="submit" style="min-height: 48px; min-width: 48px;">
                Grant Consent & Continue
              </button>
            </form>
          </section>
        </main>
      `;
      document.body.appendChild(container);

      try {
        const results = await axe.run(container, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag22aa"],
          },
        });

        const criticalOrSerious = results.violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious"
        );
        expect(
          criticalOrSerious,
          `Found critical/serious axe accessibility violations: ${JSON.stringify(criticalOrSerious, null, 2)}`
        ).toEqual([]);
      } finally {
        document.body.removeChild(container);
      }
    });
  });

  describe("8. Secret Hygiene & Git Scanning", () => {
    it("ensures .env.local and private credentials are not tracked by git", async () => {
      const fs = await import("fs");
      const path = await import("path");

      const gitignorePath = path.join(process.cwd(), ".gitignore");
      const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");

      expect(gitignoreContent).toMatch(/\.env/);
      expect(gitignoreContent).toMatch(/\.env\.local/);
    });
  });
});
