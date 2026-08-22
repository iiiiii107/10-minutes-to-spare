/* The pen pot.

   Only two tools change anything:

     pen     crosses a task off — the one tool that completes
     eraser  wipes the marks back off a task

   The highlighter and the crayon are just for marking up: they leave colour
   on a task and nothing else happens. That's deliberate — the point of them
   is annotating your own list, not another way to change its state.

   Every mark is drawn on the task itself. The task row is the canvas, so a
   mark belongs to that one task and is stored with it. */

export const TOOLS = {
  pen: {
    id: 'pen',
    label: 'Pen',
    /** null means "use the task's own colour". */
    ink: null,
    width: 2.2,
    opacity: 1,
    completes: true,
  },
  highlighter: {
    id: 'highlighter',
    label: 'Highlighter',
    ink: 'var(--butter)',
    width: 15,
    opacity: 0.4,
    completes: false,
  },
  crayon: {
    id: 'crayon',
    label: 'Crayon',
    ink: 'var(--marker)',
    width: 5.5,
    opacity: 0.8,
    completes: false,
  },
  eraser: {
    id: 'eraser',
    label: 'Eraser',
    ink: null,
    width: 0,
    opacity: 1,
    completes: false,
    erases: true,
  },
};

export const TOOL_ORDER = ['pen', 'highlighter', 'crayon', 'eraser'];

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

/**
 * Marks are stored in the row's own pixel space, so a resized window would
 * put them in the wrong place. Storing the row width they were drawn at lets
 * them be scaled back on.
 */
export function scaleMark(mark, width) {
  if (!mark.w || mark.w === width) return mark.d;
  return mark.d; // paths scale with the SVG viewBox; see .ink sizing
}
