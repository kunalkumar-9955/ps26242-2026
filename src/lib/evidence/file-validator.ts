import crypto from "crypto";

export interface FileValidationResult {
  valid: boolean;
  mimeType?: string;
  error?: string;
  detectedFormat?: string;
}

const MAGIC_BYTES = {
  webm: [0x1a, 0x45, 0xdf, 0xa3], // EBML
  riff: [0x52, 0x49, 0x46, 0x46], // 'RIFF' (WAV/WEBP)
  png: [0x89, 0x50, 0x4e, 0x47],  // PNG
  jpeg: [0xff, 0xd8, 0xff],       // JPEG
};

const ALLOWED_MIME_TYPES = new Set([
  "video/webm",
  "video/mp4",
  "audio/webm",
  "audio/wav",
  "audio/wave",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB hard limit

/**
 * Validates file buffer magic bytes, declared MIME type, and size limits.
 */
export function validateUploadFile(
  buffer: Buffer,
  declaredMime: string,
  filename: string
): FileValidationResult {
  // 1. File size check
  if (buffer.length === 0) {
    return { valid: false, error: "Empty file payload" };
  }
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size ${buffer.length} exceeds 50MB maximum upload limit`,
    };
  }

  // 2. Path traversal protection on filename
  if (
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    /[\x00-\x1f]/.test(filename)
  ) {
    return { valid: false, error: "Illegal filename: potential path traversal detected" };
  }

  // 3. MIME type whitelist check
  const normalizedMime = declaredMime.toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    return { valid: false, error: `Disallowed MIME type: ${declaredMime}` };
  }

  // 4. Magic bytes verification
  // WebM / MKV
  if (
    buffer.length >= 4 &&
    buffer[0] === MAGIC_BYTES.webm[0] &&
    buffer[1] === MAGIC_BYTES.webm[1] &&
    buffer[2] === MAGIC_BYTES.webm[2] &&
    buffer[3] === MAGIC_BYTES.webm[3]
  ) {
    return { valid: true, mimeType: normalizedMime, detectedFormat: "webm" };
  }

  // MP4 check (box 'ftyp' at offset 4)
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 4, 8) === "ftyp"
  ) {
    return { valid: true, mimeType: "video/mp4", detectedFormat: "mp4" };
  }

  // WAV (RIFF + WAVE)
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  ) {
    return { valid: true, mimeType: "audio/wav", detectedFormat: "wav" };
  }

  // JPEG
  if (
    buffer.length >= 3 &&
    buffer[0] === MAGIC_BYTES.jpeg[0] &&
    buffer[1] === MAGIC_BYTES.jpeg[1] &&
    buffer[2] === MAGIC_BYTES.jpeg[2]
  ) {
    return { valid: true, mimeType: "image/jpeg", detectedFormat: "jpeg" };
  }

  // PNG
  if (
    buffer.length >= 4 &&
    buffer[0] === MAGIC_BYTES.png[0] &&
    buffer[1] === MAGIC_BYTES.png[1] &&
    buffer[2] === MAGIC_BYTES.png[2] &&
    buffer[3] === MAGIC_BYTES.png[3]
  ) {
    return { valid: true, mimeType: "image/png", detectedFormat: "png" };
  }

  return {
    valid: false,
    error: "File content magic bytes do not match expected media signatures",
  };
}

/**
 * Storage URL signing and verification (simulating private bucket with signed URLs).
 */
const STORAGE_SIGNING_SECRET = process.env.STORAGE_SIGNING_SECRET || "satyarpl-private-storage-key-2026";

export function generateSignedStorageUrl(
  bucketPath: string,
  expiresInSec: number = 900 // default 15 minutes
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
  const payload = `${bucketPath}:${expiresAt}`;
  const sig = crypto.createHmac("sha256", STORAGE_SIGNING_SECRET).update(payload).digest("hex");
  return `/storage/private/${encodeURIComponent(bucketPath)}?expires=${expiresAt}&sig=${sig}`;
}

export function verifySignedStorageUrl(
  bucketPath: string,
  expiresParam: string | null,
  sigParam: string | null
): { allowed: boolean; reason?: string } {
  if (!expiresParam || !sigParam) {
    return { allowed: false, reason: "Unsigned storage request rejected: missing signature parameters" };
  }

  const expires = parseInt(expiresParam, 10);
  const now = Math.floor(Date.now() / 1000);

  if (isNaN(expires) || now > expires) {
    return { allowed: false, reason: "Storage URL expired" };
  }

  const payload = `${bucketPath}:${expires}`;
  const expectedSig = crypto.createHmac("sha256", STORAGE_SIGNING_SECRET).update(payload).digest("hex");

  const sigBuf = Buffer.from(sigParam, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { allowed: false, reason: "Invalid storage signature" };
  }

  return { allowed: true };
}
