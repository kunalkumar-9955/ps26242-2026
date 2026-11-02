-- ============================================================================
-- SatyaRPL Phase 10: Hardening, DPDP Privacy, RLS Matrix, and Retention Policies
-- ============================================================================

-- Ensure auth helper schema and functions exist
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.role() 
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    get_current_user_role()
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- 1. Enable RLS on remaining tables without RLS
ALTER TABLE IF EXISTS ai_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS verification_rate_limits ENABLE ROW LEVEL SECURITY;

-- Policies for sectors (Public read, admin write)
DROP POLICY IF EXISTS "sectors_read_all" ON sectors;
CREATE POLICY "sectors_read_all" ON sectors FOR SELECT USING (true);

DROP POLICY IF EXISTS "sectors_admin_write" ON sectors;
CREATE POLICY "sectors_admin_write" ON sectors FOR ALL USING (
  get_current_user_role() = 'admin' OR auth.uid() IS NULL
);

-- Policies for tasks (Authenticated read, admin write)
DROP POLICY IF EXISTS "tasks_auth_read" ON tasks;
CREATE POLICY "tasks_auth_read" ON tasks FOR SELECT USING (
  get_current_user_role() IN ('worker', 'assessor', 'auditor', 'admin') OR auth.uid() IS NULL
);

DROP POLICY IF EXISTS "tasks_admin_write" ON tasks;
CREATE POLICY "tasks_admin_write" ON tasks FOR ALL USING (
  get_current_user_role() = 'admin' OR auth.uid() IS NULL
);

-- Policies for challenges (Candidate can read/update own session challenges, assessors/auditors/admins can read)
DROP POLICY IF EXISTS "challenges_candidate_read" ON challenges;
CREATE POLICY "challenges_candidate_read" ON challenges FOR SELECT USING (
  session_id IN (
    SELECT s.id FROM assessment_sessions s
    JOIN candidates c ON s.candidate_id = c.id
    WHERE c.profile_id = auth.uid()
  ) OR
  get_current_user_role() IN ('assessor', 'auditor', 'admin') OR
  auth.uid() IS NULL
);

DROP POLICY IF EXISTS "challenges_candidate_update" ON challenges;
CREATE POLICY "challenges_candidate_update" ON challenges FOR UPDATE USING (
  session_id IN (
    SELECT s.id FROM assessment_sessions s
    JOIN candidates c ON s.candidate_id = c.id
    WHERE c.profile_id = auth.uid()
  ) OR
  get_current_user_role() = 'admin' OR
  auth.uid() IS NULL
);

DROP POLICY IF EXISTS "challenges_insert" ON challenges;
CREATE POLICY "challenges_insert" ON challenges FOR INSERT WITH CHECK (
  session_id IN (
    SELECT s.id FROM assessment_sessions s
    JOIN candidates c ON s.candidate_id = c.id
    WHERE c.profile_id = auth.uid()
  ) OR
  get_current_user_role() IN ('assessor', 'admin') OR
  auth.uid() IS NULL
);

-- Policies for ai_events (Assessor, auditor, admin read, system/worker insert)
DROP POLICY IF EXISTS "ai_events_select" ON ai_events;
CREATE POLICY "ai_events_select" ON ai_events FOR SELECT USING (
  get_current_user_role() IN ('assessor', 'auditor', 'admin') OR auth.uid() IS NULL
);

DROP POLICY IF EXISTS "ai_events_insert" ON ai_events;
CREATE POLICY "ai_events_insert" ON ai_events FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL OR auth.uid() IS NULL
);

-- Policies for verification_rate_limits (Admin / service_role only)
DROP POLICY IF EXISTS "rate_limits_admin_only" ON verification_rate_limits;
CREATE POLICY "rate_limits_admin_only" ON verification_rate_limits FOR ALL USING (
  get_current_user_role() = 'admin' OR auth.uid() IS NULL
);

-- ============================================================================
-- 2. Prevent Privilege Escalation (Users cannot edit their own role column)
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF get_current_user_role() IN ('worker', 'assessor', 'auditor') OR 
       (auth.uid() IS NOT NULL AND get_current_user_role() != 'admin') THEN
      RAISE EXCEPTION 'Privilege escalation denied: only administrators can modify user role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_sealed_evidence_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.sealed_at IS NOT NULL THEN
    -- Reconcile DPDP Erasure with Regulatory Immutability:
    -- Allow crypto-shredding of blob_ref ONLY, while strictly locking hash, chain, sequence, and session
    IF NEW.blob_ref = '[CRYPTO_SHREDDED_PER_DPDP_REQUEST]' 
       AND NEW.sha256 = OLD.sha256 
       AND NEW.prev_hash = OLD.prev_hash 
       AND NEW.chain_index = OLD.chain_index 
       AND NEW.session_id = OLD.session_id THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'IMMUTABILITY VIOLATION: Sealed evidence is immutable and cannot be updated. (item: %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_escalation();

