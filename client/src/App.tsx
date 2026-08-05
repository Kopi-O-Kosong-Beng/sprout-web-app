import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NavigationLockProvider } from './context/NavigationLockProvider';
import AppHeader from './components/common/AppHeader';
import ProtectedRoute from './components/common/ProtectedRoute';
import { ToastProvider } from './components/common/Toast';
import SuperAdminRoute from './components/common/SuperAdminRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ContactPage from './pages/ContactPage';
import ArchivePage from './pages/ArchivePage';
import ScanPage from './pages/ScanPage';
import BattlePage from './pages/BattlePage';
import LeaderboardPage from './pages/LeaderboardPage';
import BackendTestPage from './pages/BackendTestPage';
import AdminPage from './pages/AdminPage';
import TicketManagerPage from './pages/TicketManagerPage';
import StudioPage from './pages/StudioPage';
import './App.css';

/**
 * Chrome for the document pages: the painted app shell and the primary nav.
 * The landing page lives here too — it is a scrolling document, and the header
 * is how a signed-out visitor reaches log in / sign up.
 */
function DocumentLayout() {
  return (
    <div className="app-shell">
      <AppHeader />
      <Outlet />
    </div>
  );
}

/**
 * The game boards. These used to render bare, on the reasoning that a nav bar
 * above a 100dvh board would cut the art in half — but that left the nav
 * vanishing the moment a player started playing, and every screen needing its
 * own way home. The header is permanent here now; `.game-shell-body > .screen`
 * sizes each board to the space the header leaves rather than to a fresh
 * viewport, so nothing is pushed past the bottom edge.
 */
function GameLayout() {
  return (
    <div className="game-shell">
      <AppHeader />
      <div className="game-shell-body">
        <Outlet />
      </div>
    </div>
  );
}

/**
 * The sprite-pipeline studio, under the same site nav as everywhere else.
 *
 * The studio ships its own chrome — a `position: fixed` sidebar and a sticky
 * top bar — and none of it is touched here. `.studio-shell-body` carries a
 * transform, which makes it the containing block for those fixed children, so
 * the sidebar resolves against the wrapper and starts below the nav instead of
 * overlapping it. That keeps the accommodation entirely in the layout: no
 * studio component knows the nav exists.
 */
function StudioLayout() {
  return (
    <div className="studio-shell">
      <AppHeader />
      <div className="studio-shell-body">
        <Outlet />
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <NavigationLockProvider>
            <Routes>
              <Route element={<DocumentLayout />}>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/contact" element={<ContactPage />} />
                {/* Operator tools. SuperAdminRoute is presentational; the
                    server re-resolves the grant on every /api/admin and
                    /api/platform call and returns 403 to everyone else. */}
                <Route
                  path="/admin"
                  element={
                    <SuperAdminRoute>
                      <AdminPage />
                    </SuperAdminRoute>
                  }
                />
                <Route
                  path="/tickets"
                  element={
                    <SuperAdminRoute>
                      <TicketManagerPage />
                    </SuperAdminRoute>
                  }
                />
                {/* Was public. It enumerates the API surface and fires real
                    requests at it, which is an operator's tool, not a
                    visitor's. */}
                <Route
                  path="/test"
                  element={
                    <SuperAdminRoute>
                      <BackendTestPage />
                    </SuperAdminRoute>
                  }
                />
              </Route>

              {/* `/home` (the old "Play" hub) is archived: HomePage.tsx stays in
                  the tree but nothing routes to or links at it any more, so the
                  nav goes straight from the landing page to Scan. The catch-all
                  below sends any stale /home bookmark back to `/`. */}
              <Route element={<GameLayout />}>
                <Route
                  path="/scan"
                  element={
                    <ProtectedRoute>
                      <ScanPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/archive"
                  element={
                    <ProtectedRoute>
                      <ArchivePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/battle"
                  element={
                    <ProtectedRoute>
                      <BattlePage />
                    </ProtectedRoute>
                  }
                />
                {/* Open, unlike its neighbours: Ranking is one of the three tabs
                    a signed-out visitor can use. The boards read anonymously;
                    only the "where do I rank" panel needs a session, and the API
                    returns an empty standing for callers without one. */}
                <Route path="/leaderboard" element={<LeaderboardPage />} />
              </Route>

              <Route element={<StudioLayout />}>
                <Route
                  path="/studio"
                  element={
                    <SuperAdminRoute>
                      <StudioPage />
                    </SuperAdminRoute>
                  }
                />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </NavigationLockProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
