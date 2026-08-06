/**
 * The two boards, side by side.
 *
 * Experience answers "who plays best"; discovery answers "who explores most" —
 * and the second is the one a new player can top on their first afternoon, which
 * is why both are here rather than XP alone. Neither has its own tally: XP is
 * the profile the battle repository writes at the end of a match, discovery is a
 * count of the dex records the scan route writes. See
 * server/services/leaderboard.service.ts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import BackButton from "../components/common/BackButton";
import { extractApiError } from "../services/apiClient";
import { getLeaderboards, type Leaderboards } from "../services/sproutApi";
import { useAuth } from "../hooks/useAuth";

type View = "loading" | "ready" | "error";

/** Ranking is one of the three tabs a signed-out visitor can open, so the
 *  "where do I stand" line has to answer two different people. Telling a
 *  visitor to "win a battle to appear" points at a game they have no account
 *  for; they need the sign-up, not the instruction. */
const VISITOR_XP_STANDING = "Sign up to battle your way onto this board.";
const VISITOR_DISCOVERY_STANDING =
  "Sign up to scan a plant and claim a species first.";

/** Rank is a numeral in a fixed slot, never a medal emoji — PRODUCT.md names
 *  emoji-as-iconography as an anti-reference, and numerals keep every row in
 *  the same column whether it is 1st or 11th. The podium is marked by the slot's
 *  fill instead. Competition ranking, so two firsts and no second is correct. */
const PODIUM_RANK = 3;

export default function LeaderboardPage() {
  const { status } = useAuth();
  const signedIn = status === "authenticated";
  const [boards, setBoards] = useState<Leaderboards | null>(null);
  const [view, setView] = useState<View>("loading");
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestVersion.current;
    setView("loading");
    setError(null);
    try {
      const next = await getLeaderboards();
      if (request !== requestVersion.current) return;
      setBoards(next);
      setView("ready");
    } catch (caught) {
      if (request !== requestVersion.current) return;
      setError(extractApiError(caught, "Could not load the leaderboards."));
      setView("error");
    }
  }, []);

  useEffect(() => {
    /*
     * A fresh tab mounts this page before Firebase has restored the session,
     * so an immediate fetch goes out with no token, the server matches the
     * caller against an empty uid, and a ranked player is told they are not
     * ranked. Wait for auth to settle, and refetch on any later transition
     * (sign-in, sign-out) so the caller row tracks who is actually looking.
     */
    if (status === "loading") return;
    void load();
    return () => {
      requestVersion.current += 1;
    };
  }, [load, status]);

  return (
    <main className="screen screen-scrollable flex flex-col">
      <img
        src="/img/bg_home.jpg"
        alt=""
        className="fixed inset-0 -z-20 h-[100dvh] w-full object-cover"
      />
      <div className="from-sprout/90 via-sprout/40 to-sprout/90 absolute inset-0 -z-10 bg-gradient-to-b" />

      <div className="safe-top flex items-center justify-between gap-2 px-3">
        <BackButton fallback="/" />
        <Link to="/battle" className="press pixel-button px-3 py-2 text-xs">
          Battle to climb
        </Link>
      </div>

      <div className="px-4 pt-1 text-center">
        <p className="font-pixel text-outline text-[9px] text-white">
          Standings
        </p>
        <h1 className="font-pixel text-outline mt-2 text-sm leading-relaxed text-white">
          Leaderboards
        </h1>
        <p className="text-soft-shadow mt-2 text-xs text-white/85">
          Win battles for experience. Be first to a species for discovery.
        </p>
      </div>

      <div className="safe-bottom mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-3 py-3">
        {view === "loading" && (
          <section
            className="pixel-panel flex flex-col items-center gap-3 p-6 text-center"
            role="status"
            aria-live="polite"
          >
            <span className="spin h-6 w-6 rounded-full border-2 border-black border-t-transparent" />
            <h2 className="font-pixel text-xs leading-relaxed">
              Counting the standings...
            </h2>
          </section>
        )}

        {view === "error" && (
          <section className="pixel-panel p-5 text-center" role="alert">
            <h2 className="font-pixel text-xs leading-relaxed">
              Leaderboards unavailable
            </h2>
            <p className="mt-2 text-xs leading-relaxed opacity-80">{error}</p>
            <button
              className="press pixel-button mt-4 w-full px-3 py-2 text-[9px]"
              type="button"
              onClick={() => void load()}
            >
              Retry
            </button>
          </section>
        )}

        {view === "ready" && boards && (
          <>
            <Board
              eyebrow="PVE experience"
              title="Experience"
              emptyLabel="No battles fought yet. Be the first."
              standing={
                boards.xp.caller.rank === null
                  ? signedIn
                    ? "You are not ranked yet — win a battle to appear."
                    : VISITOR_XP_STANDING
                  : `You are #${boards.xp.caller.rank} of ${boards.xp.totalPlayers} with ${boards.xp.caller.xp} XP.`
              }
              rows={boards.xp.entries.map((entry) => ({
                key: `${entry.rank}-${entry.displayName}`,
                rank: entry.rank,
                name: entry.displayName,
                value: `${entry.xp}`,
                unit: "XP",
                detail: `${entry.wins}W · ${entry.losses}L · best streak ${entry.bestWinStreak}`,
                isCaller: entry.isCaller,
              }))}
            />

            <Board
              eyebrow="First discoveries"
              title="Discovery"
              emptyLabel="No species claimed yet. Scan a plant to claim one."
              standing={
                boards.discovery.caller.rank === null
                  ? signedIn
                    ? "You have not been first to a species yet — scan something new."
                    : VISITOR_DISCOVERY_STANDING
                  : `You are #${boards.discovery.caller.rank} of ${boards.discovery.totalPlayers} with ${boards.discovery.caller.discoveries} first finds.`
              }
              rows={boards.discovery.entries.map((entry) => ({
                key: `${entry.rank}-${entry.displayName}`,
                rank: entry.rank,
                name: entry.displayName,
                value: `${entry.discoveries}`,
                unit: "species",
                detail: "first to scan them",
                isCaller: entry.isCaller,
              }))}
            />
          </>
        )}
      </div>
    </main>
  );
}

