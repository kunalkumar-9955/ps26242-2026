-- Phase 4 Migration: Evidence Engine enhancements
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_label VARCHAR(100) NOT NULL DEFAULT 'draft - needs assessor review';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS nos_code VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]'::jsonb;

ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1;
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS client_metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_evidence_phash ON evidence_items(phash);
CREATE INDEX IF NOT EXISTS idx_challenges_nonce ON challenges(nonce);
CREATE INDEX IF NOT EXISTS idx_evidence_session_chain ON evidence_items(session_id, chain_index);

-- RLS: worker can create evidence and challenges in their active session
CREATE POLICY challenges_worker_read ON challenges FOR SELECT USING (true);
CREATE POLICY challenges_service_insert ON challenges FOR INSERT WITH CHECK (true);
CREATE POLICY challenges_update_consume ON challenges FOR UPDATE USING (true);

CREATE POLICY evidence_worker_insert ON evidence_items FOR INSERT WITH CHECK (true);
CREATE POLICY evidence_flags_read ON evidence_flags FOR SELECT USING (true);
CREATE POLICY evidence_flags_insert ON evidence_flags FOR INSERT WITH CHECK (true);
