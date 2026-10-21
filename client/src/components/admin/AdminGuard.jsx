import { Navigate, Outlet, useLocation } from 'react-router';
import { useAdminAuth } from '../../app/useAdminAuth.js';

export default function AdminGuard() {
  const { status, retry } = useAdminAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <main className="admin-loading" role="status">Checking administrator session…</main>;
  }
  if (status === 'error') {
    return (
      <main className="admin-loading" role="alert">
        <p>Admin services are temporarily unavailable.</p>
        <button type="button" className="button button-primary" onClick={retry}>
          Try again
        </button>
      </main>
    );
  }
  if (status !== 'authenticated') {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
