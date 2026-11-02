# Architectural Decisions Record (ADR)
**Platform:** Fraud-Resistant, Assessor-Auditable RPL Platform (SIH 2026 · PS 26242 · MSDE)

---

## ADR-001: Reference Trade Selection — CON/Q0602 Assistant Electrician
* **Status:** Accepted (Phase 2b)
* **Context:** The platform requires one deep reference trade with both video-assessable practical tasks and in-person tactile inspection criteria.
* **Decision:** Selected `CON/Q0602` (NQR Code: `QG-03-CO-03951-2025-V2-CSDCI`, NSQF Level 3) from the Construction Skill Development Council of India.
* **Consequences:** 7 compulsory NOS units imported from official NQR portal (`https://www.nqr.gov.in/qualifications/13772`). Performance criteria requiring pull-force testing (crimping), screw torque, and earth resistance are flagged for physical inspection (`requires_physical: true`).

---

## ADR-002: Live PostgreSQL Engine & Cryptographic Audit Trails
* **Status:** Accepted (Phase 2b)
* **Context:** RPL assessments require tamper-proof integrity and auditability per CAG guidelines. In-memory demo mocks cannot guarantee persistence or audit integrity.
* **Decision:** Wired directly to a live PostgreSQL 18 instance (`satyarpl_db`) with append-only database triggers on `evidence_items` and `audit_log`. Every admin mutation writes a SHA-256 hash-chained audit record.
* **Consequences:** Full data survivability across server restarts, strict RLS per role, and immutable audit logs.

---

## ADR-003: Honest Provenance & Draft Demarcation Policy
* **Status:** Accepted (Phase 2b)
* **Context:** Standards from official Gazette / NQR portals must be cleanly separated from engineering drafts or unverified guidance.
* **Decision:**
  * Qualification code, NQR code, and 7 NOS titles = `verified: true`.
  * Performance criteria, 4-level rubric anchors, weights, and vernacular trade slang = `verified: false` with label `"draft - needs assessor review"`.
  * 50% pass threshold for Level 3 = `platform_settings` entry marked `UNVERIFIED` citing PMKVY RPL draft guidelines.

---

## ADR-004: Untrusted Speech-to-Text & Anti-Hallucination Pipeline
* **Status:** Accepted (Phase 3)
* **Context:** Speech transcripts from workers may contain trade slang or prompt-injection attempts, and LLMs can hallucinate nonexistent NOS codes.
* **Decision:**
  * Transcripts are strictly sanitized and treated as untrusted user input.
  * Extracted NOS codes are post-validated against the PostgreSQL `nos` table; any code not in the database is rejected immediately.
  * If confidence is low or extraction fails, the system safely routes to `"needs assessor review"` rather than guessing.

---

## ADR-005: Challenge-Response Evidence Engine & Immutable Seals
* **Status:** Accepted (Phase 4)
* **Context:** Pre-recorded stock video, deepfakes, recycled evidence, and timestamp tampering represent severe RPL fraud vectors identified in the CAG audit of PMKVY.
* **Decision:**
  * Server issues single-use, cryptographically signed (HMAC-SHA256) expiring challenges (nonces, task variants, sequence prompts).
  * Video captures are chained on-device using SHA-256 block hashes (`prev_hash`, `chain_index`).
  * Server-side verification evaluates challenge validity, chain continuity, clock-skew, geo plausibility, and cross-candidate perceptual hash (`pHash`) reuse.
  * Sealing timestamp `sealed_at` triggers an immutable PostgreSQL trigger preventing any subsequent UPDATE or DELETE, guaranteeing evidentiary integrity.

---

