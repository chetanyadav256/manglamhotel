import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { LoaderCircle, LockKeyhole } from 'lucide-react';
import { useAdminAuth } from '../app/useAdminAuth.js';
import AdminMetadata from '../components/seo/AdminMetadata.jsx';
import '../styles/admin.css';

export default function AdminLoginPage() {
  const { status, error, login } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  if (status === 'loading') {
    return <main className="admin-loading" role="status">Checking administrator session…</main>;
  }
  if (status === 'authenticated') return <Navigate to="/admin" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    if (!email.trim() || !password) {
      setFormError('Enter your email address and password.');
      return;
    }

    setSubmitting(true);
    const authenticated = await login({ email, password });
    setSubmitting(false);
    if (authenticated) navigate(location.state?.from || '/admin', { replace: true });
  }

  const message = formError || error;

  return (
    <main className="admin-login-page">
      <a href="#admin-login-form" className="skip-link">Skip to sign in</a>
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <AdminMetadata />
        <Link className="admin-brand" to="/" aria-label="Manglam Hotel & Restaurant home">
          <span>MANGLAM<span className="brand-dot">.</span></span>
          <small>HOTEL &amp; RESTAURANT</small>
        </Link>
        <span className="admin-login-icon" aria-hidden="true"><LockKeyhole size={22} /></span>
        <p className="eyebrow">Secure administration</p>
        <h1 id="admin-login-title">Welcome back</h1>
        <p className="admin-login-intro">Sign in to continue to the Manglam management dashboard.</p>
        <form id="admin-login-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="admin-email">Email address</label>
          <input
            id="admin-email"
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck="false"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={message ? 'admin-login-error' : undefined}
          />
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={message ? 'admin-login-error' : undefined}
          />
          {message && <p id="admin-login-error" className="admin-form-error" role="alert">{message}</p>}
          <button type="submit" className="button button-primary admin-login-submit" disabled={submitting}>
            {submitting && <LoaderCircle className="admin-spinner" size={17} aria-hidden="true" />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="admin-login-note">Administrator access only.</p>
      </section>
    </main>
  );
}
