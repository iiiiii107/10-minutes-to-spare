/* The pen pot.

   Each tool leaves a different mark and means a different thing, so the pot
   is a set of actions rather than a set of colours:

     pen         crosses a task off in its own colour
     pencil      the same, in graphite — a lighter, scratchier line
     highlighter a broad band that marks a task as next up, without finishing it
     marker      a thick red strike, for the ones you really want gone
     eraser      takes the mark back off

   A phone gets the pen and the eraser only. A pot of five is a desk object;
   on a small screen it would cost more room than it earns. */

export const TOOLS = {
  pen: {
    id: 'pen',
    label: 'Pen',
    /** Uses the task's own colour. */
    ink: null,
    width: 2.2,
    opacity: 1,
    completes: true,
    mobile: true,
  },
  pencil: {
    id: 'pencil',
    label: 'Pencil',
    ink: 'var(--graphite)',
    width: 1.6,
    opacity: 0.85,
    completes: true,
    mobile: false,
  },
  highlighter: {
    id: 'highlighter',
    label: 'Highlighter',
    ink: 'var(--butter)',
    width: 15,
    opacity: 0.45,
    completes: false,
    mobile: false,
  },
  marker: {
    id: 'marker',
    label: 'Marker',
    ink: 'var(--marker)',
    width: 5,
    opacity: 0.95,
    completes: true,
    mobile: false,
  },
  eraser: {
    id: 'eraser',
    label: 'Eraser',
    ink: null,
    width: 0,
    opacity: 1,
    completes: false,
    erases: true,
    mobile: true,
  },
};

export const TOOL_ORDER = ['pen', 'pencil', 'highlighter', 'marker', 'eraser'];

export function mobileTools() {
  return TOOL_ORDER.filter((id) => TOOLS[id].mobile);
}

/**
 * Turn a run of pointer positions into a smooth path.
 * Midpoints between samples become the curve's on-path points, which keeps a
 * fast scribble from looking like a chain of straight segments.
 */
export function pathFromPoints(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

/**
 * Thin the samples so a slow drag doesn't store hundreds of near-identical
 * points. Anything closer than `minGap` to the previous keeper is dropped.
 */
export function simplify(points, minGap = 3) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (const point of points.slice(1)) {
    const last = out[out.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) >= minGap) out.push(point);
  }
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
