import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ago, ErrorAlert, fmt, Lifecycle, minutes, Modal, PriorityBadge, SlaBadge, SlaBar, Stars, StatusBadge, useLoad } from '../components/ui';
import { AuditRecord, Category, Correlation, DuplicateCandidate, Incident, LEVELS, RankedCandidate, ResolutionSuggestion } from '../types';

type Dialog = null | 'resolve' | 'requestInfo' | 'provideInfo' | 'reopen' | 'feedback' | 'assign' | 'classify' | 'edit' | 'link';

export default function IncidentDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const inc = useLoad(() => api<Incident>(`/incidents/${id}`), [id]);
  const audit = useLoad(() => api<AuditRecord[]>(`/incidents/${id}/audit`), [id]);
  const related = useLoad(
    () => api<{ duplicates: DuplicateCandidate[]; correlations: Correlation[]; linked: { id: string; title: string; status: string; priority: string }[]; suggestedResolutions: ResolutionSuggestion[] }>(`/incidents/${id}/related`),
    [id],
  );
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [noteKind, setNoteKind] = useState<'COMMENT' | 'INVESTIGATION'>('COMMENT');

  const i = inc.data;
  const run = async (path: string, body: unknown = {}) => {
    setError(null);
    try {
      const updated = await api<Incident>(`/incidents/${id}/${path}`, { body });
      inc.setData(updated);
      setDialog(null);
      audit.reload();
      related.reload();
    } catch (e) {
      setError(e);
    }
  };
  if (inc.error) return <ErrorAlert error={inc.error} />;
  if (!i) return <div className="empty">Loading…</div>;
  const can = (a: string) => i.permittedActions.includes(a);
  const isStaff = user?.role !== 'EMPLOYEE';

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row">
            <span className="mono muted">{i.id}</span>
            <PriorityBadge p={i.priority} />
            <StatusBadge s={i.status} />
            <SlaBadge s={i.slaStatus} />
            {i.escalationLevel > 0 && <span className="badge esc">Escalated · level {i.escalationLevel}</span>}
          </div>
          <h1 style={{ marginTop: 6 }}>{i.title}</h1>
          <div className="muted small">Reported by {i.reporterName} · {fmt(i.createdAt)} · {i.stateDescription}</div>
        </div>
        <div className="row">
          {can('acknowledge') && <button className="btn" onClick={() => run('acknowledge')}>✋ Acknowledge</button>}
          {can('start') && <button className="btn" onClick={() => run('start')}>▶ Start investigation</button>}
          {can('requestInfo') && <button className="btn secondary" onClick={() => setDialog('requestInfo')}>❓ Request info</button>}
          {can('resolve') && <button className="btn success" onClick={() => setDialog('resolve')}>✔ Resolve</button>}
          {can('provideInfo') && <button className="btn" onClick={() => setDialog('provideInfo')}>💬 Provide information</button>}
          {can('feedback') && <button className="btn success" onClick={() => setDialog('feedback')}>⭐ Confirm & rate</button>}
          {can('verify') && !can('feedback') && <button className="btn success" onClick={() => run('verify')}>Confirm resolution</button>}
          {can('reopen') && <button className="btn secondary" onClick={() => setDialog('reopen')}>↩ Reopen</button>}
          {can('close') && <button className="btn" onClick={() => run('close', {})}>🔒 Close</button>}
          {can('assign') && <button className="btn secondary" onClick={() => setDialog('assign')}>👤 {i.assignedTechnicianId ? 'Reassign' : 'Assign'}</button>}
          {can('classify') && <button className="btn secondary" onClick={() => setDialog('classify')}>🏷 Reclassify</button>}
          {can('edit') && <button className="btn secondary" onClick={() => setDialog('edit')}>✏ Edit</button>}
          {can('link') && <button className="btn secondary" onClick={() => setDialog('link')}>🔗 Mark duplicate</button>}
        </div>
      </div>
      <ErrorAlert error={error} />
      <div className="card" style={{ marginBottom: 16 }}>
        <Lifecycle status={i.status} />
      </div>
      {i.status === 'PENDING_INFO' && can('provideInfo') && <div className="alert warning">The technician needs more information from you — see the latest request below.</div>}
      {i.status === 'RESOLVED' && can('feedback') && <div className="alert success">A resolution was provided. Please confirm it works and rate the support, or reopen if the problem persists.</div>}

      <div className="grid grid-main">
        <div className="stack">
          <div className="card">
            <h3>Description</h3>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{i.description}</p>
          </div>
          {i.resolution && (
            <div className="card" style={{ borderColor: '#bbf7d0' }}>
              <h3>Resolution</h3>
              <p style={{ marginTop: 0 }}>{i.resolution.summary}</p>
              {i.resolution.rootCause && <p className="small"><b>Root cause:</b> {i.resolution.rootCause}</p>}
              <div className="small muted">by {i.resolution.resolvedByName} · {fmt(i.resolution.resolvedAt)}</div>
              {i.feedback && <div style={{ marginTop: 8 }}><Stars n={i.feedback.rating} /> <span className="small">{i.feedback.comment}</span></div>}
            </div>
          )}
          <div className="card">
            <h3>Activity & notes</h3>
            <ul className="timeline">
              {i.notes.length === 0 && <li className="muted small">No notes yet.</li>}
              {i.notes.map((n) => (
                <li key={n.id} className={n.type}>
                  <div className="meta"><b>{n.authorName}</b> · {n.type.replace('_', ' ').toLowerCase()} · {ago(n.createdAt)}</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
                </li>
              ))}
            </ul>
            {can('note') && (
              <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) run('notes', { text: note, kind: noteKind }).then(() => setNote('')); }}>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={isStaff ? 'Add an investigation note or comment…' : 'Add more information for the support team…'} style={{ minHeight: 70 }} />
                <div className="row" style={{ marginTop: 8 }}>
                  {isStaff && (
                    <select value={noteKind} onChange={(e) => setNoteKind(e.target.value as 'COMMENT' | 'INVESTIGATION')} style={{ width: 220 }}>
                      <option value="INVESTIGATION">Investigation note (internal)</option>
                      <option value="COMMENT">Comment to reporter</option>
                    </select>
                  )}
                  <button className="btn sm">Add note</button>
                </div>
              </form>
            )}
          </div>
          <div className="card">
            <h3>Audit trail</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Time</th><th>User</th><th>Action</th><th>State</th><th>Description</th></tr></thead>
                <tbody>
                  {(audit.data ?? []).map((a) => (
                    <tr key={a.id}>
                      <td className="small mono">{new Date(a.timestamp).toLocaleString()}</td>
                      <td className="small">{a.userName}<div className="muted">{a.userId}</div></td>
                      <td className="small mono">{a.action}</td>
                      <td className="small">{a.previousState || a.newState ? `${a.previousState ?? '—'} → ${a.newState ?? '—'}` : ''}</td>
                      <td className="small">{a.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Details</h3>
            <dl className="kv">
              <dt>Service</dt><dd className="mono">{i.serviceId}</dd>
              <dt>Category</dt><dd>{i.categoryCode ?? '—'}{i.categoryConfidence != null && <span className="muted small"> (AI {Math.round(i.categoryConfidence * 100)}%)</span>}</dd>
              <dt>Impact</dt><dd>{LEVELS[i.impact - 1]?.label}</dd>
              <dt>Urgency</dt><dd>{LEVELS[i.urgency - 1]?.label}</dd>
              <dt>Criticality</dt><dd>{LEVELS[i.businessCriticality - 1]?.label}</dd>
              <dt>Affected users</dt><dd>{i.affectedUsers}</dd>
              <dt>Technician</dt><dd>{i.assignedTechnicianName ?? <span className="muted">Unassigned</span>}</dd>
              <dt>Last update</dt><dd>{ago(i.updatedAt)}</dd>
            </dl>
          </div>
          <div className="card">
            <h3>Priority</h3>
            <div className="row"><PriorityBadge p={i.priority} /> <span className="muted small">score {i.priorityScore} · {i.priorityStrategy}</span></div>
            <ul className="small" style={{ paddingLeft: 18, marginBottom: 0 }}>{i.priorityRationale.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
          <div className="card">
            <h3>Service level agreement</h3>
            {i.sla ? (
              <>
                <div className="small muted" style={{ marginBottom: 6 }}>{i.sla.policyName}</div>
                <SlaBar pct={i.slaElapsedPct} status={i.slaStatus} />
                <dl className="kv small" style={{ marginTop: 10 }}>
                  <dt>Respond by</dt><dd>{fmt(i.sla.responseDueAt)} {i.sla.responseBreached && <span className="badge sla-BREACHED">missed</span>}</dd>
                  <dt>Responded</dt><dd>{i.sla.respondedAt ? `${fmt(i.sla.respondedAt)} (${minutes(i.responseTimeMinutes)})` : '—'}</dd>
                  <dt>Resolve by</dt><dd>{fmt(i.sla.resolutionDueAt)} {i.sla.resolutionBreached && <span className="badge sla-BREACHED">missed</span>}</dd>
                  <dt>Resolved</dt><dd>{i.sla.resolvedAt ? `${fmt(i.sla.resolvedAt)} (${minutes(i.resolutionTimeMinutes)})` : '—'}</dd>
                </dl>
              </>
            ) : <div className="muted small">No SLA policy applies.</div>}
          </div>
          {related.data && (
            <div className="ai-box">
              <h3>🤖 Intelligence</h3>
              {related.data.linked.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <b className="small">Linked / possible duplicates</b>
                  {related.data.linked.map((l) => <div key={l.id} className="small"><Link to={`/incidents/${l.id}`} className="mono">{l.id}</Link> {l.title} <span className="muted">({l.status})</span></div>)}
                </div>
              )}
              {related.data.correlations.map((c) => (
                <div key={c.key} style={{ marginBottom: 10 }}>
                  <b className="small">{c.type === 'SHARED_DEPENDENCY' ? '🧭 Probable root cause' : '📡 Correlated incidents'}: {c.serviceName}</b>
                  <div className="small">{c.probableRootCause}</div>
                  <div className="small muted">{c.incidentIds.join(', ')} · confidence {Math.round(c.confidence * 100)}%</div>
                </div>
              ))}
              {isStaff && related.data.suggestedResolutions.length > 0 && (
                <div>
                  <b className="small">💡 Suggested resolutions from history</b>
                  {related.data.suggestedResolutions.map((s) => (
                    <div key={s.incidentId} className="small" style={{ marginTop: 6 }}>
                      <Link to={`/incidents/${s.incidentId}`} className="mono">{s.incidentId}</Link> ({Math.round(s.similarity * 100)}%): {s.resolution}
                    </div>
                  ))}
                </div>
              )}
              {related.data.linked.length === 0 && related.data.correlations.length === 0 && (!isStaff || related.data.suggestedResolutions.length === 0) && <div className="small muted">No related incidents detected.</div>}
            </div>
          )}
        </div>
      </div>

      {dialog && <ActionDialog dialog={dialog} incident={i} onClose={() => setDialog(null)} run={run} error={error} />}
    </>
  );
}

function ActionDialog({ dialog, incident, onClose, run, error }: { dialog: Exclude<Dialog, null>; incident: Incident; onClose: () => void; run: (p: string, b?: unknown) => Promise<void>; error: unknown }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [rating, setRating] = useState(5);
  const [edit, setEdit] = useState({ title: incident.title, description: incident.description, impact: incident.impact, urgency: incident.urgency, affectedUsers: incident.affectedUsers });
  const recs = useLoad(
    () => (dialog === 'assign' ? api<{ activeStrategy: string; recommendations: RankedCandidate[]; unavailable: { technicianId: string; technicianName: string; reason: string }[] }>(`/incidents/${incident.id}/recommendations`) : Promise.resolve(null)),
    [dialog],
  );
  const cats = useLoad(() => (dialog === 'classify' ? api<Category[]>('/categories') : Promise.resolve([] as Category[])), [dialog]);
  const titles: Record<string, string> = {
    resolve: 'Resolve incident',
    requestInfo: 'Request information from the reporter',
    provideInfo: 'Provide information',
    reopen: 'Reopen incident',
    feedback: 'Confirm resolution & give feedback',
    assign: 'Assign technician',
    classify: 'Reclassify incident',
    edit: 'Edit incident',
    link: 'Mark as duplicate of another incident',
  };

  return (
    <Modal title={titles[dialog]} onClose={onClose}>
      <ErrorAlert error={error} />
      {dialog === 'resolve' && (
        <>
          <div className="field"><label>Resolution summary *</label><textarea value={a} onChange={(e) => setA(e.target.value)} placeholder="What was done to restore the service" /></div>
          <div className="field"><label>Root cause</label><input value={b} onChange={(e) => setB(e.target.value)} /></div>
          <button className="btn success" onClick={() => run('resolve', { summary: a, rootCause: b })}>Resolve</button>
        </>
      )}
      {(dialog === 'requestInfo' || dialog === 'provideInfo') && (
        <>
          <div className="field"><label>{dialog === 'requestInfo' ? 'Question for the reporter' : 'Your answer'}</label><textarea value={a} onChange={(e) => setA(e.target.value)} /></div>
          {dialog === 'requestInfo' && <div className="hint" style={{ marginBottom: 10 }}>The SLA resolution clock pauses until the reporter answers.</div>}
          <button className="btn" onClick={() => run(dialog === 'requestInfo' ? 'request-info' : 'provide-info', { text: a })}>Send</button>
        </>
      )}
      {dialog === 'reopen' && (
        <>
          <div className="field"><label>Why is the problem not solved?</label><textarea value={a} onChange={(e) => setA(e.target.value)} /></div>
          <button className="btn" onClick={() => run('reopen', { reason: a })}>Reopen</button>
        </>
      )}
      {dialog === 'feedback' && (
        <>
          <div className="field">
            <label>Rating</label>
            <div className="row">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={`btn sm ${n <= rating ? '' : 'secondary'}`} onClick={() => setRating(n)}>★ {n}</button>)}</div>
          </div>
          <div className="field"><label>Comment</label><textarea value={a} onChange={(e) => setA(e.target.value)} /></div>
          <button className="btn success" onClick={() => run('feedback', { rating, comment: a })}>Confirm & submit feedback</button>
        </>
      )}
      {dialog === 'assign' && (
        <>
          <p className="small muted">Smart recommendation (skills, workload, experience, history with this service). Active auto-assignment strategy: <b>{recs.data?.activeStrategy}</b></p>
          <button className="btn secondary sm" style={{ marginBottom: 10 }} onClick={() => run('assign', {})}>⚡ Auto-assign with active strategy</button>
          {(recs.data?.recommendations ?? []).map((r, idx) => (
            <div key={r.technicianId} className="card" style={{ padding: 12, marginBottom: 8 }}>
              <div className="spread">
                <div><b>{idx === 0 ? '⭐ ' : ''}{r.technicianName}</b> <span className="muted small">{r.technicianId} · {r.activeWorkload}/{r.maxWorkload} active · score {r.score}</span></div>
                <button className="btn sm" onClick={() => run('assign', { technicianId: r.technicianId })}>Assign</button>
              </div>
              <div className="small muted">{r.reasons.join(' · ')}</div>
            </div>
          ))}
          {(recs.data?.unavailable ?? []).map((u) => (
            <div key={u.technicianId} className="small muted">✖ {u.technicianName} — {u.reason} <button className="btn ghost sm" onClick={() => run('assign', { technicianId: u.technicianId })}>try anyway</button></div>
          ))}
        </>
      )}
      {dialog === 'classify' && (
        <>
          <div className="field">
            <label>Category</label>
            <select value={a} onChange={(e) => setA(e.target.value)}>
              <option value="">Select…</option>
              {(cats.data ?? []).filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button className="btn" disabled={!a} onClick={() => run('classify', { categoryCode: a })}>Save</button>
        </>
      )}
      {dialog === 'link' && (
        <>
          <div className="field"><label>Parent incident ID</label><input value={a} onChange={(e) => setA(e.target.value.toUpperCase())} placeholder="INC1037" /></div>
          <button className="btn" onClick={() => run('duplicate-of', { parentId: a })}>Link</button>
        </>
      )}
      {dialog === 'edit' && (
        <EditForm edit={edit} setEdit={setEdit} onSave={async () => {
          try {
            await api(`/incidents/${incident.id}`, { method: 'PATCH', body: edit });
            window.dispatchEvent(new Event('itsm:refresh'));
            onClose();
          } catch (e) {
            alert((e as Error).message);
          }
        }} />
      )}
    </Modal>
  );
}

function EditForm({ edit, setEdit, onSave }: { edit: { title: string; description: string; impact: number; urgency: number; affectedUsers: number }; setEdit: (e: typeof edit) => void; onSave: () => void }) {
  return (
    <>
      <div className="field"><label>Title</label><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
      <div className="field"><label>Description</label><textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
      <div className="grid grid-3">
        <div className="field"><label>Impact</label><select value={edit.impact} onChange={(e) => setEdit({ ...edit, impact: Number(e.target.value) })}>{LEVELS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}</select></div>
        <div className="field"><label>Urgency</label><select value={edit.urgency} onChange={(e) => setEdit({ ...edit, urgency: Number(e.target.value) })}>{LEVELS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}</select></div>
        <div className="field"><label>Affected users</label><input type="number" min={1} value={edit.affectedUsers} onChange={(e) => setEdit({ ...edit, affectedUsers: Number(e.target.value) })} /></div>
      </div>
      <div className="hint" style={{ marginBottom: 10 }}>Changing impact, urgency or affected users recalculates the priority and SLA.</div>
      <button className="btn" onClick={onSave}>Save changes</button>
    </>
  );
}
