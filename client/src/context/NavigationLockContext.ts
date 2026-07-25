import { createContext } from 'react';

export interface NavigationLockContextValue {
  isNavigationLocked: boolean;
  acquireNavigationLock(): () => void;
}

export const NavigationLockContext =
  createContext<NavigationLockContextValue | null>(null);
