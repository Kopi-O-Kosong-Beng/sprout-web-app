import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useNavigationLock } from '../../hooks/useNavigationLock';
import { SproutMark } from './PlantVisuals';

interface NavItem {
  to: string;
  label: string;
  requiresAuth: boolean;
  /** Hidden from non-admins rather than shown disabled: the disabled state
   *  reads as "log in to access", which would be a lie here — no amount of
   *  logging in gets a player past the server's ADMIN_EMAILS allowlist. */
  requiresAdmin?: boolean;
}

/** `/home` is the in-game hub; `/` is the public landing page. Scan is reached
 *  from the hub, which is where the game's own design puts it. */
const navItems: NavItem[] = [
  { to: '/', label: 'Home', requiresAuth: false },
  { to: '/home', label: 'Play', requiresAuth: true },
  { to: '/archive', label: 'Archive', requiresAuth: true },
  { to: '/battle', label: 'PVE Battle', requiresAuth: true },
  { to: '/studio', label: 'Studio', requiresAuth: true },
  { to: '/admin', label: 'Admin', requiresAuth: true, requiresAdmin: true },
  { to: '/contact', label: 'Contact', requiresAuth: false },
  { to: '/test', label: 'API Test', requiresAuth: false },
];

export default function AppHeader() {
  const { status, profile, firebaseUser, logout } = useAuth();
  const { isNavigationLocked } = useNavigationLock();
  const navigate = useNavigate();

  const signedIn = status === 'authenticated' || status === 'unverified';
  const identity = profile?.displayName ?? firebaseUser?.email ?? 'Account';

  async function handleLogout() {
    if (isNavigationLocked) return;
    await logout();
    navigate('/');
  }

  const navigationDisabledTitle = 'Battle setup is being saved';
  const brandContent = (
    <>
      <SproutMark />
      <span>Sprout</span>
    </>
  );

  return (
    <header className="site-header">
      {isNavigationLocked ? (
        <span
          className="brand-link is-disabled"
          aria-disabled="true"
          title={navigationDisabledTitle}
        >
          {brandContent}
        </span>
      ) : (
        <Link className="brand-link" to="/">
          {brandContent}
        </Link>
      )}

      <nav className="primary-nav" aria-label="Primary">
        {navItems
          .filter((item) => !item.requiresAdmin || profile?.isAdmin)
          .map((item) =>
            isNavigationLocked || (item.requiresAuth && !signedIn) ? (
              <span
                key={item.to}
                className="nav-link is-disabled"
                aria-disabled="true"
                title={
                  isNavigationLocked
                    ? navigationDisabledTitle
                    : 'Log in to access'
                }
              >
                {item.label}
              </span>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  isActive ? 'nav-link is-active' : 'nav-link'
                }
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
            <button
              className="text-link"
              type="button"
              disabled={isNavigationLocked}
              aria-disabled={isNavigationLocked || undefined}
              title={
                isNavigationLocked ? navigationDisabledTitle : undefined
              }
              onClick={handleLogout}
            >
              Log out
            </button>
          </>
        ) : (
          <>
            {isNavigationLocked ? (
              <span
                className="text-link is-disabled"
                aria-disabled="true"
                title={navigationDisabledTitle}
              >
                Log in
              </span>
            ) : (
              <Link className="text-link" to="/login">
                Log in
              </Link>
            )}
            <span className="header-divider" aria-hidden="true" />
            {isNavigationLocked ? (
              <span
                className="text-link is-disabled"
                aria-disabled="true"
                title={navigationDisabledTitle}
              >
                Sign up
              </span>
            ) : (
              <Link className="text-link" to="/signup">
                Sign up
              </Link>
            )}
          </>
        )}
      </div>
    </header>
  );
}
