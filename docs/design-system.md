# RPL Platform Design System Specification
**Project:** Fraud-Resistant, Assessor-Auditable RPL Assessment Platform (SIH 2026 · PS 26242 · MSDE)
**Core Thesis:** *We don't make AI judge workers. We make RPL assessments fraud-resistant and assessor-auditable.*

---

## 1. DUAL-EXPERIENCE PARADIGM

The system addresses two radically different user contexts within one cohesive brand:

### A. Worker Mode (Low-Literacy & Field First)
* **Target Audience:** Informal tradespeople, craftspeople, rural electricians, construction workers.
* **Environment:** Bright outdoor sunlight, entry-level Android devices (360px viewport), noisy job sites, intermittent 2G/3G connectivity.
* **UI Principles:**
  * **Touch-first:** Minimum tap target of **48px x 48px** (WCAG AAA recommendation).
  * **Icon-and-Voice Forward:** Every key action features a prominent visual icon and optional audio prompt (Text-To-Speech).
  * **High Contrast:** Text contrast ratio $\ge 7:1$ to withstand direct sunlight.
  * **Bilingual Native Script:** Hindi (हिन्दी) and English togglable with single tap. Layouts accommodate Devanagari text expansion (+25% character width).
  * **Warm Reassurance:** Warm Amber (#D97706) and Emerald (#059669) palette indicating encouragement and safety.

### B. Staff Mode (Assessor, Auditor & Admin Workspaces)
* **Target Audience:** Accredited Skill Council assessors, third-party audit officers, SSC quality controllers.
* **Environment:** Desktop / laptop screens, high density information displays, dual-pane video & rubric analysis.
* **UI Principles:**
  * **Data-Forward & High-Density:** 32px standard row heights, clean tabular metrics, keyboard shortcuts.
  * **Blind-First Integrity:** AI suggestions strictly masked behind clear privacy shields until human score submission.
  * **Audit Traceability:** Cryptographic chain status chips, clock-skew warnings, statistical agreement confidence intervals.
  * **Sleek Neutral Palette:** Deep Slate/Zinc (#0F172A / #1E293B) with Indigo/Cyan accents.

---

## 2. COLOR TOKENS & ELEVATION

### Base HSL Design Tokens
```css
:root {
  /* Surface & Base */
  --background: 210 40% 98%;
  --foreground: 222 47% 11%;
  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;
  --popover: 0 0% 100%;
  --popover-foreground: 222 47% 11%;

  /* Brand Accents */
  --primary: 221 83% 53%;         /* Royal Blue for institutional trust */
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96%;
  --secondary-foreground: 222 47% 11%;
  
  /* Integrity & Flag Tokens */
  --sealed-green: 158 64% 42%;    /* Cryptographically sealed */
  --flag-red: 0 84% 60%;          /* Security flag / tamper detected */
  --skew-amber: 38 92% 50%;       /* Clock skew / geo warning */
  --abstain-purple: 262 83% 58%;  /* AI Abstained / human verification needed */

  /* Structural */
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
  --border: 214 32% 91%;
  --input: 214 32% 91%;
  --ring: 221 83% 53%;
  --radius: 0.75rem;              /* 12px default corner radius */
}

.dark {
  --background: 222 47% 11%;
  --foreground: 210 40% 98%;
  --card: 217 33% 17%;
  --card-foreground: 210 40% 98%;
  --border: 217 33% 25%;
  --input: 217 33% 25%;
}
```

---

## 3. TYPOGRAPHY HIERARCHY

* **Primary Font:** Inter, system-ui, -apple-system, sans-serif
* **Devanagari Font:** Noto Sans Devanagari, system-ui
* **Scale:**
  * `Display 1 (Worker Prompts)`: 32px / line-height 40px (Bold, 700)
  * `Heading 1 (Staff Section)`: 24px / line-height 32px (SemiBold, 600)
  * `Heading 2 (Card Titles)`: 18px / line-height 26px (SemiBold, 600)
  * `Body Regular`: 15px / line-height 22px (Regular, 400)
  * `Metric / Code (Hashes/Nonces)`: 13px / Monospace (JetBrains Mono / Consolas)

---

## 4. MOTION & TRANSITIONS
* **Micro-interactions:** 150ms ease-out for hover, tap feedback, and modal popups.
* **Integrity Reveal:** 400ms smooth curtain unmasking when blind score is submitted and AI suggestion unlocks.
* **Camera Capture:** 3-2-1 countdown pulsing ring with clear audio chime simulation.
* **Prefers Reduced Motion:** Disables non-essential animated transitions, maintaining crisp instantaneous state swaps.

---

## 5. INFORMATION ARCHITECTURE PER ROLE

```
┌─────────────────────────────────────────────────────────────┐
│                    RPL PLATFORM IA                         │
└─────────────────────────────────────────────────────────────┘
      │
      ├─► [WORKER APP] (Mobile viewport: 360px - 480px)
      │     ├─ Onboarding (OTP + Lang Picker Hindi/English)
      │     ├─ Voice Declaration (Audio Waveform + Live Transcript + Edits)
      │     ├─ Gap Report (Plain-language covered/missing NOS + Read Aloud)
      │     ├─ Challenge Camera (Nonce on camera, dynamic task variant, timer)
      │     ├─ Sync Queue (IndexedDB pending items + skew check)
      │     └─ Credential Wallet (QR Code, NSQF Level, DigiLocker export)
      │
      ├─► [ASSESSOR WORKSPACE] (Desktop: 1280px+)
      │     ├─ Calibration Gate (Gold-standard video benchmark, kappa score)
      │     ├─ Candidate Queue (Assigned practical assessments)
      │     ├─ Blind-First Scoring (Evidence viewer + Rubric anchors, AI locked)
      │     ├─ AI Reveal & Reconcile (Abstention reasoning, override justification)
      │     ├─ Physical Verification (In-person checklist items)
      │     └─ Sign-Off & Recommendation (Cryptographic sign-off)
      │
      ├─► [AUDITOR DASHBOARD]
      │     ├─ Inter-Assessor Agreement (Cohen's Kappa, Krippendorff's Alpha, CI)
      │     ├─ Consistency Control (With vs Without AI comparison)
      │     ├─ Anomaly Flags (Fast scoring, geographic jump, bias)
      │     ├─ Evidence Reuse & Tamper Matrix (pHash duplicates)
      │     └─ Red-Team Attack Runner (Live injection, GPS spoof, replay simulation)
      │
      ├─► [ADMIN & GOVERNANCE]
      │     ├─ QP/NOS Registry (NQR official definitions, verified status)
      │     ├─ Trade Slang Dictionary (Local vernacular mapping)
      │     └─ System Telemetry & AI Event Logs
      │
      └─► [PUBLIC VERIFY]
            └─ /verify/[slug] (Tamper-proof verifiable credential verification)
```

---

## 6. ACCESSIBILITY COMPLIANCE (WCAG 2.2 AA)
1. **Contrast Ratio:** Minimum 4.5:1 for body copy; 7:1 for worker mobile viewports.
2. **Focus Indicators:** 2px solid visible outline with offset on all interactive buttons and inputs.
3. **No Color-Only State:** Every badge combines a distinct icon, color token, and explicit text label (e.g. `[Checkmark] Sealed`, `[AlertTriangle] Flagged: Clock Skew`).
4. **Screen Reader ARIA:** Explicit `aria-live="polite"` for voice recognition outputs and sync queue updates.
