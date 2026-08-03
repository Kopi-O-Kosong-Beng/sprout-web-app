import { useState } from 'react';
import { listAvatars, type PaginatedAvatars } from '../services/sproutApi';
import { extractApiError } from '../services/apiClient';

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
      setError(extractApiError(err, 'Request failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Avatar list</h2>
        <span className="endpoint">GET /api/avatar</span>
      </div>
      <p className="panel-hint">
        Protected route fallback test. Uses the <code>x-dev-uid</code> dev
        bypass (<code>AUTH_DEV_BYPASS=true</code>) when you are not testing a
        real Firebase token in the auth panel. Seeded demo data belongs to{' '}
        <code>demo-user-0001</code>.
      </p>

      <div className="form-stack">
        <label>
          x-dev-uid
          <input
            value={devUid}
            onChange={(e) => setDevUid(e.target.value)}
            placeholder="demo-user-0001"
          />
        </label>
        <button
          type="button"
          className="primary-cta form-submit"
          onClick={fetchAvatars}
          disabled={loading || !devUid.trim()}
        >
          {loading ? 'Fetching…' : 'Fetch avatars'}
        </button>
      </div>

      {error && <div className="result result-err">{error}</div>}

      {result && (
        <>
          <p className="readout">
            <span className="readout-key">Returned</span>
            <span className="readout-value">
              {result.total} avatar(s) · page {result.page} · size{' '}
              {result.pageSize}
            </span>
          </p>
          {/* A ruled list, not a grid of cards inside the result box: that was
              a third card depth, and the species name — a record — was set in
              9px Press Start 2P and truncated with an ellipsis. */}
          {result.items.length === 0 ? (
            <p className="empty-note">
              No avatars stored for this uid. The route answered; the collection
              is empty.
            </p>
          ) : (
            <ul className="specimen-list">
              {result.items.map((a) => (
                <li key={a.id}>
                  <div className="specimen-name">{a.speciesName}</div>
                  <div className="specimen-meta">
                    {a.speciesFamily ?? 'Unknown family'} · {a.source}
                    {a.isTemporary ? ' · temporary' : ''}
                  </div>
                  <div className="specimen-stats">
                    <span>HP {a.stats.hp}</span>
                    <span>ATK {a.stats.attack}</span>
                    <span>DEF {a.stats.defense}</span>
                    <span>SPD {a.stats.speed}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
