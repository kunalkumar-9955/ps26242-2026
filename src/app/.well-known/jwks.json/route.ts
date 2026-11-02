import { NextResponse } from "next/server";
import { credentialService } from "@/lib/credential/service";

export async function GET() {
  const keys = credentialService.getPublicKeys();
  // Standard JWKS format for RFC 8037 OKP (Edwards-curve Keys)
  const jwks = keys.map((k) => ({
    kty: "OKP",
    crv: "Ed25519",
    kid: k.keyId,
    use: "sig",
    alg: "EdDSA",
    x: Buffer.from(k.publicKeyHex, "hex").toString("base64url"),
    isActive: k.isActive,
  }));

  return NextResponse.json({ keys: jwks });
}
