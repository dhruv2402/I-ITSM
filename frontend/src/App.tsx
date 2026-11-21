import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import AuditLog from './pages/admin/AuditLog';
import Categories from './pages/admin/Categories';
import Services from './pages/admin/Services';
import Settings from './pages/admin/Settings';
import SlaCenter from './pages/admin/SlaCenter';
import SlaPolicies from './pages/admin/SlaPolicies';
import Users from './pages/admin/Users';
import Dashboard from './pages/Dashboard';
import IncidentDetail from './pages/IncidentDetail';
import IncidentList from './pages/IncidentList';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Reports from './pages/Reports';
import ReportIncident from './pages/ReportIncident';
import Workload from './pages/Workload';

export default function App() {
  const { user, loading, can } = useAuth();
  if (loading) return <div className="empty">Loading I-ITSM…</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  const isTech = user.role === 'TECHNICIAN' || user.role === 'TEAM_LEAD';
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/report" element={<ReportIncident />} />
        <Route path="/incidents" element={<IncidentList />} />
        <Route path="/incidents/:id" element={<IncidentDetail />} />
        <Route path="/profile" element={<Profile />} />
        {isTech && <Route path="/workload" element={<Workload />} />}
        {can('REPORT_VIEW') && <Route path="/reports" element={<Reports />} />}
        {can('REPORT_VIEW') && <Route path="/sla" element={<SlaCenter />} />}
        {can('USER_MANAGE') && <Route path="/admin/users" element={<Users />} />}
        {can('CONFIG_MANAGE') && <Route path="/admin/services" element={<Services />} />}
        {can('CONFIG_MANAGE') && <Route path="/admin/categories" element={<Categories />} />}
        {can('CONFIG_MANAGE') && <Route path="/admin/sla-policies" element={<SlaPolicies />} />}
        {can('CONFIG_MANAGE') && <Route path="/admin/settings" element={<Settings />} />}
        {can('AUDIT_VIEW') && <Route path="/admin/audit" element={<AuditLog />} />}
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<div className="empty">Page not found or not available for your role.</div>} />
      </Routes>
    </Layout>
  );
}
