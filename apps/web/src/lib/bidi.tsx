import type { ReactNode } from 'react';

// A number with its separators and an adjacent unit: "3,889,710 ₪", "60%", "5.6".
const NUMBER_WITH_UNIT = /(\d[\d,.]*(?:\s?(?:%|₪))?)/;

/**
 * Hebrew text with numbers, safe for right-to-left display. Two numbers in a row ("…3,889,710 ₪
 * 60%…") are otherwise reordered by the browser's bidi algorithm; isolating each number keeps
 * the order as written.
 */
export function withIsolatedNumbers(text: string): ReactNode[] {
  return text.split(NUMBER_WITH_UNIT).map((part, index) => {
    // split() with a capture group puts the matches at odd indexes.
    return index % 2 === 1 ? (
      <bdi key={index} dir="ltr" className="num whitespace-nowrap">
        {part}
      </bdi>
    ) : (
      part
    );
  });
}
