import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { NavigationLockContext } from './NavigationLockContext';

export function NavigationLockProvider({ children }: { children: ReactNode }) {
  const [lockCount, setLockCount] = useState(0);
  const isNavigationLocked = lockCount > 0;

  const acquireNavigationLock = useCallback(() => {
    let released = false;
    setLockCount((current) => current + 1);

    return () => {
      if (released) return;
      released = true;
      setLockCount((current) => Math.max(0, current - 1));
    };
  }, []);

  useEffect(() => {
    if (!isNavigationLocked) return;

    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [isNavigationLocked]);

  const value = useMemo(
    () => ({ isNavigationLocked, acquireNavigationLock }),
    [acquireNavigationLock, isNavigationLocked]
  );

  return (
    <NavigationLockContext.Provider value={value}>
      {children}
    </NavigationLockContext.Provider>
  );
}
