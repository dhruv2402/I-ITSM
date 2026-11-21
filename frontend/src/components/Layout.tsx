import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api, tokenStore } from '../api';
import { portalOf, useAuth } from '../auth';
import { NotificationItem } from '../types';
import { ago } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  show?: boolean;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, can } = useAuth();
  const nav = useNavigate();
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; title: string; severity: string }[]>([]);
  const dropRef = useRef<HTMLDivElement>(null);

  const loadNotifs = async () => {
    try {
      const r = await api<{ items: NotificationItem[]; unread: number }>('/notifications');
      setNotifs(r.items);
      setUnread(r.unread);
    } catch {
      /* ignore */
    }
  };

  // Real-time: Server-Sent Events push notifications + incident changes
  useEffect(() => {
    loadNotifs();
    const token = tokenStore.get();
    if (!token) return;
    const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener('notification', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, title: d.title, severity: d.severity }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
      loadNotifs();
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    es.addEventListener('incident', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => window.dispatchEvent(new Event('itsm:refresh')), 400);
    });
    return () => es.close();
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!user) return null;
  const portal = portalOf(user.role);
  const isTech = user.role === 'TECHNICIAN' || user.role === 'TEAM_LEAD';

  const items: (NavItem | string)[] =
    portal === 'employee'
      ? [
          { to: '/', label: 'Home', icon: '🏠' },
          { to: '/report', label: 'Report an incident', icon: '➕' },
          { to: '/incidents', label: 'My incidents', icon: '📋' },
        ]
      : portal === 'technician'
        ? [
            { to: '/', label: 'Dashboard', icon: '📊' },
            { to: '/workload', label: 'My workload', icon: '🧰', show: isTech },
            { to: '/incidents', label: user.role === 'TEAM_LEAD' ? 'All incidents' : 'Assigned incidents', icon: '📋' },
            { to: '/sla', label: 'SLA & correlations', icon: '⏱️', show: can('REPORT_VIEW') },
            { to: '/reports', label: 'Reports', icon: '📈', show: can('REPORT_VIEW') },
            { to: '/report', label: 'Report an incident', icon: '➕' },
          ]
        : [
            { to: '/', label: 'Operations dashboard', icon: '📊' },
            { to: '/incidents', label: 'Incident monitor', icon: '📋' },
            { to: '/sla', label: 'SLA & correlations', icon: '⏱️' },
            { to: '/reports', label: 'Reports & analytics', icon: '📈' },
            'Administration',
            { to: '/admin/users', label: 'Users & technicians', icon: '👥', show: can('USER_MANAGE') },
            { to: '/admin/services', label: 'IT services', icon: '🖧', show: can('CONFIG_MANAGE') },
            { to: '/admin/categories', label: 'Categories', icon: '🏷️', show: can('CONFIG_MANAGE') },
            { to: '/admin/sla-policies', label: 'SLA policies', icon: '📜', show: can('CONFIG_MANAGE') },
            { to: '/admin/settings', label: 'Strategies & system', icon: '⚙️', show: can('CONFIG_MANAGE') },
            { to: '/admin/audit', label: 'Audit log', icon: '🧾', show: can('AUDIT_VIEW') },
          ];

  const openNotif = async (n: NotificationItem) => {
    if (!n.read) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => null);
    setOpen(false);
    loadNotifs();
    if (n.incidentId) nav(`/incidents/${n.incidentId}`);
  };

  return (
    <div className={`shell portal-${portal}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">IT</div> I-ITSM
        </div>
        <div className="portal-tag">{portal === 'employee' ? 'Employee portal' : portal === 'technician' ? 'Support workspace' : 'IT management console'}</div>
        {items.map((it, i) =>
          typeof it === 'string' ? (
            <div key={i} className="nav-section">{it}</div>
          ) : it.show === false ? null : (
            <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <span>{it.icon}</span> {it.label}
            </NavLink>
          ),
        )}
        <div className="sidebar-footer">
          <div style={{ color: '#fff', fontWeight: 600 }}>{user.name}</div>
          <div className="small">{user.title} · {user.id}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <NavLink to="/profile" className="small" style={{ color: 'inherit' }}>Profile</NavLink>
            <button className="btn ghost sm" style={{ color: 'inherit' }} onClick={() => { logout(); nav('/'); }}>Log out</button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="muted small">Intelligent IT Service Management &amp; Incident Resolution System</div>
          <div className="row" ref={dropRef} style={{ position: 'relative' }}>
            <button className="bell" onClick={() => setOpen(!open)} aria-label="Notifications">
              🔔{unread > 0 && <span className="count">{unread}</span>}
            </button>
            {open && (
              <div className="dropdown">
                <div className="spread" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <b>Notifications</b>
                  <button className="btn ghost sm" onClick={async () => { await api('/notifications/read-all', { method: 'POST' }); loadNotifs(); }}>Mark all read</button>
                </div>
                {notifs.length === 0 && <div className="empty">No notifications yet</div>}
                {notifs.map((n) => (
                  <div key={n.id} className={`notif ${n.read ? '' : 'unread'} ${n.severity}`} onClick={() => openNotif(n)}>
                    <div style={{ fontWeight: 600 }}>{n.title}</div>
                    <div className="muted">{n.message}</div>
                    <div className="small muted">{ago(n.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.severity}`}>🔔 {t.title}</div>
        ))}
      </div>
    </div>
  );
}
