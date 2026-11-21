/**
 * Lightweight NLP utilities shared by the intelligent features:
 * tokenisation, stop-word removal, naive stemming, IT-domain synonym
 * normalisation and TF-IDF cosine similarity. No external ML service needed,
 * and every result is explainable.
 */
const STOP_WORDS = new Set(
  (
    'a an the and or but if then else of to in on at by for from with without into onto over under is are was were be been being ' +
    'am do does did doing have has had having i me my we our you your he she it its they them their this that these those ' +
    'not no can could should would will shall may might must just very too also so as than there here what which who whom ' +
    'when where why how all any both each few more most other some such only own same again further once about against ' +
    'between through during before after above below up out off please hi hello team issue problem since today now ' +
    'getting get got able make making made trying try using use'
  ).split(/\s+/),
);

/** Domain synonyms collapse different wordings of the same symptom onto one concept. */
const SYNONYMS: Record<string, string> = {
  unavailable: 'outage', unreachable: 'outage', down: 'outage', outage: 'outage', offline: 'outage', inaccessible: 'outage',
  fail: 'fail', failing: 'fail', failed: 'fail', failure: 'fail', fails: 'fail', error: 'fail', errors: 'fail', unable: 'fail',
  cannot: 'fail', cant: 'fail', broken: 'fail', crash: 'fail', crashed: 'fail', crashing: 'fail', declined: 'fail', rejected: 'fail',
  pay: 'payment', payment: 'payment', payments: 'payment', transaction: 'payment', transactions: 'payment', checkout: 'payment', upi: 'payment', card: 'payment',
  login: 'auth', logon: 'auth', signin: 'auth', sign: 'auth', password: 'auth', sso: 'auth', authentication: 'auth', otp: 'auth', mfa: 'auth', locked: 'auth',
  vpn: 'network', wifi: 'network', internet: 'network', lan: 'network', connectivity: 'network', dns: 'network', router: 'network', switch: 'network',
  slow: 'latency', sluggish: 'latency', lag: 'latency', lagging: 'latency', timeout: 'latency', timeouts: 'latency', latency: 'latency', hang: 'latency', hanging: 'latency',
  db: 'database', sql: 'database', mysql: 'database', postgres: 'database', oracle: 'database', query: 'database', queries: 'database', database: 'database',
  laptop: 'device', desktop: 'device', pc: 'device', computer: 'device', monitor: 'device', keyboard: 'device', mouse: 'device', printer: 'printer',
  mail: 'email', email: 'email', outlook: 'email', inbox: 'email', mailbox: 'email',
  disk: 'storage', drive: 'storage', storage: 'storage', share: 'storage', quota: 'storage', san: 'storage', nas: 'storage',
  virus: 'malware', malware: 'malware', phishing: 'phishing', ransomware: 'malware', breach: 'security', hacked: 'security', suspicious: 'security',
  aws: 'cloud', azure: 'cloud', gcp: 'cloud', cloud: 'cloud', bucket: 'cloud', s3: 'cloud', kubernetes: 'cloud', container: 'cloud',
  app: 'application', application: 'application', portal: 'application', website: 'application', site: 'application', page: 'application',
};

export type TermVector = Map<string, number>;

export class TextAnalyzer {
  static stem(word: string): string {
    if (word.length <= 4) return word;
    for (const suffix of ['ations', 'ation', 'ings', 'ing', 'ness', 'ment', 'ies', 'ed', 'es', 's']) {
      if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
        return suffix === 'ies' ? `${word.slice(0, -3)}y` : word.slice(0, -suffix.length);
      }
    }
    return word;
  }

  static normalise(word: string): string {
    const w = word.toLowerCase();
    if (SYNONYMS[w]) return SYNONYMS[w];
    const stemmed = TextAnalyzer.stem(w);
    return SYNONYMS[stemmed] ?? stemmed;
  }

  static tokenize(text: string): string[] {
    return (text ?? '')
      .toLowerCase()
      .replace(/can't|cannot/g, ' cannot ')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t) && !/^\d+$/.test(t))
      .map((t) => TextAnalyzer.normalise(t));
  }

  static termFrequency(tokens: string[]): TermVector {
    const tf: TermVector = new Map();
    tokens.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
    return tf;
  }

  /** Inverse document frequency over a corpus of documents. */
  static idf(corpus: string[][]): Map<string, number> {
    const df = new Map<string, number>();
    corpus.forEach((doc) => new Set(doc).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
    const n = corpus.length;
    const idf = new Map<string, number>();
    df.forEach((count, term) => idf.set(term, Math.log((n + 1) / (count + 1)) + 1));
    return idf;
  }

  static tfidf(tokens: string[], idf: Map<string, number>): TermVector {
    const v: TermVector = new Map();
    TextAnalyzer.termFrequency(tokens).forEach((f, t) => v.set(t, f * (idf.get(t) ?? 1)));
    return v;
  }

  static cosine(a: TermVector, b: TermVector): number {
    let dot = 0;
    let na = 0;
    let nb = 0;
    a.forEach((v, k) => {
      na += v * v;
      const w = b.get(k);
      if (w) dot += v * w;
    });
    b.forEach((v) => (nb += v * v));
    return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  /** Convenience: TF-IDF cosine similarity of two texts against an optional background corpus. */
  static similarity(a: string, b: string, corpus: string[] = []): number {
    const ta = TextAnalyzer.tokenize(a);
    const tb = TextAnalyzer.tokenize(b);
    const idf = TextAnalyzer.idf([ta, tb, ...corpus.map((c) => TextAnalyzer.tokenize(c))]);
    return TextAnalyzer.cosine(TextAnalyzer.tfidf(ta, idf), TextAnalyzer.tfidf(tb, idf));
  }

  static sharedTerms(a: string, b: string): string[] {
    const sb = new Set(TextAnalyzer.tokenize(b));
    return [...new Set(TextAnalyzer.tokenize(a))].filter((t) => sb.has(t));
  }
}
