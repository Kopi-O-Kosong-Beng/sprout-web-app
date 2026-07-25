import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/** Blocks private routes until Firebase confirms a verified account. */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
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
  return <>{children}</>;
}
