import { el, svg } from '../lib/dom.js';
import { TOOLS, TOOL_ORDER } from '../lib/tools.js';

/* The pen pot: a line-art cup with the tools standing in it, drawn in the
   same simple outlined style as the reference. Picking one lifts it out of
   the cup; the cup is drawn over the tools so they read as sitting inside. */

/** One implement, drawn side-on. */
function toolArt(id) {
  const ink = 'var(--ink)';

  if (id === 'pen') {
    return svg('g', {}, [
      svg('path', {
        d: 'M11 14 L19 14 L19 62 L11 62 Z',
        fill: 'var(--paper)', stroke: ink, 'stroke-width': '2.2', 'stroke-linejoin': 'round',
      }),
      svg('path', { d: 'M11 24 H19', stroke: ink, 'stroke-width': '2' }),
      svg('path', {
        d: 'M11 14 L15 5 L19 14 Z',
        fill: 'var(--ink-blue)', stroke: ink, 'stroke-width': '2.2', 'stroke-linejoin': 'round',
      }),
    ]);
  }

  if (id === 'highlighter') {
    return svg('g', {}, [
      svg('rect', {
        x: '9', y: '18', width: '13', height: '44', rx: '2',
        fill: 'var(--butter)', stroke: ink, 'stroke-width': '2.2',
      }),
      svg('path', {
        d: 'M10 18 L12 7 H19 L21 18 Z',
        fill: 'var(--paper)', stroke: ink, 'stroke-width': '2.2', 'stroke-linejoin': 'round',
      }),
      svg('path', { d: 'M9 28 H22', stroke: ink, 'stroke-width': '2' }),
    ]);
  }

  if (id === 'crayon') {
    return svg('g', {}, [
      svg('path', {
        d: 'M10 18 L21 18 L21 62 L10 62 Z',
        fill: 'var(--marker)', stroke: ink, 'stroke-width': '2.2', 'stroke-linejoin': 'round',
      }),
      svg('path', {
        d: 'M10 18 L15.5 7 L21 18 Z',
        fill: 'var(--paper)', stroke: ink, 'stroke-width': '2.2', 'stroke-linejoin': 'round',
      }),
      svg('path', { d: 'M10 30 H21 M10 38 H21', stroke: ink, 'stroke-width': '1.8' }),
    ]);
  }

  // eraser — a stubby block, standing like the ruler in the reference
  return svg('g', {}, [
    svg('rect', {
      x: '8', y: '20', width: '16', height: '42', rx: '2.5',
      fill: 'var(--paper)', stroke: ink, 'stroke-width': '2.2',
    }),
    svg('path', {
      d: 'M8 33 H24', stroke: ink, 'stroke-width': '2',
    }),
    svg('path', {
      d: 'M9.2 21 H22.8 A1.4 1.4 0 0 1 24 22.4 V33 H8 V22.4 A1.4 1.4 0 0 1 9.2 21 Z',
      fill: 'var(--rust)', stroke: ink, 'stroke-width': '2.2', 'stroke-linejoin': 'round',
    }),
  ]);
}

/** A single tool, sitting in the cup or lifted out of it. */
function toolButton(id, active, onPick) {
  return el('button', {
    class: 'pot-tool',
    role: 'radio',
    'aria-checked': String(id === active),
    'aria-label': TOOLS[id].label,
    title: TOOLS[id].label,
    dataset: { tool: id },
    onClick: () => onPick(id),
  }, [
    svg('svg', { viewBox: '0 0 32 64', fill: 'none', 'aria-hidden': 'true' }, [toolArt(id)]),
    el('span', { class: 'pot-label', text: TOOLS[id].label }),
  ]);
}

/** The cup, outlined, drawn in front of the tools. */
function cupArt() {
  return svg('svg', {
    class: 'pot-cup', viewBox: '0 0 120 64', fill: 'none', 'aria-hidden': 'true',
  }, [
    svg('path', {
      d: 'M9 11 L9 50 C9 57 32 62 60 62 C88 62 111 57 111 50 L111 11',
      fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': '3.2',
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }),
    svg('ellipse', {
      cx: '60', cy: '11', rx: '51', ry: '9',
      fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': '3.2',
    }),
  ]);
}

/** The tool currently in hand, drawn large for dragging across a task. */
export function toolSvg(id) {
  return svg('svg', { viewBox: '0 0 32 64', fill: 'none', 'aria-hidden': 'true' }, [toolArt(id)]);
}

/**
 * @param {string|null} active current tool id
 * @param {(id: string) => void} onPick
 * @param {boolean} compact phone layout — a flat row instead of a cup
 */
export function penPot(active, onPick, compact = false) {
  if (compact) {
    return el(
      'div',
      { class: 'pot pot-compact', role: 'radiogroup', 'aria-label': 'Pick a tool' },
      TOOL_ORDER.map((id) => toolButton(id, active, onPick)),
    );
  }

  return el('div', { class: 'pot-shell' }, [
    el('div', { class: 'pot-stage' }, [
      el(
        'div',
        { class: 'pot', role: 'radiogroup', 'aria-label': 'Pick a tool' },
        TOOL_ORDER.map((id) => toolButton(id, active, onPick)),
      ),
      cupArt(),
    ]),
  ]);
}
