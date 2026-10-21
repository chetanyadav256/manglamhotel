import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { ArrowLeft, BedDouble, LayoutDashboard, LogOut, Settings2, Utensils } from 'lucide-react';
import { useAdminAuth } from '../../app/useAdminAuth.js';
import AdminMetadata from '../seo/AdminMetadata.jsx';
import '../../styles/admin.css';

const links = [
  { label: 'Overview', icon: LayoutDashboard, to: '/admin' },
  { label: 'Rooms Management', icon: BedDouble, to: '/admin/rooms' },
  { label: 'Restaurant Management', icon: Utensils, to: '/admin/restaurant' },
  { label: 'Website Settings', icon: Settings2, to: '/admin/settings' },
];

export default function AdminLayout() {
  const { admin, error, logout } = useAdminAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const contentRef = useRef(null);
  useEffect(() => { contentRef.current?.focus({ preventScroll: true }); }, [pathname]);

  async function handleLogout() {
    if (await logout()) navigate('/admin/login', { replace: true });
  }

  return (
    <main className="admin-dashboard">
      <AdminMetadata />
      <a href="#admin-content" className="skip-link">Skip to dashboard</a>
      <header className="admin-topbar">
        <Link className="admin-brand" to="/" aria-label="Manglam Hotel & Restaurant home"><span>MANGLAM<span className="brand-dot">.</span></span><small>HOTEL &amp; RESTAURANT</small></Link>
        <div className="admin-account"><span>{admin?.name || admin?.email}</span><button className="admin-logout" type="button" aria-label="Sign out" onClick={handleLogout}><LogOut size={17} aria-hidden="true" /><span>Sign out</span></button></div>
      </header>
      <div className="admin-dashboard-layout">
        <aside className="admin-sidebar" aria-label="Administration">
          <p className="admin-sidebar-label">Workspace</p>
          <nav aria-label="Admin navigation">
            {links.map(({ label, icon: Icon, to }) => (
              <NavLink key={label} to={to} end={to === '/admin'} className="admin-nav-item"><Icon size={18} aria-hidden="true" /><span>{label}</span></NavLink>
            ))}
          </nav>
          <Link className="admin-back-link" to="/"><ArrowLeft size={16} aria-hidden="true" />Back to website</Link>
        </aside>
        <section id="admin-content" ref={contentRef} tabIndex={-1} className="admin-dashboard-content outline-none">
          {error && <p className="admin-dashboard-error" role="alert">{error}</p>}
          <Outlet />
        </section>
      </div>
      <ScrollRestoration />
    </main>
  );
}
