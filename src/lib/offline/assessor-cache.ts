import { offlineDb, OfflineAssessorCache } from "./db";

export class OfflineAssessorCacheManager {
  /**
   * Caches assigned candidate records for offline field visits
   */
  public async cacheAssignedCandidates(
    candidates: Array<{
      candidateId: string;
      candidateName: string;
      qualificationId: string;
      rubricData?: any;
    }>
  ): Promise<number> {
    const now = new Date().toISOString();
    const records: OfflineAssessorCache[] = candidates.map((c) => ({
      id: `assessor_cand_${c.candidateId}`,
      candidateId: c.candidateId,
      candidateName: c.candidateName,
      qualificationId: c.qualificationId,
      rubricData: c.rubricData || {},
      assignedAt: now,
      cachedAt: now,
    }));

    await offlineDb.assessorCache.bulkPut(records);
    return records.length;
  }

  /**
   * Retrieves all candidates cached for offline assessment
   */
  public async getCachedCandidates(): Promise<OfflineAssessorCache[]> {
    return offlineDb.assessorCache.toArray();
  }

  /**
   * Retrieves cached rubric data for a qualification
   */
  public async getCachedRubric(qualificationId: string): Promise<any | null> {
    const item = await offlineDb.assessorCache
      .where("qualificationId")
      .equals(qualificationId)
      .first();
    return item ? item.rubricData : null;
  }

  /**
   * Clears assessor cache
   */
  public async clearCache(): Promise<void> {
    await offlineDb.assessorCache.clear();
  }
}

export const offlineAssessorCache = new OfflineAssessorCacheManager();
