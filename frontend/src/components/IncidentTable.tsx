import { useNavigate } from 'react-router-dom';
import { Incident } from '../types';
import { ago, PriorityBadge, SlaBadge, StatusBadge } from './ui';

export default function IncidentTable({ items, showReporter = true, showTech = true }: { items: Incident[]; showReporter?: boolean; showTech?: boolean }) {
  const nav = useNavigate();
  if (items.length === 0) return <div className="empty">No incidents found.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Priority</th>
            <th>Status</th>
            <th>SLA</th>
            <th>Category</th>
            <th>Service</th>
            {showReporter && <th>Reporter</th>}
            {showTech && <th>Technician</th>}
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="clickable" onClick={() => nav(`/incidents/${i.id}`)}>
              <td className="mono">{i.id}</td>
              <td>
                {i.title}
                {i.escalationLevel > 0 && <span className="badge esc" style={{ marginLeft: 6 }}>⬆ L{i.escalationLevel}</span>}
                {i.relatedIncidentIds.length > 0 && <span className="badge soft" style={{ marginLeft: 6 }}>🔗 {i.relatedIncidentIds.length}</span>}
              </td>
              <td><PriorityBadge p={i.priority} /></td>
              <td><StatusBadge s={i.status} /></td>
              <td><SlaBadge s={i.slaStatus} /></td>
              <td>{i.categoryCode ?? '—'}</td>
              <td className="mono small">{i.serviceId}</td>
              {showReporter && <td>{i.reporterName}</td>}
              {showTech && <td>{i.assignedTechnicianName ?? <span className="muted">Unassigned</span>}</td>}
              <td className="small muted">{ago(i.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
