import { NextResponse } from "next/server";
import { credentialService } from "@/lib/credential/service";

export async function GET() {
  const keys = credentialService.getPublicKeys();
  return NextResponse.json({
    keys,
    activeKeyId: "ed25519-key-2026-v1",
    policy: "Keys are rotated annually. Historical public keys remain published indefinitely to ensure older credentials remain verifiable.",
    compromiseProcedure: "In case of private key compromise, key is immediately marked is_active=false, revoked_at=timestamp, compromise_reason='compromised'. Affected credentials transition to status='revoked'.",
  });
}
