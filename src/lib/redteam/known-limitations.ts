import { KnownLimitationItem } from "./types";

export const KNOWN_SECURITY_LIMITATIONS: KnownLimitationItem[] = [
  {
    id: "lim_01_offscreen_helper",
    attackName: "Off-Screen Helper Relay",
    vector: "Candidate reads single-use challenge code to a skilled helper off-camera who performs or dictates the task steps.",
    plainExplanation:
      "A candidate with a hidden Bluetooth earpiece or an off-camera accomplice can receive real-time tactical instructions during electrical wiring or tool selection.",
    currentMitigation:
      "Strict 30-to-60-second challenge consumption window; random sequence prompts that require uninterrupted two-handed motor coordination on-camera.",
    productionRequirement:
      "360-degree ambient room sweep; directional acoustic anomaly detection; in-person supervisor spot-checks at examination centers.",
    residualRisk: "Medium",
  },
  {
    id: "lim_02_proxy_hands",
    attackName: "Accomplice Hands Performing Work",
    vector: "Candidate holds the challenge code in frame while a skilled electrician's hands reach in from off-camera to complete termination.",
    plainExplanation:
      "If the camera view is cropped tightly to the distribution board, an accomplice standing immediately beside the candidate can wire the MCB while the candidate holds the code placard.",
    currentMitigation:
      "Task templates mandate wide-angle framing showing full upper body, arms, and tools; mandatory tactile hands-on post-verification by the assessor.",
    productionRequirement:
      "Pose-estimation computer vision tracking body-to-arm continuity; dual-angle synchronized video recording.",
    residualRisk: "High",
  },
  {
    id: "lim_03_high_end_deepfake",
    attackName: "Real-Time Neural Deepfake & Screen Replay",
    vector: "Generative AI or hardware-accelerated OBS virtual camera streaming a synthetically generated video stream of competent electrical work.",
    plainExplanation:
      "Ultra-realistic generative video models could simulate realistic wire stripping and conduit bending tailored to match prompt instructions.",
    currentMitigation:
      "Single-use dynamic nonces (code-on-camera + sequence actions); perceptual hash reuse detection for pre-recorded source material; server-side challenge signature verification.",
    productionRequirement:
      "Hardware-backed secure camera enclave attestation (Apple App Attest / Google Play Integrity Hardware-Backed verdict); depth-sensing LiDAR cameras.",
    residualRisk: "Medium",
  },
  {
    id: "lim_04_rooted_kernel_spoof",
    attackName: "Rooted Device Sensor & Kernel Spoofing",
    vector: "Jailbroken Android device with custom ROM / Magisk module injecting synthetic GPS coordinates and intercepted camera feeds.",
    plainExplanation:
      "A compromised operating system kernel can deceive browser Geolocation and MediaDevices APIs, reporting fictitious Lucknow coordinates while operating elsewhere.",
    currentMitigation:
      "Multi-session impossible travel speed heuristics; client-to-server clock drift limits (|drift| < 120s); IP subnet geolocation cross-verification.",
    productionRequirement:
      "Mobile native app with hardware-backed Play Integrity / SafetyNet Strong Attestation; blocking execution in unlocked bootloader environments.",
    residualRisk: "High",
  },
  {
    id: "lim_05_assessor_collusion",
    attackName: "Assessor-Candidate Collusion",
    vector: "A corrupt assessor deliberately awards Level 4 Competent to an obviously failing candidate despite evidence discrepancies.",
    plainExplanation:
      "If an assessor is bribed or coerced, they could attempt to override warnings and sign off on invalid performance.",
    currentMitigation:
      "Multi-assessor blind-first workflow (scores cannot see peer or AI grades before commit); immutable blind score triggers; z-score statistical leniency anomaly prompts; cryptographic audit log.",
    productionRequirement:
      "Automated random re-grading sampling by the National Accreditation Board (NCVET); dual-independent blind assessment for high-risk cohorts.",
    residualRisk: "Low",
  },
];
