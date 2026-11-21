import { IncidentStatus } from '../domain/enums';
import { Incident } from '../domain/incident/Incident';
import { TextAnalyzer } from './TextAnalyzer';

export interface ResolutionSuggestion {
  incidentId: string;
  title: string;
  resolution: string;
  rootCause: string;
  similarity: number;
  rating: number | null;
}

/**
 * Intelligent feature G - Suggested resolution.
 * Finds resolved/closed incidents similar to the new one and proposes how they were fixed.
 * score = 0.7 x text similarity + 0.15 x same category + 0.15 x same service (+ small boost for good feedback).
 */
export class ResolutionRecommender {
  suggest(
    query: { title: string; description: string; categoryCode: string | null; serviceId: string },
    history: Incident[],
    limit = 3,
  ): ResolutionSuggestion[] {
    const solved = history.filter(
      (i) => i.resolution && [IncidentStatus.RESOLVED, IncidentStatus.VERIFIED, IncidentStatus.CLOSED].includes(i.status),
    );
    if (solved.length === 0) return [];
    const qTokens = TextAnalyzer.tokenize(`${query.title} ${query.description}`);
    const docs = solved.map((i) => TextAnalyzer.tokenize(i.searchableText()));
    const idf = TextAnalyzer.idf([qTokens, ...docs]);
    const qv = TextAnalyzer.tfidf(qTokens, idf);
    return solved
      .map((inc, idx) => {
        const sim = TextAnalyzer.cosine(qv, TextAnalyzer.tfidf(docs[idx], idf));
        const rating = inc.feedback?.rating ?? null;
        const score =
          0.7 * sim +
          0.15 * (query.categoryCode && inc.categoryCode === query.categoryCode ? 1 : 0) +
          0.15 * (inc.serviceId === query.serviceId ? 1 : 0) +
          (rating ? (rating - 3) * 0.02 : 0);
        return { inc, sim, score, rating };
      })
      .filter((x) => x.sim > 0.15)
      .sort((a, b) => b.score - a.score)
      // the same fix applied to several incidents is suggested only once
      .filter((x, i, all) => all.findIndex((y) => y.inc.resolution!.summary === x.inc.resolution!.summary) === i)
      .slice(0, limit)
      .map(({ inc, score, rating }) => ({
        incidentId: inc.id,
        title: inc.title,
        resolution: inc.resolution!.summary,
        rootCause: inc.resolution!.rootCause,
        similarity: Math.round(Math.min(1, score) * 100) / 100,
        rating,
      }));
  }
}
