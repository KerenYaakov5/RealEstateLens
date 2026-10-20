import type { HousePartDto, HousePartName, HousePartStatus } from '@rel/shared';
import { motion } from 'motion/react';
import {
  box,
  gableRoof,
  project,
  rectOnFloor,
  rectOnLeftWall,
  rectOnRightWall,
  type Point3,
} from './isometric';

const SCALE = 22;

type Shade = 'top' | 'left' | 'right';

/** One drawn element: a flat polygon or a round blob (leaves, wheels). */
type Primitive =
  | { kind: 'poly'; points: string; color: string; shade: Shade; glass?: boolean }
  | { kind: 'circle'; at: Point3; r: number; color: string; shade: Shade };

interface PartShape {
  part: HousePartName;
  primitives: Primitive[];
  /** Where the status badge sits (model coordinates). */
  anchor: Point3;
}

// Palette of the drawing – lively but calm, one hue per material.
const C = {
  wall: '#eef2f5',
  roof: '#c8604a',
  glass: '#a9d3ef',
  frame: '#ffffff',
  door: '#7a5a43',
  asphalt: '#4d5862',
  paint: '#f4f6f8',
  car: '#2f6fd1',
  carGlass: '#d4ebfa',
  tyre: '#23292e',
  wood: '#b98557',
  pot: '#c46a45',
  leaf: '#4f9f5c',
  leafLight: '#7cc487',
  cabin: '#0f6b6f',
  machine: '#7d8b95',
  concrete: '#9aa7b1',
  steel: '#56636d',
  lawn: '#bfe3b4',
  path: '#e2e6ea',
  trunk: '#8a6a4f',
} as const;

function boxPrims(
  origin: Point3,
  size: { w: number; d: number; h: number },
  color: string,
  glass = false,
): Primitive[] {
  const faces = box(origin, size, SCALE);
  return [
    { kind: 'poly', points: faces.right, color, shade: 'right', glass },
    { kind: 'poly', points: faces.left, color, shade: 'left', glass },
    { kind: 'poly', points: faces.top, color, shade: 'top', glass },
  ];
}

function flat(points: string, color: string, shade: Shade = 'left'): Primitive {
  return { kind: 'poly', points, color, shade };
}

/** A window: white frame with glass inside, on a left- or right-facing wall. */
function windowOn(
  wall: 'left' | 'right',
  plane: number,
  from: { a: number; z: number },
  to: { a: number; z: number },
): Primitive[] {
  const inset = 0.08;
  const rect = (f: { a: number; z: number }, t: { a: number; z: number }) => {
    return wall === 'left'
      ? rectOnLeftWall(plane, { x: f.a, z: f.z }, { x: t.a, z: t.z }, SCALE)
      : rectOnRightWall(plane, { y: f.a, z: f.z }, { y: t.a, z: t.z }, SCALE);
  };
  return [
    flat(rect(from, to), C.frame, wall),
    flat(
      rect({ a: from.a + inset, z: from.z + inset }, { a: to.a - inset, z: to.z - inset }),
      C.glass,
      wall,
    ),
  ];
}

const ROOF = gableRoof({ x: 2, y: 1.5, z: 4.2 }, { w: 5, d: 4, h: 1.8 }, SCALE);