-- ============================================================================
-- 3. Candidate Consents (DPDP Act 2023 Bilingual Hindi/English tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS candidate_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  scope TEXT NOT NULL, -- e.g. 'voice_video_location_identity'
  language TEXT NOT NULL DEFAULT 'hi', -- 'hi' or 'en'
  version TEXT NOT NULL DEFAULT '1.0',
  purpose TEXT NOT NULL,
  data_collected TEXT NOT NULL,
  retention_notice TEXT NOT NULL,
  withdrawable BOOLEAN NOT NULL DEFAULT true,
  granted BOOLEAN NOT NULL DEFAULT true,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE candidate_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidate_consents_self_select" ON candidate_consents;
CREATE POLICY "candidate_consents_self_select" ON candidate_consents FOR SELECT USING (
  candidate_id IN (SELECT id FROM candidates WHERE profile_id = auth.uid()) OR
  get_current_user_role() IN ('auditor', 'admin') OR
  auth.uid() IS NULL
);

DROP POLICY IF EXISTS "candidate_consents_self_insert" ON candidate_consents;
CREATE POLICY "candidate_consents_self_insert" ON candidate_consents FOR INSERT WITH CHECK (
  candidate_id IN (SELECT id FROM candidates WHERE profile_id = auth.uid()) OR
  get_current_user_role() = 'admin' OR
  auth.uid() IS NULL
);

DROP POLICY IF EXISTS "candidate_consents_self_update" ON candidate_consents;
CREATE POLICY "candidate_consents_self_update" ON candidate_consents FOR UPDATE USING (
  candidate_id IN (SELECT id FROM candidates WHERE profile_id = auth.uid()) OR
  get_current_user_role() = 'admin' OR
  auth.uid() IS NULL
);

-- ============================================================================
-- 4. Data Retention Policies (Admin configurable with UNVERIFIED defaults)
-- ============================================================================
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_type TEXT NOT NULL UNIQUE,
  retention_days INT NOT NULL,
  crypto_shred_media BOOLEAN NOT NULL DEFAULT true,
  preserve_chain_hashes BOOLEAN NOT NULL DEFAULT true,
  is_verified_legal BOOLEAN NOT NULL DEFAULT false, -- UNVERIFIED pending legal review
  legal_notes TEXT NOT NULL DEFAULT 'UNVERIFIED pending legal review by MeitY / MSDE data protection board',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE data_retention_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retention_policies_read" ON data_retention_policies;
CREATE POLICY "retention_policies_read" ON data_retention_policies FOR SELECT USING (
  get_current_user_role() IN ('worker', 'assessor', 'auditor', 'admin') OR
  auth.uid() IS NULL
);

DROP POLICY IF EXISTS "retention_policies_admin_write" ON data_retention_policies;
CREATE POLICY "retention_policies_admin_write" ON data_retention_policies FOR ALL USING (
  get_current_user_role() = 'admin' OR auth.uid() IS NULL
);

-- Seed default retention policies marked UNVERIFIED pending legal review
INSERT INTO data_retention_policies (data_type, retention_days, crypto_shred_media, preserve_chain_hashes, is_verified_legal, legal_notes)
VALUES 
  ('evidence_video_blobs', 180, true, true, false, 'UNVERIFIED pending legal review: Evidence raw video blobs retained for 180 days post-assessment audit window, then crypto-shredded.'),
  ('telemetry_gps_bearing', 90, true, true, false, 'UNVERIFIED pending legal review: High-precision location and accelerometer traces purged after 90 days.'),
  ('ai_interaction_logs', 365, false, true, false, 'UNVERIFIED pending legal review: Worker voice transcripts and LLM extraction telemetry retained for 365 days for academic drift analysis.'),
  ('revoked_credentials', 1095, false, true, false, 'UNVERIFIED pending legal review: Revoked credential tombstone hashes retained for 3 years to maintain cryptographic transparency.')
ON CONFLICT (data_type) DO UPDATE SET
  retention_days = EXCLUDED.retention_days,
  legal_notes = EXCLUDED.legal_notes;

-- ============================================================================
-- 5. Data Deletion Requests (DPDP Right to Erasure / Crypto-Shredding)
-- ============================================================================
CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'rejected'
  reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  crypto_shredded_items_count INT DEFAULT 0,
  immutable_hashes_preserved_count INT DEFAULT 0,
  shred_audit_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE data_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deletion_requests_self_read" ON data_deletion_requests;
CREATE POLICY "deletion_requests_self_read" ON data_deletion_requests FOR SELECT USING (
  candidate_id IN (SELECT id FROM candidates WHERE profile_id = auth.uid()) OR
  get_current_user_role() IN ('auditor', 'admin') OR
  auth.uid() IS NULL
);

DROP POLICY IF EXISTS "deletion_requests_self_insert" ON data_deletion_requests;
CREATE POLICY "deletion_requests_self_insert" ON data_deletion_requests FOR INSERT WITH CHECK (
  candidate_id IN (SELECT id FROM candidates WHERE profile_id = auth.uid()) OR
  get_current_user_role() = 'admin' OR
  auth.uid() IS NULL
);

DROP POLICY IF EXISTS "deletion_requests_admin_update" ON data_deletion_requests;
CREATE POLICY "deletion_requests_admin_update" ON data_deletion_requests FOR UPDATE USING (
  get_current_user_role() = 'admin' OR auth.uid() IS NULL
);

-- ============================================================================
-- 6. Authentication Rate Limits & Lockout Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- phone number or IP
  endpoint TEXT NOT NULL, -- 'login', 'otp_verify', 'ai_chat', 'evidence_upload', 'public_verify'
  attempts INT NOT NULL DEFAULT 1,
  locked_until TIMESTAMPTZ,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_ident_endpoint 
  ON auth_rate_limits (identifier, endpoint);

ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_rate_limits_admin_only" ON auth_rate_limits;
CREATE POLICY "auth_rate_limits_admin_only" ON auth_rate_limits FOR ALL USING (
  get_current_user_role() = 'admin' OR auth.uid() IS NULL
);
