import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  const startTime = Date.now();
  let dbOk = false;
  let dbLatencyMs = 0;
  let errorMsg: string | undefined;

  try {
    const t0 = Date.now();
    await query("SELECT 1 as ping;");
    dbLatencyMs = Date.now() - t0;
    dbOk = true;
  } catch (err: any) {
    dbOk = false;
    errorMsg = err.message;
  }

  const status = dbOk ? "healthy" : "degraded";
  const statusCode = dbOk ? 200 : 503;

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        connected: dbOk,
        latencyMs: dbLatencyMs,
        ...(errorMsg ? { error: errorMsg } : {}),
      },
      environment: process.env.NODE_ENV || "development",
      version: "0.1.0-phase10-hardened",
    },
    { status: statusCode }
  );
}
