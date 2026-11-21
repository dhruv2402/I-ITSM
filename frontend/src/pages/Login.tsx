import { FormEvent, useState } from 'react';
import { useAuth } from '../auth';
import { ErrorAlert } from '../components/ui';

const DEMO = [
  { label: 'Employee / Customer', email: 'employee@itsm.demo' },
  { label: 'Technician / Support Engineer', email: 'technician@itsm.demo' },
  { label: 'Administrator / IT Manager', email: 'admin@itsm.demo' },
];

export default function Login() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (tab === 'login') await login(email, password);
      else await register({ name, email, password, department });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <h1>I-ITSM Service Desk</h1>
        <p>Report, prioritise, assign and resolve IT incidents with automatic prioritisation, smart technician assignment, SLA monitoring, duplicate detection and root-cause correlation.</p>
        <ul style={{ lineHeight: 1.9 }}>
          <li>Automatic priority: impact × urgency × business criticality</li>
          <li>Smart assignment strategies & automatic escalation</li>
          <li>Real-time notifications (in-app, e-mail, SMS)</li>
          <li>Complete audit trail of every action</li>
        </ul>
      </div>
      <div className="login-panel">
        <div className="card login-card">
          <div className="tabs">
            <button className={`tab ${tab === 'login' ? 'active' : ''}`} onClick={() => setTab('login')}>Sign in</button>
            <button className={`tab ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>Create employee account</button>
          </div>
          <ErrorAlert error={error} />
          <form onSubmit={submit}>
            {tab === 'register' && (
              <>
                <div className="field">
                  <label htmlFor="name">Full name</label>
                  <input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
                </div>
                <div className="field">
                  <label htmlFor="dept">Department</label>
                  <input id="dept" value={department} onChange={(e) => setDepartment(e.target.value)} />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
            </div>
            <div className="field">
              <label htmlFor="pw">Password</label>
              <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={tab === 'login' ? 'current-password' : 'new-password'} />
              {tab === 'register' && <div className="hint">At least 8 characters with a letter and a digit.</div>}
            </div>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Please wait…' : tab === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
          {tab === 'login' && (
            <div style={{ marginTop: 18 }}>
              <div className="small muted" style={{ marginBottom: 6 }}>Demo accounts (password <span className="mono">Password@123</span>) — click to fill:</div>
              <div className="demo-users">
                {DEMO.map((d) => (
                  <button key={d.email} type="button" onClick={() => { setEmail(d.email); setPassword('Password@123'); }}>
                    <b>{d.label}</b>
                    <span className="muted">{d.email}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
