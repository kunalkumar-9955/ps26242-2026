-- ============================================================================
-- SATYARPL MIGRATION: Phase 7 — Auditor Analytics & Anomaly Detection
-- Reference: Master Prompt Section 6b & SIH 2026 MSDE
-- ============================================================================

-- 1. EXTEND SCORES TABLE WITH EXPERIMENTAL CONDITION AND DURATION
ALTER TABLE scores ADD COLUMN IF NOT EXISTS condition VARCHAR(10) NOT NULL DEFAULT 'B';
ALTER TABLE scores ADD COLUMN IF NOT EXISTS scoring_duration_seconds INTEGER;

-- Ensure condition constraint (A = unassisted baseline, B = assisted with tool)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_scores_condition'
    ) THEN
        ALTER TABLE scores ADD CONSTRAINT chk_scores_condition CHECK (condition IN ('A', 'B'));
    END IF;
END $$;

-- 2. ASSESSOR ANOMALIES TABLE (EXPLAINABLE STATISTICAL & RULE-BASED PROMPTS)
CREATE TABLE IF NOT EXISTS assessor_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    session_id UUID REFERENCES assessment_sessions(id) ON DELETE SET NULL,
    rule_code VARCHAR(50) NOT NULL, -- 'LENIENCY_ZSCORE', 'HARSHNESS_ZSCORE', 'SPEED_SCORING', 'STRAIGHT_LINING', 'OVERRIDE_RUBBERSTAMP', 'GEO_IMPOSSIBLE_TRAVEL'
    severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high'
    description TEXT NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    resolution_note TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AUDITOR ACCESS LOGS TABLE (AUDIT TRAIL FOR OPENING RAW FLAGGED PII)
CREATE TABLE IF NOT EXISTS auditor_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auditor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    flag_id UUID,
    reason TEXT NOT NULL,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. RLS POLICIES FOR AUDITOR ANALYTICS
ALTER TABLE assessor_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditor_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anomalies_auditor_read ON assessor_anomalies;
CREATE POLICY anomalies_auditor_read ON assessor_anomalies FOR SELECT
    USING (get_current_user_role() IN ('auditor', 'admin'));

DROP POLICY IF EXISTS anomalies_auditor_update ON assessor_anomalies;
CREATE POLICY anomalies_auditor_update ON assessor_anomalies FOR UPDATE
    USING (get_current_user_role() IN ('auditor', 'admin'));

DROP POLICY IF EXISTS anomalies_auditor_insert ON assessor_anomalies;
CREATE POLICY anomalies_auditor_insert ON assessor_anomalies FOR INSERT
    WITH CHECK (get_current_user_role() IN ('auditor', 'admin') OR auth.uid() IS NULL);

DROP POLICY IF EXISTS access_logs_auditor_insert ON auditor_access_logs;
CREATE POLICY access_logs_auditor_insert ON auditor_access_logs FOR INSERT
    WITH CHECK (get_current_user_role() IN ('auditor', 'admin') OR auth.uid() IS NULL);

DROP POLICY IF EXISTS access_logs_auditor_read ON auditor_access_logs;
CREATE POLICY access_logs_auditor_read ON auditor_access_logs FOR SELECT
    USING (get_current_user_role() IN ('auditor', 'admin'));

-- 5. CONFIGURE PLATFORM SETTING FOR SMALL-N AUDIT THRESHOLD
INSERT INTO platform_settings (key, value, verified, note)
VALUES (
    'analytics_small_n_threshold',
    '{"threshold": 30, "warning_message": "Sample size is below n=30 statistical reliability threshold. Estimates carry wide confidence intervals."}'::jsonb,
    false,
    'UNVERIFIED: Configurable statistical threshold based on standard central limit theorem and inter-rater reliability sample size guidelines.'
)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    verified = EXCLUDED.verified,
    note = EXCLUDED.note;
