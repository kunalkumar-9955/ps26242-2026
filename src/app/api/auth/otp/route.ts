import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, recordRateLimitAttempt } from "@/lib/auth/rate-limiter";

const RequestOtpSchema = z.object({
  action: z.literal("request"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian mobile number format (10 digits starting with 6-9)"),
});

const VerifyOtpSchema = z.object({
  action: z.literal("verify"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian mobile number format"),
  otp: z.string().length(6, "OTP must be exactly 6 digits"),
});

const OtpBodySchema = z.discriminatedUnion("action", [RequestOtpSchema, VerifyOtpSchema]);

// Mock constant demo OTP for development/testing
const DEMO_OTP = "123456";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = OtpBodySchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { action, phone } = parsed.data;

    // Check rate limit on OTP endpoints
    const endpoint = action === "request" ? "login" : "otp_verify";
    const limitCheck = await checkRateLimit(phone, endpoint);

    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: "Too many attempts. Account/phone is temporarily locked.",
          lockedUntil: limitCheck.lockedUntil,
          retryAfterSec: limitCheck.retryAfterSec,
        },
        { status: 429 }
      );
    }

    if (action === "request") {
      // Record OTP issuance
      await recordRateLimitAttempt(phone, "login", true);
      return NextResponse.json({
        success: true,
        message: "OTP sent via SMS (simulated in test/dev mode)",
        phoneMasked: `${phone.slice(0, 2)}******${phone.slice(8)}`,
      });
    }

    // Verify OTP
    const { otp } = parsed.data;
    const isValid = otp === DEMO_OTP;

    const attemptResult = await recordRateLimitAttempt(phone, "otp_verify", isValid);

    if (!isValid) {
      if (attemptResult.locked) {
        return NextResponse.json(
          {
            error: "Too many failed OTP attempts. Maximum lockout enforced for 15 minutes.",
            locked: true,
            lockedUntil: attemptResult.lockedUntil,
          },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "Invalid OTP. Please check the code and try again.", locked: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Phone verified successfully",
      authenticated: true,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Internal server error", message: err.message },
      { status: 500 }
    );
  }
}
