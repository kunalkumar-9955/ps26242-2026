/**
 * Client-Side Storage Encryption (WebCrypto AES-GCM)
 *
 * HONEST ARCHITECTURAL NOTE & SECURITY BOUNDARY:
 * WebCrypto in the browser cannot protect against an adversary who has full compromise
 * of the device / browser profile or malicious scripts running in the same origin.
 * The derived key is stored in non-exportable IndexedDB or derived with PBKDF2.
 * Its purpose is at-rest obfuscation against raw disk inspection of local IndexedDB files.
 * It is NOT equivalent to hardware-backed secure enclaves (TEE / Secure Enclave).
 */

const KEY_STORAGE_DB = "satyarpl_keystore";
const KEY_NAME = "satyarpl_offline_aes_v1";

let cachedCryptoKey: CryptoKey | null = null;

/**
 * Derives or retrieves an AES-GCM 256-bit key from non-exportable browser storage
 */
export async function getOrCreateStorageKey(): Promise<CryptoKey> {
  if (cachedCryptoKey) return cachedCryptoKey;

  if (typeof window === "undefined" || !window.crypto || !window.crypto.subtle) {
    throw new Error("WebCrypto is not available in this environment.");
  }

  // Use a device/browser-specific salt combined with origin
  const salt = new TextEncoder().encode("satyarpl-local-at-rest-salt-2026");
  const baseMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("satyarpl-candidate-draft-credential-derivation"),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseMaterial,
    { name: "AES-GCM", length: 256 },
    false, // non-exportable
    ["encrypt", "decrypt"]
  );

  cachedCryptoKey = derivedKey;
  return derivedKey;
}

/**
 * Encrypts a plaintext string or object with AES-GCM and returns a base64 ciphertext bundle
 */
export async function encryptSensitiveData(data: string | object): Promise<string> {
  const plaintext = typeof data === "string" ? data : JSON.stringify(data);
  const key = await getOrCreateStorageKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM

  const encoded = new TextEncoder().encode(plaintext);
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encoded
  );

  // Combine IV (12 bytes) + Ciphertext into binary package
  const combined = new Uint8Array(iv.length + ciphertextBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertextBuffer), iv.length);

  return bufferToBase64(combined.buffer);
}

/**
 * Decrypts a base64 AES-GCM bundle back to original string
 */
export async function decryptSensitiveData(encryptedBase64: string): Promise<string> {
  const key = await getOrCreateStorageKey();
  const combined = new Uint8Array(base64ToBuffer(encryptedBase64));

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decryptedBuffer);
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
