import { FormEvent, useState } from 'react';
import { useAuth } from '../auth';
import { ErrorAlert } from '../components/ui';

const DEMO = [
  { label: 'Employee / Customer', email: 'employee@itsm.demo' },
  { label: 'Technician / Support Engineer', email: 'technician@itsm.demo' },
  { label: 'Administrator / IT Manager', email: 'admin@itsm.demo' },
];

const MODULES = [
  { icon: '⚡', title: 'Auto-priority', text: 'Impact × urgency × criticality', color: '#dc2626' },
  { icon: '🧠', title: 'Smart assignment', text: 'Skills, workload, experience', color: '#0d9488' },
  { icon: '⏱️', title: 'SLA & escalation', text: 'Warnings, breaches, 4-level chain', color: '#d97706' },
  { icon: '🔔', title: 'Live alerts', text: 'In-app · e-mail · SMS', color: '#7c3aed' },
];

const STATS = [
  { value: '7', label: 'AI features' },
  { value: '4', label: 'assignment strategies' },
  { value: '3', label: 'notification channels' },
  { value: '100%', label: 'actions audited' },
];

const FLOW = ['Report', 'Classify', 'Prioritise', 'Assign', 'Resolve', 'Close'];

/** Lifecycle figure: the stages every incident passes through. */
function LifecycleFigure() {
  return (
    <div className="hero-flow" aria-label="Incident lifecycle">
      {FLOW.map((s, i) => (
        <div key={s} className="hero-flow-step">
          <div className="hero-flow-dot">{i + 1}</div>
          <div className="hero-flow-label">{s}</div>
        </div>
      ))}
    </div>
  );
}

/** Priority matrix figure: impact × urgency for a criticality-3 service (Matrix strategy thresholds). */
function PriorityMatrix() {
  const pri = (i: number, u: number) => {
    const score = i * u * 3;
    return score >= 36 ? 'P1' : score >= 18 ? 'P2' : score >= 8 ? 'P3' : 'P4';
  };
  return (
    <div className="hero-matrix">
      <div className="hero-matrix-title">Priority matrix</div>
      <div className="hero-matrix-grid">
        {[4, 3, 2, 1].map((i) =>
          [1, 2, 3, 4].map((u) => {
            const p = pri(i, u);
            return (
              <div key={`${i}-${u}`} className={`hero-cell ${p}`} title={`Impact ${i}, urgency ${u} → ${p}`}>
                {p}
              </div>
            );
          }),
        )}
      </div>
      <div className="hero-matrix-axes">
        <span>Urgency →</span>
        <span>↑ Impact</span>
      </div>
    </div>
  );
}

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
        <div className="hero-brand">
          <div className="brand-logo">IT</div>
          <div>
            <div className="hero-title">I-ITSM Service Desk</div>
            <div className="hero-sub">Intelligent incident management</div>
          </div>
        </div>

        <LifecycleFigure />

        <div className="hero-grid">
          {MODULES.map((m) => (
            <div key={m.title} className="hero-tile">
              <div className="hero-icon" style={{ background: m.color }}>{m.icon}</div>
              <div>
                <div className="hero-tile-title">{m.title}</div>
                <div className="hero-tile-text">{m.text}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="hero-row">
          <PriorityMatrix />
          <div className="hero-stats">
            {STATS.map((s) => (
              <div key={s.label} className="hero-stat">
                <div className="hero-stat-value">{s.value}</div>
                <div className="hero-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
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
