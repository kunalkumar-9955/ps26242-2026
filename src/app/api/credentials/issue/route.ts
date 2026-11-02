import { NextRequest, NextResponse } from "next/server";
import { credentialService } from "@/lib/credential/service";

export async function POST(req: NextRequest) {
  try {
    const userRole = req.headers.get("x-user-role") || "assessor";
    const userId = req.headers.get("x-user-id");

    if (!["assessor", "admin"].includes(userRole) || !userId) {
      return NextResponse.json(
        { error: "Forbidden: Only certified assessors or administrators can issue credentials." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const credential = await credentialService.issueCredential(sessionId, userId);
    return NextResponse.json({ success: true, credential });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
