/** A point on the Israeli Transverse Mercator grid (ITM), in meters. */
export interface ItmPoint {
  x: number;
  y: number;
}

/**
 * Parses the "קואורדינטות" column of the CBS localities file.
 * Only the 12-digit form is accepted: 6 digits of X followed by 6 digits of Y, in meters
 * (e.g. Holon 179253658225 → x=179253, y=658225). This is the form used by every city in
 * our data. Other forms in the file (10 digits, empty) are treated as unknown rather than
 * guessed.
 */
export function parseCbsCoordinates(raw: number | null | undefined): ItmPoint | null {
  if (raw === null || raw === undefined || !Number.isInteger(raw)) {
    return null;
  }
  const digits = String(raw);
  if (digits.length !== 12) {
    return null;
  }
  return { x: Number(digits.slice(0, 6)), y: Number(digits.slice(6)) };
}

/** Straight-line distance in km. ITM is a planar metric grid, so Euclidean distance is valid. */
export function distanceKm(a: ItmPoint, b: ItmPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y) / 1000;
}
