/** Static design preview — the real archive will read GET /api/avatar in a
 *  later slice (see the Phase 1 dev plan, Slice 7).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlantAvatar,
  StatGrid,
  plantAvatars,
} from '../components/common/PlantVisuals';

export default function ArchivePage() {
  const navigate = useNavigate();
  const [selectedAvatarId, setSelectedAvatarId] = useState(plantAvatars[0].id);
  const selected =
    plantAvatars.find((avatar) => avatar.id === selectedAvatarId) ?? plantAvatars[0];

  return (
    <main className="content-page">
      <section className="page-heading">
        <p className="eyebrow">Plant archival</p>
        <h1>Browse your Pokedex-style avatar collection</h1>
        <p>
          Static preview of the authenticated avatar grid backed by
          <code> GET /api/avatar</code>. Each card shows sprite identity,
          discovery metadata, family, and battle stats.
        </p>
      </section>

      <section className="archive-layout">
        <div className="avatar-grid">
          {plantAvatars.map((avatar) => (
            <button
              key={avatar.id}
              className={
                avatar.id === selectedAvatarId
                  ? `avatar-card ${avatar.color} is-selected`
                  : `avatar-card ${avatar.color}`
              }
              type="button"
              onClick={() => setSelectedAvatarId(avatar.id)}
            >
              <PlantAvatar avatar={avatar} />
              <span>{avatar.name}</span>
              <small>{avatar.species}</small>
            </button>
          ))}
        </div>

        <aside className="detail-panel">
          <PlantAvatar avatar={selected} large />
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
            onClick={() => navigate('/battle', { state: { avatarId: selected.id } })}
          >
            <span aria-hidden="true">-&gt;</span>
            Battle With This Plant
          </button>
        </aside>
      </section>
    </main>
  );
}
