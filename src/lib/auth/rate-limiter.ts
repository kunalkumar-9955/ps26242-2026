import { query } from "@/lib/db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  lockedUntil?: Date;
  retryAfterSec?: number;
}

export interface RateLimitPolicy {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
}

export const RATE_LIMIT_POLICIES: Record<string, RateLimitPolicy> = {
  login: { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 },
  otp_verify: { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 },
  ai_chat: { maxAttempts: 30, windowMs: 60 * 1000, lockoutMs: 5 * 60 * 1000 },
  evidence_upload: { maxAttempts: 10, windowMs: 60 * 60 * 1000, lockoutMs: 30 * 60 * 1000 },
  public_verify: { maxAttempts: 60, windowMs: 60 * 1000, lockoutMs: 10 * 60 * 1000 },
};

/**
 * Checks whether an identifier (IP address, phone, or user UUID) is allowed for a given endpoint.
 */
export async function checkRateLimit(
  identifier: string,
  endpoint: string
): Promise<RateLimitResult> {
  const policy = RATE_LIMIT_POLICIES[endpoint] || {
    maxAttempts: 10,
    windowMs: 60 * 1000,
    lockoutMs: 5 * 60 * 1000,
  };

  const res = await query(
    `SELECT * FROM auth_rate_limits WHERE identifier = $1 AND endpoint = $2 LIMIT 1`,
    [identifier, endpoint]
  );

  const now = new Date();

  if (res.rows.length === 0) {
    return { allowed: true, remaining: policy.maxAttempts };
  }

  const record = res.rows[0];
  const lockedUntil = record.locked_until ? new Date(record.locked_until) : null;

  if (lockedUntil && lockedUntil > now) {
    const retryAfterSec = Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
    return {
      allowed: false,
      remaining: 0,
      lockedUntil,
      retryAfterSec,
    };
  }

  // If previous window has elapsed, treat as reset
  const firstAttempt = new Date(record.first_attempt_at);
  if (now.getTime() - firstAttempt.getTime() > policy.windowMs) {
    return { allowed: true, remaining: policy.maxAttempts };
  }

  const remaining = Math.max(0, policy.maxAttempts - record.attempts);
  const allowed = record.attempts < policy.maxAttempts;

  return {
    allowed,
    remaining,
    retryAfterSec: allowed ? undefined : Math.ceil(policy.lockoutMs / 1000),
  };
}

/**
 * Records an attempt (successful or failed).
 * If failed, increments attempt count and enforces lockout if threshold is exceeded.
 */
export async function recordRateLimitAttempt(
  identifier: string,
  endpoint: string,
  success: boolean
): Promise<{ allowed: boolean; locked: boolean; lockedUntil?: Date }> {
  const policy = RATE_LIMIT_POLICIES[endpoint] || {
    maxAttempts: 10,
    windowMs: 60 * 1000,
    lockoutMs: 5 * 60 * 1000,
  };

  const now = new Date();

  if (success) {
    // Reset rate limit on valid success
    await query(
      `DELETE FROM auth_rate_limits WHERE identifier = $1 AND endpoint = $2`,
      [identifier, endpoint]
    );
    return { allowed: true, locked: false };
  }

  const existing = await query(
    `SELECT * FROM auth_rate_limits WHERE identifier = $1 AND endpoint = $2 LIMIT 1`,
    [identifier, endpoint]
  );

  if (existing.rows.length === 0) {
    await query(
      `INSERT INTO auth_rate_limits (identifier, endpoint, attempts, first_attempt_at, last_attempt_at)
       VALUES ($1, $2, 1, $3, $3)`,
      [identifier, endpoint, now.toISOString()]
    );
    return { allowed: true, locked: false };
  }

  const record = existing.rows[0];
  const firstAttempt = new Date(record.first_attempt_at);
  const windowExpired = now.getTime() - firstAttempt.getTime() > policy.windowMs;

  const newAttempts = windowExpired ? 1 : record.attempts + 1;
  const isLocked = newAttempts >= policy.maxAttempts;
  const lockedUntil = isLocked
    ? new Date(now.getTime() + policy.lockoutMs).toISOString()
    : null;

  await query(
    `UPDATE auth_rate_limits 
     SET attempts = $1, 
         locked_until = $2, 
         last_attempt_at = $3,
         first_attempt_at = $4
     WHERE identifier = $5 AND endpoint = $6`,
    [
      newAttempts,
      lockedUntil,
      now.toISOString(),
      windowExpired ? now.toISOString() : record.first_attempt_at,
      identifier,
      endpoint,
    ]
  );

  return {
    allowed: !isLocked,
    locked: isLocked,
    lockedUntil: lockedUntil ? new Date(lockedUntil) : undefined,
  };
}

/**
 * Resets rate limit for an identifier and endpoint
 */
export async function resetRateLimit(identifier: string, endpoint: string): Promise<void> {
  await query(
    `DELETE FROM auth_rate_limits WHERE identifier = $1 AND endpoint = $2`,
    [identifier, endpoint]
  );
}
