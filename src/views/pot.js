import { capturePointer, el, svg } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { TOOLS, TOOL_ORDER, mobileTools } from '../lib/tools.js';

/* The pen pot and the doodle margin — the desk furniture beside the list.

   The pot is a computer thing: five tools standing in a jar next to the board.
   A phone gets the pen and the eraser inline instead, because a jar of five
   would cost more room than it earns on a small screen. */

/** Drawn side-on, so the pot reads as objects standing in a jar. */
export function toolSvg(id) {
  const body = {
    pen: { fill: 'var(--ink-blue)', cap: 'var(--ink-deep)' },
    pencil: { fill: 'var(--butter-deep)', cap: 'var(--graphite)' },
    highlighter: { fill: 'var(--butter)', cap: 'var(--butter-deep)' },
    marker: { fill: 'var(--marker)', cap: 'var(--ink-deep)' },
  }[id];

  if (id === 'eraser') {
    return svg('svg', { viewBox: '0 0 24 64', fill: 'none', 'aria-hidden': 'true' }, [
      svg('rect', {
        x: '4.5', y: '24', width: '15', height: '34', rx: '3',
        fill: 'var(--rust)', stroke: 'var(--ink)', 'stroke-width': '1.8',
      }),
      svg('path', {
        d: 'M4.5 40h15', stroke: 'var(--ink)', 'stroke-width': '1.6',
      }),
    ]);
  }

  return svg('svg', { viewBox: '0 0 24 64', fill: 'none', 'aria-hidden': 'true' }, [
    // barrel
    svg('path', {
      d: 'M7 20h10v34H7z', fill: body.fill,
      stroke: 'var(--ink)', 'stroke-width': '1.8', 'stroke-linejoin': 'round',
    }),
    // cap band
    svg('rect', {
      x: '6.4', y: '16', width: '11.2', height: '6', rx: '2',
      fill: body.cap, stroke: 'var(--ink)', 'stroke-width': '1.8',
    }),
    // nib
    svg('path', {
      d: 'M7 54h10l-5 7z', fill: body.cap,
      stroke: 'var(--ink)', 'stroke-width': '1.8', 'stroke-linejoin': 'round',
    }),
  ]);
}

/**
 * @param {string} active current tool id
 * @param {(id: string) => void} onPick
 * @param {boolean} compact phone layout — pen and eraser only, laid out in a row
 */
export function penPot(active, onPick, compact = false) {
  const ids = compact ? mobileTools() : TOOL_ORDER;

  const pot = el('div', {
    class: `pot${compact ? ' pot-compact' : ''}`,
    role: 'radiogroup',
    'aria-label': 'Pick a tool',
  });

  for (const id of ids) {
    pot.append(
      el('button', {
        class: 'pot-tool',
        role: 'radio',
        'aria-checked': String(id === active),
        'aria-label': TOOLS[id].label,
        title: TOOLS[id].label,
        dataset: { tool: id },
        onClick: () => onPick(id),
      }, [
        toolSvg(id),
        el('span', { class: 'pot-label', text: TOOLS[id].label }),
      ]),
    );
  }

  if (compact) return pot;

  return el('div', { class: 'pot-shell' }, [
    el('div', { class: 'pot-jar' }, [pot]),
  ]);
}

/* ---------- doodle margin ---------- */

/**
 * A scribble strip beside the list. Saved per day as an image, so whatever
 * you drew is still there tomorrow if you come back to that day.
 */
export function doodleMargin(date) {
  const canvas = el('canvas', { class: 'doodle', 'aria-label': 'Doodle margin' });
  const wrap = el('div', { class: 'doodle-wrap' }, [
    el('span', { class: 'doodle-hint', text: 'scribble' }),
    canvas,
    el('button', {
      class: 'doodle-clear',
      text: 'clear',
      'aria-label': 'Clear the doodle',
      onClick: () => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        store.setDoodle(date, null);
      },
    }),
  ]);

  // Sized once it's in the document, so the backing store matches the box.
  requestAnimationFrame(() => {
    const ratio = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;

    canvas.width = box.width * ratio;
    canvas.height = box.height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const saved = store.doodleFor(date);
    if (saved) {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, box.width, box.height);
      image.src = saved;
    }

    let drawing = false;

    canvas.addEventListener('pointerdown', (event) => {
      drawing = true;
      capturePointer(canvas, event.pointerId);
      const rect = canvas.getBoundingClientRect();
      ctx.strokeStyle = getComputedStyle(canvas).color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(event.clientX - rect.left, event.clientY - rect.top);
      event.preventDefault();
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!drawing) return;
      const rect = canvas.getBoundingClientRect();
      ctx.lineTo(event.clientX - rect.left, event.clientY - rect.top);
      ctx.stroke();
    });

    const stop = () => {
      if (!drawing) return;
      drawing = false;
      store.setDoodle(date, canvas.toDataURL('image/png'));
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', stop);
  });

  return wrap;
}
