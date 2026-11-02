# Phase 7 Report: Auditor Analytics, Reliability Statistics & Anomaly Detection
**Date:** October 11, 2026  
**Commit:** `phase 7`  
**Git Tag:** `phase-7`  

---

## 1. What Was Built

### A. Agreement Statistics Library (Pure, Well-Tested Mathematical Library)
* **File ([`src/lib/analytics/agreement.ts`](file:///e:/PS26242%282026%29/src/lib/analytics/agreement.ts)):**
  * **Cohen's Quadratic Weighted Kappa ($\kappa_w$):** Implemented for ordinal 4-level scales using quadratic weights $w_{ij} = \frac{(i - j)^2}{(k - 1)^2} = \frac{(i - j)^2}{9}$. Disagreements are penalized quadratically.
  * **Zero-Variance Undefined Kappa Protection:** When all ratings from both raters fall into a single category (e.g. all 3s), chance agreement equals 1.0 and expected disagreement is 0.0. The library returns `{ kappa: undefined, isUndefined: true }` and `undefinedReason: "Zero variance..."`, **never** returning 0 or 1.
  * **Prevalence / Bias Paradox Protection (Feinstein-Cicchetti):** Alongside kappa, the library always computes percent exact agreement and adjacent agreement ($\pm 1$ level). When distributions are heavily skewed (Prevalence Index $\ge 0.50$ and percent agreement $\ge 70\%$), a caveat note is generated instructing auditors to inspect adjacent agreement alongside kappa.
  * **Krippendorff's Alpha ($\alpha$ Ordinal Metric):** Implemented for multiple raters, handling incomplete and missing observations (`null`/`undefined`) across units without artificial imputation. Evaluates observed disagreement ($D_o$) vs chance expected disagreement ($D_e$) using ordinal distances $\delta(c, k)^2 = \left(\sum_{g=c}^k n_g - \frac{n_c + n_k}{2}\right)^2$.
  * **Intraclass Correlation Coefficient (ICC(2,1)):** Two-way random effects, absolute agreement, single rater model (Shrout & Fleiss 1979, McGraw & Wong 1996). Implements complete-case ANOVA calculating mean squares between subjects ($MS_R$), between raters ($MS_C$), residual error ($MS_E$), degrees of freedom, and F-ratio.
  * **Deterministic Percentile Bootstrap Confidence Intervals:** Computes 95% bootstrap CIs with 1,000 resamples using a custom seeded pseudo-random number generator (Mulberry32 PRNG with fixed seed 42), ensuring strictly deterministic, reproducible bounds.

### B. Honest Data Labelling & Real vs Synthetic Separation
* **Transparent Provenance ([`src/lib/analytics/auditor-service.ts`](file:///e:/PS26242%282026%29/src/lib/analytics/auditor-service.ts)):**
  * Every metric displays sample size $n$ (rating pairs, unique clips, unique assessors) and an explicit data-source badge (`real` vs `synthetic`).
  * Mixed datasets are explicitly flagged `mixed` with itemized counts; synthetic data is **never** blended silently with real assessments.
  * Configurable Small-$N$ threshold stored in `platform_settings` (`analytics_small_n_threshold`, default 30).
  * Prominent amber warning banner appears whenever $n < 30$, stating that measurement estimates carry wide confidence intervals and must be treated as exploratory.
  * **Zero Hardcoded Numbers:** Every figure displayed on `/auditor` is computed dynamically from real PostgreSQL stored data.

### C. With vs Without the Tool (Controlled Comparison Mode)
* **Experimental Comparison Engine ([`src/lib/analytics/auditor-service.ts`](file:///e:/PS26242%282026%29/src/lib/analytics/auditor-service.ts)):**
  * Evaluates counterbalanced sessions under two conditions:
    * **Condition A:** Unassisted baseline (standard rubric only, no AI assistance, no calibration support).
    * **Condition B:** Assisted workflow (full SatyaRPL workflow with calibration gate, blind-first scoring, timeline markers, and non-binding advisory AI).
  * Records `condition VARCHAR(10)` per score row in PostgreSQL (`scores` table).
  * Computes paired bootstrap difference $\Delta \kappa = \kappa_B - \kappa_A$ with 95% confidence intervals.
  * Capable of reporting `"no_improvement"` or `"worse"` when assisted workflow does not outperform unassisted baseline, and explicitly reports `"sample_too_small"` when $n$ is insufficient.
  * **Accuracy vs Master Expert Scores:** Evaluates assessor grades directly against master expert gold standards, explaining prominently why inter-rater agreement alone does not establish validity (two assessors can agree due to shared misconceptions or leniency).

### D. Explainable Assessor Anomaly Detection
* **Transparent Review Prompts ([`src/lib/analytics/auditor-service.ts`](file:///e:/PS26242%282026%29/src/lib/analytics/auditor-service.ts)):**
  * Flags are structured as non-punitive review prompts, stating their rule, exact numbers, and threshold:
    * `SPEED_SCORING`: Practical assessment completed in $< 180$ seconds.
    * `STRAIGHT_LINING`: Identical rating level assigned across $\ge 5$ distinct performance criteria without differentiation.
    * `LENIENCY_ZSCORE` / `HARSHNESS_ZSCORE`: Assessor mean score deviates from peer group mean by $|z| \ge 2.0$.
  * Persisted in PostgreSQL table `assessor_anomalies`.
  * **Resolution Workflow:** Auditors can resolve prompts with a mandatory review note ($\ge 10$ characters). Resolving a prompt updates `assessor_anomalies` and permanently records an entry into the tamper-evident hash-chained `audit_log`.

### E. Evidence Integrity Panel
* **Aggregation Widget ([`src/lib/analytics/auditor-service.ts`](file:///e:/PS26242%282026%29/src/lib/analytics/auditor-service.ts)):**
  * Aggregates fraud and integrity flags across candidates by type (`reuse` pHash visual matches, `clock_skew`, `geo_mismatch`, `challenge_missing`, `chain_tampered`) and severity (`low`, `medium`, `high`, `critical`).
  * Summarizes unresolved counts and displays recent integrity events for auditor review.

### F. Auditor Access Rules (RLS) & Raw PII Unmasking Gate
* **Zero-Trust Access Control ([`src/app/api/auditor/access-log/route.ts`](file:///e:/PS26242%282026%29/src/app/api/auditor/access-log/route.ts)):**
  * Auditor routes enforce `auditor` or `admin` role header; unauthorized requests return HTTP 403 `Forbidden`.
  * Auditors by default see aggregate statistics, anonymized assessor matrices, and flagged anomaly review prompts.
  * Candidate Aadhaar numbers are masked and high-resolution video streams are locked behind a raw PII unmasking modal.
  * Accessing raw candidate PII requires entering a mandatory audit justification ($\ge 8$ characters).
  * Justifications are permanently recorded in PostgreSQL table `auditor_access_logs` and mirrored to the cryptographic `audit_log` (`AUDITOR_ACCESS_RAW_PII`).

### G. Export with Complete Methodology Notes
* **Data Export Endpoints ([`src/app/api/auditor/export/route.ts`](file:///e:/PS26242%282026%29/src/app/api/auditor/export/route.ts)):**
  * **JSON Export:** Delivers complete metadata notes, mathematical formula definitions, bootstrap parameters (1,000 resamples, seed 42), sample sizes $n$, small-$n$ warnings, interpretation guidelines, overview reliability statistics, per-criterion tables, and controlled comparison results.
  * **CSV Export:** Includes structured `#` methodology header lines detailing app version, export timestamp, quadratic weight formula, bootstrap CI resamples, and small-$n$ threshold before emitting tabular criterion ratings.

### H. Auditor Dashboard UI
* **Staff Workspace ([`src/app/auditor/page.tsx`](file:///e:/PS26242%282026%29/src/app/auditor/page.tsx)):**
  * Dense, calm, data-forward dashboard designed for auditor oversight.
  * Metric cards for Cohen's Weighted Kappa, Krippendorff's Alpha, ICC(2,1), and Raw/Adjacent Agreement.
  * Interactive Assessor Pair Agreement Heatmap matrix table. Color is never the sole signal: every cell displays numeric kappa, exact percentage agreement, and unit count $n$.
  * Per-criterion agreement breakdown with adjacent agreement bars and prevalence paradox tags.
  * A vs B controlled comparison card with paired bootstrap difference $\Delta \kappa$ and expert accuracy callout.
  * Anomaly review prompts list with modal resolution workflow.
  * Evidence integrity breakdown by flag type and severity.
  * Auditor raw PII unmasking modal and export download dialog.

---

## 2. Test Verification Summary

Automated tests executed via `npm test` (Vitest): **50 passed across 7 test suites (100% pass rate)**:

```
 RUN  v3.2.7 E:/PS26242(2026)

 ✓ src/test/smoke.test.ts (2 tests)
 ✓ src/test/phase-2b.test.ts (5 tests)
 ✓ src/test/phase-3.test.ts (5 tests)
 ✓ src/test/phase-4.test.ts (6 tests)
 ✓ src/test/phase-5.test.ts (9 tests)
 ✓ src/test/phase-6.test.ts (6 tests)
 ✓ src/test/phase-7.test.ts (17 tests)

 Test Files  7 passed (7)
      Tests  50 passed (50)
   Duration  2.53s
```

### Phase 7 Specific Test Coverage ([`src/test/phase-7.test.ts`](file:///e:/PS26242%282026%29/src/test/phase-7.test.ts)):
1. **Weighted Cohen's kappa matches known reference values:** Verified against hand-calculated ordinal 4-point rating pairs ($k=4$) with quadratic weights $w_{ij}=(i-j)^2/9$.
2. **Perfect agreement yields 1.0:** Verified identical rating arrays return $\kappa = 1.0$ and 100% agreement.
3. **Zero variance correctly returns undefined:** Proved invariant ratings (e.g. all 3s) return `kappa: undefined` and `isUndefined: true`, **never** returning 0 or 1.
4. **Prevalence / bias paradox caveat:** Proved skewed rating distributions trigger `hasPrevalenceCaveat: true` and display adjacent agreement.
5. **Krippendorff's alpha (ordinal metric):** Tested multi-rater matrix with missing values (`null`), matching ordinal alpha standards and handling invariant zero-variance data.
6. **ICC(2,1) two-way random absolute agreement:** Verified against classic published Shrout & Fleiss (1979) Table 4 data (6 targets x 4 judges), matching reference value $0.29$.
7. **Deterministic bootstrap confidence intervals:** Verified 1,000 resamples with fixed seed (Mulberry32 PRNG) produce strictly reproducible confidence bounds.
8. **Small-$N$ banner and data source badges:** Proved $n < 30$ displays amber banner and warning text.
9. **Real vs synthetic data splitting:** Proved filtering by `real` vs `synthetic` strictly isolates data subsets without silent blending.
10. **A vs B comparison can conclude 'no improvement' or 'worse':** Verified paired comparison logic when assisted condition performs worse than baseline.
11. **Stored controlled comparison evaluation:** Evaluated database comparison records including accuracy vs master expert scores.
12. **Assessor anomaly detection:** Proved detection of `SPEED_SCORING` ($< 180$s), `STRAIGHT_LINING`, and leniency/harshness $z$-scores with transparent metrics and thresholds.
13. **Anomaly resolution workflow:** Proved resolution note validation ($< 10$ chars rejected) and verified cryptographic entry in `audit_log`.
14. **Evidence integrity summary:** Verified aggregation of flags across types and severities.
15. **Role-based security:** Verified non-auditor/non-admin roles receive HTTP 403 `Forbidden`.
16. **Auditor raw PII unmasking audit log:** Verified justification validation ($< 8$ chars rejected) and logging in both `auditor_access_logs` and `audit_log`.
17. **Export with methodology notes:** Verified JSON metadata and CSV `#` header methodology comments.

---

## 3. Honest Disclosure Table

| Capability / Subsystem | Status | Details & Provenance |
|---|---|---|
| **Cohen's Quadratic Weighted Kappa** | **REAL** | Pure mathematical implementation in TypeScript ([`src/lib/analytics/agreement.ts`](file:///e:/PS26242%282026%29/src/lib/analytics/agreement.ts)). Tested against reference literature cases. |
| **Zero Variance Kappa Undefined** | **REAL** | Mathematically verified: returns `undefined` (never 0 or 1) when expected disagreement $D_e = 0$. |
| **Krippendorff's Alpha (Ordinal)** | **REAL** | Implements Hayes & Krippendorff (2007) ordinal difference metric with missing data handling. |
| **ICC(2,1) Absolute Agreement** | **REAL** | Pure ANOVA implementation matching Shrout & Fleiss (1979) Table 4 reference value ($0.29$). |
| **Deterministic Bootstrap CIs** | **REAL** | Mulberry32 PRNG algorithm with configurable seed (default 42) producing reproducible 95% CIs. |
| **A vs B Controlled Comparison** | **REAL** | Computes paired bootstrap difference $\Delta \kappa$ from PostgreSQL scores with Condition A/B tags. |
| **Assessor Anomaly Detection** | **REAL** | SQL heuristics detecting fast scoring ($< 180$s), straight-lining, and peer $z$-scores ($|z| \ge 2.0$). |
| **Auditor Raw PII Access Logging** | **REAL** | Enforced via PostgreSQL table `auditor_access_logs` and SHA-256 hash-chained `audit_log`. |
| **JSON & CSV Methodology Export** | **REAL** | Export routes generate complete metadata notes, formulas, sample sizes, and version strings. |
| **Auditor Dashboard UI** | **REAL** | Implemented at `/auditor` with heatmaps, charts, anomaly resolution modals, and text alternatives. |
| **Seed Assessment Data (Condition A & B)** | **SYNTHETIC** | Seeded counterbalanced paired scores for Anita Devi on sessions 2 and 3 for Er. Sunita Verma and Er. Vikramaditya Singh. |
| **Seeded Anomaly Prompts & Flags** | **SYNTHETIC** | Seeded realistic test anomalies (speed scoring 95s, straight-lining 7 criteria) and evidence flags (pHash reuse, clock skew). |
| **Production Scale ($n \ge 30$)** | **UNVERIFIED** | Local development environment contains small sample size ($n < 30$), triggering the small-$n$ warning banner as designed. |
| **Small-N Threshold Setting (30)** | **UNVERIFIED** | Threshold loaded from `platform_settings`; marked with standard statistical convention. |
| **Native Device Hardware Attestation** | **UNVERIFIED** | Reports `NOT_CONFIGURED` citing production native Google Play Integrity / Apple App Attest requirements. |

---

## 4. Git History & Sign-Off

* **Commit Message:** `"phase 7"`
* **Git Tag:** `phase-7`
* **Test Suite:** 50 tests passing (100% pass rate) across all phases.
