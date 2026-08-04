import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/** Blocks private routes until Firebase confirms a verified account.
 *
 *  With `requireSuperAdmin`, additionally requires the profile's server-computed
 *  isSuperAdmin flag (the SUPER_ADMIN_EMAILS allowlist). This is a courtesy
 *  redirect, not the enforcement — /api/admin and /api/platform re-check the
 *  allowlist on every request and answer 403 regardless of what the client
 *  renders.
 */
export default function ProtectedRoute({
  children,
  requireSuperAdmin = false,
}: {
  children: ReactNode;
  requireSuperAdmin?: boolean;
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
  if (requireSuperAdmin) {
    // A transient /api/auth/me failure leaves status 'authenticated' with a
    // null profile. Rendering nothing (like 'loading' above) instead of
    // redirecting means a real operator on a flaky connection sees a blank
    // beat, not a bounce to /home they have to navigate back from.
    if (profile === null) return null;
    if (!profile.isSuperAdmin) return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}
