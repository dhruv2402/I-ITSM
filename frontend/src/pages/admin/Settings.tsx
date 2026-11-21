import { useState } from 'react';
import { api } from '../../api';
import { ErrorAlert, useLoad } from '../../components/ui';
import { NotificationItem, StrategyInfo } from '../../types';

interface Settings { assignmentStrategies: StrategyInfo[]; priorityStrategies: StrategyInfo[] }
interface System { storage: string; emailProvider: string; emailSimulated: boolean; smsProvider: string; classifierTrainingSize: number; slaMonitorLastRun: { at: string; checked: number; warnings: number; breaches: number; escalations: number } | null; liveConnections: number; observers: string[] }

export default function SettingsPage() {
  const s = useLoad(() => api<Settings>('/admin/settings'), []);
  const sys = useLoad(() => api<System>('/admin/system'), []);
  const log = useLoad(() => api<NotificationItem[]>('/admin/notifications'), []);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState('');
  const change = async (body: Record<string, string>) => {
    setError(null);
    try {
      s.setData(await api<Settings>('/admin/settings', { method: 'PUT', body }));
      setSaved('Saved — new incidents use this strategy immediately.');
    } catch (e) {
      setError(e);
    }
  };
  return (
    <>
      <div className="page-head"><div><h1>Strategies & system</h1><div className="muted">Switch algorithms at runtime (Strategy pattern) and check integrations.</div></div></div>
      <ErrorAlert error={error ?? s.error} />
      {saved && <div className="alert success">{saved}</div>}
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>Technician assignment strategy</h2>
          {(s.data?.assignmentStrategies ?? []).map((x) => (
            <label key={x.key} className="card" style={{ padding: 12, marginBottom: 8, cursor: 'pointer', borderColor: x.active ? 'var(--accent)' : undefined, fontWeight: 400 }}>
              <div className="row"><input type="radio" name="assign" checked={x.active} onChange={() => change({ assignmentStrategy: x.key })} /> <b>{x.name}</b> <span className="mono small muted">{x.key}</span></div>
              <div className="small muted">{x.description}</div>
            </label>
          ))}
        </div>
        <div className="card">
          <h2>Priority algorithm</h2>
          {(s.data?.priorityStrategies ?? []).map((x) => (
            <label key={x.key} className="card" style={{ padding: 12, marginBottom: 8, cursor: 'pointer', borderColor: x.active ? 'var(--accent)' : undefined, fontWeight: 400 }}>
              <div className="row"><input type="radio" name="prio" checked={x.active} onChange={() => change({ priorityStrategy: x.key })} /> <b>{x.name}</b> <span className="mono small muted">{x.key}</span></div>
              <div className="small muted">{x.description}</div>
            </label>
          ))}
        </div>
      </div>
      {sys.data && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>System status</h2>
          <dl className="kv">
            <dt>Storage</dt><dd>{sys.data.storage === 'mongo' ? 'MongoDB (persistent)' : 'In-memory (demo mode)'}</dd>
            <dt>E-mail</dt><dd>{sys.data.emailProvider} {sys.data.emailSimulated ? '(simulated)' : '(real)'}</dd>
            <dt>SMS</dt><dd>{sys.data.smsProvider}</dd>
            <dt>AI classifier</dt><dd>trained on {sys.data.classifierTrainingSize} historical incidents</dd>
            <dt>SLA monitor</dt><dd>{sys.data.slaMonitorLastRun ? `last run ${new Date(sys.data.slaMonitorLastRun.at).toLocaleTimeString()} — checked ${sys.data.slaMonitorLastRun.checked}` : 'not run yet'}</dd>
            <dt>Live connections</dt><dd>{sys.data.liveConnections}</dd>
            <dt>Event observers</dt><dd>{sys.data.observers.map((o) => <span key={o} className="chip">{o}</span>)}</dd>
          </dl>
        </div>
      )}
      <div className="card">
        <h2>Notification delivery log</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>User</th><th>Channel</th><th>Status</th><th>Title</th></tr></thead>
            <tbody>
              {(log.data ?? []).slice(0, 60).map((n) => (
                <tr key={n.id}>
                  <td className="small mono">{new Date(n.createdAt).toLocaleString()}</td>
                  <td className="mono small">{n.userId}</td>
                  <td><span className="chip">{n.channel}</span></td>
                  <td><span className={`badge ${n.status === 'FAILED' ? 'sla-BREACHED' : 'sla-MET'}`}>{n.status}</span></td>
                  <td className="small">{n.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
