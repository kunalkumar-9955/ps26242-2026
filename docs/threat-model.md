# SatyaRPL Threat Model & Adversarial Defense Architecture

> **SIH 2026 · Problem Statement PS 26242 · MSDE / NCVET**  
> *Platform Thesis: We don't make AI judge workers. We make RPL assessments fraud-resistant and assessor-auditable.*

---

## 1. Context and Threat Landscape

The Recognition of Prior Learning (RPL) process under PMKVY has historically been vulnerable to systematic fraud documented by the **Comptroller and Auditor General of India (CAG)** and administrative inquiries:
1. **Recycled Video Evidence:** Training centers reusing stock clips across multiple candidates or cohorts.
2. **Ghost Candidates:** Assessments submitted with fabricated GPS locations or backdated timestamps.
3. **Impersonation & Proxy Takers:** Skilled contractors executing practical tasks on behalf of unskilled candidates.
4. **Assessor Collusion:** Assessors rubber-stamping bulk passing grades without inspecting evidence.
5. **Post-Hoc Data Tampering:** Altering scores or evidence items after assessment completion.

SatyaRPL addresses these vulnerabilities using a **multi-stage defense pipeline** enforced in PostgreSQL with strict Row Level Security (RLS) and cryptographic guarantees.

---

## 2. STRIDE Threat Analysis

| Threat Category | Target Asset | Adversarial Vector | Platform Defense Mechanism | Stage |
|---|---|---|---|---|
| **Spoofing (Identity)** | Candidate verification | Replay of old clip or another candidate's video | Single-use HMAC-SHA256 challenge nonces, perceptual image hashing (`phash`) cross-candidate deduplication | `CHALLENGE_GATE`, `INTEGRITY_STAGE` |
| **Tampering** | Video clips & checklists | Splicing, video trimming, bitstream alteration | Perceptual Hamming distance delta check (`edit_suspected`), SHA-256 hash chaining | `INTEGRITY_STAGE`, `HASH_CHAIN_STAGE` |
| **Repudiation** | Assessment session evidence | Candidate or center claims clip was modified post-upload | Append-only hash chain linking blocks with timestamp + GPS signature | `HASH_CHAIN_STAGE`, `STORAGE_IMMUTABILITY_STAGE` |
| **Information Disclosure** | AI suggestion before blind scoring | Assessor attempts to view AI gap extraction to avoid grading | Blind-first scoring workflow enforced server-side with HTTP 403 `BLIND_SCORE_REQUIRED` | `SCORING_STAGE` |
| **Information Disclosure** | Private storage blobs | Unsigned direct HTTP request attempting to access evidence video | Private bucket with HMAC-SHA256 signed URLs (15-min expiry); unsigned access strictly rejected | `STORAGE_GATE` |
| **Denial of Service / Corruption** | Sealed evidence items | Malicious SQL `UPDATE` or `DELETE` targeting evidence | PostgreSQL trigger `trg_sealed_evidence_immutable` aborts transactions targeting sealed rows | `STORAGE_IMMUTABILITY_STAGE` |
| **Denial of Service / Brute Force** | OTP endpoints & AI extraction | Rapid credential guessing or LLM cost exhaustion | Endpoint rate limits (`auth_rate_limits`), 15-min lockouts on 5 failed OTPs, monthly $50 AI cost guard | `AUTH_RATE_LIMIT_STAGE` |
| **Elevation of Privilege** | Credential issuance & tamper | Forging NSQF Level or altering outcome signature | RFC 8785 JSON canonicalization + Ed25519 signature verification against public key registry | `CREDENTIAL_STAGE` |
| **Elevation of Privilege** | User profile role column | Authenticated worker updating their role to `admin` | PostgreSQL trigger `trg_prevent_role_escalation` throws SQL exception if non-admin modifies role | `DATABASE_SECURITY_STAGE` |

---

## 3. Defense Pipeline Stages

The platform routes all submitted assessment artifacts through nine sequential validation gates:

```
[Candidate Device]
        │
        ▼
1. CHALLENGE_GATE ──────────► Verifies single-use HMAC nonce, TTL window, consumption status
        │
        ▼
2. INTEGRITY_STAGE ─────────► Computes perceptual hash (pHash), checks Hamming distance against global database
        │
        ▼
3. TELEMETRY_STAGE ─────────► Verifies GPS geofence bounds and checks device clock drift against server NTP (< 300s)
        │
        ▼
4. HASH_CHAIN_STAGE ────────► Verifies sequential SHA-256 block hash continuity (prevHash === expected)
        │
        ▼
5. IDENTITY_STAGE ──────────► 1:1 facial biometric matching against Aadhaar enrolled photograph (Optional provider)
        │
        ▼
6. NLP_LLM_STAGE ───────────► Sanitizes transcript for prompt injection, enforces Zod schema, validates against DB NOS
        │
        ▼
7. SCORING_STAGE ───────────► Enforces blind-first rubric grading (locks AI suggestions until assessor commits score)
        │
        ▼
8. STORAGE_IMMUTABILITY ────► PostgreSQL triggers prohibit UPDATE/DELETE on sealed evidence records
        │
        ▼
9. CREDENTIAL_STAGE ────────► Verifies deterministic RFC 8785 canonical JSON and Ed25519 cryptographic signatures
```

---

