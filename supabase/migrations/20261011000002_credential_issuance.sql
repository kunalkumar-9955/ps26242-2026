-- Phase 8: Credential Issuance, Ed25519 Key Management & Public Verification Schema

-- 1. Alter status column on credentials to support 'valid', 'expired', 'revoked', 'superseded'
DROP POLICY IF EXISTS credentials_public_read ON credentials;
DROP POLICY IF EXISTS credentials_select_policy ON credentials;
ALTER TABLE credentials ALTER COLUMN status DROP DEFAULT;
ALTER TABLE credentials ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
ALTER TABLE credentials ALTER COLUMN status SET DEFAULT 'valid';

-- 2. Add Phase 8 columns to credentials table
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS key_id VARCHAR(64) NOT NULL DEFAULT 'ed25519-key-2026-v1';
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS revocation_reason TEXT;
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES profiles(id);
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS worker_consent_public_display BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS pseudonymous_id VARCHAR(64);
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS checksum VARCHAR(16);
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS disclaimer_notice TEXT;

-- 3. Signing Keys Table for Key Rotation and Public Verification
CREATE TABLE IF NOT EXISTS signing_keys (
    key_id VARCHAR(64) PRIMARY KEY,
    algorithm VARCHAR(20) NOT NULL DEFAULT 'Ed25519',
    public_key_hex TEXT NOT NULL,
    public_key_spki TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    compromise_reason TEXT
);

-- Enable RLS on signing_keys
ALTER TABLE signing_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signing_keys_public_read ON signing_keys;
CREATE POLICY signing_keys_public_read ON signing_keys FOR SELECT USING (true);

DROP POLICY IF EXISTS signing_keys_admin_all ON signing_keys;
CREATE POLICY signing_keys_admin_all ON signing_keys FOR ALL
    USING (get_current_user_role() = 'admin' OR auth.uid() IS NULL);

-- 4. Verification Rate Limits Table
CREATE TABLE IF NOT EXISTS verification_rate_limits (
    id BIGSERIAL PRIMARY KEY,
    client_ip_hash VARCHAR(64) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_count INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_ip_window ON verification_rate_limits(client_ip_hash, window_start);

-- 5. Platform settings for Credential Disclaimer Notice
INSERT INTO platform_settings (key, value, verified, note)
VALUES (
    'credential_disclaimer_notice',
    '{"enabled": true, "notice": "Assessment support record. Not an official NCVET/NSDC certificate unless issued by an accredited body."}'::jsonb,
    true,
    'Configurable disclaimer displayed on all credential views, PDFs, and public verification screens.'
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;

-- 6. Ensure RLS policies for credentials table
DROP POLICY IF EXISTS credentials_select_policy ON credentials;
CREATE POLICY credentials_select_policy ON credentials FOR SELECT
    USING (
        -- Admins and auditors can view all credentials
        get_current_user_role() IN ('admin', 'auditor')
        -- Assessors can view credentials
        OR get_current_user_role() = 'assessor'
        -- Candidates can view their own credentials
        OR (get_current_user_role() = 'candidate' AND candidate_id IN (
            SELECT id FROM candidates WHERE profile_id = auth.uid()
        ))
        -- Public read allows query by verify_slug
        OR auth.uid() IS NULL
    );

DROP POLICY IF EXISTS credentials_admin_update ON credentials;
CREATE POLICY credentials_admin_update ON credentials FOR UPDATE
    USING (get_current_user_role() IN ('admin', 'auditor') OR auth.uid() IS NULL);
