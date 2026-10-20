import { useEffect, useRef, useState } from 'react';

const GAP_PX = 24;

/**
 * Sticky offset for a side panel. A panel that fits the window sticks to the top as usual. A
 * taller one gets a negative offset, so it scrolls with the page and sticks only once its bottom
 * reaches the bottom of the window – every part of it stays reachable.
 */
export function useStickyTop<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [top, setTop] = useState(GAP_PX);

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }
    const update = (): void => {
      setTop(Math.min(GAP_PX, window.innerHeight - element.offsetHeight - GAP_PX));
    };
    update();
    // Missing in old browsers and in jsdom; window resizes are still handled.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return { ref, top };
}
