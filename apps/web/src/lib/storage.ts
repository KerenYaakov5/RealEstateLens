/**
 * localStorage wrapped in try/catch: it can be unavailable (private mode, blocked site data)
 * or hold something unreadable. The app must work the same without it.
 */
export function readStored(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not being able to remember choices is not an error the user needs to see.
  }
}

export function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Same as above.
  }
}
