import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlantAvatar, StatGrid } from '../components/common/PlantVisuals';
import { useArchive } from '../hooks/useArchive';

export default function ArchivePage() {
  const navigate = useNavigate();
  const demoToolsEnabled = import.meta.env.VITE_ENABLE_DEMO_TOOLS === 'true';
  const {
    avatars,
    status,
    error,
    demoEnabled,
    setDemoEnabled,
    retry,
  } = useArchive();
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const selected =
    avatars.find((avatar) => avatar.id === selectedAvatarId) ?? avatars[0] ?? null;
  const demoAction = demoEnabled ? 'Remove demo plants' : 'Add five demo plants';

  return (
    <main className="content-page">
      <section className="page-heading">
        <p className="eyebrow">Plant archival</p>
        <h1>Your plant archive</h1>
        <p>Your collected plants, ready for the next match.</p>
      </section>

      {demoToolsEnabled && (
        <div className="archive-toolbar">
          <button
            className="demo-switch"
            type="button"
            role="switch"
            aria-checked={demoEnabled}
            aria-label={demoAction}
            aria-busy={status === 'mutating'}
            disabled={status !== 'ready'}
            onClick={() => void setDemoEnabled(!demoEnabled)}
          >
            <span className="demo-switch-track" aria-hidden="true">
              <span />
            </span>
            <span>{demoAction}</span>
          </button>
          {status === 'mutating' && (
            <span
              className="demo-mutation-status"
              role="status"
              aria-label="Updating demo plants"
            >
              Updating demo plants...
            </span>
          )}
        </div>
      )}

      {status === 'loading' && (
        <section
          className="archive-layout archive-loading"
          role="status"
          aria-label="Loading archive"
          aria-live="polite"
        >
          <div className="avatar-grid" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <span className="archive-skeleton-card" key={index} />
            ))}
          </div>
          <aside className="detail-panel archive-skeleton-detail" aria-hidden="true">
            <span />
            <span />
            <span />
          </aside>
        </section>
      )}

      {status === 'error' && (
        <section className="archive-state archive-error" role="alert">
          <h2>Archive unavailable</h2>
          <p>{error}</p>
          <button className="primary-cta archive-retry" type="button" onClick={retry}>
            Retry
          </button>
        </section>
      )}

      {(status === 'ready' || status === 'mutating') && avatars.length === 0 && (
        <section className="archive-state archive-empty">
          <h2>No plants collected yet</h2>
        </section>
      )}

      {(status === 'ready' || status === 'mutating') && selected && (
        <section className="archive-layout">
          <div className="avatar-grid">
            {avatars.map((avatar) => (
              <button
                key={avatar.id}
                className={
                  avatar.id === selected.id
                    ? `avatar-card ${avatar.color} is-selected`
                    : `avatar-card ${avatar.color}`
                }
                type="button"
                aria-label={`Select ${avatar.name}${avatar.isDemo ? ' (Demo)' : ''}`}
                aria-pressed={avatar.id === selected.id}
                onClick={() => setSelectedAvatarId(avatar.id)}
              >
                {avatar.isDemo && <span className="demo-badge">Demo</span>}
                <PlantAvatar avatar={avatar} />
                <span>{avatar.name}</span>
                <small>{avatar.species}</small>
              </button>
            ))}
          </div>

          <aside className="detail-panel">
            <PlantAvatar key={selected.id} avatar={selected} large />
            <p className="eyebrow">Selected avatar</p>
            <h2>{selected.name}</h2>
            <p>
              {selected.species} from {selected.family}. Discovered on{' '}
              {selected.discovered}.
            </p>
            <StatGrid avatar={selected} />
            <button
              className="primary-cta detail-action"
              type="button"
              disabled={status === 'mutating'}
              onClick={() =>
                navigate('/battle', {
                  state: { avatarId: selected.id, avatar: selected },
                })
              }
            >
              <span aria-hidden="true">-&gt;</span>
              Battle with {selected.name}
            </button>
          </aside>
        </section>
      )}
    </main>
  );
}
