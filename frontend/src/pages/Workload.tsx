import { api } from '../api';
import { useAuth } from '../auth';
import IncidentTable from '../components/IncidentTable';
import { ErrorAlert, Stat, useLoad } from '../components/ui';
import { Incident, User } from '../types';

interface WorkloadData {
  technician: User;
  active: number;
  capacity: number;
  utilisationPct: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  resolvedTotal: number;
  awaitingAcknowledgement: number;
  incidents: Incident[];
}

export default function Workload() {
  const { refresh } = useAuth();
  const w = useLoad(() => api<WorkloadData>('/technicians/me/workload'), []);
  const d = w.data;
  const toggle = async () => {
    await api('/technicians/me/availability', { method: 'PUT', body: { available: !d?.technician.available } });
    await refresh();
    w.reload();
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>My workload</h1>
          <div className="muted">Current assignments, capacity and availability.</div>
        </div>
        {d && (
          <button className={`btn ${d.technician.available ? 'secondary' : 'success'}`} onClick={toggle}>
            {d.technician.available ? '🟢 Available — set unavailable' : '🔴 Unavailable — set available'}
          </button>
        )}
      </div>
      <ErrorAlert error={w.error} />
      {d && (
        <>
          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            <Stat label="Active" value={`${d.active} / ${d.capacity}`} tone="accent" />
            <Stat label="Utilisation" value={`${d.utilisationPct}%`} tone={d.utilisationPct >= 100 ? 'danger' : d.utilisationPct >= 80 ? 'warn' : 'ok'} />
            <Stat label="To acknowledge" value={d.awaitingAcknowledgement} tone={d.awaitingAcknowledgement ? 'danger' : undefined} />
            <Stat label="Resolved total" value={d.resolvedTotal} tone="ok" />
          </div>
          <div className="grid grid-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <h3>By status</h3>
              {Object.entries(d.byStatus).map(([k, v]) => <div key={k} className="spread small"><span>{k}</span><b>{v}</b></div>)}
              {Object.keys(d.byStatus).length === 0 && <div className="muted small">Nothing active 🎉</div>}
            </div>
            <div className="card">
              <h3>Skills</h3>
              {(d.technician.skills ?? []).map((s) => <span key={s} className="chip">{s}</span>)}
              <div className="small muted" style={{ marginTop: 8 }}>{d.technician.experienceYears} years experience · max {d.technician.maxWorkload} concurrent incidents</div>
            </div>
          </div>
          <div className="card">
            <h2>Assigned to me (by priority)</h2>
            <IncidentTable items={d.incidents} showTech={false} />
          </div>
        </>
      )}
    </>
  );
}
