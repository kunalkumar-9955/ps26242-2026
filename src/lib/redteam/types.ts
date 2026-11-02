/**
 * SATYARPL Red-Team Runner Types & Specifications
 */

export type AttackCategory =
  | "evidence_integrity"
  | "telemetry_sensors"
  | "cryptographic_chain"
  | "biometric_identity"
  | "nlp_prompt_injection"
  | "workflow_gating"
  | "storage_immutability"
  | "credential_authenticity";

export type PipelineStage =
  | "INGESTION_STAGE"
  | "CHALLENGE_GATE"
  | "INTEGRITY_STAGE"
  | "TELEMETRY_STAGE"
  | "HASH_CHAIN_STAGE"
  | "IDENTITY_STAGE"
  | "NLP_LLM_STAGE"
  | "SCORING_STAGE"
  | "STORAGE_IMMUTABILITY_STAGE"
  | "CREDENTIAL_STAGE";

export type AttackStatus = "CAUGHT" | "NOT_DETECTED" | "FAILED" | "RUNNING" | "QUEUED";

export type AttackVerdict = "PASS" | "NOT_DETECTED" | "FAIL";

export interface AttackResult {
  attackId: string;
  attackName: string;
  category: AttackCategory;
  pipelineStage: PipelineStage;
  description: string;
  expectedOutcome: string;
  actualOutcome: string;
  flagTypes: string[];
  detectionReason: string;
  status: AttackStatus;
  verdict: AttackVerdict;
  durationMs: number;
  isKnownLimitation: boolean;
  mitigation: string;
  productionAddition: string;
}

export interface SecurityTestRunRecord {
  id: string;
  runNumber: number;
  runnerId: string;
  runnerRole: string;
  scope: string;
  appVersion: string;
  gitCommit: string;
  overallDetectionRate: string;
  totalAttacks: number;
  caughtCount: number;
  notDetectedCount: number;
  failedCount: number;
  durationMs: number;
  results: AttackResult[];
  coverageMatrix: Record<string, Record<string, boolean>>;
  summaryNotes?: string;
  createdAt: string;
}

export interface KnownLimitationItem {
  id: string;
  attackName: string;
  vector: string;
  plainExplanation: string;
  currentMitigation: string;
  productionRequirement: string;
  residualRisk: "Low" | "Medium" | "High";
}
