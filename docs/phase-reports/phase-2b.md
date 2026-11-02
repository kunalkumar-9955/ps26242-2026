# Phase 2b Report: Database Migrations, Provenance & Role Gating
**Date:** October 10, 2026
**Commit:** `phase 2b`
**Git Tag:** `phase-2b`

---

## 1. What Was Built
* **Real PostgreSQL Database & Migrations:** 18 normalized tables with foreign keys and indexes running on live PostgreSQL (`satyarpl_db`).
* **Idempotent Seeder:** `runIdempotentSeed()` loads official `CON/Q0602` (Assistant Electrician, NSQF Level 3) with exact NQR titles, 13 criteria, 9 vernacular slang terms, and demo profiles without duplicating rows.
* **Append-Only Hash-Chained Audit Logging:** Every create/delete writes an audit row with actor role, before/after states, and a continuous SHA-256 hash chain protected by database triggers.
* **Exact NQR Provenance:** Official NQR URLs (`https://www.nqr.gov.in/qualifications/13772`) and NQR Code (`QG-03-CO-03951-2025-V2-CSDCI`) stored per QP and per NOS.
* **Role Gating & Protected Routes:** Non-admin roles (workers/assessors) attempting admin mutations are rejected with `HTTP 403 Forbidden` and blocked with a red lock shield screen.
* **Tooling Disclosure:** Explicitly disclosed in `/docs/ui-sources.md` that 21st.dev Magic MCP and UI UX Pro Max skills are not installed in the agent environment.

---

## 2. What Was Tested
* `src/test/phase-2b.test.ts` (5 tests) & `smoke.test.ts` (2 tests) passed (7/7 tests).
* Verified idempotence across consecutive seed runs.
* Verified audit logging on creation and deletion.
* Verified 403 Forbidden role gating for workers and assessors.
* Verified audit log access isolation for workers.
* `npm run lint` and `npx tsc --noEmit` passed with 0 errors and 0 warnings.
* `npm run build` passed with all API routes.

---

## 3. What Is Simulated
* Authentication tokens: Simulated via client context and `x-user-role` / `x-user-id` request headers against the real PostgreSQL database.

---

## 4. What Is Unverified
* Performance criteria, 4-level rubric anchors, weights, video assessability flags, and vernacular trade slang are authored drafts marked `verified = false` with label `"draft - needs assessor review"`.
* The 50% pass threshold for Level 3 is marked `UNVERIFIED` citing PMKVY RPL draft guidance.
