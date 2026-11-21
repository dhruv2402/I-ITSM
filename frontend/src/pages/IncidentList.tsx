import { useState } from 'react';
import { api, download, qs } from '../api';
import { useAuth } from '../auth';
import IncidentTable from '../components/IncidentTable';
import { ErrorAlert, useLoad } from '../components/ui';
import { Category, Incident, ItService, Page, PRIORITIES, STATUSES, User } from '../types';

const EMPTY = { id: '', text: '', status: '', priority: '', categoryCode: '', serviceId: '', technicianId: '', slaStatus: '', createdFrom: '', createdTo: '', escalated: '', sortBy: 'createdAt' };

export default function IncidentList() {
  const { user, can } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const services = useLoad(() => api<ItService[]>('/services'), []);
  const categories = useLoad(() => api<Category[]>('/categories'), []);
  const technicians = useLoad(() => (can('INCIDENT_ASSIGN') ? api<User[]>('/technicians') : Promise.resolve([] as User[])), []);
  const query = qs({
    ...applied,
    createdFrom: applied.createdFrom ? new Date(applied.createdFrom).toISOString() : '',
    createdTo: applied.createdTo ? new Date(`${applied.createdTo}T23:59:59`).toISOString() : '',
    page,
    pageSize: 20,
  });
  const list = useLoad(() => api<Page<Incident>>(`/incidents${query}`), [query]);
  const set = (k: keyof typeof EMPTY, v: string) => setF((x) => ({ ...x, [k]: v }));
  const apply = () => {
    setPage(1);
    setApplied(f);
  };
  const title = user?.role === 'EMPLOYEE' ? 'My incidents' : user?.role === 'TECHNICIAN' ? 'Assigned incidents' : 'Incident monitor';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <div className="muted">Search and filter by ID, keywords, date, status, priority, category, service, technician, SLA status and escalation.</div>
        </div>
        {can('REPORT_VIEW') && <button className="btn secondary" onClick={() => download(`/incidents/export.csv${qs(applied)}`, 'incidents.csv')}>⬇ Export CSV</button>}
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <form className="filters" onSubmit={(e) => { e.preventDefault(); apply(); }}>
          <div><label>Incident ID</label><input value={f.id} onChange={(e) => set('id', e.target.value)} placeholder="INC10…" /></div>
          <div><label>Keywords</label><input value={f.text} onChange={(e) => set('text', e.target.value)} placeholder="payment, vpn…" /></div>
          <div><label>Status</label><select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">Any</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label>Priority</label><select value={f.priority} onChange={(e) => set('priority', e.target.value)}><option value="">Any</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div><label>Category</label><select value={f.categoryCode} onChange={(e) => set('categoryCode', e.target.value)}><option value="">Any</option>{(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label>Service</label><select value={f.serviceId} onChange={(e) => set('serviceId', e.target.value)}><option value="">Any</option>{(services.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          {can('INCIDENT_ASSIGN') && (
            <div><label>Technician</label><select value={f.technicianId} onChange={(e) => set('technicianId', e.target.value)}><option value="">Any</option>{(technicians.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          )}
          <div><label>SLA status</label><select value={f.slaStatus} onChange={(e) => set('slaStatus', e.target.value)}><option value="">Any</option>{['ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'PAUSED'].map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label>Created from</label><input type="date" value={f.createdFrom} onChange={(e) => set('createdFrom', e.target.value)} /></div>
          <div><label>Created to</label><input type="date" value={f.createdTo} onChange={(e) => set('createdTo', e.target.value)} /></div>
          <div><label>Escalated</label><select value={f.escalated} onChange={(e) => set('escalated', e.target.value)}><option value="">Any</option><option value="true">Yes</option><option value="false">No</option></select></div>
          <div><label>Sort by</label><select value={f.sortBy} onChange={(e) => set('sortBy', e.target.value)}><option value="createdAt">Newest</option><option value="priority">Priority</option><option value="updatedAt">Last updated</option></select></div>
          <div className="row"><button className="btn">Search</button><button type="button" className="btn secondary" onClick={() => { setF(EMPTY); setApplied(EMPTY); setPage(1); }}>Reset</button></div>
        </form>
      </div>
      <div className="card">
        <ErrorAlert error={list.error} />
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="muted small">{list.data ? `${list.data.total} incident(s)` : 'Loading…'}</span>
          {list.data && list.data.total > list.data.pageSize && (
            <div className="row">
              <button className="btn sm secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
              <span className="small">Page {page} of {Math.ceil(list.data.total / list.data.pageSize)}</span>
              <button className="btn sm secondary" disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          )}
        </div>
        <IncidentTable items={list.data?.items ?? []} showReporter={user?.role !== 'EMPLOYEE'} />
      </div>
    </>
  );
}
