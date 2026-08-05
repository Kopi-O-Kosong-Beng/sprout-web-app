/**
 * The two leaderboards.
 *
 * Both are read-only projections of state the app already maintains. PVE
 * experience is accumulated on the user profile by the battle repository at the
 * end of every resolved match (`pveXp`, guarded by `rewardApplied` so a replayed
 * transaction cannot double-count). Discovery is a count of `dex` records naming
 * a player as the first finder — the same records the scan route writes and the
 * almanac reads. Neither board keeps a tally of its own, because a second tally
 * is a second answer to a question that already has one.
 *
 * Ranking is standard competition ranking: ties share the higher rank and the
 * next distinct value skips ahead (1, 1, 3). Rank is computed over *every*
 * player, then the board is sliced — so the caller's rank is their true standing
 * and not their position within the visible slice.
 */
import { getDb } from '../firebase';
import type { DexDiscovery } from '../models/dex';
import dexRepository from '../repositories/dex';

/** How many rows either board returns. The caller's own standing is reported
 *  separately, so a player outside the slice still learns where they are. */
export const LEADERBOARD_SIZE = 10;

export interface XpLeaderboardEntry {
  rank: number;
  displayName: string;
  xp: number;
  wins: number;
  losses: number;
  bestWinStreak: number;
  /** Whether this row belongs to the caller. Carried instead of a uid: the
   *  client only needs to highlight one row, and other players' identifiers
   *  are not the client's business. */
  isCaller: boolean;
}

export interface DiscoveryLeaderboardEntry {
  rank: number;
  displayName: string;
  discoveries: number;
  isCaller: boolean;
}

export interface CallerXpStanding {
  rank: number | null;
  displayName: string;
  xp: number;
  wins: number;
  losses: number;
  bestWinStreak: number;
}

export interface CallerDiscoveryStanding {
  rank: number | null;
  displayName: string;
  discoveries: number;
}

export interface Leaderboards {
  xp: { entries: XpLeaderboardEntry[]; caller: CallerXpStanding; totalPlayers: number };
  discovery: {
    entries: DiscoveryLeaderboardEntry[];
    caller: CallerDiscoveryStanding;
    totalPlayers: number;
  };
}

interface PlayerRow {
  userId: string;
  displayName: string;
  xp: number;
  wins: number;
  losses: number;
  bestWinStreak: number;
}

/** Firestore holds these as plain numbers; a profile written before PVE existed
 *  has none at all, which must read as zero rather than NaN. */
function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function toDisplayName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

async function readPlayers(): Promise<PlayerRow[]> {
  const snapshot = await getDb().collection('users').get();
  return snapshot.docs.map((doc) => {
    const data = doc.data() ?? {};
    return {
      userId: doc.id,
      displayName: toDisplayName(data.displayName, 'Unnamed player'),
      xp: toCount(data.pveXp),
      wins: toCount(data.pveWins),
      losses: toCount(data.pveLosses),
      bestWinStreak: toCount(data.bestPveWinStreak),
    };
  });
}

/**
 * Standard competition ranking over an already-sorted list.
 *
 * `valueOf` is what decides a tie — two players on the same score share a rank
 * regardless of how the sort broke the tie for display.
 */
function assignRanks<T>(sorted: T[], valueOf: (item: T) => number): Map<T, number> {
  const ranks = new Map<T, number>();
  let previousValue: number | null = null;
  let previousRank = 0;

  sorted.forEach((item, index) => {
    const value = valueOf(item);
    const rank = previousValue !== null && value === previousValue ? previousRank : index + 1;
    ranks.set(item, rank);
    previousValue = value;
    previousRank = rank;
  });

  return ranks;
}

/** Descending by score; the display name breaks ties so the order is stable
 *  across requests rather than following Firestore's document order. */
function byScoreThenName<T extends { displayName: string }>(
  score: (item: T) => number
): (left: T, right: T) => number {
  return (left, right) =>
    score(right) - score(left) || left.displayName.localeCompare(right.displayName);
}

function buildXpBoard(players: PlayerRow[], callerId: string) {
  // Only players who have actually played. The discovery board has always said
  // this — "a board padded with zeros says nothing and buries the players it is
  // meant to celebrate" — but the XP board listed the whole user collection, so
  // every account that ever registered and never battled sat on it at 0 XP,
  // pushing real players down and making totalPlayers a signup count.
  //
  // The caller is exempt: someone with no battles yet still needs their own
  // row, and it reads as unranked rather than as a placing.
  const ranked = players.filter(
    (player) => player.xp > 0 || player.wins > 0 || player.losses > 0
  );
  const sorted = [...ranked].sort(byScoreThenName<PlayerRow>((player) => player.xp));
  const ranks = assignRanks(sorted, (player) => player.xp);
  const caller =
    sorted.find((player) => player.userId === callerId) ??
    players.find((player) => player.userId === callerId);

  return {
    entries: sorted.slice(0, LEADERBOARD_SIZE).map((player) => ({
      rank: ranks.get(player) ?? 0,
      displayName: player.displayName,
      xp: player.xp,
      wins: player.wins,
      losses: player.losses,
      bestWinStreak: player.bestWinStreak,
      isCaller: player.userId === callerId,
    })),
    caller: {
      rank: caller ? (ranks.get(caller) ?? null) : null,
      displayName: caller?.displayName ?? 'You',
      xp: caller?.xp ?? 0,
      wins: caller?.wins ?? 0,
      losses: caller?.losses ?? 0,
      bestWinStreak: caller?.bestWinStreak ?? 0,
    },
    totalPlayers: sorted.length,
  };
}

interface DiscoveryRow {
  userId: string;
  displayName: string;
  discoveries: number;
}

function buildDiscoveryBoard(
  players: PlayerRow[],
  discoveries: DexDiscovery[],
  callerId: string
) {
  const counts = new Map<string, number>();
  for (const record of discoveries) {
    const finder = record.firstDiscoveredBy;
    if (!finder) continue;
    counts.set(finder, (counts.get(finder) ?? 0) + 1);
  }

  // Only players who found something appear. A board padded with zeros says
  // nothing and buries the players it is meant to celebrate.
  const rows: DiscoveryRow[] = players
    .filter((player) => (counts.get(player.userId) ?? 0) > 0)
    .map((player) => ({
      userId: player.userId,
      displayName: player.displayName,
      discoveries: counts.get(player.userId) ?? 0,
    }))
    .sort(byScoreThenName<DiscoveryRow>((row) => row.discoveries));

  const ranks = assignRanks(rows, (row) => row.discoveries);
  const caller = rows.find((row) => row.userId === callerId);
  const callerProfile = players.find((player) => player.userId === callerId);

  return {
    entries: rows.slice(0, LEADERBOARD_SIZE).map((row) => ({
      rank: ranks.get(row) ?? 0,
      displayName: row.displayName,
      discoveries: row.discoveries,
      isCaller: row.userId === callerId,
    })),
    caller: {
      rank: caller ? (ranks.get(caller) ?? null) : null,
      displayName: caller?.displayName ?? callerProfile?.displayName ?? 'You',
      discoveries: caller?.discoveries ?? 0,
    },
    totalPlayers: rows.length,
  };
}

export async function getLeaderboards(callerId: string): Promise<Leaderboards> {
  const [players, discoveries] = await Promise.all([
    readPlayers(),
    dexRepository.list(),
  ]);

  return {
    xp: buildXpBoard(players, callerId),
    discovery: buildDiscoveryBoard(players, discoveries, callerId),
  };
}
