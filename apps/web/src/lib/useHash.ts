import { useSyncExternalStore } from 'react';

/** The URL hash ("#/admin"), updating on navigation – enough routing for two screens. */
export function useHash(): string {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('hashchange', onChange);
      return () => {
        window.removeEventListener('hashchange', onChange);
      };
    },
    () => {
      return window.location.hash;
    },
    () => {
      return '';
    },
  );
}
