import { FormEvent, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorAlert } from '../components/ui';

export default function Profile() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState(false);
  if (!user) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(false);
    try {
      await api('/auth/change-password', { body: { currentPassword: current, newPassword: next } });
      setOk(true);
      setCurrent('');
      setNext('');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>My profile</h2>
        <dl className="kv">
          <dt>ID</dt><dd className="mono">{user.id}</dd>
          <dt>Name</dt><dd>{user.name}</dd>
          <dt>E-mail</dt><dd>{user.email}</dd>
          <dt>Role</dt><dd>{user.title}</dd>
          <dt>Department</dt><dd>{user.department ?? '—'}</dd>
          <dt>Phone</dt><dd>{user.phone ?? '—'}</dd>
          <dt>Permissions</dt><dd>{user.permissions.map((p) => <span key={p} className="chip">{p}</span>)}</dd>
        </dl>
      </div>
      <form className="card" onSubmit={submit}>
        <h2>Change password</h2>
        <ErrorAlert error={error} />
        {ok && <div className="alert success">Password changed.</div>}
        <div className="field"><label>Current password</label><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" /></div>
        <div className="field"><label>New password</label><input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" /><div className="hint">At least 8 characters with a letter and a digit.</div></div>
        <button className="btn">Update password</button>
      </form>
    </div>
  );
}
