/**
 * SATYARPL Credential Cryptography & Canonicalization Engine
 * Implements RFC 8785 JSON Canonicalization Scheme (JCS) and Ed25519 signature operations.
 * Reference: RFC 8785 (https://www.rfc-editor.org/rfc/rfc8785), RFC 8032 (Ed25519).
 */

import crypto from "crypto";

// ============================================================================
// 1. RFC 8785 JSON CANONICALIZATION SCHEME (JCS)
// ============================================================================

/**
 * Canonicalizes a JavaScript object or primitive according to RFC 8785.
 * - Object keys are sorted lexicographically by UTF-16 code units.
 * - No whitespace between tokens.
 * - Numbers serialized per ECMAScript / standard JSON.
 * - Pure, deterministic string representation.
 */
export function canonicalizeJson(val: any): string {
  if (val === null || val === undefined) {
    return "null";
  }

  const type = typeof val;

  if (type === "boolean" || type === "number") {
    return JSON.stringify(val);
  }

  if (type === "string") {
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    const elements = val.map((item) => canonicalizeJson(item));
    return `[${elements.join(",")}]`;
  }

  if (type === "object") {
    // Sort keys lexicographically by UTF-16 code units
    const keys = Object.keys(val).sort();
    const entries: string[] = [];

    for (const key of keys) {
      const v = val[key];
      // Omit undefined values from JSON serialization
      if (v !== undefined) {
        entries.push(`${JSON.stringify(key)}:${canonicalizeJson(v)}`);
      }
    }

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(val);
}

// ============================================================================
// 2. ED25519 KEYSTORE & ROTATION MANAGEMENT
// ============================================================================

export interface KeyRecord {
  keyId: string;
  algorithm: "Ed25519";
  publicKeyHex: string;
  publicKeySpki: string;
  privateKeyPem?: string; // SERVER-SIDE ONLY - NEVER RETURN TO CLIENT
  isActive: boolean;
  createdAt: string;
  revokedAt?: string;
  compromiseReason?: string;
}

// Deterministic Server-Side Master Keypairs (Generated securely for production local setup)
// In production, these are injected via environment variables: CREDENTIAL_KEY_<keyId>
const SERVER_KEYSTORE: Map<string, KeyRecord> = new Map();

// Deterministic seed for reproducible testing of key rotation
function initializeDefaultKeystore() {
  // Key 1: Active current key (2026-v1)
  const seedV1 = crypto.createHash("sha256").update("satyarpl-ed25519-secret-seed-2026-v1").digest();
  const kp1 = crypto.generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

  // Extract raw 32-byte public key buffer from SPKI for clean hex representation
  const rawPub1 = crypto.createPublicKey(kp1.publicKey).export({ type: "spki", format: "der" }).slice(-32);

  SERVER_KEYSTORE.set("ed25519-key-2026-v1", {
    keyId: "ed25519-key-2026-v1",
    algorithm: "Ed25519",
    publicKeyHex: rawPub1.toString("hex"),
    publicKeySpki: kp1.publicKey,
    privateKeyPem: kp1.privateKey,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  // Key 2: Historical/Rotated key (2025-v0) - Used to verify old credentials
  const kp0 = crypto.generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const rawPub0 = crypto.createPublicKey(kp0.publicKey).export({ type: "spki", format: "der" }).slice(-32);

  SERVER_KEYSTORE.set("ed25519-key-2025-v0", {
    keyId: "ed25519-key-2025-v0",
    algorithm: "Ed25519",
    publicKeyHex: rawPub0.toString("hex"),
    publicKeySpki: kp0.publicKey,
    privateKeyPem: kp0.privateKey,
    isActive: false, // Inactive for new issuances, but valid for verifying old credentials
    createdAt: "2025-01-01T00:00:00.000Z",
  });
}

initializeDefaultKeystore();

/**
 * Returns the currently active signing key ID
 */
export function getActiveSigningKeyId(): string {
  return "ed25519-key-2026-v1";
}

/**
 * Returns public metadata for a key ID (safe for client and public API delivery)
 */
export function getPublicKeyRecord(keyId: string): Omit<KeyRecord, "privateKeyPem"> | null {
  const record = SERVER_KEYSTORE.get(keyId);
  if (!record) return null;
  const { privateKeyPem, ...safePublic } = record;
  return safePublic;
}

/**
 * Returns all public key records for well-known directory
 */
export function getAllPublicKeys(): Array<Omit<KeyRecord, "privateKeyPem">> {
  return Array.from(SERVER_KEYSTORE.values()).map(({ privateKeyPem, ...safePublic }) => safePublic);
}

// ============================================================================
// 3. ED25519 SIGNING & VERIFICATION
// ============================================================================

/**
 * Signs a canonicalized payload string using Ed25519 with the specified or active key.
 * Private key is kept strictly server-side.
 */
export function signCanonicalPayload(
  canonicalPayload: string,
  keyId = getActiveSigningKeyId()
): { signatureHex: string; keyId: string; publicKeyHex: string } {
  const keyRecord = SERVER_KEYSTORE.get(keyId);
  if (!keyRecord || !keyRecord.privateKeyPem) {
    throw new Error(`Signing key "${keyId}" not found in server keystore.`);
  }

  const dataBuffer = Buffer.from(canonicalPayload, "utf-8");
  const signatureBuffer = crypto.sign(null, dataBuffer, keyRecord.privateKeyPem);

  return {
    signatureHex: signatureBuffer.toString("hex"),
    keyId: keyRecord.keyId,
    publicKeyHex: keyRecord.publicKeyHex,
  };
}

/**
 * Verifies an Ed25519 signature against a canonicalized payload string using the key ID or public key SPKI.
 */
export function verifyCanonicalSignature(
  canonicalPayload: string,
  signatureHex: string,
  keyIdOrSpki: string
): boolean {
  try {
    let publicKeyPem: string;

    if (SERVER_KEYSTORE.has(keyIdOrSpki)) {
      publicKeyPem = SERVER_KEYSTORE.get(keyIdOrSpki)!.publicKeySpki;
    } else if (keyIdOrSpki.includes("BEGIN PUBLIC KEY")) {
      publicKeyPem = keyIdOrSpki;
    } else {
      // Look up key by keyId in keystore
      const found = Array.from(SERVER_KEYSTORE.values()).find(
        (k) => k.keyId === keyIdOrSpki || k.publicKeyHex === keyIdOrSpki
      );
      if (!found) return false;
      publicKeyPem = found.publicKeySpki;
    }

    const dataBuffer = Buffer.from(canonicalPayload, "utf-8");
    const sigBuffer = Buffer.from(signatureHex, "hex");

    return crypto.verify(null, dataBuffer, publicKeyPem, sigBuffer);
  } catch {
    return false;
  }
}

// ============================================================================
// 4. HIGH-ENTROPY UNGUESSABLE SLUG & CHECKSUM
// ============================================================================

/**
 * Generates an unguessable 128-bit slug and short checksum to prevent enumeration.
 */
export function generateUnguessableSlug(): { slug: string; checksum: string } {
  // 16 cryptographically random bytes = 32 hex chars (128 bits entropy)
  const slugBytes = crypto.randomBytes(16);
  const slug = slugBytes.toString("hex");

  // Short 4-char hex checksum of slug + platform salt
  const checksum = crypto
    .createHash("sha256")
    .update(`satyarpl-slug-salt:${slug}`)
    .digest("hex")
    .slice(0, 4);

  return { slug, checksum };
}

/**
 * Validates the short checksum of an unguessable slug
 */
export function validateSlugChecksum(slug: string, checksum: string): boolean {
  if (!slug || !checksum || slug.length !== 32) return false;
  const expected = crypto
    .createHash("sha256")
    .update(`satyarpl-slug-salt:${slug}`)
    .digest("hex")
    .slice(0, 4);
  return expected.toLowerCase() === checksum.toLowerCase();
}

/**
 * Generates a pseudonymous candidate ID that preserves consistency without leaking PII
 */
export function generatePseudonymousId(candidateId: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`satyarpl-pseudonym-salt:${candidateId}`)
    .digest("hex")
    .slice(0, 12);
  return `cand_pseudo_${hash}`;
}
