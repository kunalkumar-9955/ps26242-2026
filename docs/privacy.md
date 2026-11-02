# SatyaRPL Privacy & DPDP Architecture Document

> **IMPORTANT DISCLAIMER:**  
> This document and the SatyaRPL technical architecture describe engineering controls designed to align with the **Digital Personal Data Protection Act, 2023 (DPDP Act)** and MeitY/MSDE guidelines.  
> **THIS DOCUMENT DOES NOT CONSTITUTE FORMAL LEGAL ADVICE.**  
> All data retention thresholds and deletion workflows must undergo independent verification by qualified legal counsel and the Data Protection Board of India before deployment to production.

---

## 1. Principles of Data Processing

Under Section 4 and Section 6 of the DPDP Act 2023, data processing must be grounded in lawful consent, specific purpose limitation, and absolute data minimisation:

1. **Lawful & Informed Consent:** Data principals (candidates/workers) receive clear, unambiguous notices in **Hindi** and **English** before any sensor data (microphone, camera, geolocation) is collected.
2. **Purpose Limitation:** Evidence gathered is strictly processed for the purpose of Recognition of Prior Learning (RPL) assessment under NSQF Assistant Electrician (`CON/Q0602`) standards.
3. **Data Minimisation:** The platform collects only what is strictly necessary to establish authentic competency. High-precision GPS coordinates are used solely for real-time bounding and purged post-assessment.
4. **Storage Limitation & Retention:** Data is retained only as long as necessary for regulatory appeals and auditing. Raw media blobs are crypto-shredded following audit windows.

---

## 2. Bilingual Consent Framework

Consent is collected prior to initiating practical evaluations via `/worker/consent`:

- **Notice Details Disclosed:**
  - **Purpose:** Vocational assessment and certification under National Skills Qualifications Framework (NSQF).
  - **Data Categories Collected:** Voice declaration audio, practical task video snippets, GPS location, device timestamp, and skill self-declarations.
  - **Access Controls:** Restricted to assigned certified assessors, quality auditors, and administrative compliance officials.
  - **Right of Withdrawal:** Workers are informed that they may revoke consent at any time; revocation halts ongoing assessments.
- **Audit Persistence:** Every consent event is persisted in PostgreSQL table `candidate_consents` recording:
  - `candidate_id` (pseudonymous UUID)
  - `language` (`hi` or `en`)
  - `version` (`1.0`)
  - `granted_at` (UTC timestamp)
  - Scrubbed client hash (`ip_hash`, `user_agent`)

---

## 3. Worker Data Rights (DPDP Section 11 & Section 12)

Candidates access their DPDP rights through the dedicated `/worker/my-data` portal:

### 3.1. Right to Access Information (View My Data)
Workers can inspect:
- All submitted voice declarations and NOS coverage gap analyses.
- Assessment sessions and assessor scoring statuses.
- Full inventory of recorded evidence items and their current cryptographic state.

### 3.2. Right to Data Portability (Export JSON)
A single-click "डेटा निर्यात करें (Export JSON)" action exports a complete, machine-readable JSON bundle of the worker's records. PII is scrubbed and identifiers are pseudonymous.

### 3.3. Right to Correction and Erasure (Crypto-Shredding)
Under DPDP Section 12, data principals may request erasure of their personal data. However, **vocational assessment integrity requires regulatory auditability**:

#### The Tension: Immutability vs. Right to Erasure
- **Regulatory Requirement:** CAG, NCVET, and MSDE require immutable audit trails proving an assessor did not fabricate passing grades.
- **Privacy Requirement:** The worker has a statutory right to have personal audio and video footage erased.

#### Technical Resolution: Cryptographic Shredding
SatyaRPL reconciles this conflict through **Crypto-Shredding**:
1. When deletion is requested, the system permanently destroys the storage media blob reference:
   ```sql
   UPDATE evidence_items 
   SET blob_ref = '[CRYPTO_SHREDDED_PER_DPDP_REQUEST]'
   WHERE session_id IN (SELECT id FROM assessment_sessions WHERE candidate_id = $1);
   ```
2. The **SHA-256 block hash** (`sha256`), sequence index (`seq`), and predecessor link (`prev_hash`) **remain intact** in the ledger.
3. **Result:** No third party can ever view the personal audio or video. However, auditors can mathematically verify that the cryptographic chain created during the assessment remains unbroken and unforgeable.
4. The deletion event is logged to `data_deletion_requests` and `audit_log`.

---

## 4. Protection of Children & Sensitive Data

1. **Child Safety Gate (Section 9 DPDP Act):**
   - Industrial qualification `CON/Q0602` involves live 230V electrical circuitry, conduit bending, and heavy hand tools.
   - Registration enforces a strict **minimum age of 18 years**.
   - Attempted registrations under 18 years of age are automatically blocked at API boundary (`validateAgeEligibility`).
2. **Zero Raw Aadhaar Collection:**
   - Raw 12-digit Aadhaar numbers are **never requested, collected, processed, or stored**.
   - If government identity verification is integrated, the system accepts only a pseudonymous reference token or masked format (`XXXX-XXXX-1234`).
   - Logging filters explicitly scrub any patterns matching Indian identity numbers.

---

## 5. Retention Schedule & Scheduled Purge Job

Retention periods are managed in PostgreSQL table `data_retention_policies`:

| Data Category | Retention Period | Default Action | Legal Status |
|---|---|---|---|
| **Raw Video Blobs** | 180 Days | Crypto-Shred Media Blob (Preserve Hashes) | `UNVERIFIED pending legal review` |
| **Telemetry (GPS/Bearing)** | 90 Days | Purge Coordinate Values (Preserve Hash) | `UNVERIFIED pending legal review` |
| **AI Extraction Telemetry** | 365 Days | Retain Pseudonymous Tokens for Drift Analysis | `UNVERIFIED pending legal review` |
| **Revoked Credential Hashes** | 1,095 Days (3 Years) | Retain Tombstone Hashes for Public Ledger | `UNVERIFIED pending legal review` |

### Automated Purge Worker
- The purge runner (`executeRetentionPurgeJob`) queries policies, identifies expired records older than `retention_days`, and executes cryptographic shredding.
- Administrators can trigger or inspect purges via `/api/admin/retention` and the `/admin/retention` dashboard.
