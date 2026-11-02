import crypto from "crypto";
import { query } from "@/lib/db";

export type ChallengeKind = "code_on_camera" | "task_variant" | "spoken_phrase" | "sequence_prompt";

export interface ChallengeRecord {
  id: string;
  sessionId: string;
  taskId: string;
  nonce: string;
  promptText: string;
  type: ChallengeKind;
  issuedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  signature: string;
}

export class ChallengeService {
  private secret: string;

  constructor() {
    this.secret =
      process.env.CHALLENGE_HMAC_SECRET || "satya-rpl-sih-2026-super-secret-challenge-key-32chars";
  }

  /**
   * Generates a cryptographically random verification nonce
   */
  public generateNonce(): string {
    const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
    const digits = Math.floor(1000 + Math.random() * 9000);
    return `RPL-${digits}-${randomHex}`;
  }

  /**
   * Signs a challenge payload with HMAC-SHA256 binding session, task, and expiry
   */
  public signChallenge(nonce: string, sessionId: string, taskId: string, expiresAt: string): string {
    const payload = `${nonce}|${sessionId}|${taskId}|${expiresAt}`;
    return crypto.createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  /**
   * Generates dynamic challenge instruction prompt text
   */
  public createPrompt(type: ChallengeKind, nonce: string): string {
    switch (type) {
      case "code_on_camera":
        return `Show verification code [${nonce}] clearly written on paper or tape to camera during task execution.`;
      case "spoken_phrase":
        return `Recite the verification code aloud in Hindi or English: "सुरक्षा कोड ${nonce} - SatyaRPL Verification".`;
      case "task_variant":
        return `Task Variant: Execute the connection starting from terminal 2 while displaying code [${nonce}].`;
      case "sequence_prompt":
        return `Sequence Order: 1. Earth Conductor -> 2. Neutral -> 3. Phase. Display code [${nonce}].`;
    }
  }

  /**
   * Issues a single signed, expiring challenge bound to session and task
   */
  public async issueChallenge(
    sessionId: string,
    taskId: string,
    type: ChallengeKind = "code_on_camera",
    ttlSeconds: number = 900 // 15 minutes validity
  ): Promise<ChallengeRecord> {
    const nonce = this.generateNonce();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
    const signature = this.signChallenge(nonce, sessionId, taskId, expiresAt.toISOString());
    const promptText = this.createPrompt(type, nonce);

    const res = await query(
      `
      INSERT INTO challenges (
        session_id,
        task_id,
        nonce,
        prompt_text,
        type,
        issued_at,
        expires_at,
        signature
      ) VALUES ($1, $2, $3, $4, $5::challenge_kind, $6, $7, $8)
      RETURNING *;
    `,
      [
        sessionId,
        taskId,
        nonce,
        promptText,
        type,
        issuedAt.toISOString(),
        expiresAt.toISOString(),
        signature,
      ]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      sessionId: row.session_id,
      taskId: row.task_id,
      nonce: row.nonce,
      promptText: row.prompt_text,
      type: row.type,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
      signature: row.signature,
    };
  }

  /**
   * Batch pre-fetch challenges for offline capture resilience
   */
  public async batchPrefetchChallenges(
    sessionId: string,
    taskIds: string[],
    countPerTask: number = 2,
    ttlSeconds: number = 3600 // 1 hour validity for offline session batches
  ): Promise<ChallengeRecord[]> {
    const results: ChallengeRecord[] = [];
    const kinds: ChallengeKind[] = ["code_on_camera", "spoken_phrase", "sequence_prompt"];

    for (const taskId of taskIds) {
      for (let i = 0; i < countPerTask; i++) {
        const kind = kinds[i % kinds.length];
        const challenge = await this.issueChallenge(sessionId, taskId, kind, ttlSeconds);
        results.push(challenge);
      }
    }

    return results;
  }

  /**
   * Verifies and marks challenge as consumed. Returns validation results with detailed reasons.
   */
  public async validateAndConsumeChallenge(
    nonce: string,
    sessionId: string,
    taskId: string
  ): Promise<{
    valid: boolean;
    reason?: string;
    challengeId?: string;
    clockSkewSeconds?: number;
  }> {
    const res = await query("SELECT * FROM challenges WHERE nonce = $1 LIMIT 1;", [nonce]);

    if (res.rows.length === 0) {
      return { valid: false, reason: `Challenge nonce [${nonce}] does not exist in platform registry.` };
    }

    const c = res.rows[0];

    // 1. Session binding check
    if (c.session_id !== sessionId) {
      return {
        valid: false,
        challengeId: c.id,
        reason: `Session mismatch: Challenge was issued to session [${c.session_id}], but presented by [${sessionId}].`,
      };
    }

    // 2. Task binding check
    if (c.task_id !== taskId) {
      return {
        valid: false,
        challengeId: c.id,
        reason: `Task mismatch: Challenge was bound to task [${c.task_id}], but presented for [${taskId}].`,
      };
    }

    // 3. Signature verification
    const expectedSig = this.signChallenge(c.nonce, c.session_id, c.task_id, new Date(c.expires_at).toISOString());
    if (c.signature !== expectedSig) {
      return {
        valid: false,
        challengeId: c.id,
        reason: "Cryptographic signature mismatch: Challenge payload was tampered with.",
      };
    }

    // 4. Replay / Single-use check
    if (c.consumed_at !== null) {
      return {
        valid: false,
        challengeId: c.id,
        reason: `Replay Attack Detected: Challenge [${nonce}] was already consumed at ${new Date(c.consumed_at).toISOString()}.`,
      };
    }

    // 5. Expiration check
    const now = new Date();
    const expiresAt = new Date(c.expires_at);
    if (now > expiresAt) {
      return {
        valid: false,
        challengeId: c.id,
        reason: `Challenge expired: Nonce validity ended at ${expiresAt.toISOString()}, presented at ${now.toISOString()}.`,
      };
    }

    // Mark as consumed in PostgreSQL
    await query("UPDATE challenges SET consumed_at = NOW() WHERE id = $1;", [c.id]);

    return {
      valid: true,
      challengeId: c.id,
    };
  }
}

export const challengeService = new ChallengeService();
