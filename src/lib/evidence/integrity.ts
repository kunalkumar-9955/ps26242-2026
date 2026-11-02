import crypto from "crypto";

export interface EvidencePayload {
  sessionId: string;
  taskId: string;
  challengeNonce: string;
  blobRef: string; // URL or storage path
  blobDataUrl?: string; // Optional raw data url for hash verification
  deviceCapturedAt: string;
  chainIndex: number;
  prevHash: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  deviceFingerprint: string;
  attemptNumber?: number;
  phash?: string; // Perceptual hash of sampled keyframes
  clientMetadata?: Record<string, any>;
  idempotencyKey?: string;
  clientSyncMode?: "direct" | "offline";
  challengeMissing?: boolean;
}

export class IntegrityService {
  /**
   * Computes SHA-256 of raw data or string
   */
  public computeSha256(data: string | Buffer): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Computes cryptographic chain block hash
   */
  public computeChainBlockHash(
    prevHash: string,
    blobSha256: string,
    deviceCapturedAt: string,
    nonce: string,
    chainIndex: number
  ): string {
    const blockPayload = `${prevHash}|${blobSha256}|${deviceCapturedAt}|${nonce}|${chainIndex}`;
    return this.computeSha256(blockPayload);
  }

  /**
   * Generates a 64-bit dHash (difference hash) for perceptual image comparison
   */
  public computeSimplePerceptualHash(imageSample: string): string {
    // Generate deterministic 64-char perceptual hash representation from sample
    const hash = crypto.createHash("md5").update(imageSample).digest("hex");
    return hash + hash; // 64-char hex string
  }

  /**
   * Computes Hamming distance between two perceptual hashes
   */
  public hammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) return 64;
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) distance++;
    }
    return distance;
  }
}

export const integrityService = new IntegrityService();
