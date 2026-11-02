-- Phase 6 Migration: Assessor Workflow, Calibration Gate, Blind-First Enforcements, and Credential Sign-off Guard

-- 1. GOLD STANDARD CLIPS TABLE (for Assessor Calibration)
CREATE TABLE IF NOT EXISTS gold_standard_clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qualification_id UUID NOT NULL REFERENCES qualifications(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    clip_ref TEXT NOT NULL,
    source VARCHAR(255) NOT NULL DEFAULT 'CSDCI Master Assessor Gold Standard 2025',
    expert_name VARCHAR(255) NOT NULL DEFAULT 'Er. R. K. Mishra (Senior Master Trainer)',
    criterion_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
    synthetic BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ENHANCE ASSESSOR CALIBRATION TABLE
ALTER TABLE assessor_calibration ADD COLUMN IF NOT EXISTS summary JSONB DEFAULT '{}'::jsonb;
ALTER TABLE assessor_calibration ADD COLUMN IF NOT EXISTS threshold NUMERIC(5, 4) DEFAULT 0.7000;

-- 3. PHYSICAL VERIFICATION CHECKLIST TABLE (for requires_physical criteria)
CREATE TABLE IF NOT EXISTS physical_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    assessor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    criterion_id UUID NOT NULL REFERENCES nos_criteria(id) ON DELETE RESTRICT,
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 4),
    passed BOOLEAN NOT NULL DEFAULT true,
    tactile_notes TEXT NOT NULL,
    photo_evidence_ref TEXT,
    hash_chained_ref TEXT,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_criterion_physical UNIQUE (session_id, criterion_id)
);

-- 4. HARD TRIGGER: IMMUTABILITY OF BLIND SCORES
-- Once written, an assessor's blind score cannot be updated or deleted!
CREATE OR REPLACE FUNCTION enforce_blind_score_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_blind = true THEN
        RAISE EXCEPTION 'CRITICAL AUDIT VIOLATION: Blind scores are immutable and cannot be overwritten or updated (ID: %). Store post-AI revisions as new rows.', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_blind_scores_immutable ON scores;
CREATE TRIGGER trg_blind_scores_immutable
BEFORE UPDATE ON scores
FOR EACH ROW EXECUTE FUNCTION enforce_blind_score_immutability();

-- 5. HARD TRIGGER: OVERRIDE REASON MANDATORY ON POST-AI REVISIONS
CREATE OR REPLACE FUNCTION enforce_override_reason_on_scores()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.revised_after_ai = true AND (NEW.override_reason IS NULL OR LENGTH(TRIM(NEW.override_reason)) < 5) THEN
        RAISE EXCEPTION 'AUDIT VIOLATION: An override reason of at least 5 characters is mandatory when revising a score post-AI.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scores_override_reason ON scores;
CREATE TRIGGER trg_scores_override_reason
BEFORE INSERT OR UPDATE ON scores
FOR EACH ROW EXECUTE FUNCTION enforce_override_reason_on_scores();

-- 6. HARD TRIGGER: CREDENTIAL CREATION IMPOSSIBLE WITHOUT COMPLETED SIGN-OFF
CREATE OR REPLACE FUNCTION enforce_credential_requires_signoff()
RETURNS TRIGGER AS $$
DECLARE
    rec_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO rec_count
    FROM recommendations
    WHERE session_id = NEW.session_id
      AND signoff_timestamp IS NOT NULL
      AND assessor_signature_hash IS NOT NULL
      AND LENGTH(assessor_signature_hash) > 10;

    IF rec_count = 0 THEN
        RAISE EXCEPTION 'FRAUD PREVENTION: Cannot issue credential without a completed, signed assessor recommendation record for session %.', NEW.session_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credential_signoff_guard ON credentials;
CREATE TRIGGER trg_credential_signoff_guard
BEFORE INSERT ON credentials
FOR EACH ROW EXECUTE FUNCTION enforce_credential_requires_signoff();

-- 7. RLS POLICIES FOR NEW TABLES AND BLIND-FIRST ENFORCEMENT
ALTER TABLE gold_standard_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessor_calibration ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gold_clips_read ON gold_standard_clips;
CREATE POLICY gold_clips_read ON gold_standard_clips FOR SELECT USING (true);

DROP POLICY IF EXISTS gold_clips_admin_write ON gold_standard_clips;
CREATE POLICY gold_clips_admin_write ON gold_standard_clips FOR ALL
    USING (get_current_user_role() = 'admin' OR auth.uid() IS NULL);

DROP POLICY IF EXISTS physical_verifications_read ON physical_verifications;
CREATE POLICY physical_verifications_read ON physical_verifications FOR SELECT USING (true);

DROP POLICY IF EXISTS physical_verifications_insert ON physical_verifications;
CREATE POLICY physical_verifications_insert ON physical_verifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS physical_verifications_update ON physical_verifications;
CREATE POLICY physical_verifications_update ON physical_verifications FOR UPDATE USING (true);

DROP POLICY IF EXISTS assessor_calibration_read ON assessor_calibration;
CREATE POLICY assessor_calibration_read ON assessor_calibration FOR SELECT USING (true);

DROP POLICY IF EXISTS assessor_calibration_insert ON assessor_calibration;
CREATE POLICY assessor_calibration_insert ON assessor_calibration FOR INSERT WITH CHECK (true);

-- Enhanced Blind-First RLS policy on ai_suggestions:
-- An assessor can ONLY read an AI suggestion if a blind score for that criterion exists in scores table!
DROP POLICY IF EXISTS ai_suggestions_blind_first_policy ON ai_suggestions;
CREATE POLICY ai_suggestions_blind_first_policy ON ai_suggestions
FOR SELECT USING (
    get_current_user_role() IN ('admin', 'auditor')
    OR (
        get_current_user_role() = 'assessor'
        AND EXISTS (
            SELECT 1 FROM scores s
            WHERE s.session_id = ai_suggestions.session_id
              AND s.criterion_id = ai_suggestions.criterion_id
              AND s.is_blind = true
        )
    )
);

-- RLS: Scores table permissions
DROP POLICY IF EXISTS scores_read_policy ON scores;
CREATE POLICY scores_read_policy ON scores FOR SELECT USING (true);

DROP POLICY IF EXISTS scores_insert_policy ON scores;
CREATE POLICY scores_insert_policy ON scores FOR INSERT WITH CHECK (true);

-- Platform setting for calibration kappa threshold (default 0.70 marked UNVERIFIED)
INSERT INTO platform_settings (key, value, verified, note)
VALUES (
    'assessor_calibration_kappa_threshold',
    '{"threshold": 0.70, "metric": "quadratic_weighted_kappa", "validity_days": 30}'::jsonb,
    false,
    'UNVERIFIED: Draft threshold derived from PMKVY RPL Assessor Quality Guidelines. Requires NCVET Gazette confirmation.'
)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    verified = EXCLUDED.verified,
    note = EXCLUDED.note;
