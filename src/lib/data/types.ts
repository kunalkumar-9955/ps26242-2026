export type AssessableFromVideo = "yes" | "partial" | "no";

export interface RubricAnchors {
  level1: string; // Unsafe / Needs Training
  level2: string; // Partial / Requires Assistance
  level3: string; // Competent (NSQF Level Standard)
  level4: string; // Master / Exemplary & explains safety
}

export interface Criterion {
  id: string;
  criterionCode: string;
  description: string;
  assessableFromVideo: AssessableFromVideo;
  requiresPhysical: boolean;
  weight: number;
  rubric: RubricAnchors;
}

export interface NOS {
  id: string;
  code: string;
  title: string;
  isCore: boolean;
  theoryMarks: number;
  practicalMarks: number;
  criteria: Criterion[];
}

export interface QualificationPack {
  id: string;
  qpCode: string;
  name: string;
  sectorCode: string;
  sectorName: string;
  nsqfLevel: number;
  version: string;
  sourceUrl: string;
  verified: boolean;
  isSynthetic: boolean;
  passThresholdPercent: number; // e.g., 50% for Level 3
  nosList: NOS[];
}

export interface TradeTerm {
  id: string;
  qpCode: string;
  vernacularTerm: string;
  standardEnglishTask: string;
  language: string;
  verified: boolean;
}
