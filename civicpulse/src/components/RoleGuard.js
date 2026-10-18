import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NAV_ITEMS } from '../auth/roles';

export default function RoleGuard({ path, children }) {
  const { role } = useAuth();
  const item = NAV_ITEMS.find((nav) => nav.path === path);

  if (!item) return children;
  if (!item.roles.includes(role)) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return children;
}