## 4. Known Physical and Biological Limitations (Honest Disclosure)

As required by Section 8 of the Master Prompt, the system explicitly documents physical, hardware, and social attacks that cannot be reliably stopped purely through software running in a standard mobile web browser:

### 4.1. Skilled Helper Doing Technical Task while Candidate Holds Nonce
- **Vulnerability:** An unskilled candidate holds up the challenge paper/code while a certified electrician off-center or to the side executes the complex distribution board wiring.
- **Current Software Mitigation:** Dynamic sequence variant challenge forcing the candidate to narrate each action aloud with synchronized hand visibility.
- **Production Native Requirement:** Continuous skeletal pose estimation model verifying hand-to-face biomechanical connectivity, or certified in-person RPL invigilation.

### 4.2. Off-Camera Helper / Hidden Prompter
- **Vulnerability:** A candidate speaks the spoken challenge or technical rationale while an off-camera accomplice whispers answers or holds up a prompt board.
- **Current Software Mitigation:** Random nonces with short TTL (900 seconds) preventing memorization; assessor audit playback with speech cadence inspection.
- **Production Native Requirement:** Dual-camera recording (front + rear ultra-wide angle) or secondary room overview proctoring camera.

### 4.3. High-Quality Screen Replay / Generative Deepfakes
- **Vulnerability:** Replaying a prerecorded, high-resolution 4K video displayed on an iPad or OLED monitor directly into the smartphone camera.
- **Current Software Mitigation:** Perceptual pHash cross-candidate deduplication; candidate must show a freshly generated physical handwritten code.
- **Production Native Requirement:** Moiré pattern detection algorithms, active flash-reflection challenge (screen glare vs. skin reflection), and Time-of-Flight / LiDAR depth sensors.

### 4.4. Rooted / Jailbroken Android OS Hooking
- **Vulnerability:** Using Magisk / Xposed / Frida to hook Linux kernel drivers, feeding virtual camera feeds, spoofing GPS coordinates, and manipulating `clock_gettime`.
- **Current Software Mitigation:** Server-side geofencing distance delta bounding; server-side NTP timestamp delta bounding.
- **Production Native Requirement:** Native Android application leveraging **Google Play Integrity API** and hardware-backed KeyStore attestation (TEE / Knox).

### 4.5. Assessor Collusion / Bribery Rings
- **Vulnerability:** An assessor accepts kickbacks to award passing scores regardless of fraudulent video evidence.
- **Current Software Mitigation:** Blind-first scoring (AI suggestion hidden); inter-rater agreement analytics (Weighted Cohen's Kappa, Krippendorff's Alpha); mandatory calibration gate (Kappa < 0.40 triggers account suspension); cryptographic immutable audit logging.
- **Production Native Requirement:** Mandatory dual-evaluator blind scoring on a random 10% sample of all candidates, paired with biometric authentication of the assessor during grading.

---

## 5. Red-Team Test Runner Architecture

The automated Red-Team suite (`src/lib/redteam/runner.ts`) executes all 12 adversarial vectors directly against the production pipeline in PostgreSQL:

1. `replay_clip_same_candidate` -> Intercepted at `INTEGRITY_STAGE` (`reuse`)
2. `replay_clip_cross_candidate` -> Intercepted at `INTEGRITY_STAGE` (`reuse`)
3. `reencoded_clip` -> Intercepted at `INTEGRITY_STAGE` (`edit_suspected`)
4. `gps_spoof` -> Intercepted at `TELEMETRY_STAGE` (`geo_mismatch`)
5. `clock_skew` -> Intercepted at `TELEMETRY_STAGE` (`clock_skew`)
6. `expired_reused_challenge` -> Intercepted at `CHALLENGE_GATE` (`challenge_missing`)
7. `chain_tamper` -> Intercepted at `HASH_CHAIN_STAGE` (`chain_tampered`)
8. `identity_mismatch` -> Routed to `IDENTITY_STAGE`. When no biometric provider is configured, the suite honestly returns `NOT DETECTED: provider not configured` (never false `PASS`).
9. `prompt_injection_transcript` -> Intercepted at `NLP_LLM_STAGE` (`[FILTERED_INJECTION_TOKEN]` + anti-hallucination DB validation)
10. `eavesdrop_ai_suggestion` -> Intercepted at `SCORING_STAGE` (HTTP 403 `BLIND_SCORE_REQUIRED`)
11. `sealed_evidence_tamper` -> Intercepted at `STORAGE_IMMUTABILITY_STAGE` (PostgreSQL trigger exception)
12. `credential_signature_tamper` -> Intercepted at `CREDENTIAL_STAGE` (RFC 8785 Ed25519 verification failure)

---

## 6. Audit & Safety Invariants

1. **Synthetic Isolation Invariant:** The attack runner will abort execution if invoked against any candidate or session where `is_synthetic !== true`.
2. **Role Gate Invariant:** Only users authenticated with `admin` or `auditor` roles can trigger attack simulations.
3. **Append-Only Evidence Invariant:** Any SQL `UPDATE` or `DELETE` on rows in `evidence_items` with non-null `sealed_at` is rejected at the database engine level via trigger.
4. **Tamper-Evident Audit Invariant:** Every Red-Team execution writes to `security_test_runs` and `audit_log`, creating a SHA-256 hash linked chain of all administrative activity.
