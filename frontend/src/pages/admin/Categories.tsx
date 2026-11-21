import { useState } from 'react';
import { api } from '../../api';
import { ErrorAlert, Modal, useLoad } from '../../components/ui';
import { Category } from '../../types';

export default function Categories() {
  const list = useLoad(() => api<Category[]>('/categories'), []);
  const [edit, setEdit] = useState<{ c: Category; isNew: boolean; kw: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const save = async () => {
    if (!edit) return;
    setError(null);
    const body = { ...edit.c, keywords: edit.kw.split(',').map((k) => k.trim()).filter(Boolean) };
    try {
      if (edit.isNew) await api('/admin/categories', { body });
      else {
        const { id, ...rest } = body;
        await api(`/admin/categories/${id}`, { method: 'PATCH', body: rest });
      }
      setEdit(null);
      list.reload();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <>
      <div className="page-head">
        <div><h1>Incident categories</h1><div className="muted">New categories work immediately: their keywords drive the AI category suggestion and technicians can list them as skills.</div></div>
        <button className="btn" onClick={() => setEdit({ c: { id: '', name: '', description: '', keywords: [], active: true }, isNew: true, kw: '' })}>➕ New category</button>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Keywords</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(list.data ?? []).map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.id}</td>
                <td>{c.name}</td>
                <td>{c.keywords.map((k) => <span key={k} className="chip">{k}</span>)}</td>
                <td>{c.active ? 'Active' : 'Inactive'}</td>
                <td><button className="btn sm secondary" onClick={() => setEdit({ c, isNew: false, kw: c.keywords.join(', ') })}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.isNew ? 'New category' : `Edit ${edit.c.name}`} onClose={() => setEdit(null)}>
          <ErrorAlert error={error} />
          <div className="field"><label>Code</label><input value={edit.c.id} disabled={!edit.isNew} onChange={(e) => setEdit({ ...edit, c: { ...edit.c, id: e.target.value.toUpperCase() } })} placeholder="TELEPHONY" /></div>
          <div className="field"><label>Name</label><input value={edit.c.name} onChange={(e) => setEdit({ ...edit, c: { ...edit.c, name: e.target.value } })} /></div>
          <div className="field"><label>Keywords (comma separated)</label><textarea value={edit.kw} onChange={(e) => setEdit({ ...edit, kw: e.target.value })} placeholder="desk phone, voip, extension" /></div>
          <div className="field"><label>Status</label><select value={String(edit.c.active)} onChange={(e) => setEdit({ ...edit, c: { ...edit.c, active: e.target.value === 'true' } })}><option value="true">Active</option><option value="false">Inactive</option></select></div>
          <button className="btn" onClick={save}>Save</button>
        </Modal>
      )}
    </>
  );
}
