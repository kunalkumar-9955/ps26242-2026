# Phase 5 Report: Offline-First PWA, Append-Only Sync & Attestation Boundaries
**Date:** October 11, 2026  
**Commit:** `phase 5`  
**Git Tag:** `phase-5`  

---

## 1. What Was Built

### A. Progressive Web App (PWA) Foundation
* **Installable Web Manifest ([`public/manifest.json`](file:///e:/PS26242%282026%29/public/manifest.json)):**
  * Bilingual names (`SatyaRPL — सत्य RPL (Recognition of Prior Learning)`), standalone display mode, orientation locking (`portrait`), theme color (`#2563EB`), and background color (`#0F172A`).
  * High-resolution vector icons ([`public/icons/icon-192.svg`](file:///e:/PS26242%282026%29/public/icons/icon-192.svg) and [`public/icons/icon-512.svg`](file:///e:/PS26242%282026%29/public/icons/icon-512.svg)) featuring the official SatyaRPL shield, verification tick, and electrician trade lightning spark.
  * Direct application shortcuts to `/worker` (Declaration) and `/worker/capture` (Evidence).
* **Versioned Service Worker ([`public/sw.js`](file:///e:/PS26242%282026%29/public/sw.js)):**
  * Cache version: `satyarpl-shell-v1.0.0`.
  * Pre-caches offline shell resources (`/`, `/worker`, `/worker/capture`, `/manifest.json`, `/offline.html`, vector icons).
  * Stale cache eviction: on `activate`, purges all non-matching cache namespaces and claims clients (`self.clients.claim()`).
  * Dynamic routing strategy: Network-First for API routes and navigation; Stale-While-Revalidate for static bundles; dedicated standalone fallback to [`public/offline.html`](file:///e:/PS26242%282026%29/public/offline.html).
  * Update lifecycle: listens for `SKIP_WAITING` message from user prompt to enable seamless reload.

### B. Dexie IndexedDB Offline Store & At-Rest Encryption
* **Client-Side Schema ([`src/lib/offline/db.ts`](file:///e:/PS26242%282026%29/src/lib/offline/db.ts)):**
  * `drafts`: encrypted drafts for candidate text & self-declarations.
  * `declarations`: voice recording transcriptions queued for online LLM extraction.
  * `checklistProgress`: individual practical task step checkpoints.
  * `evidenceBlobs`: local video clip blobs and MIME metadata.
  * `hashChainState`: active session block indices and previous SHA-256 block hashes.
  * `syncQueue`: persistent queue entries with idempotency keys, chunk progress, and priority.
  * `challengesCache`: pre-fetched single-use challenge inventory.
  * `assessorCache`: offline-ready structure for candidate rubrics and physical inspection criteria.
* **Storage Resilience & Quota Management:**
  * Persistent storage requests via `navigator.storage.persist()` and status checking with `navigator.storage.persisted()`.
  * Storage quota telemetry via `navigator.storage.estimate()` calculating used bytes, total quota, percentage, and a `> 95%` storage-full threshold alarm.
* **WebCrypto AES-GCM Encryption ([`src/lib/offline/crypto.ts`](file:///e:/PS26242%282026%29/src/lib/offline/crypto.ts)):**
  * Encrypts sensitive draft data at rest using AES-GCM (256-bit) with PBKDF2 (100,000 iterations, SHA-256) and a 96-bit cryptographic IV.
  * Honest documentation: WebCrypto at-rest encryption protects against raw disk extraction of browser IndexedDB files, but cannot protect against a malicious script running in the same origin or full OS compromise.

### C. Offline Challenge Management & Audit Flags
* **Batch Prefetch & Consumption ([`src/lib/offline/challenge-cache.ts`](file:///e:/PS26242%282026%29/src/lib/offline/challenge-cache.ts)):**
  * Online prefetching of multi-challenge batches (`/api/evidence/challenges` with `batch: true`).
  * Single-use offline consumption: marks `consumedAt` timestamp in IndexedDB immediately to prevent offline replay attacks.
  * Automatic purge of expired challenges (`new Date(expiresAt) < Date.now()`).
  * **Strict Audit Requirement:** If a worker captures evidence when no valid, unexpired challenge exists in the offline store, the capture is **NOT** silently rejected or faked. It is queued and explicitly flagged `challenge_missing` (critical severity) on sync, requiring mandatory manual assessor review.

### D. Sync Engine, Resumable Uploads & Idempotency
* **Sync Engine Core ([`src/lib/offline/sync-engine.ts`](file:///e:/PS26242%282026%29/src/lib/offline/sync-engine.ts)):**
  * Priority-based processing: Declarations (Priority 0) $\to$ Evidence (Priority 1) $\to$ Drafts (Priority 2).
  * Exponential backoff with decorrelated jitter: `base = min(30s, 1s * 2^attempts) + rand(800ms)`.
  * Maximum attempt threshold: Transitions to `"needs_attention"` after 5 failed attempts, preserving item for manual user retry.
  * Pause/Resume controls allowing workers to halt syncing on metered cellular networks.
* **Resumable Chunked Transfer ([`src/app/api/evidence/sync/route.ts`](file:///e:/PS26242%282026%29/src/app/api/evidence/sync/route.ts)):**
  * Slices large video payloads into 250,000-character chunks (~180KB).
  * Server stages chunks in `evidence_chunks` table.
  * If a network connection drops mid-transfer, sync resumes from the exact `chunkIndex` where it failed.
* **Idempotency Keys:**
  * Deterministic key generation: `satyarpl-evidence-${sessionId}-${chainIndex}-${queueId}`.
  * Server persists responses in `idempotency_keys` table. Duplicate retries return the exact cached seal outcome without duplicate database rows or trigger violations.
* **Conflict Resolution Policy (Documented in Code):**
  * **Evidence:** APPEND-ONLY. Every capture generates an immutable block with a unique UUID and sequential hash chain index. Zero merge conflicts possible.
  * **Drafts:** LAST-WRITER-WINS (LWW). Later timestamps supersede previous drafts.

### E. Server Re-Verification Pipeline Enhancements
* **Telemetric Timing & Clock Skew ([`src/lib/evidence/server-verifier.ts`](file:///e:/PS26242%282026%29/src/lib/evidence/server-verifier.ts)):**
  * Records both `device_captured_at` and `server_received_at` in Postgres.
  * Computes clock skew seconds and checks client sync mode (`clientSyncMode = 'offline'`).
  * **Forward Tampering Flag:** If device clock was manipulated into the future relative to server time (`device_captured_at > server_received_at + 60s`), flags critical `clock_skew`.
  * **Challenge Window Check:** Verifies capture time falls within the challenge issuance window (`issued_at <= device_captured_at <= expires_at`).

### F. UI Components & Attestation Interface
* **Sync Status Bar & Drawer ([`src/components/offline-sync-bar.tsx`](file:///e:/PS26242%282026%29/src/components/offline-sync-bar.tsx)):**
  * Global floating sync pill with online (emerald) / offline (amber) indicator, queued count, and spinning sync loader.
  * Full slide-out Drawer modal displaying per-item sync status (`queued`, `syncing`, `synced`, `failed`, `needs_attention`), retry buttons, and clear-synced actions.
  * Live storage quota visualizer (`MB / GB` and `%` bar) with persistent storage request button.
  * Ephemeral PWA update banner prompting workers to reload when a new service worker version is waiting.
* **Pluggable Device Attestation ([`src/lib/offline/attestation.ts`](file:///e:/PS26242%282026%29/src/lib/offline/attestation.ts)):**
  * Interface for hardware-backed attestation (Play Integrity / Apple App Attest).
  * In the browser PWA runtime, transparently displays a **`NOT_CONFIGURED`** badge in the UI, explaining production requirements without simulated deceit.

---

## 2. Test Verification Summary

### A. Vitest Automated Unit & Integration Tests ([`src/test/phase-5.test.ts`](file:///e:/PS26242%282026%29/src/test/phase-5.test.ts))
Ran via `npm test`: **27 passed** across all 5 project suites:
1. `persists drafts and evidence across simulated tab close / app restarts`: Verified Dexie IndexedDB data survivability.
2. `performs immediate on-device hash chaining for offline captures`: Verified client-side SHA-256 block continuity.
3. `pre-fetches batch challenges, consumes them single-use, and expires unused ones`: Verified cache consumption and purge.
4. `flags offline capture without valid challenge as challenge_missing on sync`: Verified server pipeline attaches critical flag.
5. `flags device timestamps set in the future or with large clock skew`: Verified forward clock spoofing detection.
6. `guarantees idempotent retries when using idempotencyKey`: Verified duplicate submissions return identical sealed result without re-inserting.
7. `tracks resumable upload progress in IndexedDB sync queue`: Verified upload resumes from chunk offset.
8. `calculates storage quota and handles storage pressure`: Verified `getStorageQuota()` calculations.
9. `reports NOT_CONFIGURED state honestly through pluggable attestation provider`: Verified interface returns honest status.

### B. Playwright End-to-End Tests ([`e2e/offline.spec.ts`](file:///e:/PS26242%282026%29/e2e/offline.spec.ts))
Ran via `npx playwright test`: **5 passed (100%)**:
1. `manifest.json contains required PWA metadata and icons`: Validated installable manifest, shortcuts, and 192/512 icons.
2. `service worker sw.js is accessible and versioned`: Validated cache namespace `satyarpl-shell-v1.0.0` and background sync tag.
3. `offline fallback page is accessible`: Validated [`public/offline.html`](file:///e:/PS26242%282026%29/public/offline.html) bilingual content.
4. `Worker UI renders Offline Sync drawer, storage estimator, and NOT_CONFIGURED attestation badge`: Validated drawer interaction, storage meter, and exact badge match.
5. `Airplane mode emulation: offline banner triggers and captures queue locally`: Validated `context.setOffline(true)` triggers offline warning banner and restores cleanly on reconnect.

---

## 3. iOS Safari vs Chrome Android Differences

| Feature | Chrome Android (Chromium) | iOS Safari (WebKit) | Platform Handling |
|---|---|---|---|
| **Background Sync API (`SyncManager`)** | Fully Supported (`reg.sync.register`) | **Unsupported** (WebKit rejects Background Sync) | SatyaRPL implements a dual-path engine: Chrome registers `satyarpl-evidence-sync`. iOS Safari utilizes a foreground fallback listening to `visibilitychange` (when worker re-opens Safari), `online`, and a periodic 20-second interval check. |
| **PWA Installation Prompt** | Standard `beforeinstallprompt` event | Manual "Add to Home Screen" via Share sheet | Documented in offline guidance; manifest includes Apple-compatible metadata (`apple-touch-icon`, `viewport-fit=cover`). |
| **Storage Persistence (`navigator.storage.persist`)** | Granted automatically if PWA installed or site bookmarked | Eviction possible if device storage pressure is extreme and site unvisited for > 7 days | Persistent storage request invoked on launch; quota meter warns worker when local storage reaches 95%. |
| **MediaRecorder / Camera Access** | Full `MediaRecorder` with WebM / VP8 / Opus | MP4 / H.264 default in Safari; requires secure origin (HTTPS/localhost) | Camera viewfinder supports adaptive container negotiation (`video/webm` or `video/mp4`) and clean simulated camera fallback. |

---

## 4. What Offline Can and Cannot Prove (Honest Security Boundary)

### What Offline CAN Mathematically Prove:
1. **Cryptographic Sequence Integrity:** On-device SHA-256 block hashing guarantees that clip $N$ cannot be altered, replaced, or reordered without invalidating the `prev_hash` of block $N+1$.
2. **Single-Use Challenge Binding:** A challenge pre-fetched while online cannot be consumed twice offline, because the client updates `consumedAt` atomically in IndexedDB.
3. **Idempotent Deliverability:** The server will never process duplicate submissions of the same capture or alter an already sealed hash-chain block.

### What Offline CANNOT Mathematically Prove (Vulnerabilities in Offline PWA):
1. **Device Clock Manipulation:** A worker or rogue center operator can set their mobile device system clock to an earlier or later time while offline. The server detects forward clock manipulation (`device_captured_at > server_received_at`), but cannot distinguish between a legitimate delayed sync and a worker setting their clock back 20 minutes while in airplane mode.
2. **GPS Spoofing:** In browser PWAs, geolocation relies on browser APIs which can be spoofed by mock location apps on rooted Android devices or developer tools.
3. **Physical Hardware Presence:** Without hardware-backed attestation keys, browser JavaScript cannot prove the code was executed inside a certified hardware TEE (Trusted Execution Environment).

### The Production Path:
* **Android:** Google Play Integrity API (Hardware-backed key attestation, evaluation of `MEETS_STRONG_INTEGRITY`).
* **iOS:** Apple DeviceCheck & App Attest service (Secure Enclave cryptographic tokens bound to the app binary).
* **Current Status:** Pluggable interface implemented and actively reports **`NOT_CONFIGURED`** across UI and audit logs until native wrapper credentials are supplied.
