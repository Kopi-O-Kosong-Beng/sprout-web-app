/** Transitional client-only preview. Task 9 replaces this simulated flow with
 *  the server-authoritative PVE API.
 */
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BotAvatar,
  HealthBar,
  PlantAvatar,
  StatGrid,
  type PlantAvatarData,
} from '../components/common/PlantVisuals';

type BattleView = 'ready' | 'loading' | 'battle';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlantAvatarData(value: unknown): value is PlantAvatarData {
  if (!isRecord(value)) return false;

  const stringFields = [
    'id',
    'name',
    'species',
    'family',
    'discovered',
    'color',
  ] as const;
  const statFields = ['hp', 'attack', 'defense', 'speed'] as const;

  return (
    stringFields.every(
      (field) => typeof value[field] === 'string' && value[field].trim().length > 0
    ) &&
    statFields.every(
      (field) => typeof value[field] === 'number' && Number.isFinite(value[field])
    ) &&
    (value.spriteUrl === undefined || typeof value.spriteUrl === 'string') &&
    (value.isDemo === undefined || typeof value.isDemo === 'boolean')
  );
}

function getRouteAvatar(state: unknown): PlantAvatarData | null {
  if (!isRecord(state) || !isPlantAvatarData(state.avatar)) return null;
  if (state.avatarId !== undefined && state.avatarId !== state.avatar.id) return null;
  return state.avatar;
}

export default function BattlePage() {
  const location = useLocation();
  const selectedAvatar = getRouteAvatar(location.state);
  const [view, setView] = useState<BattleView>('ready');

  if (!selectedAvatar) {
    return (
      <main className="content-page">
        <section className="page-heading">
          <p className="eyebrow">PVE battle lab</p>
          <h1>Battle practice</h1>
        </section>
        <section className="archive-state battle-empty">
          <h2>No plant selected</h2>
          <p>Choose an owned plant from your Archive to continue.</p>
          <Link className="primary-cta archive-retry" to="/archive">
            Return to Archive
          </Link>
        </section>
      </main>
    );
  }

  const startBattleLoading = () => {
    setView('loading');
    window.setTimeout(() => setView('battle'), 900);
  };

  return (
    <main className="content-page">
      <section className="page-heading">
        <p className="eyebrow">PVE battle lab</p>
        <h1>Battle practice with {selectedAvatar.name}</h1>
        <p>Test your selected plant against a training bot.</p>
      </section>

      {view === 'ready' && (
        <section className="battle-select">
          <article className="fighter-panel">
            <PlantAvatar avatar={selectedAvatar} large />
            <p className="eyebrow">Owned combatant</p>
            <h2>{selectedAvatar.name}</h2>
            <StatGrid avatar={selectedAvatar} compact />
          </article>
          <aside className="battle-ready">
            <h2>{selectedAvatar.name} is ready</h2>
            <p>A training bot is waiting for a practice match.</p>
            <button
              className="primary-cta detail-action"
              type="button"
              onClick={startBattleLoading}
            >
              <span aria-hidden="true">-&gt;</span>
              Start Practice Match
            </button>
            <Link className="details-link" to="/archive">
              Choose another plant
            </Link>
          </aside>
        </section>
      )}

      {view === 'loading' && (
        <section className="battle-loading" aria-live="polite">
          <div className="loader-orbit">
            <PlantAvatar avatar={selectedAvatar} large />
          </div>
          <p className="eyebrow">Preparing practice match</p>
          <h2>Generating bot opponent...</h2>
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
            <p>Choose an action for this practice round.</p>
            <div className="battle-actions">
              <button type="button">Attack</button>
              <button type="button">Special</button>
              <button type="button">Defend</button>
            </div>
            <Link className="details-link" to="/archive">
              Change Avatar
            </Link>
          </div>

          <div className="fighter-panel bot-fighter">
            <BotAvatar />
            <h2>Bot Thornback</h2>
            <HealthBar label="HP" value={58} />
            <div className="battle-log">
              <span>Turn 3</span>
              <p>{selectedAvatar.name} dealt 34 special damage.</p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
