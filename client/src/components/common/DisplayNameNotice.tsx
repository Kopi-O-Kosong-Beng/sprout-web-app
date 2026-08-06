import { useEffect, useRef } from 'react';
import { acknowledgeDisplayNameNotice } from '../../services/sproutApi';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

/**
 * Tells a player, once, that the name they would have had was already taken.
 *
 * Accounts created outside the signup form — Google sign-in, mainly — get a
 * display name derived from their email's local part, and that used to be
 * written without the uniqueness check signup enforces. Two people called
 * `nat@` became two players called "nat": indistinguishable on the leaderboard,
 * and an almanac crediting a discovery to a name shared by both. The server now
 * assigns a free variant instead, which means someone ends up with a name they
 * never chose and were never told about. This is the telling.
 *
 * It renders nothing. It lives at the app root because the notice can arrive on
 * whichever screen the sign-in landed on, and it should not depend on that
 * screen being mounted.
 */
export default function DisplayNameNotice() {
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  /*
   * Guards the toast against React's double-invoked effects in StrictMode and
   * against any re-render before the refreshed profile arrives. Keyed by uid so
   * a different account signing in on the same page still gets told.
   */
  const announced = useRef<string | null>(null);

  useEffect(() => {
    const previous = profile?.displayNameAdjustedFrom;
    if (!profile || !previous) return;
    if (announced.current === profile.uid) return;
    announced.current = profile.uid;

    showToast({
      tone: 'info',
      message: `"${previous}" was taken, so you're "${profile.displayName}" for now.`,
      action: {
        label: 'okie!',
        // Acknowledging is what stops it coming back. A failure here is not
        // worth interrupting anyone over — the worst case is being told again
        // next sign-in — so it is swallowed rather than surfaced.
        onSelect: () => {
          void acknowledgeDisplayNameNotice()
            .then(() => refreshProfile())
            .catch(() => {});
        },
      },
    });
  }, [profile, refreshProfile, showToast]);

  return null;
}
