import { Category } from '../domain/catalog/Category';
import { TextAnalyzer } from './TextAnalyzer';

export interface CategorySuggestion {
  categoryCode: string;
  confidence: number;
  alternatives: { categoryCode: string; confidence: number }[];
  matchedKeywords: string[];
}

/**
 * Intelligent feature F - Automatic incident categorisation.
 *
 * Hybrid model:
 *  - keyword evidence from each category's admin-maintained keyword list
 *  - a multinomial Naive Bayes model trained on historical, already-classified incidents
 * final score = 0.6 x keyword share + 0.4 x Naive Bayes posterior.
 * New categories work immediately through their keywords and get better as history grows.
 */
export class CategoryClassifier {
  private tokenCounts = new Map<string, Map<string, number>>();
  private totalTokens = new Map<string, number>();
  private docCounts = new Map<string, number>();
  private vocabulary = new Set<string>();
  private totalDocs = 0;

  train(samples: { text: string; categoryCode: string }[]): void {
    this.tokenCounts.clear();
    this.totalTokens.clear();
    this.docCounts.clear();
    this.vocabulary.clear();
    this.totalDocs = 0;
    for (const s of samples) {
      const c = s.categoryCode.toUpperCase();
      const tokens = TextAnalyzer.tokenize(s.text);
      this.totalDocs++;
      this.docCounts.set(c, (this.docCounts.get(c) ?? 0) + 1);
      const counts = this.tokenCounts.get(c) ?? new Map<string, number>();
      tokens.forEach((t) => {
        counts.set(t, (counts.get(t) ?? 0) + 1);
        this.vocabulary.add(t);
      });
      this.tokenCounts.set(c, counts);
      this.totalTokens.set(c, (this.totalTokens.get(c) ?? 0) + tokens.length);
    }
  }

  get trainingSize(): number {
    return this.totalDocs;
  }

  suggest(text: string, categories: Category[]): CategorySuggestion | null {
    const active = categories.filter((c) => c.isActive);
    const tokens = TextAnalyzer.tokenize(text);
    if (tokens.length === 0 || active.length === 0) return null;
    const tokenSet = new Set(tokens);

    // keyword evidence
    const kw = new Map<string, number>();
    const matched = new Map<string, string[]>();
    for (const cat of active) {
      const hits = cat.keywords.filter((k) => {
        const kt = TextAnalyzer.tokenize(k);
        return kt.length > 0 && kt.every((t) => tokenSet.has(t));
      });
      kw.set(cat.code, hits.length);
      matched.set(cat.code, hits);
    }
    const kwTotal = [...kw.values()].reduce((a, b) => a + b, 0);

    // naive bayes posterior (softmax over log-likelihoods)
    const nb = new Map<string, number>();
    if (this.totalDocs > 0) {
      const v = this.vocabulary.size || 1;
      const logs = active.map((cat) => {
        const docs = this.docCounts.get(cat.code) ?? 0;
        const counts = this.tokenCounts.get(cat.code) ?? new Map<string, number>();
        const total = this.totalTokens.get(cat.code) ?? 0;
        let lp = Math.log((docs + 1) / (this.totalDocs + active.length));
        tokens.forEach((t) => (lp += Math.log(((counts.get(t) ?? 0) + 1) / (total + v))));
        return { code: cat.code, lp };
      });
      const max = Math.max(...logs.map((l) => l.lp));
      const exp = logs.map((l) => ({ code: l.code, e: Math.exp(l.lp - max) }));
      const sum = exp.reduce((a, b) => a + b.e, 0);
      exp.forEach((x) => nb.set(x.code, x.e / sum));
    }

    const scores = active.map((cat) => {
      const k = kwTotal > 0 ? (kw.get(cat.code) ?? 0) / kwTotal : 0;
      const n = nb.get(cat.code) ?? 0;
      const score = this.totalDocs > 0 ? 0.6 * k + 0.4 * n : k;
      return { categoryCode: cat.code, confidence: score };
    });
    scores.sort((a, b) => b.confidence - a.confidence);
    const best = scores[0];
    if (!best || best.confidence < 0.2 || (kwTotal === 0 && best.confidence < 0.35)) return null;
    const round = (x: number) => Math.round(x * 100) / 100;
    return {
      categoryCode: best.categoryCode,
      confidence: round(best.confidence),
      alternatives: scores.slice(1, 3).filter((s) => s.confidence > 0.05).map((s) => ({ ...s, confidence: round(s.confidence) })),
      matchedKeywords: matched.get(best.categoryCode) ?? [],
    };
  }
}