## ADR-006: Offline-First PWA, Append-Only Sync & Cryptographic Attestation Boundaries
* **Status:** Accepted (Phase 5)
* **Context:** Vocational assessment sites across rural and semi-urban India frequently suffer from intermittent, low-bandwidth, or absent network connectivity during practical trials. Workers must not lose declaration speech recordings or video captures when offline. Concurrently, offline capture introduces timestamp and GPS manipulation risks.
* **Decision:**
  * **Versioned PWA Shell:** Service worker (`satyarpl-shell-v1.0.0`) caches core app shells with an explicit update notification workflow and stale cache eviction.
  * **Dexie IndexedDB Persistent Storage:** Drafts, declarations, challenges, and hash-chain state persist locally. Sensitive drafts are encrypted at rest with WebCrypto AES-GCM-256. Persistent storage is requested via `navigator.storage.persist()`.
  * **Append-Only Evidence Sync (Zero-Conflict Policy):** Evidence captures are strictly append-only blocks chained on-device. No conflict resolution is required for evidence. Declaration drafts follow Last-Writer-Wins (LWW).
  * **Challenge Pre-Fetch & Missing Flags:** Challenges are pre-fetched while online in short-lived batches. If a worker records offline without an unexpired challenge, evidence is queued and explicitly flagged `challenge_missing` on sync—never silently accepted.
  * **Resumable Chunked Sync with Idempotency:** Sync items use deterministic idempotency keys (`idempotency_key = sha256(item_id + attempt)`). Server returns cached sealed outcomes on duplicate retries without duplicate record insertion. Multi-part uploads resume from the last un-uploaded chunk.
  * **Background Sync vs iOS Safari Fallback:** Chrome Android uses `SyncManager` background sync; iOS Safari (which lacks Background Sync) uses foreground fallback triggers (`visibilitychange`, `online`, and interval checks).
  * **Attestation Boundary Honesty:** Device clocks and GPS coordinates can be spoofed in offline browser environments. Server heuristics flag clock skew and impossible travel, but mathematical hardware proof requires production native APIs (Google Play Integrity / Apple App Attest). The platform exposes a pluggable attestation interface reporting `NOT_CONFIGURED` with complete transparency.

---

## ADR-007: Assessor Calibration Gate, Blind-First Workspace & Advisory AI Boundaries
* **Status:** Accepted (Phase 6)
* **Context:** Assessor subjective bias, inter-rater drift, and automation bias (blindly accepting or rubber-stamping AI suggestions) represent critical failure points in RPL assessment integrity. Furthermore, AI cannot safely judge tactile properties (crimp pull strength, terminal torque, finish, safety feel).
* **Decision:**
  * **Inter-Rater Reliability Calibration Gate:** Assessors must achieve Cohen's Quadratic Weighted Kappa ($\kappa \ge 0.70$) against master expert gold-standard clips before accessing candidate sessions. Certification is valid for 30 days and enforced server-side. The 0.70 threshold is an admin setting marked `UNVERIFIED` citing PMKVY assessor quality guidelines.
  * **Server-Side Blind-First Enforcement:** AI suggestions are strictly barred from delivery—via API routes, service calls, and database RLS policies (`ai_suggestions_blind_first_policy`)—until the assessor commits an independent blind score (Level 1–4) with a mandatory technical rationale ($\ge 10$ chars).
  * **Immutable Blind Scores:** The initial blind score is permanently immutable (enforced by PostgreSQL trigger `trg_blind_scores_immutable`). Post-AI revisions require a mandatory override reason ($\ge 5$ chars, enforced by trigger `trg_scores_override_reason`) and are stored as separate rows.
  * **Code-Enforced Physical Abstention:** Criteria marked `requires_physical = true` or `assessable_from_video = 'no'` **always** abstain in code (`abstained: true`, `abstain_reason: 'needs_physical_verification'`), routing to a dedicated hands-on tactile checklist. The AI is structurally barred from producing final pass/fail decisions.
  * **Deterministic Arithmetic & Credential Guard:** Session outcome is computed by deterministic arithmetic from configured thresholds. PostgreSQL trigger `trg_credential_signoff_guard` rejects any `credentials` row insertion unless an explicit, signed recommendation record exists for the session.

---

