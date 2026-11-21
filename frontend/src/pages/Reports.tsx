import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, download } from '../api';
import { ErrorAlert, minutes, Stat, useLoad } from '../components/ui';

interface TechRow { technicianId: string; name: string; role: string; skills: string[]; available: boolean; activeIncidents: number; capacity: number; utilisationPct: number; p1Active: number; resolvedTotal: number; slaBreaches: number; avgResolutionMinutes: number | null; avgRating: number | null }
interface SvcRow { serviceId: string; name: string; businessCriticality: number; dependsOn: string[]; incidents: number; open: number; critical: number; slaBreaches: number; avgResolutionMinutes: number | null; health: string }
interface Overview { totalIncidents: number; openIncidents: number; criticalIncidents: number; resolvedIncidents: number; slaViolations: number; slaCompliancePct: number | null; avgResponseMinutes: number | null; avgResolutionMinutes: number | null; byCategory: Record<string, number>; byStatus: Record<string, number> }

export default function Reports() {
  const o = useLoad(() => api<Overview>('/reports/overview'), []);
  const t = useLoad(() => api<TechRow[]>('/reports/technicians'), []);
  const s = useLoad(() => api<SvcRow[]>('/reports/services'), []);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports & analytics</h1>
          <div className="muted">Incident overview, technician workload and service analysis.</div>
        </div>
        <button className="btn secondary" onClick={() => download('/incidents/export.csv', 'incidents.csv')}>⬇ Export all incidents (CSV)</button>
      </div>
      <ErrorAlert error={o.error ?? t.error ?? s.error} />
      {o.data && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Incident overview</h2>
          <div className="grid grid-4">
            <Stat label="Total incidents" value={o.data.totalIncidents} />
            <Stat label="Open incidents" value={o.data.openIncidents} tone="accent" />
            <Stat label="Critical incidents" value={o.data.criticalIncidents} tone="danger" />
            <Stat label="Resolved incidents" value={o.data.resolvedIncidents} tone="ok" />
            <Stat label="SLA violations" value={o.data.slaViolations} tone="danger" />
            <Stat label="SLA compliance" value={o.data.slaCompliancePct != null ? `${o.data.slaCompliancePct}%` : '—'} />
            <Stat label="Mean time to respond" value={minutes(o.data.avgResponseMinutes)} />
            <Stat label="Mean time to resolve" value={minutes(o.data.avgResolutionMinutes)} />
          </div>
        </div>
      )}
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>Incidents by category</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={Object.entries(o.data?.byCategory ?? {}).map(([k, v]) => ({ name: k, value: v }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={11} interval={0} angle={-30} textAnchor="end" height={70} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="value" fill="#7c3aed" name="Incidents" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h2>Technician performance</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={t.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="activeIncidents" fill="#ea580c" name="Active" />
              <Bar dataKey="resolvedTotal" fill="#16a34a" name="Resolved" />
              <Bar dataKey="slaBreaches" fill="#dc2626" name="SLA breaches" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Technician workload</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Technician</th><th>Skills</th><th>Active</th><th>Utilisation</th><th>P1 active</th><th>Resolved</th><th>Avg resolution</th><th>SLA breaches</th><th>Rating</th></tr></thead>
            <tbody>
              {(t.data ?? []).map((r) => (
                <tr key={r.technicianId}>
                  <td>{r.name} <span className="muted small">{r.technicianId}{r.role === 'TEAM_LEAD' ? ' · lead' : ''}</span>{!r.available && <span className="badge status" style={{ marginLeft: 4 }}>unavailable</span>}</td>
                  <td>{r.skills.map((x) => <span key={x} className="chip">{x}</span>)}</td>
                  <td>{r.activeIncidents} / {r.capacity}</td>
                  <td>{r.utilisationPct}%</td>
                  <td>{r.p1Active}</td>
                  <td>{r.resolvedTotal}</td>
                  <td>{minutes(r.avgResolutionMinutes)}</td>
                  <td>{r.slaBreaches}</td>
                  <td>{r.avgRating ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h2>Service analysis</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Service</th><th>Health</th><th>Criticality</th><th>Incidents</th><th>Open</th><th>P1</th><th>SLA breaches</th><th>Avg resolution</th><th>Depends on</th></tr></thead>
            <tbody>
              {(s.data ?? []).map((r) => (
                <tr key={r.serviceId}>
                  <td>{r.name} <span className="mono small muted">{r.serviceId}</span></td>
                  <td><span className={`badge ${r.health === 'DOWN' ? 'sla-BREACHED' : r.health === 'DEGRADED' ? 'sla-AT_RISK' : 'sla-MET'}`}>{r.health}</span></td>
                  <td>{r.businessCriticality}/4</td>
                  <td>{r.incidents}</td>
                  <td>{r.open}</td>
                  <td>{r.critical}</td>
                  <td>{r.slaBreaches}</td>
                  <td>{minutes(r.avgResolutionMinutes)}</td>
                  <td className="small mono">{r.dependsOn.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
