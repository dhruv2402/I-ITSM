import { useState } from 'react';
import { api } from '../../api';
import { ErrorAlert, Modal, useLoad } from '../../components/ui';
import { ItService, PRIORITIES, Priority, SlaPolicy } from '../../types';

const BLANK: SlaPolicy = { id: '', name: '', priority: 'P2', serviceId: null, responseMinutes: 15, resolutionMinutes: 120, warningThresholdPct: 75, active: true };
const h = (m: number) => (m < 60 ? `${m} min` : `${+(m / 60).toFixed(1)} h`);

export default function SlaPolicies() {
  const list = useLoad(() => api<SlaPolicy[]>('/sla-policies'), []);
  const services = useLoad(() => api<ItService[]>('/services'), []);
  const [edit, setEdit] = useState<{ p: SlaPolicy; isNew: boolean } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const save = async () => {
    if (!edit) return;
    setError(null);
    const { id, ...body } = edit.p;
    try {
      if (edit.isNew) await api('/admin/sla-policies', { body });
      else await api(`/admin/sla-policies/${id}`, { method: 'PATCH', body });
      setEdit(null);
      list.reload();
    } catch (e) {
      setError(e);
    }
  };
  const remove = async (p: SlaPolicy) => {
    if (!confirm(`Delete SLA policy "${p.name}"?`)) return;
    try {
      await api(`/admin/sla-policies/${p.id}`, { method: 'DELETE' });
      list.reload();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <>
      <div className="page-head">
        <div><h1>SLA policies</h1><div className="muted">Default targets per priority, optionally overridden per IT service. Service-specific policies win over defaults.</div></div>
        <button className="btn" onClick={() => setEdit({ p: BLANK, isNew: true })}>➕ New SLA policy</button>
      </div>
      <ErrorAlert error={error} />
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Priority</th><th>Applies to</th><th>Response target</th><th>Resolution target</th><th>Warning at</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(list.data ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td><span className={`badge ${p.priority}`}>{p.priority}</span></td>
                <td>{p.serviceId ?? <span className="muted">All services (default)</span>}</td>
                <td>{h(p.responseMinutes)}</td>
                <td>{h(p.resolutionMinutes)}</td>
                <td>{p.warningThresholdPct}%</td>
                <td>{p.active ? 'Active' : 'Inactive'}</td>
                <td className="row">
                  <button className="btn sm secondary" onClick={() => setEdit({ p, isNew: false })}>Edit</button>
                  {p.serviceId && <button className="btn sm ghost" onClick={() => remove(p)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.isNew ? 'New SLA policy' : `Edit ${edit.p.name}`} onClose={() => setEdit(null)}>
          <ErrorAlert error={error} />
          <div className="grid grid-2">
            <div className="field"><label>Name</label><input value={edit.p.name} onChange={(e) => setEdit({ ...edit, p: { ...edit.p, name: e.target.value } })} /></div>
            <div className="field"><label>Priority</label><select value={edit.p.priority} onChange={(e) => setEdit({ ...edit, p: { ...edit.p, priority: e.target.value as Priority } })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></div>
            <div className="field"><label>Service</label><select value={edit.p.serviceId ?? ''} onChange={(e) => setEdit({ ...edit, p: { ...edit.p, serviceId: e.target.value || null } })}><option value="">All services (default)</option>{(services.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="field"><label>Warning threshold (%)</label><input type="number" min={10} max={99} value={edit.p.warningThresholdPct} onChange={(e) => setEdit({ ...edit, p: { ...edit.p, warningThresholdPct: Number(e.target.value) } })} /></div>
            <div className="field"><label>Response target (minutes)</label><input type="number" min={1} value={edit.p.responseMinutes} onChange={(e) => setEdit({ ...edit, p: { ...edit.p, responseMinutes: Number(e.target.value) } })} /></div>
            <div className="field"><label>Resolution target (minutes)</label><input type="number" min={1} value={edit.p.resolutionMinutes} onChange={(e) => setEdit({ ...edit, p: { ...edit.p, resolutionMinutes: Number(e.target.value) } })} /></div>
            <div className="field"><label>Status</label><select value={String(edit.p.active)} onChange={(e) => setEdit({ ...edit, p: { ...edit.p, active: e.target.value === 'true' } })}><option value="true">Active</option><option value="false">Inactive</option></select></div>
          </div>
          <button className="btn" onClick={save}>Save</button>
        </Modal>
      )}
    </>
  );
}
