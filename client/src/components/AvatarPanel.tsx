import { useState } from 'react';
import { listAvatars, type PaginatedAvatars } from '../services/sproutApi';

const DEFAULT_DEV_UID = 'demo-user-0001';

export default function AvatarPanel() {
  const [devUid, setDevUid] = useState(DEFAULT_DEV_UID);
  const [result, setResult] = useState<PaginatedAvatars | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchAvatars() {
    setLoading(true);
    setError(null);
    try {
      const data = await listAvatars(devUid.trim());
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2>GET /api/avatar</h2>
      <p className="panel-hint">
        Protected route. Uses the <code>x-dev-uid</code> dev bypass (
        <code>AUTH_DEV_BYPASS=true</code>) in place of a real Firebase login —
        see <code>server/middleware/auth.middleware.ts</code>. Seeded demo
        data belongs to <code>demo-user-0001</code>.
      </p>

      <label>
        x-dev-uid
        <input
          value={devUid}
          onChange={(e) => setDevUid(e.target.value)}
          placeholder="demo-user-0001"
        />
      </label>
      <button type="button" onClick={fetchAvatars} disabled={loading || !devUid.trim()}>
        {loading ? 'Fetching…' : 'Fetch avatars'}
      </button>

      {error && <div className="result result-err">{error}</div>}

      {result && (
        <div className="result result-ok">
          <p>
            {result.total} avatar(s) — page {result.page}, pageSize {result.pageSize}
          </p>
          {result.items.length === 0 ? (
            <p>No avatars for this user.</p>
          ) : (
            <ul className="avatar-list">
              {result.items.map((a) => (
                <li key={a.id} className="avatar-card">
                  <div className="avatar-name">{a.speciesName}</div>
                  <div className="avatar-meta">
                    {a.speciesFamily ?? 'Unknown family'} · {a.source}
                    {a.isTemporary ? ' · temporary' : ''}
                  </div>
                  <div className="avatar-stats">
                    HP {a.stats.hp} · ATK {a.stats.attack} · DEF {a.stats.defense} · SPD{' '}
                    {a.stats.speed}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
