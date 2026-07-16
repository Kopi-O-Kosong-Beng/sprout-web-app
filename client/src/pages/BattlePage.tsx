/** Static battle-flow preview — the real PVE loop is Phase 2 of the dev plan
 *  (POST /api/battle/pve/* does not exist yet).
 */
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  BotAvatar,
  HealthBar,
  PlantAvatar,
  StatGrid,
  plantAvatars,
} from '../components/common/PlantVisuals';

type BattleView = 'select' | 'loading' | 'battle';

export default function BattlePage() {
  const location = useLocation();
  const initialAvatarId =
    (location.state as { avatarId?: string } | null)?.avatarId ?? plantAvatars[0].id;

  const [selectedAvatarId, setSelectedAvatarId] = useState(initialAvatarId);
  const [view, setView] = useState<BattleView>('select');

  const selectedAvatar = useMemo(
    () => plantAvatars.find((avatar) => avatar.id === selectedAvatarId) ?? plantAvatars[0],
    [selectedAvatarId],
  );

  const startBattleLoading = () => {
    setView('loading');
    window.setTimeout(() => setView('battle'), 900);
  };

  return (
    <main className="content-page">
      <section className="page-heading">
        <p className="eyebrow">PVE battle lab</p>
        <h1>Pick a plant avatar and spar with a bot</h1>
        <p>
          Static battle flow covering avatar selection, loading, and a turn-based
          battle menu for attack, special, and defend actions.
        </p>
      </section>

      {view === 'select' && (
        <section className="battle-select">
          <div className="avatar-grid compact">
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
                <small>HP {avatar.hp}</small>
              </button>
            ))}
          </div>
          <aside className="battle-ready">
            <PlantAvatar avatar={selectedAvatar} large />
            <h2>{selectedAvatar.name} is ready</h2>
            <p>
              Select your combatant before creating a battle session with a
              generated NPC opponent.
            </p>
            <button className="primary-cta detail-action" type="button" onClick={startBattleLoading}>
              <span aria-hidden="true">-&gt;</span>
              Start PVE Match
            </button>
          </aside>
        </section>
      )}

      {view === 'loading' && (
        <section className="battle-loading" aria-live="polite">
          <div className="loader-orbit">
            <PlantAvatar avatar={selectedAvatar} large />
          </div>
          <p className="eyebrow">Loading battle menu</p>
          <h2>Generating bot opponent...</h2>
          <p>Deriving stats, opening battle session, and preparing turn log.</p>
        </section>
      )}

      {view === 'battle' && (
        <section className="battle-arena">
          <div className="fighter-panel user-fighter">
            <PlantAvatar avatar={selectedAvatar} large />
            <h2>{selectedAvatar.name}</h2>
            <HealthBar label="HP" value={82} />
            <StatGrid avatar={selectedAvatar} compact />
          </div>

          <div className="battle-menu">
            <p className="eyebrow">Your turn</p>
            <h2>Bot Thornback used Guard Root.</h2>
            <p>
              Choose an action. Damage preview is deterministic in the backend
              battle service.
            </p>
            <div className="battle-actions">
              <button type="button">Attack</button>
              <button type="button">Special</button>
              <button type="button">Defend</button>
            </div>
            <button className="details-link" type="button" onClick={() => setView('select')}>
              Change Avatar
            </button>
          </div>

          <div className="fighter-panel bot-fighter">
            <BotAvatar />
            <h2>Bot Thornback</h2>
            <HealthBar label="HP" value={58} />
            <div className="battle-log">
              <span>Turn 3</span>
              <p>Orchid Flare dealt 34 special damage.</p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
