import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CITY_REFERENCES } from '../../src/data/cities.js';
import { CityMatcher } from '../../src/import/normalizers/location.js';
import { distanceKm, parseCbsCoordinates } from '../../src/services/geo/itm.js';
import { DEFAULT_SNAPSHOT_PATH } from '../../src/services/locality.service.js';

interface SnapshotLocality {
  code: number;
  nameHe: string;
  coordinates: number | null;
}

const snapshot = JSON.parse(readFileSync(DEFAULT_SNAPSHOT_PATH, 'utf8')) as {
  localities: SnapshotLocality[];
};
const byCode = new Map(snapshot.localities.map((locality) => [locality.code, locality]));

describe('parseCbsCoordinates', () => {
  it('splits the 12-digit form into 6-digit X and Y (meters)', () => {
    expect(parseCbsCoordinates(179253658225)).toEqual({ x: 179253, y: 658225 });
  });

  it('treats other forms as unknown instead of guessing', () => {
    expect(parseCbsCoordinates(2067063030)).toBeNull();
    expect(parseCbsCoordinates(null)).toBeNull();
    expect(parseCbsCoordinates(12.5)).toBeNull();
  });
});

describe('official CBS codes in our city references', () => {
  const matcher = new CityMatcher(CITY_REFERENCES);

  it.each(CITY_REFERENCES.map((city) => [city.key, city.cbsCode] as const))(
    '%s (code %d) exists in the CBS file, names the same city and has coordinates',
    (key, code) => {
      const locality = byCode.get(code);

      expect(locality).toBeDefined();
      const match = matcher.match(locality?.nameHe ?? '');
      expect(match.ok && match.value.cityKey).toBe(key);
      expect(parseCbsCoordinates(locality?.coordinates)).not.toBeNull();
    },
  );
});

describe('distanceKm on official coordinates', () => {
  const point = (code: number) => {
    const parsed = parseCbsCoordinates(byCode.get(code)?.coordinates);
    if (parsed === null) {
      throw new Error(`no coordinates for ${code}`);
    }
    return parsed;
  };

  it('is symmetric and zero for the same place', () => {
    expect(distanceKm(point(6600), point(6600))).toBe(0);
    expect(distanceKm(point(6600), point(5000))).toBeCloseTo(distanceKm(point(5000), point(6600)));
  });

  it("orders neighbours sensibly: Givatayim is closer to Ramat Gan than Be'er Sheva is", () => {
    const ramatGan = point(8600);

    expect(distanceKm(ramatGan, point(6300))).toBeLessThan(distanceKm(ramatGan, point(9000)));
  });
});
