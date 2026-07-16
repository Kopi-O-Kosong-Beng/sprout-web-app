import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { SproutMark } from './PlantVisuals';

const navItems = [
  { to: '/', label: 'Home', requiresAuth: false },
  { to: '/archive', label: 'Archive', requiresAuth: true },
  { to: '/battle', label: 'PVE Battle', requiresAuth: true },
  { to: '/contact', label: 'Contact', requiresAuth: false },
  { to: '/test', label: 'API Test', requiresAuth: false },
];

export default function AppHeader() {
  const { status, profile, firebaseUser, logout } = useAuth();
  const navigate = useNavigate();

  const signedIn = status === 'authenticated' || status === 'unverified';
  const identity = profile?.displayName ?? firebaseUser?.email ?? 'Account';

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <header className="site-header">
      <Link className="brand-link" to="/">
        <SproutMark />
        <span>Sprout</span>
      </Link>

      <nav className="primary-nav" aria-label="Primary">
        {navItems.map((item) =>
          item.requiresAuth && !signedIn ? (
            <span
              key={item.to}
              className="nav-link is-disabled"
              aria-disabled="true"
              title="Log in to access"
            >
              {item.label}
            </span>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      <div className="header-actions">
        {signedIn ? (
          <>
            <span className="header-user" title={firebaseUser?.email ?? undefined}>
              {identity}
              {status === 'unverified' && <em> (unverified)</em>}
            </span>
            <span className="header-divider" aria-hidden="true" />
            <button className="text-link" type="button" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link className="text-link" to="/login">
              Log in
            </Link>
            <span className="header-divider" aria-hidden="true" />
            <Link className="text-link" to="/signup">
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
