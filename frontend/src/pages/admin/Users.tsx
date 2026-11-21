import { useState } from 'react';
import { api } from '../../api';
import { ErrorAlert, Modal, useLoad } from '../../components/ui';
import { Category, Role, User } from '../../types';

const ROLES: Role[] = ['EMPLOYEE', 'TECHNICIAN', 'TEAM_LEAD', 'ADMIN', 'MANAGER'];
const BLANK = { name: '', email: '', password: '', role: 'TECHNICIAN' as Role, phone: '', department: '', skills: [] as string[], maxWorkload: 5, experienceYears: 1 };

export default function Users() {
  const [role, setRole] = useState('');
  const users = useLoad(() => api<User[]>(`/admin/users${role ? `?role=${role}` : ''}`), [role]);
  const techs = useLoad(() => api<User[]>('/technicians'), []);
  const cats = useLoad(() => api<Category[]>('/categories'), []);
  const [edit, setEdit] = useState<User | 'new' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const workload = new Map((techs.data ?? []).map((t) => [t.id, t.activeWorkload ?? 0]));

  const toggleActive = async (u: User) => {
    setError(null);
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
      users.reload();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Users & technicians</h1><div className="muted">Create accounts, manage roles, technician skills, capacity and availability.</div></div>
        <div className="row">
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 170 }}><option value="">All roles</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
          <button className="btn" onClick={() => setEdit('new')}>➕ New user</button>
        </div>
      </div>
      <ErrorAlert error={error ?? users.error} />
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Role</th><th>E-mail</th><th>Skills</th><th>Workload</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(users.data ?? []).map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.id}</td>
                  <td>{u.name}<div className="small muted">{u.department}</div></td>
                  <td><span className="badge soft">{u.title}</span></td>
                  <td className="small">{u.email}</td>
                  <td>{(u.skills ?? []).map((s) => <span key={s} className="chip">{s}</span>)}</td>
                  <td>{u.maxWorkload ? `${workload.get(u.id) ?? 0} / ${u.maxWorkload}` : '—'}{u.available === false && <div className="small muted">unavailable</div>}</td>
                  <td>{u.active ? <span className="badge sla-MET">active</span> : <span className="badge sla-BREACHED">deactivated</span>}</td>
                  <td className="row">
                    <button className="btn sm secondary" onClick={() => setEdit(u)}>Edit</button>
                    <button className="btn sm ghost" onClick={() => toggleActive(u)}>{u.active ? 'Deactivate' : 'Activate'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {edit && <UserDialog user={edit === 'new' ? null : edit} categories={(cats.data ?? []).map((c) => c.id)} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); users.reload(); techs.reload(); }} />}
    </>
  );
}

function UserDialog({ user, categories, onClose, onSaved }: { user: User | null; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(user ? { ...BLANK, ...user, password: '', phone: user.phone ?? '', department: user.department ?? '', skills: user.skills ?? [], maxWorkload: user.maxWorkload ?? 5, experienceYears: user.experienceYears ?? 1 } : BLANK);
  const [available, setAvailable] = useState(user?.available ?? true);
  const [error, setError] = useState<unknown>(null);
  const isTech = f.role === 'TECHNICIAN' || f.role === 'TEAM_LEAD';
  const save = async () => {
    setError(null);
    try {
      if (user) {
        await api(`/admin/users/${user.id}`, {
          method: 'PATCH',
          body: { name: f.name, phone: f.phone, department: f.department, role: f.role, ...(isTech ? { skills: f.skills, maxWorkload: Number(f.maxWorkload), experienceYears: Number(f.experienceYears), available } : {}) },
        });
        if (f.password) await api(`/admin/users/${user.id}/reset-password`, { body: { password: f.password } });
      } else {
        await api('/admin/users', { body: { ...f, maxWorkload: Number(f.maxWorkload), experienceYears: Number(f.experienceYears), ...(isTech ? {} : { skills: undefined, maxWorkload: undefined, experienceYears: undefined }) } });
      }
      onSaved();
    } catch (e) {
      setError(e);
    }
  };
  const toggleSkill = (s: string) => setF({ ...f, skills: f.skills.includes(s) ? f.skills.filter((x) => x !== s) : [...f.skills, s] });
  return (
    <Modal title={user ? `Edit ${user.name}` : 'New user'} onClose={onClose}>
      <ErrorAlert error={error} />
      <div className="grid grid-2">
        <div className="field"><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label>E-mail</label><input value={f.email} disabled={!!user} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label>Role</label><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div className="field"><label>{user ? 'New password (optional)' : 'Password'}</label><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></div>
        <div className="field"><label>Phone (for SMS)</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+91…" /></div>
        <div className="field"><label>Department</label><input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></div>
      </div>
      {isTech && (
        <>
          <div className="field"><label>Skills (incident categories)</label><div>{categories.map((c) => <button key={c} type="button" className={`btn sm ${f.skills.includes(c) ? '' : 'secondary'}`} style={{ margin: 2 }} onClick={() => toggleSkill(c)}>{c}</button>)}</div></div>
          <div className="grid grid-3">
            <div className="field"><label>Max workload</label><input type="number" min={1} max={50} value={f.maxWorkload} onChange={(e) => setF({ ...f, maxWorkload: Number(e.target.value) })} /></div>
            <div className="field"><label>Experience (years)</label><input type="number" min={0} max={60} value={f.experienceYears} onChange={(e) => setF({ ...f, experienceYears: Number(e.target.value) })} /></div>
            {user && <div className="field"><label>Available</label><select value={String(available)} onChange={(e) => setAvailable(e.target.value === 'true')}><option value="true">Yes</option><option value="false">No</option></select></div>}
          </div>
        </>
      )}
      <button className="btn" onClick={save}>Save</button>
    </Modal>
  );
}
