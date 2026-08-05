import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * Blocks the operator tools — Studio, API Test, Ticket Manager, Admin — behind
 * the superadmin grant.
 *
 * Presentational only, exactly like the nav filter it mirrors. The server
 * re-resolves the grant on every /api/admin and /api/platform request and
 * answers 403 regardless, so the worst a forged flag in devtools buys is a
 * page full of failed requests.
 *
 * A player who lands here by typing the URL is sent home rather than to
 * /login: they are already signed in, and a login form would invite them to
 * try credentials that cannot change the outcome.
 */
export default function SuperAdminRoute({ children }: { children: ReactNode }) {
  const { status, profile } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return null; // initial Firebase callback hasn't fired — avoid a redirect flash
  }
  if (status === 'signed-out') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (status === 'unverified') {
    return <Navigate to="/verify-email" state={{ from: location.pathname }} replace />;
  }
  // profile is null for a moment after a transient /api/auth/me failure. Wait
  // rather than bounce: redirecting on a network blip would throw an operator
  // out of the console mid-task.
  if (!profile) {
    return null;
  }
  if (!profile.isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
