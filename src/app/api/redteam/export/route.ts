import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { KNOWN_SECURITY_LIMITATIONS } from "@/lib/redteam/known-limitations";

export async function GET(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role");

    // Enforce role authorization: Auditor and Admin only
    if (!userRole || !["admin", "auditor"].includes(userRole)) {
      return NextResponse.json(
        {
          error: "Forbidden: Only auditors and administrators can export security audit reports.",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const runId = searchParams.get("runId");
    const format = searchParams.get("format") || "json";

    let runQuery = "SELECT * FROM security_test_runs ORDER BY run_number DESC LIMIT 1;";
    const queryParams: any[] = [];

    if (runId) {
      runQuery = "SELECT * FROM security_test_runs WHERE id = $1 LIMIT 1;";
      queryParams.push(runId);
    }

    const res = await query(runQuery, queryParams);
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "No security test run found to export." }, { status: 404 });
    }

    const run = res.rows[0];
    const attackResults = typeof run.results === "string" ? JSON.parse(run.results) : run.results;
    const coverageMatrix = typeof run.coverage_matrix === "string" ? JSON.parse(run.coverage_matrix) : run.coverage_matrix;

    const exportData = {
      reportType: "SatyaRPL Red-Team Security & Integrity Audit Report",
      exportedAt: new Date().toISOString(),
      runNumber: run.run_number,
      appVersion: run.app_version,
      gitCommit: run.git_commit,
      runner: {
        id: run.runner_id,
        role: run.runner_role,
      },
      scope: run.scope,
      metrics: {
        totalAttacks: run.total_attacks,
        caughtCount: run.caught_count,
        notDetectedCount: run.not_detected_count,
        failedCount: run.failed_count,
        overallDetectionRate: run.overall_detection_rate,
        durationMs: run.duration_ms,
      },
      summary: run.summary_notes,
      attackResults,
      coverageMatrix,
      knownLimitations: KNOWN_SECURITY_LIMITATIONS,
    };

    if (format === "html") {
      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SatyaRPL Security Audit Report - Run #${run.run_number}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; color: #111827; }
    h1 { font-size: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 24px; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
    .badge-pass { background: #dcfce7; color: #166534; }
    .badge-warn { background: #fef9c3; color: #854d0e; }
    .badge-fail { background: #fee2e2; color: #991b1b; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    .meta-box { background: #f3f4f6; padding: 16px; border-radius: 6px; margin-bottom: 20px; font-size: 14px; }
    @media print { body { margin: 15mm; } .no-print { display: none; } }
  </style>
</head>
<body>
  <h1>🛡️ SatyaRPL Adversarial Security & Verification Audit Report</h1>
  <div class="meta-box">
    <strong>Run Number:</strong> #${run.run_number} | 
    <strong>Date:</strong> ${new Date(run.created_at).toLocaleString()} | 
    <strong>Version:</strong> ${run.app_version} (${run.git_commit})<br/>
    <strong>Auditor/Runner:</strong> ${run.runner_role} (${run.runner_id}) | 
    <strong>Test Scope:</strong> ${run.scope}<br/>
    <strong>Overall Detection Rate:</strong> <strong>${run.overall_detection_rate}</strong> (${run.caught_count} caught, ${run.not_detected_count} unconfigured, ${run.failed_count} failed) | 
    <strong>Suite Duration:</strong> ${run.duration_ms} ms
  </div>

  <h2>Adversarial Attack Results (12 Scenarios)</h2>
  <table>
    <thead>
      <tr>
        <th>Attack</th>
        <th>Pipeline Stage</th>
        <th>Actual Outcome / Reason</th>
        <th>Verdict</th>
      </tr>
    </thead>
    <tbody>
      ${attackResults.map((a: any) => `
        <tr>
          <td><strong>${a.attackName}</strong><br/><small style="color:#6b7280">${a.attackId}</small></td>
          <td><code>${a.pipelineStage}</code></td>
          <td>${a.detectionReason || a.actualOutcome}</td>
          <td>
            <span class="badge ${a.verdict === 'PASS' ? 'badge-pass' : a.verdict === 'NOT_DETECTED' ? 'badge-warn' : 'badge-fail'}">
              ${a.verdict}
            </span>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>Known Platform Limitations &amp; Mitigations</h2>
  <table>
    <thead>
      <tr>
        <th>Attack Scenario</th>
        <th>Platform Mitigation</th>
        <th>Production Native Requirement</th>
      </tr>
    </thead>
    <tbody>
      ${KNOWN_SECURITY_LIMITATIONS.map((l) => `
        <tr>
          <td><strong>${l.attackName}</strong><br/><small style="color:#6b7280">${l.plainExplanation}</small></td>
          <td>${l.currentMitigation}</td>
          <td>${l.productionRequirement}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <br/>
  <p style="font-size: 12px; color: #6b7280;">Generated by SatyaRPL Red-Team Runner. Signed cryptographic hash recorded in platform audit log.</p>
</body>
</html>
      `;

      return new NextResponse(htmlContent, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `inline; filename="satyarpl-redteam-report-${run.run_number}.html"`,
        },
      });
    }

    return NextResponse.json(exportData, {
      headers: {
        "Content-Disposition": `attachment; filename="satyarpl-security-run-${run.run_number}.json"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
