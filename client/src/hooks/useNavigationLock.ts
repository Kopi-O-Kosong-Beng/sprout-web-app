import { useContext } from 'react';
import { NavigationLockContext } from '../context/NavigationLockContext';

export function useNavigationLock() {
  const context = useContext(NavigationLockContext);
  if (!context) {
    throw new Error(
      'useNavigationLock must be used inside <NavigationLockProvider>.'
    );
  }
  return context;
}