// The model: footprint units, x to the right-back, y to the left-back. Listed back to front, so
// later parts are drawn over earlier ones (painter's algorithm).
const SHAPES: PartShape[] = [
  {
    part: 'parking',
    primitives: [
      ...boxPrims({ x: 8.8, y: 1, z: 0 }, { w: 2.8, d: 3.4, h: 0.06 }, C.asphalt),
      flat(rectOnFloor(0.061, { x: 8.95, y: 1.15 }, { x: 9.05, y: 4.25 }, SCALE), C.paint, 'top'),
      flat(rectOnFloor(0.061, { x: 11.35, y: 1.15 }, { x: 11.45, y: 4.25 }, SCALE), C.paint, 'top'),
      // The car: body, cabin with windows, wheels on the side facing the viewer.
      ...boxPrims({ x: 9.6, y: 1.45, z: 0.22 }, { w: 1.25, d: 2.5, h: 0.5 }, C.car),
      ...boxPrims({ x: 9.7, y: 2.1, z: 0.72 }, { w: 1.05, d: 1.35, h: 0.42 }, C.car),
      flat(
        rectOnRightWall(10.75, { y: 2.2, z: 0.78 }, { y: 3.35, z: 1.08 }, SCALE),
        C.carGlass,
        'right',
      ),
      flat(
        rectOnLeftWall(3.45, { x: 9.8, z: 0.78 }, { x: 10.65, z: 1.08 }, SCALE),
        C.carGlass,
        'left',
      ),
      { kind: 'circle', at: { x: 10.85, y: 1.95, z: 0.22 }, r: 6, color: C.tyre, shade: 'left' },
      { kind: 'circle', at: { x: 10.85, y: 3.45, z: 0.22 }, r: 6, color: C.tyre, shade: 'left' },
    ],
    anchor: { x: 10.2, y: 2.7, z: 2 },
  },
  {
    part: 'structure',
    primitives: [
      ...boxPrims({ x: 2, y: 1.5, z: 0 }, { w: 5, d: 4, h: 4.2 }, C.wall),
      // Front wall (facing left): door and two floors of windows.
      flat(rectOnLeftWall(5.5, { x: 5.3, z: 0 }, { x: 6.1, z: 1.7 }, SCALE), C.door),
      ...windowOn('left', 5.5, { a: 2.4, z: 2.7 }, { a: 3.3, z: 3.6 }),
      ...windowOn('left', 5.5, { a: 4.0, z: 2.7 }, { a: 4.9, z: 3.6 }),
      ...windowOn('left', 5.5, { a: 5.6, z: 2.7 }, { a: 6.5, z: 3.6 }),
      // Side wall (facing right): ground-floor windows and the balcony door.
      ...windowOn('right', 7, { a: 1.9, z: 0.8 }, { a: 2.8, z: 1.7 }),
      ...windowOn('right', 7, { a: 3.4, z: 0.8 }, { a: 4.3, z: 1.7 }),
      ...windowOn('right', 7, { a: 2.9, z: 2.3 }, { a: 4.0, z: 3.7 }),
      { kind: 'poly', points: ROOF.right, color: C.roof, shade: 'top' },
      { kind: 'poly', points: ROOF.gable, color: C.wall, shade: 'right' },
      { kind: 'poly', points: ROOF.left, color: C.roof, shade: 'left' },
    ],
    anchor: { x: 4.5, y: 3.5, z: 6.6 },
  },
  {
    part: 'balcony',
    primitives: [
      ...boxPrims({ x: 7, y: 2.2, z: 2.1 }, { w: 1.4, d: 2.4, h: 0.18 }, C.wood),
      // Two potted plants.
      ...boxPrims({ x: 7.3, y: 2.4, z: 2.28 }, { w: 0.4, d: 0.4, h: 0.35 }, C.pot),
      { kind: 'circle', at: { x: 7.5, y: 2.6, z: 2.95 }, r: 9, color: C.leaf, shade: 'left' },
      {
        kind: 'circle',
        at: { x: 7.45, y: 2.55, z: 3.15 },
        r: 5,
        color: C.leafLight,
        shade: 'left',
      },
      ...boxPrims({ x: 7.3, y: 3.9, z: 2.28 }, { w: 0.4, d: 0.4, h: 0.35 }, C.pot),
      { kind: 'circle', at: { x: 7.5, y: 4.1, z: 2.9 }, r: 8, color: C.leaf, shade: 'left' },
      {
        kind: 'circle',
        at: { x: 7.45, y: 4.05, z: 3.08 },
        r: 4.5,
        color: C.leafLight,
        shade: 'left',
      },
      // Glass railing on the open sides.
      ...boxPrims({ x: 8.3, y: 2.2, z: 2.28 }, { w: 0.1, d: 2.4, h: 0.75 }, C.glass, true),
      ...boxPrims({ x: 7, y: 4.5, z: 2.28 }, { w: 1.4, d: 0.1, h: 0.75 }, C.glass, true),
    ],
    anchor: { x: 8, y: 3.4, z: 3.9 },
  },
  {
    part: 'elevator',
    primitives: [
      // The cabin, seen through the glass shaft.
      ...boxPrims({ x: 7.15, y: 4.95, z: 2.2 }, { w: 1, d: 1, h: 1.25 }, C.cabin),
      ...boxPrims({ x: 7, y: 4.8, z: 0 }, { w: 1.3, d: 1.3, h: 5.4 }, C.glass, true),
      ...boxPrims({ x: 7, y: 4.8, z: 5.4 }, { w: 1.3, d: 1.3, h: 0.3 }, C.machine),
    ],
    anchor: { x: 7.65, y: 5.45, z: 6.5 },
  },
  {
    part: 'safeRoom',
    primitives: [
      ...boxPrims({ x: 3, y: 5.5, z: 0 }, { w: 1.9, d: 1.5, h: 2.3 }, C.concrete),
      // Steel door and a shuttered window.
      flat(rectOnLeftWall(7, { x: 3.55, z: 0 }, { x: 4.35, z: 1.65 }, SCALE), C.steel),
      flat(rectOnRightWall(4.9, { y: 5.95, z: 1.2 }, { y: 6.6, z: 1.8 }, SCALE), C.steel, 'right'),
    ],
    anchor: { x: 3.95, y: 6.25, z: 3 },
  },
];

