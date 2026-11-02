import { NextRequest, NextResponse } from "next/server";
import { redTeamRunner } from "@/lib/redteam/runner";
import { KNOWN_SECURITY_LIMITATIONS } from "@/lib/redteam/known-limitations";

export async function POST(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role");

    // Enforce role authorization: Auditor and Admin only
    if (!userRole || !["admin", "auditor"].includes(userRole)) {
      return NextResponse.json(
        {
          error: "Forbidden: Red-Team Mode requires authenticated 'admin' or 'auditor' role.",
          roleReceived: userRole || "anonymous",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { attackId, sessionId = redTeamRunner.SANDBOX_SESSION_ID } = body;

    if (!attackId) {
      return NextResponse.json({ error: "attackId is required" }, { status: 400 });
    }

    const result = await redTeamRunner.executeSingleAttack(attackId, sessionId);
    const limitation = KNOWN_SECURITY_LIMITATIONS.find((l) => l.id.includes(attackId) || l.attackName.toLowerCase().includes(attackId.replace(/_/g, " "))) || null;

    return NextResponse.json({
      success: true,
      result,
      limitation,
    });
  } catch (error: any) {
    const status = error.message?.includes("Forbidden") || error.message?.includes("Real candidate") ? 403 : 500;
    return NextResponse.json(
      {
        error: error.message || "Single attack execution failed.",
      },
      { status }
    );
  }
}
