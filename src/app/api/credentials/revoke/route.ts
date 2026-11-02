import { NextRequest, NextResponse } from "next/server";
import { credentialService } from "@/lib/credential/service";

export async function POST(req: NextRequest) {
  try {
    const userRole = (req.headers.get("x-user-role") || "") as "admin" | "auditor";
    const userId = req.headers.get("x-user-id");

    if (!["admin", "auditor"].includes(userRole) || !userId) {
      return NextResponse.json(
        { error: "Forbidden: Only platform administrators or auditors can revoke credentials." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { credentialId, reason } = body;

    if (!credentialId || !reason) {
      return NextResponse.json(
        { error: "credentialId and a detailed revocation reason are required." },
        { status: 400 }
      );
    }

    const revoked = await credentialService.revokeCredential(credentialId, userId, userRole, reason);
    return NextResponse.json({ success: true, credential: revoked });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
