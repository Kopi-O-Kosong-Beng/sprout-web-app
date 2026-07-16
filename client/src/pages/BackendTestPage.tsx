/** The original "Sprout — Backend Test Page", preserved as a subpage at /test.
 *  Exercises the live Express + Firestore/SQLite backend directly — a
 *  database-interface smoke test for the team to confirm the API contracts
 *  work end-to-end. Not part of the product UI.
 */
import HealthStatus from '../components/HealthStatus';
import AuthPanel from '../components/AuthPanel';
import AvatarPanel from '../components/AvatarPanel';
import TicketPanel from '../components/TicketPanel';

export default function BackendTestPage() {
  return (
    <main className="test-page">
      <header className="test-page-header">
        <h1>🌱 Sprout — Backend Test Page</h1>
        <p className="subtitle">
          Exercises the live Express + Firestore/SQLite backend directly. Not
          the real product UI — a database-interface smoke test for the team
          to confirm the API contracts work end-to-end.
        </p>
      </header>

      <HealthStatus />

      <div className="test-panels">
        <AuthPanel />
        <AvatarPanel />
        <TicketPanel />
      </div>
    </main>
  );
}
