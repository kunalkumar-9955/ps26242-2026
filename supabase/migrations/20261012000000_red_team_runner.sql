-- Phase 9: Red-Team Mode, Sealed Evidence Immutability Guard & Security Test Runs

-- 1. Immutability Trigger on Evidence Items (Attack k)
CREATE OR REPLACE FUNCTION enforce_sealed_evidence_immutable()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.sealed_at IS NOT NULL THEN
            RAISE EXCEPTION 'IMMUTABILITY VIOLATION: Sealed evidence is immutable and cannot be updated. (item: %)', OLD.id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.sealed_at IS NOT NULL THEN
            RAISE EXCEPTION 'IMMUTABILITY VIOLATION: Sealed evidence is immutable and cannot be deleted. (item: %)', OLD.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sealed_evidence_immutable ON evidence_items;
CREATE TRIGGER trg_sealed_evidence_immutable
BEFORE UPDATE OR DELETE ON evidence_items
FOR EACH ROW EXECUTE FUNCTION enforce_sealed_evidence_immutable();

-- 2. Security Test Runs Persistence Table
CREATE TABLE IF NOT EXISTS security_test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_number BIGSERIAL,
    runner_id UUID REFERENCES profiles(id),
    runner_role VARCHAR(50) NOT NULL,
    scope VARCHAR(50) NOT NULL DEFAULT 'synthetic_redteam_sandbox',
    app_version VARCHAR(50) NOT NULL DEFAULT 'v2.0.0-phase9',
    git_commit VARCHAR(40) NOT NULL DEFAULT 'HEAD',
    overall_detection_rate VARCHAR(20) NOT NULL,
    total_attacks INT NOT NULL,
    caught_count INT NOT NULL,
    not_detected_count INT NOT NULL,
    failed_count INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    results JSONB NOT NULL DEFAULT '[]'::jsonb,
    coverage_matrix JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Dedicated Synthetic Sandbox Candidate & Session
INSERT INTO candidates (id, profile_id, aadhaar_masked, qualification_id, is_synthetic)
SELECT
    '99999999-9999-9999-9999-999999999999',
    '33333333-3333-3333-3333-333333333333',
    'XXXX-XXXX-9999',
    q.id,
    true
FROM qualifications q WHERE q.qp_code = 'CON/Q0602' LIMIT 1
ON CONFLICT (id) DO UPDATE SET is_synthetic = true;

INSERT INTO assessment_sessions (id, candidate_id, assessor_id, status, is_synthetic)
VALUES (
    '99999999-9999-9999-9999-000000000001',
    '99999999-9999-9999-9999-999999999999',
    '22222222-2222-2222-2222-222222222222',
    'in_progress',
    true
)
ON CONFLICT (id) DO UPDATE SET is_synthetic = true;

-- 4. Enable RLS on security_test_runs
ALTER TABLE security_test_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_test_runs_admin_auditor ON security_test_runs;
CREATE POLICY security_test_runs_admin_auditor ON security_test_runs
    FOR ALL
    USING (get_current_user_role() IN ('admin', 'auditor') OR auth.uid() IS NULL);
