/** A point in the house's 3D model: x to the right-back, y to the left-back, z up. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/** Isometric projection to SVG coordinates (y grows downwards). */
export function project(point: Point3, scale: number): [number, number] {
  return [(point.x - point.y) * COS30 * scale, ((point.x + point.y) * SIN30 - point.z) * scale];
}

/** Any flat polygon in the model, as SVG points. */
export function polygon(points: Point3[], scale: number): string {
  return points
    .map((point) => {
      const [sx, sy] = project(point, scale);
      return `${sx.toFixed(1)},${sy.toFixed(1)}`;
    })
    .join(' ');
}

export interface BoxFaces {
  top: string;
  /** Face towards the viewer's left (the y side). */
  left: string;
  /** Face towards the viewer's right (the x side). */
  right: string;
}

/** The three visible faces of an axis-aligned box at (x, y, z) with width w, depth d, height h. */
export function box(
  origin: Point3,
  size: { w: number; d: number; h: number },
  scale: number,
): BoxFaces {
  const { x, y, z } = origin;
  const { w, d, h } = size;
  return {
    top: polygon(
      [
        { x, y, z: z + h },
        { x: x + w, y, z: z + h },
        { x: x + w, y: y + d, z: z + h },
        { x, y: y + d, z: z + h },
      ],
      scale,
    ),
    left: polygon(
      [
        { x, y: y + d, z },
        { x: x + w, y: y + d, z },
        { x: x + w, y: y + d, z: z + h },
        { x, y: y + d, z: z + h },
      ],
      scale,
    ),
    right: polygon(
      [
        { x: x + w, y, z },
        { x: x + w, y: y + d, z },
        { x: x + w, y: y + d, z: z + h },
        { x: x + w, y, z: z + h },
      ],
      scale,
    ),
  };
}

/** A gable roof over a box footprint, ridge running along x. */
export function gableRoof(
  origin: Point3,
  size: { w: number; d: number; h: number },
  scale: number,
): { left: string; right: string; gable: string } {
  const { x, y, z } = origin;
  const { w, d, h } = size;
  const ridgeY = y + d / 2;
  return {
    // The slope facing the viewer.
    left: polygon(
      [
        { x, y: y + d, z },
        { x: x + w, y: y + d, z },
        { x: x + w, y: ridgeY, z: z + h },
        { x, y: ridgeY, z: z + h },
      ],
      scale,
    ),
    right: polygon(
      [
        { x, y, z },
        { x: x + w, y, z },
        { x: x + w, y: ridgeY, z: z + h },
        { x, y: ridgeY, z: z + h },
      ],
      scale,
    ),
    // The triangular end wall on the x side.
    gable: polygon(
      [
        { x: x + w, y, z },
        { x: x + w, y: y + d, z },
        { x: x + w, y: ridgeY, z: z + h },
      ],
      scale,
    ),
  };
}

/** A rectangle on a wall facing the viewer's left (the plane y = const): a window, a door. */
export function rectOnLeftWall(
  y: number,
  from: { x: number; z: number },
  to: { x: number; z: number },
  scale: number,
): string {
  return polygon(
    [
      { x: from.x, y, z: from.z },
      { x: to.x, y, z: from.z },
      { x: to.x, y, z: to.z },
      { x: from.x, y, z: to.z },
    ],
    scale,
  );
}

/** A rectangle on a wall facing the viewer's right (the plane x = const). */
export function rectOnRightWall(
  x: number,
  from: { y: number; z: number },
  to: { y: number; z: number },
  scale: number,
): string {
  return polygon(
    [
      { x, y: from.y, z: from.z },
      { x, y: to.y, z: from.z },
      { x, y: to.y, z: to.z },
      { x, y: from.y, z: to.z },
    ],
    scale,
  );
}

/** A rectangle lying flat at height z: a path, a parking line. */
export function rectOnFloor(
  z: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  scale: number,
): string {
  return polygon(
    [
      { x: from.x, y: from.y, z },
      { x: to.x, y: from.y, z },
      { x: to.x, y: to.y, z },
      { x: from.x, y: to.y, z },
    ],
    scale,
  );
}
