import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/** Blocks private routes until Firebase confirms a verified account.
 *
 *  `requireAdmin` adds the ADMIN_EMAILS allowlist on top, read from the profile
 *  the server derives with isAdminEmail(). That flag is a UI hint and not a
 *  security boundary — the server re-checks every admin endpoint itself — but
 *  it keeps a developer-facing page from being one URL guess away for any
 *  signed-in player.
 *
 *  It fails closed. `status` only reaches 'authenticated' once the profile
 *  fetch has settled, so this cannot flash; but when that fetch failed
 *  transiently the profile is null, and a real admin is turned away rather than
 *  let through on a missing answer. That matches the server middleware, where
 *  an unset allowlist denies everyone.
 */
export default function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children: ReactNode;
  requireAdmin?: boolean;
}) {
  const { status, profile } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return null; // initial Firebase callback hasn't fired — avoid a redirect flash
  }
  if (status === 'signed-out') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (status === 'unverified') {
    return (
      <Navigate
        to="/verify-email"
        state={{ from: location.pathname }}
        replace
      />
    );
  }
  // Home rather than /login: they are signed in, so the login page would bounce
  // them straight back and read as a loop.
  if (requireAdmin && !profile?.isAdmin) {
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}