/** Not data – the setting: lawn and a path to the door (trees are in FOREGROUND). */
const GROUND: Primitive[] = [
  ...boxPrims({ x: 0, y: 0, z: -0.2 }, { w: 12.2, d: 7.6, h: 0.2 }, C.lawn),
  flat(rectOnFloor(0.002, { x: 5.3, y: 5.5 }, { x: 6.1, y: 7.6 }, SCALE), C.path, 'top'),
];
// In front of the house (drawn last), so a see-through "missing" house never shows a tree inside.
const FOREGROUND: Primitive[] = [
  ...tree({ x: 0.9, y: 6.7 }, 0.9),
  ...tree({ x: 11.5, y: 6.7 }, 0.8),
];

function tree(at: { x: number; y: number }, size: number): Primitive[] {
  return [
    ...boxPrims(
      { x: at.x - 0.12, y: at.y - 0.12, z: 0 },
      { w: 0.24, d: 0.24, h: 1.1 * size },
      C.trunk,
    ),
    {
      kind: 'circle',
      at: { x: at.x, y: at.y, z: 1.5 * size },
      r: 17 * size,
      color: C.leaf,
      shade: 'left',
    },
    {
      kind: 'circle',
      at: { x: at.x - 0.1, y: at.y - 0.1, z: 1.85 * size },
      r: 9 * size,
      color: C.leafLight,
      shade: 'left',
    },
  ];
}

const BADGE_RADIUS = 10;
const PADDING = 8;

/** The drawing's bounds, derived from every element and badge – nothing is clipped or wasted. */
function computeViewBox(): string {
  const xs: number[] = [];
  const ys: number[] = [];
  const all = [...GROUND, ...FOREGROUND, ...SHAPES.flatMap((shape) => shape.primitives)];
  for (const primitive of all) {
    if (primitive.kind === 'circle') {
      const [x, y] = project(primitive.at, SCALE);
      xs.push(x - primitive.r, x + primitive.r);
      ys.push(y - primitive.r, y + primitive.r);
      continue;
    }
    for (const pair of primitive.points.split(' ')) {
      const [x, y] = pair.split(',').map(Number);
      xs.push(x ?? 0);
      ys.push(y ?? 0);
    }
  }
  for (const shape of SHAPES) {
    const [x, y] = project(shape.anchor, SCALE);
    xs.push(x - BADGE_RADIUS, x + BADGE_RADIUS);
    ys.push(y - BADGE_RADIUS, y + BADGE_RADIUS);
  }
  const minX = Math.min(...xs) - PADDING;
  const minY = Math.min(...ys) - PADDING;
  const width = Math.max(...xs) - minX + PADDING;
  const height = Math.max(...ys) - minY + PADDING;
  return `${minX.toFixed(0)} ${minY.toFixed(0)} ${width.toFixed(0)} ${height.toFixed(0)}`;
}

const VIEW_BOX = computeViewBox();

/** Light top, mid left, dark right – a fixed light source from the top-left. */
function shadeColor(color: string, shade: Shade): string {
  if (shade === 'top') {
    return `color-mix(in srgb, ${color} 80%, white)`;
  }
  if (shade === 'right') {
    return `color-mix(in srgb, ${color} 82%, black)`;
  }
  return color;
}

