import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NavigationLockProvider } from './context/NavigationLockProvider';
import AppHeader from './components/common/AppHeader';
import ProtectedRoute from './components/common/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import HomePage from './pages/HomePage';
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
 * The game boards are full-bleed painted screens that each fill the viewport
 * and carry their own back button, so they render without the app header —
 * a nav bar across the top of a 100dvh board would cut the art in half and
 * push the action row off-screen on a phone.
 */
function GameLayout() {
  return <Outlet />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NavigationLockProvider>
          <Routes>
            <Route element={<DocumentLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/contact" element={<ContactPage />} />
              {/* Signed-in gate only; the server's ADMIN_EMAILS allowlist is
                  the real authority and returns 403 to everyone else. */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <AdminPage />
                  </ProtectedRoute>
                }
              />
              {/* The backend test bench drives real endpoints against the real
                  project — account signup among them — so it sits behind the
                  same allowlist as /admin rather than being open to the web. */}
              <Route
                path="/test"
                element={
                  <ProtectedRoute requireAdmin>
                    <BackendTestPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route element={<GameLayout />}>
              <Route
                path="/home"
                element={
                  <ProtectedRoute>
                    <HomePage />
                  </ProtectedRoute>
                }
              />
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
              <Route
                path="/leaderboard"
                element={
                  <ProtectedRoute>
                    <LeaderboardPage />
                  </ProtectedRoute>
                }
              />
              {/* The sprite-pipeline studio brings its own sidebar and top bar,
                  so it also renders outside the app header. */}
              <Route
                path="/studio"
                element={
                  <ProtectedRoute requireAdmin>
                    <StudioPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </NavigationLockProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
