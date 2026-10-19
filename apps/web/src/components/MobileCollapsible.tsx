import type { ReactNode } from 'react';
import { DESKTOP_QUERY, useMediaQuery } from '../lib/useMediaQuery';

interface MobileCollapsibleProps {
  title: string;
  /** One line describing the current choices, shown while collapsed. */
  summary: string;
  children: ReactNode;
}

/**
 * Always open on desktop; on a phone it collapses (with a summary of the choices) so the results
 * are not pushed far below a long panel.
 */
export function MobileCollapsible({ title, summary, children }: MobileCollapsibleProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  if (isDesktop) {
    return <div className="space-y-5">{children}</div>;
  }
  return (
    <details className="rounded-xl border border-line px-3 py-2">
      <summary className="cursor-pointer">
        <span className="text-sm font-medium text-ink-soft">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{summary}</span>
      </summary>
      <div className="mt-3 space-y-5">{children}</div>
    </details>
  );
}