## ADR-008: Auditor Analytics, Reliability Statistics & Explainable Anomaly Review Prompts
* **Status:** Accepted (Phase 7)
* **Context:** Vocational skill audits require rigorous, explainable measurement of inter-rater reliability, fairness, and assessment integrity across distributed assessment centers. Standard statistical practices often collapse on edge cases (e.g. zero-variance distributions showing spurious 0.0 or 1.0 kappa, prevalence paradox depressing kappa despite 90%+ agreement, and small sample sizes yielding false confidence). Furthermore, auditor surveillance of raw worker PII must adhere to strict zero-trust data minimization principles.
* **Decision:**
  * **Pure Agreement Statistics Library:**
    * **Cohen's Quadratic Weighted Kappa ($\kappa_w$):** Implemented for ordinal 4-level scales using quadratic weights $w_{ij} = (i-j)^2 / 9$. When score distributions lack variance across categories (chance agreement equals 1.0), the library returns `undefined` (`isUndefined: true`), never 0 or 1.
    * **Prevalence / Bias Paradox Guard:** Always displays percent exact agreement and adjacent agreement ($\pm 1$ level) alongside kappa. Skewed score distributions ($P \ge 0.50$ with agreement $\ge 70\%$) automatically trigger a prominent Feinstein-Cicchetti prevalence paradox caveat.
    * **Krippendorff's Alpha ($\alpha$ Ordinal):** Handles multiple raters and incomplete/missing ratings across candidates without imputation.
    * **Intraclass Correlation Coefficient (ICC(2,1)):** Two-way random effects, absolute agreement, single rater model (Shrout & Fleiss 1979). Complete case ANOVA computation with exact degrees of freedom and F-ratio.
    * **Deterministic Percentile Bootstrap CIs:** 1,000 resamples using a deterministic pseudorandom generator (Mulberry32 PRNG with fixed seed 42) ensuring reproducible confidence intervals.
  * **Strict Data Source Splitting & Small-N Banners:**
    * Every aggregate statistic displays sample size $n$ (rating pairs, unique clips, unique assessors) and a data source badge (`real` vs `synthetic`). Mixed datasets are explicitly flagged `mixed` with itemized counts and never blended silently.
    * When $n < 30$ (configurable in `platform_settings`), an amber warning banner explicitly alerts the auditor that measurement estimates carry wide confidence intervals.
    * No hardcoded improvement numbers: all deltas $\Delta \kappa$ are computed on live database scores.
  * **Controlled Comparison Mode (Condition A vs B) & Validity Boundary:**
    * Supports counterbalanced experimental design: Condition A (unassisted baseline) vs Condition B (assisted with SatyaRPL workflow).
    * Computes paired bootstrap differences $\Delta \kappa = \kappa_B - \kappa_A$. Capable of concluding `"no_improvement"` or `"worse"` when assisted workflow does not outperform baseline.
    * Evaluates diagnostic accuracy against master expert gold standards, emphasizing that inter-assessor agreement alone does not establish measurement validity.
  * **Explainable Anomaly Prompts (Review Prompts, Not Accusations):**
    * Detects statistical and operational anomalies using transparent rules and explicit numeric thresholds:
      * `SPEED_SCORING`: Assessment completed in $< 180$ seconds.
      * `STRAIGHT_LINING`: Invariant scores assigned across $\ge 5$ distinct criteria.
      * `LENIENCY_ZSCORE` / `HARSHNESS_ZSCORE`: Assessor mean deviates from peer mean by $|z| \ge 2.0$.
    * Flags are non-punitive review prompts requiring auditor notes ($\ge 10$ characters) that write immutably to `assessor_anomalies` and `audit_log`.
  * **Zero-Trust Auditor RLS & Raw PII Unmasking Gate:**
    * By default, auditors see aggregate metrics, anonymized assessor matrices, and flagged anomaly items.
    * Raw candidate Aadhaar and full-resolution video footage remain masked. Unmasking raw candidate PII requires a mandatory audit justification ($\ge 8$ characters) logged to `auditor_access_logs` and the tamper-evident hash-chained `audit_log`.
  * **Verifiable Export:**
    * CSV and JSON export endpoints deliver pseudonymized datasets with embedded methodology notes: mathematical formulas, quadratic weight definitions, bootstrap seed/resamples, sample sizes, data provenance, and platform version.

---

