import { useSyncExternalStore } from 'react';

/** Whether a CSS media query currently matches; updates when the screen changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    () => {
      return window.matchMedia(query).matches;
    },
    () => {
      return false;
    },
  );
}

/** Tailwind's `lg` breakpoint – where the panel sits beside the results. */
export const DESKTOP_QUERY = '(min-width: 1024px)';
