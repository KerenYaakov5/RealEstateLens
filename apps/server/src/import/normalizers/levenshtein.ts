// Reused rows keep the hot path allocation-free (search runs this thousands of times per query).
let previousRow = new Uint16Array(64);
let currentRow = new Uint16Array(64);

/** Edit distance between two strings (insert / delete / substitute = 1). */
export function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }
  if (previousRow.length <= b.length) {
    previousRow = new Uint16Array(b.length + 1);
    currentRow = new Uint16Array(b.length + 1);
  }
  let previous = previousRow;
  let current = currentRow;
  for (let j = 0; j <= b.length; j++) {
    previous[j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    const charA = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = charA === b.charCodeAt(j - 1) ? 0 : 1;
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      const substitution = (previous[j - 1] ?? 0) + cost;
      current[j] = Math.min(deletion, insertion, substitution);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length] ?? 0;
}

/** Similarity in [0, 1]: 1 means identical. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) {
    return 1;
  }
  return 1 - levenshtein(a, b) / longest;
}

/**
 * Upper bound of `similarity` from lengths alone: the distance is at least the length
 * difference. Lets callers skip the full computation when a threshold cannot be reached.
 */
export function maxSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) {
    return 1;
  }
  return 1 - Math.abs(a.length - b.length) / longest;
}
