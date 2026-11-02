import { pool } from "./index";
import crypto from "crypto";

export interface AuditParams {
  entityName: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  actorId?: string;
  actorRole: "admin" | "assessor" | "auditor" | "worker" | "system";
  beforeState?: any;
  afterState?: any;
  metadata?: Record<string, any>;
}

export async function logAuditEvent(params: AuditParams) {
  const client = await pool.connect();
  try {
    // 1. Get latest hash for chain continuity
    const latestRes = await client.query(
      "SELECT curr_hash FROM audit_log ORDER BY id DESC LIMIT 1"
    );
    const prevHash =
      latestRes.rows.length > 0 && latestRes.rows[0].curr_hash
        ? latestRes.rows[0].curr_hash
        : "0000000000000000000000000000000000000000000000000000000000000000";

    const timestamp = new Date().toISOString();
    const payloadToHash = `${prevHash}|${params.entityName}|${params.entityId}|${params.action}|${params.actorRole}|${JSON.stringify(
      params.afterState || {}
    )}|${timestamp}`;

    const currHash = crypto
      .createHash("sha256")
      .update(payloadToHash)
      .digest("hex");

    const insertQuery = `
      INSERT INTO audit_log (
        entity_name,
        entity_id,
        action,
        actor_id,
        actor_role,
        before_state,
        after_state,
        prev_hash,
        curr_hash,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, curr_hash, created_at;
    `;

    const res = await client.query(insertQuery, [
      params.entityName,
      params.entityId,
      params.action,
      params.actorId || null,
      params.actorRole,
      params.beforeState ? JSON.stringify(params.beforeState) : null,
      params.afterState ? JSON.stringify(params.afterState) : null,
      prevHash,
      currHash,
      JSON.stringify(params.metadata || {}),
    ]);

    return res.rows[0];
  } finally {
    client.release();
  }
}
