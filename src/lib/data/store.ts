import { QualificationPack, TradeTerm, NOS, Criterion } from "./types";
import { SEEDED_QUALIFICATION, SEEDED_TRADE_TERMS } from "./trade-seed";

class DomainStore {
  private qualifications: Map<string, QualificationPack> = new Map();
  private tradeTerms: TradeTerm[] = [];

  constructor() {
    this.seed();
  }

  private seed() {
    this.qualifications.set(SEEDED_QUALIFICATION.qpCode, { ...SEEDED_QUALIFICATION });
    this.tradeTerms = [...SEEDED_TRADE_TERMS];
  }

  public getQualification(qpCode: string): QualificationPack | undefined {
    return this.qualifications.get(qpCode);
  }

  public listQualifications(): QualificationPack[] {
    return Array.from(this.qualifications.values());
  }

  public getNos(nosCode: string): NOS | undefined {
    for (const qp of this.qualifications.values()) {
      const match = qp.nosList.find((n) => n.code === nosCode);
      if (match) return match;
    }
    return undefined;
  }

  public listTradeTerms(qpCode?: string): TradeTerm[] {
    if (!qpCode) return [...this.tradeTerms];
    return this.tradeTerms.filter((term) => term.qpCode === qpCode);
  }

  public addTradeTerm(term: Omit<TradeTerm, "id">): TradeTerm {
    const newTerm: TradeTerm = {
      ...term,
      id: `tt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    };
    this.tradeTerms.push(newTerm);
    return newTerm;
  }

  public matchVernacularSlang(phrase: string): TradeTerm[] {
    const lower = phrase.toLowerCase();
    return this.tradeTerms.filter(
      (t) =>
        lower.includes(t.vernacularTerm.toLowerCase()) ||
        t.vernacularTerm.toLowerCase().includes(lower)
    );
  }
}

// Global Singleton for in-app data resolution
export const domainStore = new DomainStore();
