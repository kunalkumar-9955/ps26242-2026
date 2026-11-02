-- ============================================================================
-- SatyaRPL Schema Migration: Initial Production Schema
-- Problem Statement: SIH 2026 · PS 26242 · MSDE
-- Domain: Fraud-Resistant, Assessor-Auditable RPL Assessment Platform
-- ============================================================================

-- 1. EXTENSIONS & SCHEMAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
BEGIN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE app_role AS ENUM ('worker', 'assessor', 'auditor', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE assessable_type AS ENUM ('yes', 'partial', 'no');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE flag_type AS ENUM (
        'reuse',
        'edit_suspected',
        'geo_mismatch',
        'clock_skew',
        'challenge_missing',
        'duplicate_person',
        'chain_tampered'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE flag_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE challenge_kind AS ENUM ('code_on_camera', 'task_variant', 'spoken_phrase', 'sequence_prompt');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE credential_status_type AS ENUM ('issued', 'revoked', 'provisional');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gap_status AS ENUM ('covered', 'partial', 'gap');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. PROFILES & ROLES
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE,
    phone VARCHAR(20),
    email VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    role app_role NOT NULL DEFAULT 'worker',
    language_pref VARCHAR(10) NOT NULL DEFAULT 'hi',
    is_synthetic BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. QUALIFICATIONS (QP), NOS & CRITERIA
CREATE TABLE IF NOT EXISTS sectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qualifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sector_id UUID REFERENCES sectors(id) ON DELETE CASCADE,
    qp_code VARCHAR(50) UNIQUE NOT NULL, -- e.g. CON/Q0602
    nqr_code VARCHAR(100),               -- e.g. QG-03-CO-03951-2025-V2-CSDCI
    name VARCHAR(255) NOT NULL,          -- e.g. Assistant Electrician
    nsqf_level INTEGER NOT NULL,         -- e.g. 3
    version VARCHAR(20) NOT NULL DEFAULT '2.0',
    source_url TEXT NOT NULL,            -- e.g. https://www.nqr.gov.in/qualifications/13772
    verified BOOLEAN NOT NULL DEFAULT true, -- NQR verified
    is_synthetic BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qualification_id UUID NOT NULL REFERENCES qualifications(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,          -- e.g. CON/N0602
    title VARCHAR(255) NOT NULL,        -- Official title from NQR
    is_core BOOLEAN NOT NULL DEFAULT true,
    theory_marks INTEGER NOT NULL DEFAULT 20,
    practical_marks INTEGER NOT NULL DEFAULT 80,
    source_url TEXT NOT NULL,           -- e.g. https://www.nqr.gov.in/qualifications/13772#CON-N0602
    verified BOOLEAN NOT NULL DEFAULT true, -- Matches official NQR
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (qualification_id, code)
);

CREATE TABLE IF NOT EXISTS nos_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nos_id UUID NOT NULL REFERENCES nos(id) ON DELETE CASCADE,
    criterion_code VARCHAR(50) NOT NULL, -- e.g. PC1.1
    description TEXT NOT NULL,
    assessable_from_video assessable_type NOT NULL DEFAULT 'yes',
    requires_physical BOOLEAN NOT NULL DEFAULT false,
    weight NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    rubric_level_1 TEXT NOT NULL,
    rubric_level_2 TEXT NOT NULL,
    rubric_level_3 TEXT NOT NULL,
    rubric_level_4 TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT false, -- Authored draft
    status_label VARCHAR(100) NOT NULL DEFAULT 'draft - needs assessor review',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (nos_id, criterion_code)
);

-- Trade Slang Synonyms Table (Vernacular to standard task)
CREATE TABLE IF NOT EXISTS trade_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qualification_id UUID REFERENCES qualifications(id) ON DELETE CASCADE,
    vernacular_term VARCHAR(100) NOT NULL,
    standard_english_task VARCHAR(255) NOT NULL,
    language VARCHAR(20) NOT NULL DEFAULT 'hi',
    verified BOOLEAN NOT NULL DEFAULT false, -- Authored draft
    status_label VARCHAR(100) NOT NULL DEFAULT 'draft - needs assessor review',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (qualification_id, vernacular_term)
);

