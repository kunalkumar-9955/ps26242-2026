import { describe, it, expect, beforeAll } from "vitest";
import { runIdempotentSeed } from "@/lib/db/seed";
import { query, pool } from "@/lib/db";
import { logAuditEvent } from "@/lib/db/audit";
import { POST as handleTradeTermsPost, DELETE as handleTradeTermsDelete } from "@/app/api/admin/trade-terms/route";
import { GET as handleAuditLogGet } from "@/app/api/admin/audit-log/route";
import { NextRequest } from "next/server";

describe("Phase 2b: Real Postgres Migrations, RLS, Audit Logging & Role Gating", () => {
  beforeAll(async () => {
    // Ensure clean initial seed
    await runIdempotentSeed();
  });

  // 1. IDEMPOTENT IMPORT TEST
  it("executes idempotent seed without duplicating qualifications or NOS units", async () => {
    const res1 = await runIdempotentSeed();
    expect(res1.success).toBe(true);

    const res2 = await runIdempotentSeed();
    expect(res2.success).toBe(true);

    // Verify exact row counts in PostgreSQL
    const qpCount = await query("SELECT count(*) as count FROM qualifications WHERE qp_code = 'CON/Q0602';");
    expect(parseInt(qpCount.rows[0].count)).toBe(1);

    const nosCount = await query("SELECT count(*) as count FROM nos;");
    expect(parseInt(nosCount.rows[0].count)).toBe(7);
  });

  // 2. PROVENANCE & HONEST DEMARCATION FLAGS
  it("verifies official NQR titles are verified=true and authored rubrics/slang are verified=false", async () => {
    // Qualification Provenance
    const qpRes = await query("SELECT qp_code, nqr_code, source_url, verified FROM qualifications WHERE qp_code = 'CON/Q0602';");
    expect(qpRes.rows[0].nqr_code).toBe("QG-03-CO-03951-2025-V2-CSDCI");
    expect(qpRes.rows[0].source_url).toBe("https://www.nqr.gov.in/qualifications/13772");
    expect(qpRes.rows[0].verified).toBe(true);

    // Official NOS Titles & Source URLs
    const nosRes = await query("SELECT code, title, source_url, verified FROM nos;");
    expect(nosRes.rows.length).toBe(7);
    for (const nos of nosRes.rows) {
      expect(nos.verified).toBe(true);
      expect(nos.source_url).toContain("https://www.nqr.gov.in/qualifications/13772#");
    }

    // Authored Criteria: MUST be verified=false with draft status label
    const criteriaRes = await query("SELECT count(*) as total, count(*) FILTER (WHERE verified = false) as unverified FROM nos_criteria;");
    expect(parseInt(criteriaRes.rows[0].total)).toBe(13);
    expect(parseInt(criteriaRes.rows[0].unverified)).toBe(13);

    // Passing threshold setting: MUST be verified=false
    const settingsRes = await query("SELECT value, verified, note FROM platform_settings WHERE key = 'pass_threshold_percent';");
    expect(settingsRes.rows[0].verified).toBe(false);
    expect(settingsRes.rows[0].note).toContain("PMKVY RPL assessment guidelines");
  });

  // 3. AUDIT LOG ON CREATE / DELETE
  it("records cryptographically hash-chained audit log rows on create and delete", async () => {
    // Read current audit log count
    const initialLogRes = await query("SELECT count(*) as count FROM audit_log;");
    const initialCount = parseInt(initialLogRes.rows[0].count);

    // Perform an admin add
    const addReq = new NextRequest("http://localhost:3000/api/admin/trade-terms", {
      method: "POST",
      headers: {
        "x-user-role": "admin",
        "x-user-id": "44444444-4444-4444-4444-444444444444",
      },
      body: JSON.stringify({
        vernacularTerm: "दीवार काटना (Diwar katna)",
        standardEnglishTask: "Wall chasing channel cutting",
      }),
    });

    const addRes = await handleTradeTermsPost(addReq);
    expect(addRes.status).toBe(200);
    const addData = await addRes.json();
    const createdId = addData.term.id;

    // Check that audit_log grew by 1
    const postAddLogRes = await query("SELECT count(*) as count FROM audit_log;");
    expect(parseInt(postAddLogRes.rows[0].count)).toBe(initialCount + 1);

    // Fetch the audit log row and verify before/after state
    const latestLogRes = await query("SELECT * FROM audit_log ORDER BY id DESC LIMIT 1;");
    const latestLog = latestLogRes.rows[0];
    expect(latestLog.entity_name).toBe("TRADE_TERMS");
    expect(latestLog.action).toBe("CREATE");
    expect(latestLog.actor_role).toBe("admin");
    expect(latestLog.before_state).toBeNull();
    expect(latestLog.after_state.id).toBe(createdId);
    expect(latestLog.curr_hash.length).toBe(64); // SHA-256

    // Now delete it
    const delReq = new NextRequest(`http://localhost:3000/api/admin/trade-terms?id=${createdId}`, {
      method: "DELETE",
      headers: {
        "x-user-role": "admin",
        "x-user-id": "44444444-4444-4444-4444-444444444444",
      },
    });

    const delRes = await handleTradeTermsDelete(delReq);
    expect(delRes.status).toBe(200);

    // Verify delete audit log row
    const deleteLogRes = await query("SELECT * FROM audit_log ORDER BY id DESC LIMIT 1;");
    const deleteLog = deleteLogRes.rows[0];
    expect(deleteLog.action).toBe("DELETE");
    expect(deleteLog.before_state.id).toBe(createdId);
    expect(deleteLog.after_state).toBeNull();
  });

  // 4. ADMIN ROUTE BLOCKED FOR WORKERS & ASSESSORS (403 FORBIDDEN)
  it("rejects unauthorized non-admin roles attempting admin mutations with 403 Forbidden", async () => {
    // Worker attempt
    const workerReq = new NextRequest("http://localhost:3000/api/admin/trade-terms", {
      method: "POST",
      headers: {
        "x-user-role": "worker",
        "x-user-id": "11111111-1111-1111-1111-111111111111",
      },
      body: JSON.stringify({
        vernacularTerm: "मजदूर टर्म (Worker term)",
        standardEnglishTask: "Unauthorized edit",
      }),
    });

    const workerRes = await handleTradeTermsPost(workerReq);
    expect(workerRes.status).toBe(403);
    const workerData = await workerRes.json();
    expect(workerData.error).toContain("Forbidden");

    // Assessor attempt
    const assessorReq = new NextRequest("http://localhost:3000/api/admin/trade-terms", {
      method: "POST",
      headers: {
        "x-user-role": "assessor",
        "x-user-id": "22222222-2222-2222-2222-222222222222",
      },
      body: JSON.stringify({
        vernacularTerm: "असेसर टर्म (Assessor term)",
        standardEnglishTask: "Unauthorized edit",
      }),
    });

    const assessorRes = await handleTradeTermsPost(assessorReq);
    expect(assessorRes.status).toBe(403);
  });

  // 5. AUDIT LOG ACCESS GATING
  it("allows only admin and auditor to inspect audit_log and blocks workers", async () => {
    // Worker query to audit log
    const workerAuditReq = new NextRequest("http://localhost:3000/api/admin/audit-log", {
      headers: { "x-user-role": "worker" },
    });
    const workerAuditRes = await handleAuditLogGet(workerAuditReq);
    expect(workerAuditRes.status).toBe(403);

    // Auditor query to audit log
    const auditorAuditReq = new NextRequest("http://localhost:3000/api/admin/audit-log", {
      headers: { "x-user-role": "auditor" },
    });
    const auditorAuditRes = await handleAuditLogGet(auditorAuditReq);
    expect(auditorAuditRes.status).toBe(200);
    const auditorData = await auditorAuditRes.json();
    expect(Array.isArray(auditorData.auditLogs)).toBe(true);

    // Admin query to audit log
    const adminAuditReq = new NextRequest("http://localhost:3000/api/admin/audit-log", {
      headers: { "x-user-role": "admin" },
    });
    const adminAuditRes = await handleAuditLogGet(adminAuditReq);
    expect(adminAuditRes.status).toBe(200);
  });
});
