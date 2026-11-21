import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { ErrorAlert, fmt, PriorityBadge, useLoad } from '../../components/ui';
import { Correlation, Priority } from '../../types';

interface Violation { id: string; title: string; priority: Priority; status: string; serviceId: string; assignedTechnicianId: string | null; responseBreached: boolean; resolutionBreached: boolean; resolutionDueAt: string; escalationLevel: number }
interface Risk { incidentId: string; title: string; priority: Priority; status: string; riskScore: number; level: string; minutesLeft: number; reasons: string[] }

export default function SlaCenter() {
  const { can } = useAuth();
  const violations = useLoad(() => api<Violation[]>('/reports/sla-violations'), []);
  const risk = useLoad(() => api<Risk[]>('/reports/sla-risk'), []);
  const corr = useLoad(() => api<Correlation[]>('/reports/correlations'), []);
  const runMonitor = async () => {
    const r = await api<{ checked: number; warnings: number; breaches: number; escalations: number }>('/admin/sla-monitor/run', { method: 'POST' });
    alert(`SLA monitor checked ${r.checked} incidents: ${r.warnings} warnings, ${r.breaches} breaches, ${r.escalations} escalations.`);
    violations.reload();
    risk.reload();
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>SLA monitoring & incident correlation</h1>
          <div className="muted">The background monitor checks SLAs continuously, warns before deadlines, records violations and escalates unacknowledged critical incidents.</div>
        </div>
        {can('CONFIG_MANAGE') && <button className="btn secondary" onClick={runMonitor}>▶ Run SLA monitor now</button>}
      </div>
      <ErrorAlert error={violations.error ?? risk.error ?? corr.error} />
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>🧭 Correlated incidents & probable root causes</h2>
        {(corr.data ?? []).length === 0 && <div className="muted small">No correlated open incidents right now.</div>}
        <div className="grid grid-2">
          {(corr.data ?? []).map((c) => (
            <div key={c.key} className="ai-box">
              <div className="spread"><b>{c.type === 'SHARED_DEPENDENCY' ? 'Shared dependency' : 'Same service'}: {c.serviceName}</b><span className="badge soft">{Math.round(c.confidence * 100)}%</span></div>
              <div className="small" style={{ margin: '6px 0' }}>{c.probableRootCause}</div>
              <div className="small">{c.incidentIds.map((id) => <Link key={id} to={`/incidents/${id}`} className="chip mono">{id}</Link>)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h2>📉 Predicted SLA risk (open incidents)</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Incident</th><th>Risk</th><th>Time left</th></tr></thead>
              <tbody>
                {(risk.data ?? []).map((r) => (
                  <tr key={r.incidentId}>
                    <td><Link to={`/incidents/${r.incidentId}`} className="mono">{r.incidentId}</Link> <PriorityBadge p={r.priority} /><div className="small">{r.title}</div><div className="small muted">{r.reasons.join(' · ')}</div></td>
                    <td><span className={`badge ${r.level === 'BREACHED' || r.level === 'HIGH' ? 'sla-BREACHED' : r.level === 'MEDIUM' ? 'sla-AT_RISK' : 'sla-MET'}`}>{r.level} {Math.round(r.riskScore * 100)}%</span></td>
                    <td className="small">{r.minutesLeft} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>🚨 Recorded SLA violations</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Incident</th><th>Breach</th><th>Escalation</th></tr></thead>
              <tbody>
                {(violations.data ?? []).map((v) => (
                  <tr key={v.id}>
                    <td><Link to={`/incidents/${v.id}`} className="mono">{v.id}</Link> <PriorityBadge p={v.priority} /><div className="small">{v.title}</div><div className="small muted">{v.status} · due {fmt(v.resolutionDueAt)}</div></td>
                    <td className="small">{v.responseBreached && <div>Response</div>}{v.resolutionBreached && <div>Resolution</div>}</td>
                    <td>{v.escalationLevel > 0 ? <span className="badge esc">L{v.escalationLevel}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
