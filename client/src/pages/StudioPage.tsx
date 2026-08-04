import { useEffect, useState } from 'react';
import { Sidebar } from '../studio/components/Sidebar';
import { Topbar } from '../studio/components/Topbar';
import { AuthCard } from '../studio/components/AuthCard';
import { NotesManager } from '../studio/components/NotesManager';
import { PipelineStudio } from '../studio/components/PipelineStudio';
import { AdminDashboard } from '../studio/components/AdminDashboard';
import { UnitTests } from '../studio/components/UnitTests';
import { PageHead, Spinner } from '../studio/components/ui';
import { usePlatformStatus } from '../studio/hooks/usePlatformStatus';
import { useDexCollection } from '../studio/hooks/useDexCollection';
import {
  ADMIN_ROUTES,
  ROUTES,
  STUDIO_ROUTES,
  TEST_ROUTE,
  type RouteId,
} from '../studio/nav';
import { useAuth } from '../hooks/useAuth';

/**
 * The AI sprite-pipeline operations portal, migrated whole from
 * Sprout_Dev_Platform where it was that repo's entire App.tsx.
 *
 * Two things changed on the way in:
 *
 *  - Auth comes from this app's AuthProvider rather than its own Firebase
 *    listener. The route is already behind ProtectedRoute, so by the time this
 *    renders there is a verified session; AuthCard remains for the one case that
 *    can still happen, a Firebase config missing locally.
 *
 *  - Its internal hash router is kept. The studio has ten views of its own and
 *    routing them through react-router would mean ten new app routes for what is
 *    one destination; the hash keeps each view linkable and reload-safe without
 *    touching the app's route table.
 *
 * `.studio-root` scopes the dark Florentine palette to this subtree, so the
 * painted light game screens are unaffected.
 */

const isRoute = (value: string): value is RouteId => value in ROUTES;

export default function StudioPage() {
  const { status, firebaseUser } = useAuth();
  const [notesCount, setNotesCount] = useState(0);
  const [navOpen, setNavOpen] = useState(false);

  // Route lives in the hash so views are linkable and survive a reload.
  const [route, setRoute] = useState<RouteId>(() => {
    const initial = window.location.hash.replace('#', '');
    return isRoute(initial) ? initial : 'scanner';
  });

  const platform = usePlatformStatus();
  const dexDocs = useDexCollection();

  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'sprout-dev';
  const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)';

  // Keep hash and state in sync in both directions.
  useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash.replace('#', '');
      if (isRoute(next)) setRoute(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (next: RouteId) => {
    setRoute(next);
    setNavOpen(false);
    window.location.hash = next;
  };

  const def = ROUTES[route];
  const loadingAuth = status === 'loading';
  const needsAuth = Boolean(def.requiresAuth) && !firebaseUser;

  const renderContent = () => {
    if (loadingAuth) {
      return (
        <div className="flex flex-col items-center gap-4 py-32 text-center">
          <Spinner className="h-8 w-8" />
          <p className="text-meta text-txt-4">Verifying Firebase credentials…</p>
        </div>
      );
    }

    if (needsAuth) return <AuthCard />;

    if (route === TEST_ROUTE) return <UnitTests />;

    if (STUDIO_ROUTES.includes(route)) {
      return <PipelineStudio route={route} dexDocs={dexDocs} />;
    }

    if (ADMIN_ROUTES.includes(route)) {
      return <AdminDashboard route={route} platform={platform} />;
    }

    return firebaseUser ? (
      <NotesManager user={firebaseUser} onCountChange={setNotesCount} />
    ) : (
      <AuthCard />
    );
  };

  /** Per-route action slot in the page header. */
  const headRight =
    route === 'notes' && firebaseUser ? (
      <span className="font-mono text-meta text-txt-4">{notesCount} document(s) in sync</span>
    ) : undefined;

  return (
    <div id="app-root" className="studio-root bg-void text-txt-2 min-h-screen">
      <Sidebar
        route={route}
        onNavigate={navigate}
        user={firebaseUser}
        loadingAuth={loadingAuth}
        projectId={projectId}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        dexCount={dexDocs.length}
      />

      <div className="flex min-h-screen flex-col lg:pl-[248px]">
        <Topbar
          route={route}
          onMenu={() => setNavOpen(true)}
          projectId={projectId}
          databaseId={databaseId}
          health={platform.health}
          loadingHealth={platform.loadingHealth}
          onRefresh={platform.refreshAll}
        />

        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">
            {!loadingAuth && (
              <PageHead
                kicker={def.kicker}
                title={needsAuth ? 'Sign in required' : def.title}
                sub={needsAuth ? undefined : def.sub}
                right={headRight}
              />
            )}
            {renderContent()}
          </div>
        </main>

        <footer className="border-line border-t px-4 py-3 sm:px-6 lg:px-8">
          <div className="text-txt-5 mx-auto flex w-full max-w-[1400px] flex-col gap-1 font-mono text-[10px] sm:flex-row sm:items-center sm:justify-between">
            <span>Sprites quantised to Spica72 · 192×192 · {projectId}</span>
            <span>Auth &amp; Firestore rules active</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
