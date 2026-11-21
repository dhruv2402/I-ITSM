import { Incident } from '../domain/incident/Incident';
import { TextAnalyzer } from './TextAnalyzer';

export interface DuplicateCandidate {
  incidentId: string;
  title: string;
  status: string;
  score: number;
  textSimilarity: number;
  sameService: boolean;
  sharedTerms: string[];
}

export interface DraftIncident {
  id?: string;
  title: string;
  description: string;
  serviceId: string;
  createdAt?: Date;
}

/**
 * Intelligent feature A - Duplicate incident detection.
 * score = 0.65 x TF-IDF text similarity + 0.35 x (same affected service)
 * Only open incidents reported in the look-back window are considered.
 */
export class DuplicateDetector {
  constructor(
    private readonly threshold = 0.5,
    private readonly lookBackHours = 72,
  ) {}

  findDuplicates(draft: DraftIncident, existing: Incident[], now: Date = new Date()): DuplicateCandidate[] {
    const since = now.getTime() - this.lookBackHours * 3_600_000;
    const pool = existing.filter((i) => i.id !== draft.id && i.isActive() && i.createdAt.getTime() >= since);
    if (pool.length === 0) return [];
    const draftText = `${draft.title} ${draft.title} ${draft.description}`; // title counted twice: it carries the symptom
    const corpus = pool.map((i) => TextAnalyzer.tokenize(`${i.title} ${i.title} ${i.description}`));
    const draftTokens = TextAnalyzer.tokenize(draftText);
    const idf = TextAnalyzer.idf([draftTokens, ...corpus]);
    const dv = TextAnalyzer.tfidf(draftTokens, idf);
    return pool
      .map((inc, idx) => {
        const textSimilarity = TextAnalyzer.cosine(dv, TextAnalyzer.tfidf(corpus[idx], idf));
        const sameService = inc.serviceId === draft.serviceId;
        const score = 0.65 * textSimilarity + 0.35 * (sameService ? 1 : 0);
        return {
          incidentId: inc.id,
          title: inc.title,
          status: inc.status,
          score: Math.round(score * 100) / 100,
          textSimilarity: Math.round(textSimilarity * 100) / 100,
          sameService,
          sharedTerms: TextAnalyzer.sharedTerms(draftText, inc.searchableText()),
        };
      })
      .filter((c) => c.score >= this.threshold && c.textSimilarity > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
}