function primitiveStyle(primitive: Primitive, status: HousePartStatus) {
  const { color, shade } = primitive;
  const glass = primitive.kind === 'poly' && primitive.glass === true;
  switch (status) {
    case 'full':
      return {
        fill: shadeColor(color, shade),
        fillOpacity: glass ? 0.55 : 1,
        stroke: 'rgb(19 40 46 / 0.22)',
      };
    case 'partial':
      // Faded but opaque (glass stays see-through): the part exists in only some deals.
      return {
        fill: `color-mix(in srgb, ${shadeColor(color, shade)} 40%, white)`,
        fillOpacity: glass ? 0.45 : 1,
        stroke: `color-mix(in srgb, ${color} 60%, white)`,
      };
    case 'missing':
      return {
        fill: 'var(--color-compromise)',
        fillOpacity: 0.04,
        stroke: 'var(--color-compromise)',
        strokeDasharray: '5 4',
      };
    case 'unknown':
      return {
        fill: 'var(--color-muted)',
        fillOpacity: 0.06,
        stroke: 'var(--color-muted)',
        strokeDasharray: '2 4',
      };
  }
}

function Shape({
  primitive,
  style,
  strokeWidth,
}: {
  primitive: Primitive;
  style: ReturnType<typeof primitiveStyle>;
  strokeWidth: number;
}) {
  if (primitive.kind === 'circle') {
    const [cx, cy] = project(primitive.at, SCALE);
    return <circle cx={cx} cy={cy} r={primitive.r} strokeWidth={strokeWidth} style={style} />;
  }
  return (
    <polygon
      points={primitive.points}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      style={style}
    />
  );
}

const BADGE: Readonly<Record<HousePartStatus, { text: string; color: string } | null>> = {
  full: null,
  partial: { text: '½', color: 'var(--color-warn)' },
  missing: { text: '!', color: 'var(--color-compromise)' },
  unknown: { text: '?', color: 'var(--color-muted)' },
};

interface IsoHouseProps {
  parts: HousePartDto[];
  labels: Readonly<Record<HousePartName, string>>;
  selected: HousePartName | null;
  onSelect: (part: HousePartName) => void;
}

/** The house the budget buys: each part drawn by how often affordable deals include it. */
export function IsoHouse({ parts, labels, selected, onSelect }: IsoHouseProps) {
  const statusOf = new Map(parts.map((part) => [part.part, part.status] as const));
  const setting = (primitives: Primitive[]) => {
    return primitives.map((primitive, index) => (
      <Shape
        key={index}
        primitive={primitive}
        style={primitiveStyle(primitive, 'full')}
        strokeWidth={0.6}
      />
    ));
  };

  return (
    <svg
      viewBox={VIEW_BOX}
      className="h-auto w-full max-w-xl"
      role="group"
      aria-label="הבית שהתקציב קונה"
    >
      <g aria-hidden="true">{setting(GROUND)}</g>

      {SHAPES.map((shape, index) => {
        const status = statusOf.get(shape.part) ?? 'unknown';
        const badge = BADGE[status];
        const [bx, by] = project(shape.anchor, SCALE);
        const isSelected = selected === shape.part;
        return (
          <motion.g
            // A new key per status replays the "being built" animation when the status changes.
            key={`${shape.part}-${status}`}
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: index * 0.06, ease: 'easeOut' }}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            aria-label={labels[shape.part]}
            onClick={() => {
              onSelect(shape.part);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(shape.part);
              }
            }}
            className="cursor-pointer outline-none [&:focus-visible_:is(polygon,circle)]:stroke-[3]"
          >
            {shape.primitives.map((primitive, primitiveIndex) => (
              <Shape
                key={primitiveIndex}
                primitive={primitive}
                style={primitiveStyle(primitive, status)}
                strokeWidth={isSelected ? 2.5 : 1}
              />
            ))}
            {badge !== null && (
              <g aria-hidden="true">
                <circle
                  cx={bx}
                  cy={by}
                  r={BADGE_RADIUS}
                  style={{ fill: badge.color, stroke: 'white', strokeWidth: 2 }}
                />
                <text
                  x={bx}
                  y={by + 4.5}
                  textAnchor="middle"
                  className="text-[13px] font-extrabold"
                  style={{ fill: 'white' }}
                >
                  {badge.text}
                </text>
              </g>
            )}
          </motion.g>
        );
      })}

      <g aria-hidden="true">{setting(FOREGROUND)}</g>
    </svg>
  );
}
