import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';
import { Priority, PRIORITY_LABEL, SlaStatus, Status } from '../types';

export const PriorityBadge = ({ p }: { p: Priority | null }) =>
  p ? <span className={`badge ${p}`}>{p} · {PRIORITY_LABEL[p]}</span> : <span className="badge status">—</span>;

export const StatusBadge = ({ s }: { s: Status }) => <span className={`badge status ${s}`}>{s.replace('_', ' ')}</span>;

export const SlaBadge = ({ s }: { s: SlaStatus }) => <span className={`badge sla-${s}`}>SLA {s.replace('_', ' ').toLowerCase()}</span>;

export const Stars = ({ n }: { n: number }) => <span className="stars">{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>;

export const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};
export const minutes = (m: number | null | undefined) => (m == null ? '—' : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'danger' | 'warn' | 'ok' | 'accent' }) {
  return (
    <div className={`card stat ${tone ?? ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error);
  const code = error instanceof ApiError ? error.code : null;
  return (
    <div className="alert error">
      {code && <b className="mono">{code}: </b>}
      {msg}
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Small data-loading hook: returns data, error, loading and a reload function. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [load]);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    const h = () => reload();
    window.addEventListener('itsm:refresh', h);
    return () => window.removeEventListener('itsm:refresh', h);
  }, [reload]);
  return { data, error, loading, reload, setData };
}

export function Lifecycle({ status }: { status: Status }) {
  const steps: Status[] = ['NEW', 'CLASSIFIED', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'CLOSED'];
  const idx = status === 'PENDING_INFO' ? steps.indexOf('IN_PROGRESS') : steps.indexOf(status);
  return (
    <div className="lifecycle">
      {steps.map((s, i) => (
        <span key={s} className={i < idx ? 'done' : i === idx ? 'current' : ''}>
          {i === idx && status === 'PENDING_INFO' ? 'PENDING INFO' : s.replace('_', ' ')}
        </span>
      ))}
    </div>
  );
}

export function SlaBar({ pct, status }: { pct: number | null; status: SlaStatus }) {
  if (pct == null) return <span className="muted small">No SLA</span>;
  const tone = status === 'BREACHED' ? 'danger' : status === 'AT_RISK' ? 'warn' : '';
  return (
    <div title={`${pct}% of resolution time used`}>
      <div className={`progress ${tone}`}>
        <div style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="small muted">{pct}% of window used</div>
    </div>
  );
}