## ADR-009: Verifiable Credential Issuance, Ed25519 Signing, Key Rotation & Zero-PII Public Verification
* **Status:** Accepted (Phase 8)
* **Context:** Vocational skill assessment records must be publicly verifiable by employers and government bodies without requiring platform logins or central database access for basic validation. However, credentials must protect candidate privacy (preventing identity theft, enumeration, or unwanted Aadhaar/phone scraping). Furthermore, cryptographic signing keys must be rotated over time without invalidating legacy credentials, and platform records must not fraudulently impersonate official NCVET certificates without accreditation.
* **Decision:**
  * **Verifiable Credential Payload & RFC 8785 Canonicalization:**
    * Payload format is inspired by the W3C Verifiable Credentials specification (documenting transparently that formal W3C compliance is not claimed without a formal validator test suite).
    * Payloads contain credential ID, issuer metadata, pseudonymous candidate subject ID (`cand_pseudo_<hash>`), qualification codes (`CON/Q0602`, `QG-03-CO-03951-2025-V2-CSDCI`), NSQF Level 3, per-NOS competency outcomes, assessor sign-off references, issuance/expiration dates, schema version, and key ID.
    * Payloads are strictly canonicalized using RFC 8785 JSON Canonicalization Scheme (JCS) before signing, ensuring deterministic byte representations across all platforms and runtimes.
  * **Asymmetric Ed25519 Signatures & Keystore Management:**
    * Credentials are signed with Ed25519 (RFC 8032) using private keys stored strictly server-side. Private keys are never exported, never sent to clients, never committed to git, and never logged.
    * Public keys are published at standard endpoints (`/.well-known/jwks.json` and `/api/credentials/keys`).
    * **Key Rotation:** Supports active signing key (`ed25519-key-2026-v1`) alongside archived historical keys (`ed25519-key-2025-v0`). Historical credentials remain verifiable via their designated `key_id`. Compromised keys are immediately revoked in the keystore.
    * **Code & Trigger Guard:** Credential issuance is structurally barred unless an approved, signed assessor recommendation record exists (enforced by PostgreSQL trigger `trg_credential_signoff_guard`). The AI is barred from triggering credential creation.
  * **Revocation and Expiry Lifecycle:**
    * Supports live lifecycle statuses: `valid`, `expired`, `revoked`, `superseded`.
    * Administrative or auditor revocation requires a mandatory technical justification ($\ge 10$ characters) permanently logged to `audit_log`.
    * Public verification always checks live database revocation status.
  * **High-Entropy Slug, Checksum & Zero-PII QR:**
    * QR codes encode only a 128-bit unguessable random slug (`verify_slug`) and short checksum (`checksum`) pointing to `/verify/[slug]`. No candidate Aadhaar numbers, phone numbers, names, or scores are embedded in the QR code.
    * Public verification portal (/verify/[slug]) shows minimal candidate identity only when explicit worker consent is given; otherwise displays solely the pseudonymous ID.
    * Anti-enumeration protection: uniform 404 responses for unknown slugs and sliding-window IP rate limiting (60 req/min).
  * **Mandatory Governance Notice (Honest Labelling):**
    * Every digital credential card and printable PDF prominently displays: *"Assessment support record. Not an official NCVET/NSDC certificate unless issued by an accredited body."*
    * Configurable by admin in `platform_settings` (`credential_disclaimer_notice`, default ON).
  * **SIDH / DigiLocker Mock Contract:**
    * Defined in `docs/sidh-integration.md` and `docs/sidh-openapi.yaml`. Implemented as local sandbox endpoints (`/api/mock/sidh/*`) with explicit `MOCK CONTRACT` headers to establish a blueprint for future accreditation.

---

