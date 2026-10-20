import { motion } from 'motion/react';

/** One gentle spring for every moving selection in the app. */
export const SELECTION_SPRING = { type: 'spring', stiffness: 500, damping: 38, mass: 0.8 } as const;

interface SlidingHighlightProps {
  /** Shared by all options of one group, so the highlight slides between them. */
  layoutId: string;
  className: string;
}

/**
 * The background of the selected option in a group. Rendered only inside the selected option;
 * motion animates it from the previous option's position, so it slides instead of jumping.
 */
export function SlidingHighlight({ layoutId, className }: SlidingHighlightProps) {
  return (
    <motion.span
      aria-hidden="true"
      layoutId={layoutId}
      transition={SELECTION_SPRING}
      className={`absolute inset-0 transition-colors duration-200 ${className}`}
    />
  );
}