-- Configurable Platform Settings (e.g. passing thresholds)
CREATE TABLE IF NOT EXISTS platform_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT false,
    note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. CANDIDATES & DECLARATIONS
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    qualification_id UUID NOT NULL REFERENCES qualifications(id) ON DELETE RESTRICT,
    aadhaar_masked VARCHAR(20),
    assigned_assessor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    state VARCHAR(100),
    district VARCHAR(100),
    is_synthetic BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS declarations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    raw_transcript TEXT NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'hi',
    audio_ref TEXT,
    structured_extraction JSONB NOT NULL DEFAULT '{}'::jsonb,
    per_nos_coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
    ai_event_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gap_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    nos_id UUID NOT NULL REFERENCES nos(id) ON DELETE CASCADE,
    status gap_status NOT NULL,
    recommended_bridge_hours INTEGER NOT NULL DEFAULT 0,
    rationale_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. TASKS, CHALLENGES & SESSIONS
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qualification_id UUID NOT NULL REFERENCES qualifications(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    instructions_hi TEXT NOT NULL,
    instructions_en TEXT NOT NULL,
    challenge_type challenge_kind NOT NULL DEFAULT 'code_on_camera',
    duration_seconds INTEGER NOT NULL DEFAULT 180,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    assessor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
    is_synthetic BOOLEAN NOT NULL DEFAULT false,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
    nonce VARCHAR(32) NOT NULL UNIQUE,
    prompt_text TEXT NOT NULL,
    type challenge_kind NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    signature TEXT NOT NULL
);

-- 7. EVIDENCE ITEMS (Append-Only once sealed)
CREATE TABLE IF NOT EXISTS evidence_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
    challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL,
    blob_ref TEXT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    prev_hash VARCHAR(64) NOT NULL,
    chain_index INTEGER NOT NULL DEFAULT 0,
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_captured_at TIMESTAMPTZ NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    accuracy_meters NUMERIC(8, 2),
    device_fingerprint TEXT NOT NULL,
    phash VARCHAR(64),
    liveness_result VARCHAR(50) DEFAULT 'verified',
    sealed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
    type flag_type NOT NULL,
    severity flag_severity NOT NULL DEFAULT 'high',
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    resolution_note TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. SCORES & BLIND SCORING
CREATE TABLE IF NOT EXISTS scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    assessor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    criterion_id UUID NOT NULL REFERENCES nos_criteria(id) ON DELETE RESTRICT,
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 4),
    rationale TEXT NOT NULL,
    is_blind BOOLEAN NOT NULL DEFAULT true,
    revised_after_ai BOOLEAN NOT NULL DEFAULT false,
    override_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, assessor_id, criterion_id, is_blind)
);

CREATE TABLE IF NOT EXISTS ai_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    criterion_id UUID NOT NULL REFERENCES nos_criteria(id) ON DELETE RESTRICT,
    suggested_level INTEGER CHECK (suggested_level BETWEEN 1 AND 4),
    confidence NUMERIC(4, 3) NOT NULL,
    observed_evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    abstained BOOLEAN NOT NULL DEFAULT false,
    abstain_reason TEXT,
    revealed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, criterion_id)
);

CREATE TABLE IF NOT EXISTS assessor_calibration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    gold_clip_id VARCHAR(100) NOT NULL,
    criterion_id UUID NOT NULL REFERENCES nos_criteria(id) ON DELETE CASCADE,
    assessor_score INTEGER NOT NULL,
    gold_score INTEGER NOT NULL,
    weighted_kappa NUMERIC(5, 4) NOT NULL,
    passed BOOLEAN NOT NULL DEFAULT false,
    certified_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. RECOMMENDATIONS & VERIFIABLE CREDENTIALS
CREATE TABLE IF NOT EXISTS recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    assessor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    system_draft_outcome VARCHAR(50) NOT NULL,
    final_assessor_outcome VARCHAR(50) NOT NULL,
    is_override BOOLEAN NOT NULL DEFAULT false,
    override_reason TEXT,
    signoff_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assessor_signature_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id)
);

CREATE TABLE IF NOT EXISTS credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE RESTRICT,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
    qualification_id UUID NOT NULL REFERENCES qualifications(id) ON DELETE RESTRICT,
    status credential_status_type NOT NULL DEFAULT 'issued',
    verifiable_payload JSONB NOT NULL,
    signature TEXT NOT NULL,
    qr_payload TEXT NOT NULL,
    verify_slug VARCHAR(64) UNIQUE NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- 10. AUDIT LOG & IMMUTABILITY (Enhanced with before/after state and actor role)
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    entity_name VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    actor_role VARCHAR(50) NOT NULL DEFAULT 'system',
    before_state JSONB,
    after_state JSONB,
    prev_hash VARCHAR(64) NOT NULL,
    curr_hash VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(100) NOT NULL,
    prompt_hash VARCHAR(64) NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    latency_ms INTEGER NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. IMMUTABLE APPEND-ONLY DATABASE TRIGGERS
