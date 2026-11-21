import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { ErrorAlert, PriorityBadge, useLoad } from '../components/ui';
import { Category, DuplicateCandidate, Incident, ItService, LEVELS, Priority, ResolutionSuggestion } from '../types';

interface Analysis {
  categorySuggestion: { categoryCode: string; confidence: number; matchedKeywords: string[]; alternatives: { categoryCode: string; confidence: number }[] } | null;
  duplicates: DuplicateCandidate[];
  suggestedResolutions: ResolutionSuggestion[];
  priorityPreview: { priority: Priority; score: number; rationale: string[] } | null;
}

export default function ReportIncident() {
  const nav = useNavigate();
  const services = useLoad(() => api<ItService[]>('/services'), []);
  const categories = useLoad(() => api<Category[]>('/categories'), []);
  const [form, setForm] = useState({ title: '', description: '', serviceId: '', categoryCode: '', impact: 2, urgency: 2, affectedUsers: 1 });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ incident: Incident; duplicates: DuplicateCandidate[]; assignment: { strategy: string; chosen: { technicianName: string } | null } } | null>(null);
  const [dupOf, setDupOf] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  // live AI analysis (debounced) while the user types
  useEffect(() => {
    if (form.title.length + form.description.length < 8) {
      setAnalysis(null);
      return;
    }
    const t = setTimeout(() => {
      api<Analysis>('/incidents/analyze', {
        body: { title: form.title, description: form.description, serviceId: form.serviceId || undefined, impact: form.impact, urgency: form.urgency, affectedUsers: form.affectedUsers },
      })
        .then(setAnalysis)
        .catch(() => null);
    }, 450);
    return () => clearTimeout(t);
  }, [form]);

  const submit = async (e: FormEvent, confirmNotDuplicate = false) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDupOf(null);
    try {
      const r = await api<typeof result>('/incidents', {
        body: { ...form, categoryCode: form.categoryCode || null, affectedUsers: Number(form.affectedUsers), confirmNotDuplicate },
      });
      setResult(r);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_INCIDENT') setDupOf((err.details as { existingId: string }).existingId);
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const i = result.incident;
    return (
      <div className="card" style={{ maxWidth: 720 }}>
        <h1>✅ Incident {i.id} created</h1>
        <p className="muted">The system processed your report automatically:</p>
        <dl className="kv">
          <dt>Category</dt><dd>{i.categoryCode}{i.categoryConfidence != null && <span className="muted"> (AI suggested, {Math.round(i.categoryConfidence * 100)}% confidence)</span>}</dd>
          <dt>Priority</dt><dd><PriorityBadge p={i.priority} /> <span className="muted small">score {i.priorityScore}</span></dd>
          <dt>SLA</dt><dd>{i.sla ? `${i.sla.policyName} — respond within ${i.sla.responseMinutes} min, resolve within ${i.sla.resolutionMinutes} min` : 'No SLA configured (administrators were alerted)'}</dd>
          <dt>Assigned to</dt><dd>{result.assignment.chosen ? `${result.assignment.chosen.technicianName} (${result.assignment.strategy})` : 'Queued — no technician available right now'}</dd>
          <dt>Related reports</dt><dd>{result.duplicates.length ? result.duplicates.map((d) => d.incidentId).join(', ') : 'None'}</dd>
        </dl>
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn" onClick={() => nav(`/incidents/${i.id}`)}>Track this incident</button>
          <button className="btn secondary" onClick={() => { setResult(null); setForm({ ...form, title: '', description: '' }); }}>Report another</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Report an incident</h1>
          <div className="muted">Describe what is not working. Category, priority, SLA and technician are determined automatically.</div>
        </div>
      </div>
      <div className="grid grid-main">
        <form className="card" onSubmit={(e) => submit(e)}>
          <ErrorAlert error={error} />
          {dupOf && (
            <div className="alert warning">
              You already reported this as <Link to={`/incidents/${dupOf}`}>{dupOf}</Link>.{' '}
              <button type="button" className="btn sm secondary" onClick={(e) => submit(e as unknown as FormEvent, true)}>It is a different problem — submit anyway</button>
            </div>
          )}
          <div className="field">
            <label htmlFor="title">Short title *</label>
            <input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Payment application unavailable" required minLength={5} maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="desc">Description *</label>
            <textarea id="desc" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What happened, since when, error messages, who is affected…" required minLength={10} />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="svc">Affected IT service *</label>
              <select id="svc" value={form.serviceId} onChange={(e) => set('serviceId', e.target.value)} required>
                <option value="">Select a service…</option>
                {(services.data ?? []).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cat">Category</label>
              <select id="cat" value={form.categoryCode} onChange={(e) => set('categoryCode', e.target.value)}>
                <option value="">Let the system decide</option>
                {(categories.data ?? []).filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="impact">Impact (how widespread)</label>
              <select id="impact" value={form.impact} onChange={(e) => set('impact', Number(e.target.value))}>
                {LEVELS.map((l) => <option key={l.v} value={l.v}>{l.v} — {['Single user', 'Team', 'Department', 'Whole organisation'][l.v - 1]}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="urgency">Urgency (how time-critical)</label>
              <select id="urgency" value={form.urgency} onChange={(e) => set('urgency', Number(e.target.value))}>
                {LEVELS.map((l) => <option key={l.v} value={l.v}>{l.v} — {['Can wait', 'Work slowed down', 'Work blocked', 'Business stopped'][l.v - 1]}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="users">Number of affected users</label>
              <input id="users" type="number" min={1} max={1000000} value={form.affectedUsers} onChange={(e) => set('affectedUsers', Number(e.target.value))} />
            </div>
          </div>
          <button className="btn" disabled={busy}>{busy ? 'Submitting…' : 'Submit incident'}</button>
        </form>

        <div className="stack">
          <div className="ai-box">
            <h3>🤖 Live analysis</h3>
            {!analysis && <div className="small muted">Start typing to get a category suggestion, priority preview, duplicate check and known fixes.</div>}
            {analysis && (
              <div className="stack" style={{ gap: 10 }}>
                <div>
                  <b>Suggested category: </b>
                  {analysis.categorySuggestion ? (
                    <>
                      {analysis.categorySuggestion.categoryCode} <span className="muted small">({Math.round(analysis.categorySuggestion.confidence * 100)}%)</span>
                      {!form.categoryCode && <button type="button" className="btn ghost sm" onClick={() => set('categoryCode', analysis.categorySuggestion!.categoryCode)}>Use</button>}
                      {analysis.categorySuggestion.matchedKeywords.length > 0 && <div className="small muted">keywords: {analysis.categorySuggestion.matchedKeywords.join(', ')}</div>}
                    </>
                  ) : <span className="muted">not sure yet</span>}
                </div>
                {analysis.priorityPreview && (
                  <div>
                    <b>Expected priority: </b><PriorityBadge p={analysis.priorityPreview.priority} />
                    <div className="small muted">{analysis.priorityPreview.rationale[0]}</div>
                  </div>
                )}
              </div>
            )}
          </div>
          {analysis && analysis.duplicates.length > 0 && (
            <div className="card">
              <h3>⚠️ Possibly already reported</h3>
              {analysis.duplicates.map((d) => (
                <div key={d.incidentId} style={{ marginBottom: 8 }}>
                  <Link to={`/incidents/${d.incidentId}`} className="mono">{d.incidentId}</Link> {d.title}
                  <div className="small muted">{Math.round(d.score * 100)}% match · {d.status}{d.sameService ? ' · same service' : ''}</div>
                </div>
              ))}
              <div className="small muted">You can still submit — your report will be linked so the team sees the full picture.</div>
            </div>
          )}
          {analysis && analysis.suggestedResolutions.length > 0 && (
            <div className="card">
              <h3>💡 Known fixes for similar problems</h3>
              {analysis.suggestedResolutions.map((s) => (
                <div key={s.incidentId} style={{ marginBottom: 10 }}>
                  <div><b>{s.title}</b> <span className="muted small">({s.incidentId}, {Math.round(s.similarity * 100)}% similar)</span></div>
                  <div className="small">{s.resolution}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
