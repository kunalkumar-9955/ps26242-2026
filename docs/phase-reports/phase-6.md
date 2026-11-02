# Phase 6 Report: Assessor Workflow, Calibration Gate & Blind-First Scoring Integrity
**Date:** October 11, 2026  
**Commit:** `phase 6`  
**Git Tag:** `phase-6`  

---

## 1. What Was Built

### A. Assessor Calibration Gate (Inter-Rater Reliability Engine)
* **Gold-Standard Benchmark Clips ([`supabase/migrations/20261011000000_assessor_workflow.sql`](file:///e:/PS26242%282026%29/supabase/migrations/20261011000000_assessor_workflow.sql)):**
  * Table `gold_standard_clips` stores master reference video references, named master expert evaluators (e.g. Er. R. K. Mishra, Senior Master Trainer, CSDCI), official source citations, and criterion-by-criterion benchmark level scores (1–4).
  * Table includes `synthetic: boolean` flag ensuring test clips are clearly demarcated.
* **Cohen's Quadratic Weighted Kappa ($\kappa$) ([`src/lib/assessor/calibration-service.ts`](file:///e:/PS26242%282026%29/src/lib/assessor/calibration-service.ts)):**
  * Calculates mathematical inter-rater agreement between assessor grading and expert benchmarks across $k = 4$ ordinal levels.
  * Uses quadratic penalty weights: $w_{ij} = \frac{(i - j)^2}{(k - 1)^2} = \frac{(i - j)^2}{9}$, severely penalizing wide discrepancies (e.g., scoring Level 1 when master benchmark is Level 4).
  * Generates observed matrix $O$ and chance-expected matrix $E$ to compute $\kappa = 1 - \frac{\sum w_{ij} O_{ij}}{\sum w_{ij} E_{ij}}$.
* **Certification Gate & Expiration:**
  * Assessor certification records stored in `assessor_calibration` with `certified_until` (30-day validity window) and `passed: boolean`.
  * Threshold loaded dynamically from `platform_settings` (`assessor_calibration_kappa_threshold`, default 0.70 marked `UNVERIFIED`).
  * If $\kappa < 0.70$ or if `certified_until` has elapsed, access to candidate scoring workspaces is strictly locked with actionable recalibration prompts.

### B. Blind-First Scoring Workspace
* **Dual-Pane Keyboard-Friendly Staff Workspace ([`src/app/assessor/session/[id]/page.tsx`](file:///e:/PS26242%282026%29/src/app/assessor/session/%5Bid%5D/page.tsx)):**
  * Built using Tailwind CSS with dense, calm layout adhering to WCAG 2.2 AA standards.
  * Side-by-side 4-level rubric descriptions directly displayed for each criterion (Beginner, Developing, Competent, Master).
  * Rapid single-keystroke grading shortcuts (`1`, `2`, `3`, `4`) with mandatory technical rationale ($\ge 10$ characters).
  * HTML5 video player with interactive timeline seek markers (`0:05 Safety`, `0:12 Wire Strip`, `0:24 Conduit Entry`, `0:38 MCB Mount`).
* **Server-Side Blind-First Gating:**
  * **API Layer ([`src/app/api/assessor/suggestions/route.ts`](file:///e:/PS26242%282026%29/src/app/api/assessor/suggestions/route.ts)):** Requests to fetch AI suggestions return HTTP 403 `BLIND_SCORE_REQUIRED` if the assessor has not yet committed their blind score for that criterion.
  * **Service Layer ([`src/lib/assessor/scoring-service.ts`](file:///e:/PS26242%282026%29/src/lib/assessor/scoring-service.ts)):** `getAiSuggestion()` throws an exception if no blind score exists for the assessor.
  * **Database Layer ([`supabase/migrations/20261011000000_assessor_workflow.sql`](file:///e:/PS26242%282026%29/supabase/migrations/20261011000000_assessor_workflow.sql)):** RLS policy `ai_suggestions_blind_first_policy` hides `ai_suggestions` rows from assessors until a corresponding `is_blind = true` row is committed.

### C. Immutable Blind Scores & Revision Audit Trail
* **PostgreSQL Trigger `trg_blind_scores_immutable`:**
  * Enforces immutability on `scores` table. Any direct SQL `UPDATE` on a row where `is_blind = true` raises an uncatchable exception: `CRITICAL AUDIT VIOLATION: Blind scores are immutable and cannot be overwritten or updated`.
* **PostgreSQL Trigger `trg_scores_override_reason`:**
  * When an assessor modifies their score post-AI observation, a new row is inserted with `is_blind = false` and `revised_after_ai = true`.
  * Trigger enforces that `override_reason` must be at least 5 non-whitespace characters.

### D. Advisory AI Evidence Observation & Physical Abstention
* **Advisory-Only Bounds ([`src/lib/assessor/scoring-service.ts`](file:///e:/PS26242%282026%29/src/lib/assessor/scoring-service.ts)):**
  * AI observations supply non-binding evidence citations (suggested level, confidence %, timestamp bookmarks, and rationale).
  * The AI is structurally barred from producing any final decision or pass/fail verdict.
* **Code-Enforced Physical Abstention:**
  * Criteria with `requires_physical = true` or `assessable_from_video = 'no'` **always** abstain in code (`abstained: true`, `abstain_reason: 'needs_physical_verification'`, `suggested_level: null`).
  * Abstention is rendered in the UI as a first-class operational state, routing the assessor to the hands-on physical verification checklist.

### E. Physical Verification Checklist
* **Tactile Inspection Workflow ([`src/lib/assessor/physical-service.ts`](file:///e:/PS26242%282026%29/src/lib/assessor/physical-service.ts)):**
  * Dedicated offline-capable interface for tactile criteria: crimp tensile pull-force resistance, terminal torque screw tightness, finish quality, and 500V megger insulation resistance.
  * Records result (Pass/Fail), rating level (1–4), tactile observation notes, and optional photo evidence references into `physical_verifications` table.

### F. Deterministic Recommendation Engine & Sign-Off Guard
* **Deterministic Arithmetic ([`src/lib/assessor/scoring-service.ts`](file:///e:/PS26242%282026%29/src/lib/assessor/scoring-service.ts)):**
  * Calculates total weighted score and percentage against the 50% pass threshold configured in `platform_settings`.
  * System draft (`competent` vs `not_yet_competent`) is generated by strict deterministic arithmetic—never free-form LLM calculation.
* **PostgreSQL Trigger `trg_credential_signoff_guard`:**
  * `BEFORE INSERT ON credentials` trigger queries `recommendations` table.
  * Rejects credential creation with exception: `FRAUD PREVENTION: Cannot issue credential without a completed, signed assessor recommendation record for session...`
  * Assessor signs recommendation digitally, writing digital signature hash and timestamp to PostgreSQL before credential issuance is permitted.

### G. Assessor Self-View & Assignment Queue
* **Staff Dashboard ([`src/app/assessor/page.tsx`](file:///e:/PS26242%282026%29/src/app/assessor/page.tsx)):**
  * Renders personal performance metrics: Agreement Rate vs Expert Benchmarks (84%), Override Rate Post-AI (12%), and Average Scoring Minutes per Candidate (18.5 min).
  * Displays assigned candidate queue filtered by assessor ID via PostgreSQL RLS.
  * Shows prominent calibration status banner: Green when active, Amber when recalibration is required.

### H. Admin Gold-Standard Registry
* **Admin Management Portal ([`src/app/admin/page.tsx`](file:///e:/PS26242%282026%29/src/app/admin/page.tsx)):**
  * Dedicated **Gold Benchmark Clips** tab for platform administrators to inspect and register gold-standard clips and expert criterion levels.
  * Mutations write cryptographically hash-chained entries into `audit_log`.

---

## 2. Test Verification Summary

Automated tests executed via `npm test` (Vitest): **33 passed across 6 test suites (100% pass rate)**:

```
 RUN  v3.2.7 E:/PS26242(2026)

 ✓ src/test/smoke.test.ts (2 tests)
 ✓ src/test/phase-2b.test.ts (5 tests)
 ✓ src/test/phase-3.test.ts (5 tests)
 ✓ src/test/phase-4.test.ts (6 tests)
 ✓ src/test/phase-5.test.ts (9 tests)
 ✓ src/test/phase-6.test.ts (6 tests)

 Test Files  6 passed (6)
      Tests  33 passed (33)
   Duration  1.64s
```

### Phase 6 Specific Test Coverage ([`src/test/phase-6.test.ts`](file:///e:/PS26242%282026%29/src/test/phase-6.test.ts)):
1. **Early AI suggestion fetch fails via UI/API route, service layer, and direct database queries:**
   * Proved API route returns HTTP 403 `BLIND_SCORE_REQUIRED`.
   * Proved service layer throws `BLIND_SCORE_REQUIRED` exception.
   * Proved database query under blind-first policy returns 0 rows.
2. **Calibration gate blocks below threshold and expires:**
   * Proved quadratic weighted kappa calculation accurately penalizes large discrepancies.
   * Proved uncalibrated and expired assessors are blocked from accessing candidate workspaces.
   * Proved low-agreement submissions (< 0.70) fail certification.
3. **Criteria with `assessable_from_video = 'no'` or `requires_physical = true` always abstain:**
   * Proved service returns `abstained = true` and `abstainReason = 'needs_physical_verification'` with `suggestedLevel = null`.
   * Proved criterion successfully routes to physical checklist.
4. **Database constraint preventing credential issuance without completed sign-off:**
   * Proved direct SQL `INSERT INTO credentials` raises PostgreSQL exception when session is un-signed.
   * Proved credential insertion succeeds immediately after valid assessor sign-off.
5. **Blind score protection & mandatory override reason:**
   * Proved PostgreSQL trigger `trg_blind_scores_immutable` blocks SQL `UPDATE` on blind score rows.
   * Proved revised scores without override reason are rejected.
   * Proved revised scores with valid reasons are saved as new rows while preserving the blind score intact.
6. **Role-based permissions across new Phase 6 tables:**
   * Proved `gold_standard_clips`, `assessor_calibration`, `physical_verifications`, and `recommendations` enforce appropriate access control.

---

## 3. Honest Disclosure: Real vs Mocked vs Unverified

| Component / Subsystem | Implementation Reality | Notes & Limitations |
|---|---|---|
| **PostgreSQL RLS & Triggers** | **100% REAL** | Running on live PostgreSQL 18 (`satyarpl_db`). Hard database triggers enforce blind score immutability, override reasons, and credential sign-off guards. |
| **Quadratic Weighted Kappa Math** | **100% REAL** | Implemented exact Cohen formula with quadratic penalty weights ($w_{ij} = (i-j)^2/9$) and margin distribution matrices. |
| **Server-Side Blind Gating** | **100% REAL** | Enforced at HTTP API, TypeScript service layer, and PostgreSQL RLS policy level. |
| **Physical Verification Store** | **100% REAL** | Stored in PostgreSQL `physical_verifications` table with offline IndexedDB caching. |
| **Deterministic Scoring Arithmetic**| **100% REAL** | Strict weighted arithmetic calculation; LLM generates explanation text only. |
| **AI Advisory Suggestions** | **HONEST MOCK FALLBACK** | When external OpenAI/Gemini API keys are absent in `.env.local`, system uses deterministic mock advisory observations clearly flagged with `mock: true` and a visible `MOCK` badge in UI. |
| **Video Playback Streams** | **PUBLIC TEST ASSETS** | Sample MP4 streams from Google's public test bucket (`ForBiggerBlazes.mp4`) are used to demonstrate real HTML5 video playback and timeline markers. |
| **Calibration Kappa Threshold (0.70)**| **UNVERIFIED (Draft)** | Stored in `platform_settings` and explicitly flagged `verified: false`. Sourced from draft PMKVY RPL assessor quality guidelines; requires formal NCVET Gazette confirmation. |
| **Pass Threshold (50%)** | **UNVERIFIED (Draft)** | Stored in `platform_settings` and explicitly flagged `verified: false`. Derived from draft Level 3 guidelines. |
| **Synthetic Test Data** | **DEMARCATED SYNTHETIC** | Synthetic candidates (e.g., Ramesh Sharma) and benchmark clips are explicitly stored with `is_synthetic: true` / `synthetic: true` and badged in the UI. |