## ADR-010: Red-Team Mode, Pipeline Attack Harness & Sealed Evidence Immutability
* **Status:** Accepted (Phase 9)
* **Context:** In high-stakes vocational assessments subject to public funds (PMKVY/MSDE), security defenses cannot rely on theoretical claims or synthetic mock validations. To prove fraud resistance, the platform requires an integrated adversarial test harness capable of attacking the real pipeline in PostgreSQL under Row Level Security (RLS). The harness must execute real adversarial attacks, report actual detection outcomes and rejection stages honestly, and remain strictly isolated so real candidate assessment records can never be touched or altered.
* **Decision:**
  * **Real Pipeline Execution (No Faked Results):**
    * The attack runner (`src/lib/redteam/runner.ts`) executes 12 concrete adversarial vectors against the real backend pipeline (`serverVerificationPipeline`, `challengeService`, `integrityService`, `scoringService`, PostgreSQL triggers, and Ed25519 cryptographic verifiers).
    * Every run produces a concrete result: expected outcome, actual outcome, specific anomaly flag types (`reuse`, `edit_suspected`, `geo_mismatch`, `clock_skew`, `chain_tampered`, etc.) or rejection reasons, defense stage that caught it, and a PASS or FAIL verdict.
    * When an external provider is not configured (e.g. 1:1 biometric facial recognition without an active Aadhaar FaceRD SDK), the system honestly reports `"NOT DETECTED: provider not configured"` with status `NOT_DETECTED`. It never claims false PASS verdicts.
  * **Strict Synthetic Isolation Guard:**
    * Attacks execute only within dedicated synthetic sandbox scopes (`is_synthetic = true`).
    * The runner asserts `assertSandboxSafety(sessionId)` before executing any vector; if targeted against any session or candidate where `is_synthetic !== true`, the runner aborts with a critical security violation error. Proved via automated test.
  * **Database Immutability Trigger on Sealed Evidence:**
    * Created PostgreSQL trigger `trg_sealed_evidence_immutable` on `evidence_items`.
    * Any SQL `UPDATE` or `DELETE` attempt targeting an evidence record where `sealed_at IS NOT NULL` is aborted at the database engine level by `enforce_sealed_evidence_immutable()`.
  * **Persistence and Reporting:**
    * Created table `security_test_runs` storing timestamp, app version, git commit, runner actor, scope, per-attack verdicts, detection stages, flags, and overall detection rate.
    * Every execution creates an immutable SHA-256 hash linked record in `audit_log`.
    * Export available as JSON and printable HTML/PDF.
  * **Role Authorization & Rate Limiting:**
    * Gated strictly behind authenticated `admin` and `auditor` roles. Worker and assessor roles receive HTTP 403 Forbidden.
    * Runner API enforces sliding-window cooldowns (5s) per runner ID.
  * **Documented Known Limitations:**
    * Created `docs/threat-model.md` detailing physical, biological, and hardware limitations that software alone cannot stop (off-screen coach, proxy hands, deepfakes, rooted Android devices, assessor collusion), current mitigations, and required production additions.

---

## ADR-011: Hardening, Complete RLS Matrix, DPDP Privacy & Cryptographic Shredding
* **Status:** Accepted (Phase 10)
* **Context:** In production operation, the RPL platform must achieve comprehensive hardening across security, privacy, and regulatory compliance: 100% table RLS coverage, privilege escalation defense, rate limiting, magic bytes upload verification, DPDP Act 2023 alignment, and WCAG 2.2 AA accessibility. A critical challenge exists between Section 12 of the DPDP Act (Right to Erasure) and vocational integrity mandates (immutable evidence audit trails).
* **Decision:**
  * **100% RLS Enforcement:**
    * Row Level Security activated across all 35 public database tables (`relrowsecurity = true`).
    * Zero tables without RLS. Explicit policies defined for worker, assessor, auditor, admin, anonymous, and service roles.
  * **Privilege Escalation Prevention:**
    * Implemented PostgreSQL trigger `trg_prevent_role_escalation` on `profiles`.
    * Any non-admin user attempting to alter their own `role` column in `profiles` is aborted by the database engine with an exception.
  * **Reconciling Erasure with Immutability via Crypto-Shredding:**
    * When a worker requests erasure under DPDP Section 12 via `/worker/my-data`, the media blob storage reference is permanently overwritten (`blob_ref = '[CRYPTO_SHREDDED_PER_DPDP_REQUEST]'`), destroying personal footage access.
    * The immutable cryptographic chain hashes (`sha256`, `prev_hash`, and sequence index) are strictly preserved so auditors can mathematically verify historical ledger integrity without possessing the underlying media blob.
  * **Bilingual Consent Framework:**
    * Mandatory bilingual consent screens (Hindi & English) implemented at `/worker/consent` prior to camera, microphone, or GPS capture. Consents logged to `candidate_consents` with version 1.0, timestamp, and scope.
  * **Rate Limiting & Brute Force Lockouts:**
    * Implemented sliding-window rate limiting in `auth_rate_limits`. Enforces 5 failed attempt lockouts (15 minutes) on OTP verification to stop brute-force attacks.
  * **Input & File Upload Validation:**
    * Enforced binary magic bytes checking (WebM, MP4, WAV, PNG, JPEG), 50MB max file sizes, path traversal rejection, and private bucket signed URLs (15-min expiry).
  * **AI Protection & Budget Guard:**
    * Enforced 5,000 character input caps, Zod output schema validation, anti-hallucination database NOS filtering, and a $50.00/month cumulative cost ceiling in `ai_events`.
  * **Accessibility (WCAG 2.2 AA):**
    * High-contrast dark themes, &ge; 48px touch targets, full keyboard navigation for assessor/auditor workspaces, and Devanagari text expansion tolerance.
