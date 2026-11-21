import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { portalOf, useAuth } from '../auth';
import IncidentTable from '../components/IncidentTable';
import { ErrorAlert, minutes, Stat, useLoad } from '../components/ui';
import { Incident, Page } from '../types';

const PRIORITY_COLORS: Record<string, string> = { P1: '#dc2626', P2: '#ea580c', P3: '#ca8a04', P4: '#16a34a', NONE: '#94a3b8' };

export default function Dashboard() {
  const { user, can } = useAuth();
  if (!user) return null;
  const portal = portalOf(user.role);
  if (portal === 'employee') return <EmployeeHome />;
  if (portal === 'technician' && !can('REPORT_VIEW')) return <TechnicianHome />;
  return <OpsDashboard />;
}

function EmployeeHome() {
  const { user } = useAuth();
  const { data, error } = useLoad(() => api<Page<Incident>>('/incidents?pageSize=50'), []);
  const items = data?.items ?? [];
  const open = items.filter((i) => !['VERIFIED', 'CLOSED'].includes(i.status));
  const waiting = items.filter((i) => i.status === 'PENDING_INFO' || i.status === 'RESOLVED');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hello, {user?.name.split(' ')[0]} 👋</h1>
          <div className="muted">Report problems and follow their progress here.</div>
        </div>
        <Link to="/report" className="btn">➕ Report an incident</Link>
      </div>
      <ErrorAlert error={error} />
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <Stat label="Open incidents" value={open.length} tone="accent" />
        <Stat label="Need your action" value={waiting.length} tone={waiting.length ? 'warn' : undefined} />
        <Stat label="Total reported" value={items.length} />
      </div>
      {waiting.length > 0 && (
        <div className="alert warning">
          {waiting.map((i) => (
            <div key={i.id}>
              <Link to={`/incidents/${i.id}`}><b>{i.id}</b></Link> — {i.status === 'PENDING_INFO' ? 'the technician needs more information from you' : 'a resolution was provided: please confirm and rate it'}
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <h2>My incidents</h2>
        <IncidentTable items={items} showReporter={false} />
      </div>
    </>
  );
}

function TechnicianHome() {
  const { data, error } = useLoad(() => api<{ active: number; capacity: number; utilisationPct: number; awaitingAcknowledgement: number; resolvedTotal: number; incidents: Incident[] }>('/technicians/me/workload'), []);
  const risk = useLoad(() => api<{ incidentId: string; title: string; level: string; minutesLeft: number; reasons: string[] }[]>('/reports/sla-risk'), []);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>My support dashboard</h1>
          <div className="muted">Your queue, ordered by priority. Acknowledge new assignments quickly — P1/P2 escalate automatically.</div>
        </div>
      </div>
      <ErrorAlert error={error} />
      {data && (
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          <Stat label="Active incidents" value={`${data.active} / ${data.capacity}`} tone="accent" />
          <Stat label="Utilisation" value={`${data.utilisationPct}%`} tone={data.utilisationPct >= 80 ? 'warn' : 'ok'} />
          <Stat label="Awaiting acknowledgement" value={data.awaitingAcknowledgement} tone={data.awaitingAcknowledgement ? 'danger' : undefined} />
          <Stat label="Resolved (all time)" value={data.resolvedTotal} tone="ok" />
        </div>
      )}
      {risk.data && risk.data.filter((r) => r.level !== 'LOW').length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>⚠️ SLA risk on my incidents</h2>
          {risk.data.filter((r) => r.level !== 'LOW').map((r) => (
            <div key={r.incidentId} className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div><Link to={`/incidents/${r.incidentId}`} className="mono">{r.incidentId}</Link> {r.title}<div className="small muted">{r.reasons.join(' · ')}</div></div>
              <span className={`badge ${r.level === 'BREACHED' || r.level === 'HIGH' ? 'sla-BREACHED' : 'sla-AT_RISK'}`}>{r.level} · {r.minutesLeft} min left</span>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <h2>My queue</h2>
        <IncidentTable items={data?.incidents ?? []} showTech={false} />
      </div>
    </>
  );
}

interface Overview {
  totalIncidents: number;
  openIncidents: number;
  criticalIncidents: number;
  resolvedIncidents: number;
  slaViolations: number;
  atRisk: number;
  unassigned: number;
  escalated: number;
  slaCompliancePct: number | null;
  avgResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  avgFeedbackRating: number | null;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byCategory: Record<string, number>;
}

function OpsDashboard() {
  const overview = useLoad(() => api<Overview>('/reports/overview'), []);
  const trend = useLoad(() => api<{ date: string; created: number; resolved: number; breached: number }[]>('/reports/trend?days=14'), []);
  const techs = useLoad(() => api<{ technicianId: string; name: string; activeIncidents: number; capacity: number; utilisationPct: number; available: boolean }[]>('/reports/technicians'), []);
  const services = useLoad(() => api<{ serviceId: string; name: string; incidents: number; open: number; health: string }[]>('/reports/services'), []);
  const critical = useLoad(() => api<Page<Incident>>('/incidents?activeOnly=true&sortBy=priority&pageSize=8'), []);
  const o = overview.data;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Operations dashboard</h1>
          <div className="muted">Live view: refreshes automatically as incidents change.</div>
        </div>
        <Link to="/incidents" className="btn secondary">Open incident monitor →</Link>
      </div>
      <ErrorAlert error={overview.error} />
      {o && (
        <>
          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            <Stat label="Total incidents" value={o.totalIncidents} />
            <Stat label="Open incidents" value={o.openIncidents} tone="accent" />
            <Stat label="Critical (P1) open" value={o.criticalIncidents} tone={o.criticalIncidents ? 'danger' : 'ok'} />
            <Stat label="Resolved incidents" value={o.resolvedIncidents} tone="ok" />
            <Stat label="SLA violations" value={o.slaViolations} tone={o.slaViolations ? 'danger' : 'ok'} />
            <Stat label="SLA compliance" value={o.slaCompliancePct != null ? `${o.slaCompliancePct}%` : '—'} tone={(o.slaCompliancePct ?? 100) < 80 ? 'warn' : 'ok'} />
            <Stat label="Avg. resolution" value={minutes(o.avgResolutionMinutes)} />
            <Stat label="Avg. feedback" value={o.avgFeedbackRating != null ? `${o.avgFeedbackRating} / 5` : '—'} />
          </div>
          <div className="grid grid-3" style={{ marginBottom: 16 }}>
            <Stat label="At risk of SLA breach" value={o.atRisk} tone={o.atRisk ? 'warn' : undefined} />
            <Stat label="Unassigned" value={o.unassigned} tone={o.unassigned ? 'warn' : undefined} />
            <Stat label="Escalated" value={o.escalated} tone={o.escalated ? 'danger' : undefined} />
          </div>
        </>
      )}
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>Incident trend (14 days)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="created" stroke="#2563eb" strokeWidth={2} isAnimationActive={false} />
              <Line type="monotone" dataKey="resolved" stroke="#16a34a" strokeWidth={2} isAnimationActive={false} />
              <Line type="monotone" dataKey="breached" stroke="#dc2626" strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h2>Incidents by priority</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={Object.entries(o?.byPriority ?? {}).map(([k, v]) => ({ name: k, value: v }))} dataKey="value" nameKey="name" outerRadius={90} label>
                {Object.keys(o?.byPriority ?? {}).map((k) => <Cell key={k} fill={PRIORITY_COLORS[k] ?? '#94a3b8'} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>Technician workload</h2>
          <table>
            <thead><tr><th>Technician</th><th>Active</th><th>Utilisation</th></tr></thead>
            <tbody>
              {(techs.data ?? []).map((t) => (
                <tr key={t.technicianId}>
                  <td>{t.name} <span className="muted small">{t.technicianId}</span> {!t.available && <span className="badge status">off</span>}</td>
                  <td>{t.activeIncidents} / {t.capacity}</td>
                  <td style={{ width: 160 }}>
                    <div className={`progress ${t.utilisationPct >= 100 ? 'danger' : t.utilisationPct >= 80 ? 'warn' : ''}`}><div style={{ width: `${Math.min(100, t.utilisationPct)}%` }} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Service health & analysis</h2>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={services.data ?? []} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} fontSize={12} />
              <YAxis type="category" dataKey="name" width={150} fontSize={11} interval={0} />
              <Tooltip />
              <Legend />
              <Bar dataKey="incidents" fill="#7c3aed" name="All incidents" />
              <Bar dataKey="open" fill="#ea580c" name="Open" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <h2>Most urgent open incidents</h2>
        <IncidentTable items={critical.data?.items ?? []} />
      </div>
    </>
  );
}
