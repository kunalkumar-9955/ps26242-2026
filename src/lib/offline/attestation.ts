/**
 * Device Attestation Interface (Play Integrity / App Attest)
 *
 * HONEST ARCHITECTURAL DOCUMENTATION:
 * What Offline Can and Cannot Prove:
 * -----------------------------------
 * 1. Offline hash-chaining guarantees internal continuity: block N cannot be modified
 *    without breaking the hash of block N+1.
 * 2. However, a local device clock and client GPS coordinates CAN be spoofed by a rooted
 *    device, mock location provider, or modified browser environment while offline.
 * 3. Server checks (impossible travel heuristics, challenge window expiration, and clock-skew
 *    analysis) significantly reduce spoofing opportunities, but CANNOT mathematically
 *    guarantee physical truth without hardware-backed attestation.
 * 4. Production Path:
 *    - Android: Google Play Integrity API (Hardware-backed key attestation & app licensing).
 *    - iOS: Apple DeviceCheck & App Attest service (Secure Enclave cryptographic tokens).
 *    - In standard browser PWA environments, WebAuthn can offer origin-bound public key pairs,
 *      but full OS integrity requires the production native wrapper.
 *
 * This platform provides a pluggable interface that reports NOT_CONFIGURED
 * clearly and transparently in the UI until native keys are provided.
 */

export type AttestationStatus =
  | "NOT_CONFIGURED"
  | "VERIFIED"
  | "FAILED"
  | "UNSUPPORTED";

export interface AttestationResult {
  status: AttestationStatus;
  provider: string;
  hardwareBacked: boolean;
  token: string | null;
  descriptionEn: string;
  descriptionHi: string;
}

export interface DeviceAttestationProvider {
  name: string;
  getAttestation(nonce: string): Promise<AttestationResult>;
}

export class PluggableDeviceAttestation implements DeviceAttestationProvider {
  public name = "Play Integrity / App Attest Pluggable Provider";

  public async getAttestation(nonce: string): Promise<AttestationResult> {
    // Honest default: In this browser PWA runtime, production native keys are not configured
    return {
      status: "NOT_CONFIGURED",
      provider: "Google Play Integrity / Apple App Attest (Pluggable)",
      hardwareBacked: false,
      token: null,
      descriptionEn:
        "Hardware-backed device attestation is NOT_CONFIGURED. Running in standard Web PWA mode. Server heuristic checks are active.",
      descriptionHi:
        "हार्डवेयर-समर्थित डिवाइस सत्यापन NOT_CONFIGURED है। मानक वेब PWA मोड सक्रिय है। सर्वर सत्यापन जांच सक्रिय है।",
    };
  }
}

export const deviceAttestation = new PluggableDeviceAttestation();
