import { NextRequest, NextResponse } from "next/server";
import { credentialService } from "@/lib/credential/service";
import crypto from "crypto";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Client IP hashing for rate limiting
    const forwarded = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const clientIp = forwarded.split(",")[0].trim();
    const clientHash = crypto.createHash("sha256").update(clientIp).digest("hex").slice(0, 16);

    const verification = await credentialService.verifyCredentialBySlug(slug, clientHash);

    if (!verification) {
      // Uniform response for unknown slugs to prevent enumeration
      return NextResponse.json(
        {
          error: "NOT_FOUND",
          message: "The requested credential record could not be found or has not been issued.",
          slug,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(verification, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (error: any) {
    if (error.message?.includes("RATE_LIMIT_EXCEEDED")) {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: "Too many verification requests. Please slow down and retry in 60 seconds.",
        },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
