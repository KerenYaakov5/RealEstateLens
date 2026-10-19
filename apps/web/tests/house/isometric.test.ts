import { describe, expect, it } from 'vitest';
import { box, project } from '../../src/features/house/isometric';

describe('project', () => {
  it('maps the origin to the origin', () => {
    const [x, y] = project({ x: 0, y: 0, z: 0 }, 10);

    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });

  it('draws height straight up on screen', () => {
    const [x, y] = project({ x: 0, y: 0, z: 2 }, 10);

    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(-20);
  });

  it('sends x to the right and y to the left at the same depth', () => {
    const [xRight] = project({ x: 1, y: 0, z: 0 }, 10);
    const [xLeft] = project({ x: 0, y: 1, z: 0 }, 10);

    expect(xRight).toBeGreaterThan(0);
    expect(xLeft).toBeCloseTo(-xRight);
  });
});

describe('box', () => {
  it('returns three faces of four points each', () => {
    const faces = box({ x: 0, y: 0, z: 0 }, { w: 2, d: 1, h: 3 }, 10);

    for (const face of [faces.top, faces.left, faces.right]) {
      expect(face.split(' ')).toHaveLength(4);
    }
  });
});
