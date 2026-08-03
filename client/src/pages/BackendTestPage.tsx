/** The original "Sprout — Backend Test Page", preserved as a subpage at /test.
 *  Exercises the live Express + Firestore backend directly — a
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
        {/* No emoji in the title: PRODUCT.md names emoji-as-iconography as an
            anti-reference, and a seedling glyph in front of "Sprout" is exactly
            that — decoration standing in for the mark the header already has. */}
        <h1>Sprout — backend test bench</h1>
        <p className="subtitle">
          Exercises the live Express + Firestore backend directly. Not the
          product UI — every control below sends a real request and prints the
          real response, so the team can confirm the API contracts end to end.
        </p>
      </header>

      <HealthStatus />

      {/* Auth is a four-step procedure; the other two are single-shot
          endpoints. The layout gives each the width its content needs rather
          than splitting the page into equal thirds — see .test-layout. */}
      <div className="test-layout">
        <AuthPanel />
        <AvatarPanel />
        <TicketPanel />
      </div>
    </main>
  );
}
