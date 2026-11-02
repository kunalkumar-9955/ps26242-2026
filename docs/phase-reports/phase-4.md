# Phase 4 Report: Evidence Engine, Challenge-Response & Immutable Seals
**Date:** October 10, 2026
**Commit:** `phase 4`
**Git Tag:** `phase-4`

---

## 1. What Was Built
* **Practical Task Templates for CON/Q0602 ([`src/lib/db/seed.ts`](file:///e:/PS26242%282026%29/src/lib/db/seed.ts)):**
  * Seeded 3 practical tasks mapped to core NOS units (`CON/N0602` tools, `CON/N0604` wiring, `CON/N0605` panels) with challenge variants (`code_on_camera`, `spoken_phrase`, `task_variant`, `sequence_prompt`).
  * Marked honestly as `verified: false` with label `"draft - needs assessor review"`.
* **Server Challenge Service ([`src/lib/evidence/challenge-service.ts`](file:///e:/PS26242%282026%29/src/lib/evidence/challenge-service.ts)):**
  * Generates random, single-use, cryptographically signed (HMAC-SHA256) expiring challenges bound to candidate, session, and task.
  * Supports batch pre-fetching of challenges for offline capture resilience.
  * Prevents replay attacks: validates unexpired window, checks session/task binding, and marks nonces as consumed upon first use.
* **On-Device Integrity & Hashing ([`src/lib/evidence/integrity.ts`](file:///e:/PS26242%282026%29/src/lib/evidence/integrity.ts)):**
  * WebCrypto SHA-256 clip hashing and cryptographic block chain generation (`prev_hash`, `chain_index`).
  * 64-bit perceptual hash (pHash/dHash) generation for frame reuse detection and Hamming distance comparison.
* **Server Verification Pipeline ([`src/lib/evidence/server-verifier.ts`](file:///e:/PS26242%282026%29/src/lib/evidence/server-verifier.ts)):**
  * 8-point automated verification running on upload:
    1. Challenge validity, single-use check, and binding verification.
    2. Hash chain continuity and genesis block match.
    3. Clock-skew detection (device vs server time difference > 120s triggers `clock_skew` flag).
    4. Geolocation plausibility and impossible travel check (> 500km in under 2 hours triggers `geo_mismatch` flag).
    5. Cross-candidate perceptual hash reuse detection (Hamming distance $\le 4$ triggers `reuse` flag).
    6. Edit-suspicion heuristics (re-encode traces, framerate drops trigger `edit_suspected` flag).
    7. Face consistency/liveness check via provider interface (records `liveness_result = 'not_checked'` if unavailable).
    8. Challenge code/phrase OCR presence check.
  * Inserts record into `evidence_items` and logs all failed checks into `evidence_flags` table.
  * Seals the record with `sealed_at = NOW()`, triggering the PostgreSQL database trigger that prohibits subsequent UPDATE or DELETE.
* **Mobile-First Capture UI ([`src/app/worker/capture/page.tsx`](file:///e:/PS26242%282026%29/src/app/worker/capture/page.tsx)):**
  * Responsive 360px layout with $\ge 48\text{px}$ touch targets.
  * Step-by-step task checklist, active challenge overlay, GPS status, and 3-2-1 countdown ring.
  * MediaRecorder capture with fallback for unsupported browsers/unsecured HTTP contexts.
  * Retake workflow with attempt tracking (`attempt_number`).
  * Worker-facing verification outcome card with chain status badge, audit flags, and "what to do next" guidance.
* **Reusable Attack Simulation Helpers ([`src/lib/evidence/attack-helpers.ts`](file:///e:/PS26242%282026%29/src/lib/evidence/attack-helpers.ts)):**
  * Dedicated adversary attack simulations: Replay Attacks, Re-encoded Spices, GPS Spoofing, Reused Nonces, Chain Tampering, and Face Mismatch.

---

## 2. What Was Tested
* **Phase 4 Automated Test Suite ([`src/test/phase-4.test.ts`](file:///e:/PS26242%282026%29/src/test/phase-4.test.ts)):**
  * `npm test`: **18 passed** across 4 test suites (`smoke.test.ts`, `phase-2b.test.ts`, `phase-3.test.ts`, `phase-4.test.ts`).
  * **Challenge Integrity:** Tested single-use consumption; verified second attempt is rejected as Replay Attack; verified session mismatch rejection.
  * **Hash Chain Continuity:** Verified tampered `prev_hash` produces `chain_tampered` flag and breaks verification.
  * **Perceptual Hash Reuse Detection:** Verified replaying a video clip from another candidate triggers a critical `reuse` flag with matching Hamming distance.
  * **Clock-Skew & GPS Flags:** Verified simulated 2-hour device clock skew produces `clock_skew` flag; verified impossible travel produces `geo_mismatch` flag.
  * **Database Trigger Immutability:** Verified that calling SQL `UPDATE` or `DELETE` on a sealed evidence row raises an exception from `enforce_sealed_evidence_immutability()` database trigger.
* **Type-Check & Linting:**
  * `npx tsc --noEmit; npm run lint`: **0 errors, 0 warnings**.
* **Next.js Production Build:**
  * `npm run build`: Compiled all 14 pages and API routes cleanly (including `/worker/capture`, `/api/evidence/challenges`, `/api/evidence/upload`, `/api/evidence/tasks`).

---

## 3. What Is Real, Mocked & Simulated
* **Real:**
  * Live PostgreSQL tables (`tasks`, `challenges`, `evidence_items`, `evidence_flags`) running on `satyarpl_db`.
  * HMAC-SHA256 signature signing and verification using `CHALLENGE_HMAC_SECRET`.
  * SHA-256 hash chaining and perceptual hash (pHash) Hamming distance calculations.
  * PostgreSQL append-only immutable triggers preventing modification of sealed evidence.
  * Server-side verification pipeline and flag generation.
* **Mocked / Simulated:**
  * **Liveness & Face Provider:** In the absence of an external biometric provider API (e.g., AWS Rekognition or Aadhaar FaceRD), liveness defaults to `not_checked` unless explicit test metadata is supplied.
  * **Camera on Unsecured HTTP:** Browser security requires HTTPS for `navigator.mediaDevices.getUserMedia`. In non-HTTPS development testing, a simulated camera feed is provided. Instructions for testing on a physical phone via HTTPS tunnel are provided below.

---

## 4. What Is Unverified
* **Task Templates & Variants:** The 3 practical task templates and variants for `CON/Q0602` were authored by our team and are marked `verified: false` with label `"draft - needs assessor review"`.
* **Passing Threshold & Rubrics:** As noted in Phase 2b, rubrics and pass threshold remain unverified drafts.

---

## 5. Technical Reality: What Device Clocks and Geolocation Can and Cannot Prove
* **Device Clocks:**
  * **What it proves:** Measures relative order of events captured on the device.
  * **What it CANNOT prove:** A rooted or modified device can spoof local system time. Server received timestamps (`server_received_at`) and short-lived challenges bound to server timestamps mitigate this, but cannot cryptographically prove offline capture time without hardware-backed attestation (Android Keystore / Play Integrity).
* **Geolocation (GPS):**
  * **What it proves:** Provides reported client coordinates when permitted.
  * **What it CANNOT prove:** Software GPS spoofing apps (mock location providers) can simulate coordinates. Server-side velocity checks (impossible travel) catch crude anomalies, but high-assurance geofencing requires cellular cell-tower triangulation or hardware attestation.

---

## 6. How to Test Camera on a Physical Mobile Phone
Browsers enforce that `getUserMedia` works only on `https://` or `localhost`:
1. Use an HTTPS reverse tunnel (e.g. `npx localtunnel --port 3000` or `cloudflared tunnel --url http://localhost:3000`).
2. Open the generated HTTPS URL on the mobile browser (Chrome on Android or Safari on iOS).
3. Grant camera and microphone permissions when prompted.
