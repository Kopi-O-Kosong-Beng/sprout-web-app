import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NavigationLockProvider } from './context/NavigationLockProvider';
import AppHeader from './components/common/AppHeader';
import ProtectedRoute from './components/common/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ContactPage from './pages/ContactPage';
import ArchivePage from './pages/ArchivePage';
import BattlePage from './pages/BattlePage';
import BackendTestPage from './pages/BackendTestPage';
import AdminPage from './pages/AdminPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NavigationLockProvider>
          <div className="app-shell">
            <AppHeader />
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/contact" element={<ContactPage />} />
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
              <Route path="/test" element={<BackendTestPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </NavigationLockProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
