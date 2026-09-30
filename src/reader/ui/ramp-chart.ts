import type { ComfortSettings } from '../../shared/types.js';
import { rampSpeed } from '../engine/ramp.js';

// SPEC §3.8: called only for an open settings disclosure, never by a tick.
export function renderRampChart(svg: SVGSVGElement, settings: ComfortSettings, wpm: number): void {
  const x = (k: number): number => 48 + k * 60;
  const y = (v: number): number => 174 - (v - 0.4) / 0.6 * 140;
  let markup = '<title>Speed recovery after a sentence</title>';
  for (let k = 0; k <= 8; k++) markup += `<text x="${x(k)}" y="194" text-anchor="middle">${k}</text>`;
  for (const v of [0.4, 0.6, 0.8, 1]) {
    markup += `<path d="M48 ${y(v)}H528" stroke="currentColor" opacity=".15"/><text x="40" y="${y(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`;
  }
  markup += '<text x="288" y="214" text-anchor="middle">Word index after sentence end</text><text x="48" y="17">Fraction of set speed</text>';
  const curves: ComfortSettings['rampCurve'][] = ['linear', 'out', 'in', 'first'];
  curves.sort((a, b) => Number(a === settings.rampCurve) - Number(b === settings.rampCurve));
  for (const curve of curves) {
    const active = settings.ramp && curve === settings.rampCurve;
    const points = Array.from({ length: 161 }, (_, i) => `${x(i / 20)},${y(rampSpeed(i / 20, { ...settings, ramp: true, rampCurve: curve }))}`).join(' ');
    markup += `<polyline data-curve="${curve}" points="${points}" fill="none" stroke="currentColor" stroke-width="${active ? 3.5 : 1.5}" opacity="${active ? 1 : 0.2}"/>`;
  }
  if (settings.blink) {
    const normal = 60000 / wpm;
    const speed = normal / Math.max(normal / rampSpeed(0, settings), normal + settings.blinkMs);
    const py = y(Math.max(0.4, speed));
    markup += `<path data-blink="true" d="M48 ${py - 5}l5 5-5 5-5-5Z" fill="currentColor"/><text x="58" y="${py - 9}">Blink: ${(speed * 100).toFixed(1)}%${speed < 0.4 ? ' (below axis)' : ''}</text>`;
  }
  svg.innerHTML = markup;
}
