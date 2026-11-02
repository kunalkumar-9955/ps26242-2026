# UI Component Sources & Architecture Adaptation
**Platform:** Fraud-Resistant, Assessor-Auditable RPL Platform (SIH 2026 · PS 26242 · MSDE)

---

## 1. TOOLING DISCLOSURE (21st.dev & UI UX Pro Max)

* **UI UX Pro Max Skill:** Not pre-installed in the Antigravity agent environment. Design tokens, typography hierarchy, high-contrast worker thresholds, and accessibility guidelines were authored directly from scratch and codified in [`docs/design-system.md`](./design-system.md).
* **21st.dev Magic MCP:** Not installed in the Antigravity MCP catalog (only Neon MCP is available). No third-party components were pasted directly from 21st.dev.
* **Component Implementation:** All components on `/admin`, `/worker`, and upcoming routes are original implementations built using Tailwind CSS and Lucide React icons, adhering to the design patterns and density standards specified below.

---

## 2. COMPONENT DESIGN ADAPTATIONS USED ON SCREENS

| Component Pattern | Pattern Archetype | Screen Implementation | Adaptation & Integrity Features |
|---|---|---|---|
| **Standards Tree & Provenance Inspector** | High-density Registry / File Tree | `/admin` QP & NOS Tabs | Renders official NQR qualification pack (`CON/Q0602`), NQR code (`QG-03-CO-03951-2025-V2-CSDCI`), and all 7 NOS units. Explicitly separates `NQR VERIFIED` standards from authored drafts (`draft - needs assessor review`). |
| **Slang Dictionary Manager** | Interactive Data Table with Inline Actions | `/admin` Vernacular Slang Tab | Live search and table wired directly to PostgreSQL `trade_terms`. Allows administrators to add/delete entries. Persisted across page refreshes. |
| **Cryptographic Audit Stream** | Activity / Transaction Log | `/admin` Audit Log Tab | Visualizes append-only `audit_log` rows with SHA-256 hash chains (`curr_hash` and `prev_hash`), actor roles, actions (CREATE, DELETE), and timestamps. |
| **Role Gate Shield** | 403 Forbidden Shield Screen | `/admin` Auth Gate | Displays a prominent red security shield when non-admin roles (e.g., workers) attempt to access `/admin`, explaining role isolation policy. |
| **Voice Declaration & Waveform Card** | Audio Recorder / Visualizer | `/worker` Voice Section | 64px x 64px high-contrast touch button, live HTML5 Canvas audio waveform visualizer, bilingual voice toggle (Hindi & English), and honest `MOCK STT` provider badge. |
| **Transcript Review & Quick Edit** | Live Speech-to-Text Card | `/worker` Transcript Section | Displays speech confidence percentage, editable textarea toggle, and one-tap submission for low-literacy workers. |
| **Plain-Language Gap Report** | Competency Diagnostic Cards | `/worker` Gap Report Section | Categorizes all 7 compulsory NOS units into `Covered`, `Partial (16h bridge)`, and `Bridge Training (32h)`. Features a browser SpeechSynthesis read-aloud button ("बोलकर सुनाएं"). Prominently badged as **NOT pass/fail**. |
| **Challenge Camera Viewfinder & Watermark** | Video KYC / Media Capture | `/worker/capture` Camera | Live video element with dynamic timestamp, GPS coordinate stamp, and verification nonce watermark overlay. 3-2-1 countdown ring animation. |
| **Evidence Checklist & Retake Manager** | Stepper / Task Workflow | `/worker/capture` Checklist | Practical task selector (Tools, Conduit Wiring, MCB Panels) with duration timers, attempt counter (`attempt_number`), and single-tap retake workflow. |
| **Integrity Seal & Plain-Language Guidance** | Status Alert & Guidance Card | `/worker/capture` Verification Outcome | Displays `SEALED & HASH-VERIFIED` shield or detailed audit flags (e.g. clock-skew, chain broken) with actionable next-step guidance for workers. |
| **PWA Update Alert Bar** | Ephemeral Notification Banner | Global App Shell (`OfflineSyncBar`) | Pulsating banner alerting worker when a new Service Worker version is installed, offering one-tap `skipWaiting` reload. |
| **Airplane Mode / Offline Status Banner** | System Status Alert Banner | Global App Shell (`OfflineSyncBar`) | High-contrast amber warning alerting workers that offline capture is active and hash-chains are recorded locally. |
| **Sync Status Floating Pill** | Floating Action Status Badge | Global Bottom-Right (`OfflineSyncBar`) | Displays online/offline indicator, queued items count, attention warnings, and spinning sync spinner. |
| **Sync Queue & Storage Drawer** | Slide-out Drawer / Modal | Global Overlay (`OfflineSyncBar`) | Shows per-item sync status (`queued`, `syncing`, `synced`, `failed`, `needs_attention`), retry buttons, pause/resume toggle, and IndexedDB storage usage meter with persistent storage request. |
| **Hardware Attestation Transparency Strip** | Audit / Security Status Strip | Sync Drawer & Worker Views | Displays honest `NOT_CONFIGURED` badge for Google Play Integrity / Apple App Attest, documenting production native requirements. |
| **Assessor Self-View & Gate Banner** | Metric Stat Cards & Security Alert | `/assessor` Dashboard | Displays assessor agreement rate %, average scoring time, override rate %, and prominent Calibration Gate banner blocking scoring when uncalibrated or expired. |
| **Calibration Benchmark Player & Matrix** | Split Media Player & Rubric Card | `/assessor/calibrate` Workspace | Benchmark footage player alongside 1-4 level selectors; computes Cohen's quadratic weighted kappa ($w_{ij} = (i-j)^2/9$) vs master expert benchmarks. |
| **Blind-First Scoring & Timeline Workspace** | Dual-pane Media Review & Form | `/assessor/session/[id]` Scoring Tab | Video player with timeline markers; per-criterion 4-level rubric descriptions side-by-side; rapid keyboard shortcuts (`1`, `2`, `3`, `4`); server-enforced blind gate. |
| **AI Advisory Observation & Abstention Banner** | Non-binding Advisory Card | `/assessor/session/[id]` AI Panel | Reveals AI level, confidence %, and timestamp citations *only* after blind score commit. Features first-class Abstention state for tactile criteria (`needs_physical_verification`). |
| **Physical Tactile Checklist** | Inspection Checklist / Form | `/assessor/session/[id]` Physical Tab | Hands-on testing for crimp tensile pull, terminal torque, and megger insulation tests with pass/fail toggle and tactile notes. |
| **Recommendation Sign-Off & Seal** | Deterministic Summary & Signature Form | `/assessor/session/[id]` Sign-off Tab | Shows deterministic score arithmetic and pass threshold; requires digital signature and override justification before sealing. |
| **Gold Benchmark Registry** | Admin Media & Standards Registry | `/admin` Gold Clips Tab | Allows platform administrators to register gold standard clips, expert evaluator benchmark scores, and source citations with cryptographic audit logging. |
| **Auditor Reliability Stat Grid** | High-density Metric Cards | `/auditor` Primary Stats | Displays Cohen's Weighted Kappa ($\kappa_w$), Krippendorff's Alpha ($\alpha$), ICC(2,1), and Adjacent Agreement with sample size $n$, 95% bootstrap CIs, mathematical formulas, and prevalence bias caveats. |
| **Data Provenance & Small-N Alert** | System Status Alert Banner | `/auditor` Top Banner | Amber warning when sample size $n < 30$ stating wide confidence intervals; purple banner identifying synthetic simulation data. Split toggle (`Real` vs `Synthetic`). |
| **Assessor Pair Agreement Heatmap** | Interactive Cross-tabulation Grid | `/auditor` Pair Heatmap | Visualizes inter-assessor agreement matrix. Color is never the sole signal: every cell displays numeric kappa, exact percentage agreement, and unit count $n$. Includes text alternative. |
| **Per-Criterion Reliability Breakdown** | Grouped Metric Rows with Bars | `/auditor` Criteria Tab | Per-NOS and per-criterion agreement with adjacent agreement bars (&plusmn;1 level) and prevalence paradox caveat tags. |
| **A vs B Controlled Comparison Panel** | Comparative Experiment Card | `/auditor` Comparison Tab | Evaluates Condition A (unassisted) vs Condition B (assisted) with paired bootstrap differences $\Delta \kappa$. Capable of concluding "no improvement" or "worse". Contrasts agreement with expert accuracy. |
| **Explainable Anomaly Review Prompts** | Audit Alert List with Modal Workflow | `/auditor` Anomaly Tab | Non-punitive review prompts for speed scoring ($< 180$s), straight-lining, and $z$-score leniency/harshness. Mandatory resolution note modal logged to `audit_log`. |
| **Evidence Integrity Summary** | Security Dashboard Widget | `/auditor` Integrity Tab | Aggregates visual pHash reuse, device clock skews, and geofence mismatches by type and severity. |
| **Zero-Trust Raw PII Access Gate** | Security Interstitial Dialog / Modal | `/auditor` PII Shield | Requires mandatory auditor justification (&ge; 8 characters) before unmasking raw candidate Aadhaar and full footage, permanently logged to `auditor_access_logs`. |
| **Verifiable Methodology Export** | Data Download Dialog | `/auditor` Export Modal | Single-tap CSV / JSON exports bundling pseudonymized ratings with methodology notes, formulas, sample sizes, and app versioning. |
| **Worker Credential Card** | High-contrast Certificate Card | `/worker/credential` | Bilingual card (Hindi & English), QR code preview, WhatsApp share intent, copy link, print-ready view, and candidate consent toggle for public name disclosure. Works offline in PWA shell. |
| **Public Verification Portal** | Zero-PII Status Portal | `/verify/[slug]` | Public, authentication-free verification interface displaying valid, revoked, expired, or invalid status with Ed25519 cryptographic details. Minimal identity disclosure, zero scores, and client-side offline verification tool. |
| **Admin Credential & Revocation Registry** | Data Table with Modal Form | `/admin` Credentials Tab | Full inventory of issued credentials with unguessable slugs, verification links, and a modal revocation workflow requiring mandatory justification logged to `audit_log`. |
| **Red-Team Live Attack Montage** | Interactive Stepper / Presenter Deck | `/redteam` Live Montage Tab | Presenter-friendly high-contrast deck with keyboard shortcuts (`Space`/`→` Next, `Enter` Run All, `R` Reset, `P` Presenter Mode); step-by-step real execution with explicit state badges and stage indicators. |
| **Coverage Heatmap Matrix** | Two-dimensional Cross-tabulation Table | `/redteam` Matrix Tab | 12 Attacks &times; 9 Pipeline Defense Stages showing which stage intercepted each attack. Color is never the sole signal: every cell displays text alternatives (`INTERCEPT`, `NOT DETECTED`). |
| **Known Limitations Disclosure Panel** | Security Assessment Cards | `/redteam` Limitations Tab | Documents attacks software cannot stop (proxy hands, off-camera prompter, 4K screen replays, rooted OS, assessor collusion) with current mitigations, production hardware additions, and links to `/docs/threat-model.md`. |
| **Security Test Run History & Export** | Data Table with Download Actions | `/redteam` Run History Tab | Immutable logs from `security_test_runs` with run numbers, git commit hashes, runner roles, durations, detection rates, and single-tap JSON and printable HTML/PDF reports. |
| **Bilingual Worker Consent Screen** | Permission Interstitial Screen | `/worker/consent` | Full bilingual Hindi/English DPDP consent notice prior to audio/video/GPS capture; explicit purpose, retention, and withdrawal disclosures; versioned consent recording. |
| **Worker My Data & Deletion Portal** | Data Rights & Privacy Dashboard | `/worker/my-data` | Complete DPDP Act 2023 worker rights flow: inspect declarations, sessions, and hash chain; single-tap JSON export; crypto-shredded erasure request with ledger hash preservation explanation. |
| **Admin Retention & Purge Manager** | Compliance Lifecycle Settings | `/admin/retention` | Configurable retention periods per data type; prominent `UNVERIFIED PENDING LEGAL` disclaimer tags; manual and scheduled purge runner with crypto-shredding. |

---

## 3. UNIFIED DESIGN RULES APPLIED
1. **Container Radii:** Outer cards use `rounded-2xl` (16px), table containers use `rounded-xl` (12px), badges use `rounded-full` or `rounded`.
2. **Typography Weights:** Headers strictly use font weight 700 (`font-bold`) or 600 (`font-semibold`); codes and hashes use monospace (`font-mono`).
3. **Accessibility Minimums:** Worker buttons enforce minimum tap target `>= 48px x 48px` (`min-h-[48px]`, `touch-target`); staff workspaces support keyboard navigation (`1`, `2`, `3`, `4`).
4. **Honest Demarcation:** Green badges for official NQR sources; amber badges for authored draft rubrics and synthetic test data; purple badges for AI advisory suggestions; gold badges for benchmark master clips.

