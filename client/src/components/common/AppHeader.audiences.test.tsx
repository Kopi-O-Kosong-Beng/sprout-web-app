import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from '../../context/AuthContext';
import { NavigationLockProvider } from '../../context/NavigationLockProvider';
import type { AuthProfile } from '../../services/sproutApi';
import AppHeader from './AppHeader';

/**
 * The nav answers three audiences, and the difference between "greyed out" and
 * "absent" carries meaning:
 *
 *   greyed  — you could reach this by verifying your account (Scan, Archive,
 *             PVE Battle)
 *   absent  — no amount of signing in gets you here (Studio, API Test, Ticket
 *             Manager, Admin)
 *
 * Showing an operator tool as disabled would read as "log in to access", which
 * is a lie; hiding a game screen would leave a visitor with no idea the game
 * exists. So each rule is asserted on both axes.
 */

const PLAYER_TABS = ['Scan', 'Archive', 'PVE Battle'];
const PUBLIC_TABS = ['Home', 'Ranking', 'Contact'];
const OPERATOR_TABS = ['Studio', 'API Test', 'Ticket Manager', 'Admin'];

function authValue(
  status: AuthContextValue['status'],
  profile: AuthProfile | null
): AuthContextValue {
  return {
    status,
    firebaseUser: null,
    profile,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    refreshProfile: vi.fn(),
  };
}

function profileFor(isAdmin: boolean): AuthProfile {
  return {
    uid: 'user-1',
    email: 'player@example.com',
    displayName: 'Player',
    emailVerified: true,
    isAdmin,
    isSuperAdmin: isAdmin,
  };
}

function renderNav(status: AuthStatus, profile: AuthProfile | null) {
  render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue(status, profile)}>
        <NavigationLockProvider>
          <AppHeader />
        </NavigationLockProvider>
      </AuthContext.Provider>
    </MemoryRouter>
  );
  return screen.getByRole('navigation', { name: /primary/i });
}

/** Present and clickable. */
function expectOpen(nav: HTMLElement, labels: string[]) {
  for (const label of labels) {
    expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
  }
}

/** Present, but inert — rendered as a span rather than a link. */
function expectGreyed(nav: HTMLElement, labels: string[]) {
  for (const label of labels) {
    expect(within(nav).getByText(label)).toHaveAttribute('aria-disabled', 'true');
    expect(within(nav).queryByRole('link', { name: label })).not.toBeInTheDocument();
  }
}

function expectAbsent(nav: HTMLElement, labels: string[]) {
  for (const label of labels) {
    expect(within(nav).queryByText(label)).not.toBeInTheDocument();
  }
}

describe('AppHeader nav by audience', () => {
  it('gives a signed-out visitor the public three, greys the game, hides the tools', () => {
    const nav = renderNav('signed-out', null);

    expectOpen(nav, PUBLIC_TABS);
    expectGreyed(nav, PLAYER_TABS);
    expectAbsent(nav, OPERATOR_TABS);
  });

  /* An unverified account has a session but cannot pass ProtectedRoute, so it
   * gets the visitor's nav rather than the player's — showing Scan as live
   * would promise a page that immediately redirects to /verify-email. */
  it('treats an unverified account as a visitor', () => {
    const nav = renderNav('unverified', null);

    expectOpen(nav, PUBLIC_TABS);
    expectGreyed(nav, PLAYER_TABS);
    expectAbsent(nav, OPERATOR_TABS);
  });

  it('opens the game to a verified player but still hides the tools', () => {
    const nav = renderNav('authenticated', profileFor(false));

    expectOpen(nav, [...PUBLIC_TABS, ...PLAYER_TABS]);
    expectAbsent(nav, OPERATOR_TABS);
  });

  it('shows everything to a superadmin', () => {
    const nav = renderNav('authenticated', profileFor(true));

    expectOpen(nav, [...PUBLIC_TABS, ...PLAYER_TABS, ...OPERATOR_TABS]);
  });

  it('orders player tabs first, then a divider, then the operator tools', () => {
    const nav = renderNav('authenticated', profileFor(true));

    const labels = Array.from(nav.children).map((child) =>
      child.classList.contains('nav-divider') ? '|' : child.textContent
    );
    expect(labels).toEqual([
      'Home',
      'Scan',
      'Archive',
      'PVE Battle',
      'Ranking',
      'Contact',
      '|',
      'Admin',
      'Studio',
      'API Test',
      'Ticket Manager',
    ]);
  });

  /* The rule is drawn before the first tool in the rendered list, not at a
   * fixed index — so a nav with no tools must not end in a dangling rule. */
  it('draws no divider for a player, who has no tools to separate', () => {
    expect(
      renderNav('authenticated', profileFor(false)).querySelector('.nav-divider')
    ).toBeNull();
  });

  it('draws no divider for a signed-out visitor', () => {
    expect(renderNav('signed-out', null).querySelector('.nav-divider')).toBeNull();
  });

  /* API Test used to be public. It enumerates the API surface and fires real
   * requests at it, so it moved behind the grant with the other tools. */
  it('keeps API Test away from signed-out visitors and ordinary players', () => {
    expectAbsent(renderNav('signed-out', null), ['API Test']);
  });
});
