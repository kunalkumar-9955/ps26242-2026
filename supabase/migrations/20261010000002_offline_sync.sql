-- Phase 5 Migration: Offline Sync Engine & Idempotency Store

CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) NOT NULL UNIQUE,
    endpoint VARCHAR(100) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idempotency_key ON idempotency_keys(key);

ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS clock_skew_seconds NUMERIC(10, 2);
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS client_sync_mode VARCHAR(50) DEFAULT 'direct';

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_idempotency ON evidence_items(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Chunked upload staging table (for resumable multi-part evidence transfer)
CREATE TABLE IF NOT EXISTS evidence_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id VARCHAR(255) NOT NULL,
    chunk_index INTEGER NOT NULL,
    total_chunks INTEGER NOT NULL,
    chunk_hash VARCHAR(64) NOT NULL,
    chunk_data TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_upload_chunk UNIQUE (upload_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_evidence_chunks_upload ON evidence_chunks(upload_id);

-- RLS policies
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY idempotency_read ON idempotency_keys FOR SELECT USING (true);
CREATE POLICY idempotency_insert ON idempotency_keys FOR INSERT WITH CHECK (true);

CREATE POLICY evidence_chunks_read ON evidence_chunks FOR SELECT USING (true);
CREATE POLICY evidence_chunks_insert ON evidence_chunks FOR INSERT WITH CHECK (true);
CREATE POLICY evidence_chunks_delete ON evidence_chunks FOR DELETE USING (true);
