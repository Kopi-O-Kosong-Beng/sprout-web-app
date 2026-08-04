import { useEffect, useRef, type ReactNode } from 'react';
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
  const { status, profile, refreshProfile } = useAuth();
  const location = useLocation();
  const retriedProfile = useRef(false);

  /*
    A transient /api/auth/me failure leaves status 'authenticated' with a null
    profile, and nothing else ever refetches it — the state is terminal, not a
    beat. One retry from here turns "operator sees a blank page until they
    sign out and back in" into a hiccup. Once per mount, so a genuinely dead
    backend cannot make this loop.
  */
  useEffect(() => {
    if (!requireSuperAdmin) return;
    if (status !== 'authenticated' || profile !== null) return;
    if (retriedProfile.current) return;
    retriedProfile.current = true;
    void refreshProfile();
  }, [requireSuperAdmin, status, profile, refreshProfile]);

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
    if (profile === null) {
      // Visible while the retry above resolves — a silent blank page reads as
      // a crash to the person staring at it.
      return (
        <p className="page-shell" role="status">
          Checking operator access…
        </p>
      );
    }
    if (!profile.isSuperAdmin) return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}
