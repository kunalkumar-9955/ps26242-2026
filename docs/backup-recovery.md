# SatyaRPL Backup, Disaster Recovery & Migration Rollback Guide

> **SIH 2026 · Problem Statement PS 26242 · MSDE**  
> **Production Reliability Standard: RPO < 1 Hour, RTO < 15 Minutes**

---

## 1. PostgreSQL Disaster Recovery Architecture

The SatyaRPL platform operates on PostgreSQL 16+ with Row Level Security and cryptographic immutability triggers.

### 1.1. Backup Strategy
1. **Continuous WAL Archiving (Point-in-Time Recovery - PITR):**
   - Write-Ahead Logs (WAL) are streamed continuously to redundant cloud object storage (AWS S3 Glacier or Cloudflare R2).
   - Allows recovery to any arbitrary second within the 30-day retention window.
2. **Daily Logical Backups (`pg_dump`):**
   - Executed daily at 02:00 IST via cron job.
   - Command:
     ```bash
     pg_dump -Fc -h localhost -U postgres -d satyarpl_db -f /var/backups/satyarpl_$(date +%Y%m%d_%H%M%S).dump
     ```
   - Backups are encrypted with AES-256 before upload.

---

## 2. Tested Database Restore Procedure

The following procedure was verified against `satyarpl_db`:

### Step 1: Prepare Clean Target Database
```bash
dropdb -h localhost -U postgres satyarpl_db_recovery --if-exists
createdb -h localhost -U postgres satyarpl_db_recovery
```

### Step 2: Restore Logical Archive
```bash
pg_restore -h localhost -U postgres -d satyarpl_db_recovery -v /var/backups/satyarpl_target.dump
```

### Step 3: Verify Integrity & Ledger Invariants
Post-restore script executes:
1. Verify table counts:
   ```sql
   SELECT count(*) FROM pg_tables WHERE schemaname = 'public';
   -- Expect: 35 tables
   ```
2. Verify SHA-256 chain continuity:
   ```sql
   SELECT count(*) FROM audit_log;
   SELECT count(*) FROM evidence_items;
   ```
3. Test RLS activation:
   ```sql
   SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;
   -- Must return 0
   ```

---

## 3. Migration Rollback Notes

Every migration in `supabase/migrations/` is paired with an idempotent down-migration script:

| Migration File | Description | Rollback Command |
|---|---|---|
| `20261010000000_init_rpl_schema.sql` | Initial tables & triggers | `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` |
| `20261011000000_assessor_workflow.sql` | Assessor scores & calibration | `DROP TABLE assessor_scores, assessor_calibration, gold_clips CASCADE;` |
| `20261011000001_auditor_analytics.sql` | Auditor access logs & resolutions | `DROP TABLE auditor_access_logs, auditor_resolutions CASCADE;` |
| `20261011000002_credential_issuance.sql` | Verifiable credentials & revocations | `DROP TABLE credential_revocations, credentials CASCADE;` |
| `20261012000000_red_team_runner.sql` | Red-Team runner & sealed trigger | `DROP TRIGGER trg_sealed_evidence_immutable ON evidence_items; DROP TABLE security_test_runs CASCADE;` |
| `20261013000000_phase10_hardening.sql` | DPDP privacy, retention & rate limits | `DROP TRIGGER trg_prevent_role_escalation ON profiles; DROP TABLE auth_rate_limits, data_deletion_requests, data_retention_policies, candidate_consents CASCADE;` |

---

## 4. Disaster Recovery Health Checks
- Live endpoint: `GET /api/health`
- Returns HTTP 200 with `{ status: "healthy", database: { connected: true, latencyMs: <50 } }`.
- When database connection drops, endpoint returns HTTP 503 `{ status: "degraded", database: { connected: false } }`.
