import { NextRequest, NextResponse } from "next/server";
import { credentialService } from "@/lib/credential/service";

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { credentialId, consent } = body;

    if (!credentialId || typeof consent !== "boolean") {
      return NextResponse.json(
        { error: "credentialId and boolean consent are required." },
        { status: 400 }
      );
    }

    const updated = await credentialService.updateWorkerConsent(credentialId, userId, consent);
    return NextResponse.json({ success: true, updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