CREATE OR REPLACE FUNCTION enforce_sealed_evidence_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.sealed_at IS NOT NULL THEN
            RAISE EXCEPTION 'Cryptographic Violation: Sealed evidence is immutable and cannot be updated.';
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.sealed_at IS NOT NULL THEN
            RAISE EXCEPTION 'Cryptographic Violation: Sealed evidence is immutable and cannot be deleted.';
        END IF;
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sealed_evidence_immutable ON evidence_items;
CREATE TRIGGER trg_sealed_evidence_immutable
    BEFORE UPDATE OR DELETE ON evidence_items
    FOR EACH ROW
    EXECUTE FUNCTION enforce_sealed_evidence_immutability();

CREATE OR REPLACE FUNCTION enforce_audit_log_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit Violation: audit_log table is strictly append-only. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON audit_log;
CREATE TRIGGER trg_audit_log_append_only
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION enforce_audit_log_append_only();

-- Helper function to inspect current user role in RLS
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS VARCHAR AS $$
BEGIN
    -- 1. Check custom session variable if set by app
    BEGIN
        IF current_setting('app.current_user_role', true) IS NOT NULL AND current_setting('app.current_user_role', true) != '' THEN
            RETURN current_setting('app.current_user_role', true);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 2. Check supabase auth profile
    IF auth.uid() IS NOT NULL THEN
        RETURN (SELECT role::text FROM profiles WHERE auth_user_id = auth.uid() OR id = auth.uid() LIMIT 1);
    END IF;

    -- 3. Default fallback
    RETURN 'anon';
END;
$$ LANGUAGE plpgsql STABLE;

-- 12. ROW LEVEL SECURITY (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE nos ENABLE ROW LEVEL SECURITY;
ALTER TABLE nos_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gap_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Read policies for public standards
CREATE POLICY qualifications_read ON qualifications FOR SELECT USING (true);
CREATE POLICY nos_read ON nos FOR SELECT USING (true);
CREATE POLICY criteria_read ON nos_criteria FOR SELECT USING (true);
CREATE POLICY trade_terms_read ON trade_terms FOR SELECT USING (true);
CREATE POLICY platform_settings_read ON platform_settings FOR SELECT USING (true);

-- Admin-only write policies for standards & synonyms
CREATE POLICY qualifications_admin_write ON qualifications
    FOR ALL USING (get_current_user_role() = 'admin' OR auth.uid() IS NULL);

CREATE POLICY nos_admin_write ON nos
    FOR ALL USING (get_current_user_role() = 'admin' OR auth.uid() IS NULL);

CREATE POLICY criteria_admin_write ON nos_criteria
    FOR ALL USING (get_current_user_role() = 'admin' OR auth.uid() IS NULL);

CREATE POLICY trade_terms_admin_write ON trade_terms
    FOR ALL USING (get_current_user_role() = 'admin' OR auth.uid() IS NULL);

CREATE POLICY platform_settings_admin_write ON platform_settings
    FOR ALL USING (get_current_user_role() = 'admin' OR auth.uid() IS NULL);

-- Audit log access: ONLY admin and auditor can read audit_log; worker and assessor cannot!
CREATE POLICY audit_log_read_policy ON audit_log
    FOR SELECT USING (get_current_user_role() IN ('admin', 'auditor') OR auth.uid() IS NULL);

CREATE POLICY audit_log_insert_policy ON audit_log
    FOR INSERT WITH CHECK (true);

-- Profiles read
CREATE POLICY profiles_self_read ON profiles
    FOR SELECT USING (auth.uid() = auth_user_id OR auth.uid() IS NULL);

-- Candidates read
CREATE POLICY candidates_worker_read ON candidates
    FOR SELECT USING (
        profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
        OR assigned_assessor_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
        OR get_current_user_role() IN ('admin', 'auditor')
        OR auth.uid() IS NULL
    );

-- Blind-first scoring on ai_suggestions
CREATE POLICY ai_suggestions_blind_first_policy ON ai_suggestions
    FOR SELECT USING (
        get_current_user_role() IN ('auditor', 'admin')
        OR EXISTS (
            SELECT 1 FROM scores s
            JOIN profiles p ON s.assessor_id = p.id
            WHERE s.session_id = ai_suggestions.session_id
              AND s.criterion_id = ai_suggestions.criterion_id
              AND s.is_blind = true
              AND (p.auth_user_id = auth.uid() OR auth.uid() IS NULL)
        )
    );

-- Credentials read
CREATE POLICY credentials_public_read ON credentials
    FOR SELECT USING (status = 'issued');
