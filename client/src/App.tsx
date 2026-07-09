import HealthStatus from './components/HealthStatus';
import AvatarPanel from './components/AvatarPanel';
import TicketPanel from './components/TicketPanel';
import './App.css';

function App() {
  return (
    <div className="page">
      <header>
        <h1>🌱 Sprout — Backend Test Page</h1>
        <p className="subtitle">
          Exercises the live Express + Firestore/SQLite backend directly. Not
          the real product UI — a database-interface smoke test for the team
          to confirm the API contracts work end-to-end.
        </p>
      </header>

      <HealthStatus />

      <main>
        <AvatarPanel />
        <TicketPanel />
      </main>
    </div>
  );
}

export default App;
