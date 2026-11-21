import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../api';
import { ErrorAlert, useLoad } from '../../components/ui';
import { AuditRecord } from '../../types';

const ACTIONS = ['INCIDENT_CREATED', 'INCIDENT_CLASSIFIED', 'PRIORITY_CALCULATED', 'PRIORITY_CHANGED', 'INCIDENT_ASSIGNED', 'INCIDENT_ACKNOWLEDGED', 'WORK_STARTED', 'INFO_REQUESTED', 'INCIDENT_RESOLVED', 'INCIDENT_CLOSED', 'SLA_WARNING', 'SLA_RESPONSE_BREACHED', 'SLA_RESOLUTION_BREACHED', 'INCIDENT_ESCALATED', 'DUPLICATE_DETECTED', 'USER_LOGIN', 'USER_CREATED', 'CONFIG_CHANGED'];

export default function AuditLog() {
  const [f, setF] = useState({ incidentId: '', userId: '', action: '' });
  const [applied, setApplied] = useState(f);
  const list = useLoad(() => api<AuditRecord[]>(`/admin/audit${qs({ ...applied, limit: 300 })}`), [applied]);
  return (
    <>
      <div className="page-head"><div><h1>Audit log</h1><div className="muted">Immutable record of every action: timestamp, user, action, incident, previous and new state.</div></div></div>
      <div className="card" style={{ marginBottom: 16 }}>
        <form className="filters" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
          <div><label>Incident ID</label><input value={f.incidentId} onChange={(e) => setF({ ...f, incidentId: e.target.value.toUpperCase() })} /></div>
          <div><label>User ID</label><input value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value.toUpperCase() })} /></div>
          <div><label>Action</label><select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}><option value="">Any</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select></div>
          <div><button className="btn">Filter</button></div>
        </form>
      </div>
      <ErrorAlert error={list.error} />
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Incident</th><th>State change</th><th>Description</th></tr></thead>
            <tbody>
              {(list.data ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="small mono">{new Date(a.timestamp).toLocaleString()}</td>
                  <td className="small">{a.userName}<div className="muted">{a.userId} · {a.userRole}</div></td>
                  <td className="small mono">{a.action}</td>
                  <td>{a.incidentId ? <Link to={`/incidents/${a.incidentId}`} className="mono">{a.incidentId}</Link> : '—'}</td>
                  <td className="small">{a.previousState || a.newState ? `${a.previousState ?? '—'} → ${a.newState ?? '—'}` : ''}</td>
                  <td className="small">{a.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
