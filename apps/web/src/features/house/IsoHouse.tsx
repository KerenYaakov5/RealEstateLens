import type { HousePartDto, HousePartName, HousePartStatus } from '@rel/shared';
import { motion } from 'motion/react';
import { box, gableRoof, project, type Point3 } from './isometric';

const SCALE = 22;

interface Face {
  points: string;
  shade: 'top' | 'left' | 'right';
}

interface PartShape {
  part: HousePartName;
  /** Base color (a CSS color, usually a design token). */
  color: string;
  faces: Face[];
  /** Where the status badge sits (model coordinates). */
  anchor: Point3;
}

function boxFaces(origin: Point3, size: { w: number; d: number; h: number }): Face[] {
  const faces = box(origin, size, SCALE);
  return [
    { points: faces.right, shade: 'right' },
    { points: faces.left, shade: 'left' },
    { points: faces.top, shade: 'top' },
  ];
}

const ROOF = gableRoof({ x: 2, y: 1.5, z: 4.2 }, { w: 5, d: 4, h: 1.8 }, SCALE);

// The model: footprint units, x to the right-back, y to the left-back. Listed back to front, so
// later parts are drawn over earlier ones (painter's algorithm).
const SHAPES: PartShape[] = [
  {
    part: 'parking',
    color: '#5b6b70',
    faces: [
      ...boxFaces({ x: 8.8, y: 1, z: 0 }, { w: 2.8, d: 3.4, h: 0.06 }),
      ...boxFaces({ x: 9.4, y: 1.8, z: 0.06 }, { w: 1.7, d: 1.1, h: 0.45 }),
      ...boxFaces({ x: 9.75, y: 1.95, z: 0.51 }, { w: 0.9, d: 0.8, h: 0.35 }),
    ],
    anchor: { x: 10.2, y: 2.7, z: 1.4 },
  },
  {
    part: 'structure',
    color: 'var(--color-sand)',
    faces: [
      ...boxFaces({ x: 2, y: 1.5, z: 0 }, { w: 5, d: 4, h: 4.2 }),
      { points: ROOF.right, shade: 'top' },
      { points: ROOF.gable, shade: 'right' },
      { points: ROOF.left, shade: 'left' },
    ],
    anchor: { x: 4.5, y: 3.5, z: 6.6 },
  },
  {
    part: 'balcony',
    color: '#b07a4a',
    faces: [
      ...boxFaces({ x: 7, y: 2.2, z: 2.1 }, { w: 1.4, d: 2.4, h: 0.18 }),
      ...boxFaces({ x: 8.3, y: 2.2, z: 2.28 }, { w: 0.1, d: 2.4, h: 0.75 }),
    ],
    anchor: { x: 8, y: 3.4, z: 3.6 },
  },
  {
    part: 'elevator',
    color: 'var(--color-brand)',
    faces: boxFaces({ x: 7, y: 4.8, z: 0 }, { w: 1.3, d: 1.3, h: 5.4 }),
    anchor: { x: 7.65, y: 5.45, z: 6.2 },
  },
  {
    part: 'safeRoom',
    color: '#4b5a75',
    faces: boxFaces({ x: 3, y: 5.5, z: 0 }, { w: 1.9, d: 1.5, h: 2.3 }),
    anchor: { x: 3.95, y: 6.25, z: 3 },
  },
];

const GROUND = boxFaces({ x: 0, y: 0, z: -0.2 }, { w: 12.2, d: 7.6, h: 0.2 });

const BADGE_RADIUS = 10;
const PADDING = 8;

/** The drawing's bounds, derived from every polygon and badge – nothing is clipped or wasted. */
function computeViewBox(): string {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const face of [...GROUND, ...SHAPES.flatMap((shape) => shape.faces)]) {
    for (const pair of face.points.split(' ')) {
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
function shadeColor(color: string, shade: Face['shade']): string {
  if (shade === 'top') {
    return `color-mix(in srgb, ${color} 78%, white)`;
  }
  if (shade === 'right') {
    return `color-mix(in srgb, ${color} 78%, black)`;
  }
  return color;
}

function faceStyle(color: string, shade: Face['shade'], status: HousePartStatus) {
  switch (status) {
    case 'full':
      return { fill: shadeColor(color, shade), fillOpacity: 1, stroke: 'rgb(19 40 46 / 0.25)' };
    case 'partial':
      // Opaque but faded: a see-through wall would show the ground through the house.
      return {
        fill: `color-mix(in srgb, ${shadeColor(color, shade)} 45%, white)`,
        fillOpacity: 1,
        stroke: color,
      };
    case 'missing':
      return {
        fill: 'var(--color-compromise)',
        fillOpacity: 0.05,
        stroke: 'var(--color-compromise)',
        strokeDasharray: '5 4',
      };
    case 'unknown':
      return {
        fill: 'var(--color-muted)',
        fillOpacity: 0.08,
        stroke: 'var(--color-muted)',
        strokeDasharray: '2 4',
      };
  }
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

  return (
    <svg
      viewBox={VIEW_BOX}
      className="h-auto w-full max-w-xl"
      role="group"
      aria-label="הבית שהתקציב קונה"
    >
      <g aria-hidden="true">
        {GROUND.map((face) => (
          <polygon
            key={face.shade}
            points={face.points}
            style={{ fill: shadeColor('var(--color-line)', face.shade) }}
          />
        ))}
      </g>

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
            className="cursor-pointer outline-none [&:focus-visible_polygon]:stroke-[3]"
          >
            {shape.faces.map((face, faceIndex) => (
              <polygon
                key={faceIndex}
                points={face.points}
                strokeWidth={isSelected ? 2.5 : 1}
                strokeLinejoin="round"
                style={faceStyle(shape.color, face.shade, status)}
              />
            ))}
            {badge !== null && (
              <g aria-hidden="true">
                <circle cx={bx} cy={by} r={BADGE_RADIUS} style={{ fill: badge.color }} />
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
    </svg>
  );
}
