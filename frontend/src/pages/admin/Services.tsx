import { useState } from 'react';
import { api } from '../../api';
import { ErrorAlert, Modal, useLoad } from '../../components/ui';
import { ItService, LEVELS } from '../../types';

const BLANK: ItService = { id: '', name: '', description: '', businessCriticality: 3, ownerTeam: '', userBase: 100, dependsOn: [], active: true };

export default function Services() {
  const list = useLoad(() => api<ItService[]>('/services'), []);
  const [edit, setEdit] = useState<{ s: ItService; isNew: boolean } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const all = list.data ?? [];
  const save = async () => {
    if (!edit) return;
    setError(null);
    try {
      const { id, ...rest } = edit.s;
      if (edit.isNew) await api('/admin/services', { body: edit.s });
      else await api(`/admin/services/${id}`, { method: 'PATCH', body: rest });
      setEdit(null);
      list.reload();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <>
      <div className="page-head">
        <div><h1>IT services</h1><div className="muted">Business criticality feeds the priority algorithm; dependencies feed root-cause correlation.</div></div>
        <button className="btn" onClick={() => setEdit({ s: BLANK, isNew: true })}>➕ New service</button>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Criticality</th><th>Users</th><th>Owner</th><th>Depends on</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {all.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.id}</td>
                <td>{s.name}<div className="small muted">{s.description}</div></td>
                <td>{LEVELS[s.businessCriticality - 1]?.label}</td>
                <td>{s.userBase}</td>
                <td>{s.ownerTeam}</td>
                <td className="small mono">{s.dependsOn.join(' → ') || '—'}</td>
                <td>{s.active ? 'Active' : 'Retired'}</td>
                <td><button className="btn sm secondary" onClick={() => setEdit({ s, isNew: false })}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.isNew ? 'New IT service' : `Edit ${edit.s.name}`} onClose={() => setEdit(null)}>
          <ErrorAlert error={error} />
          <div className="grid grid-2">
            <div className="field"><label>ID</label><input value={edit.s.id} disabled={!edit.isNew} onChange={(e) => setEdit({ ...edit, s: { ...edit.s, id: e.target.value.toUpperCase() } })} placeholder="SVC-XYZ" /></div>
            <div className="field"><label>Name</label><input value={edit.s.name} onChange={(e) => setEdit({ ...edit, s: { ...edit.s, name: e.target.value } })} /></div>
            <div className="field"><label>Business criticality</label><select value={edit.s.businessCriticality} onChange={(e) => setEdit({ ...edit, s: { ...edit.s, businessCriticality: Number(e.target.value) } })}>{LEVELS.map((l) => <option key={l.v} value={l.v}>{l.v} — {l.label}</option>)}</select></div>
            <div className="field"><label>User base</label><input type="number" min={0} value={edit.s.userBase} onChange={(e) => setEdit({ ...edit, s: { ...edit.s, userBase: Number(e.target.value) } })} /></div>
            <div className="field"><label>Owner team</label><input value={edit.s.ownerTeam} onChange={(e) => setEdit({ ...edit, s: { ...edit.s, ownerTeam: e.target.value } })} /></div>
            <div className="field"><label>Status</label><select value={String(edit.s.active)} onChange={(e) => setEdit({ ...edit, s: { ...edit.s, active: e.target.value === 'true' } })}><option value="true">Active</option><option value="false">Retired</option></select></div>
          </div>
          <div className="field"><label>Description</label><input value={edit.s.description} onChange={(e) => setEdit({ ...edit, s: { ...edit.s, description: e.target.value } })} /></div>
          <div className="field">
            <label>Depends on (upstream services)</label>
            <div>{all.filter((x) => x.id !== edit.s.id).map((x) => {
              const on = edit.s.dependsOn.includes(x.id);
              return <button key={x.id} type="button" className={`btn sm ${on ? '' : 'secondary'}`} style={{ margin: 2 }} onClick={() => setEdit({ ...edit, s: { ...edit.s, dependsOn: on ? edit.s.dependsOn.filter((d) => d !== x.id) : [...edit.s.dependsOn, x.id] } })}>{x.id}</button>;
            })}</div>
          </div>
          <button className="btn" onClick={save}>Save</button>
        </Modal>
      )}
    </>
  );
}