interface BoardRow {
  key: string;
  rank: number;
  name: string;
  /** The ranked figure, on its own so it can be set large and tabular. */
  value: string;
  unit: string;
  detail: string;
  isCaller: boolean;
}

function Board({
  eyebrow,
  title,
  rows,
  standing,
  emptyLabel,
}: {
  eyebrow: string;
  title: string;
  rows: BoardRow[];
  standing: string;
  emptyLabel: string;
}) {
  return (
    <section className="pixel-panel p-3">
      <p className="font-pixel text-[9px] opacity-60">{eyebrow}</p>
      <h2 className="font-pixel mt-2 text-xs leading-relaxed">{title}</h2>

      {rows.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed opacity-75">{emptyLabel}</p>
      ) : (
        <ol
          className="mt-3 flex flex-col gap-1.5"
          aria-label={`${title} ranking`}
        >
          {rows.map((row, index) => {
            /*
             * Competition ranking gives every player on the same score the same
             * number, so seven players on 0 XP are all "2nd". Seven identical
             * numerals down the column reads as a bug — the same number stamped
             * over and over, as though the board failed to sort — so a tied run
             * alternates its row fill. The run is then legible as what it is:
             * distinct people who genuinely tied.
             *
             * Parity comes from the row's offset within its own run, not from
             * its index in the list, so a tie always starts on the same shade
             * however far down the board it begins.
             */
            const tiedWith = rows.filter(
              (other) => other.rank === row.rank,
            ).length;
            const isTied = tiedWith > 1;
            const offsetInRun =
              index - rows.findIndex((other) => other.rank === row.rank);

            return (
              <li
                key={row.key}
                className={[
                  "rank-row",
                  row.isCaller ? "is-caller" : "",
                  isTied ? "is-tied" : "",
                  isTied && offsetInRun % 2 === 1 ? "is-tied-alt" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span
                  className={`rank-slot shrink-0${row.rank <= PODIUM_RANK ? " is-podium" : ""}`}
                  aria-hidden="true"
                >
                  {row.rank}
                </span>
                {/*
                The numeral above is decorative to a screen reader, and nothing
                replaced it — so the rank, the one thing this list exists to
                convey, was announced to nobody. This says it, and says when it
                is shared, since a tie is exactly the case a sighted reader can
                see at a glance and a listener cannot.
              */}
                <span className="sr-only">
                  {isTied
                    ? `Rank ${row.rank}, tied with ${tiedWith - 1} other ${
                        tiedWith - 1 === 1 ? "player" : "players"
                      }.`
                    : `Rank ${row.rank}.`}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="battle-server-copy block truncate text-[15px] leading-snug font-semibold">
                    {row.name}
                    {row.isCaller && (
                      // Text, not colour alone — the row also carries a heavier
                      // border, so the mark survives greyscale and colour blindness.
                      <span className="ml-1.5 align-middle text-[11px] font-bold tracking-wide uppercase opacity-70">
                        You
                      </span>
                    )}
                  </strong>
                  <small className="block text-[12px] leading-snug opacity-75">
                    {row.detail}
                  </small>
                </span>
                {/* The figure the board ranks on: the largest thing in the row. */}
                <span className="shrink-0 text-right">
                  <strong className="block text-[17px] leading-none font-bold tabular-nums">
                    {row.value}
                  </strong>
                  <small className="mt-0.5 block text-[10px] tracking-wide uppercase opacity-60">
                    {row.unit}
                  </small>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-3 border-t-2 border-black/15 pt-2 text-[10px] leading-relaxed opacity-80">
        {standing}
      </p>
    </section>
  );
}
