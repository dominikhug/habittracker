export interface ColorDef {
  id: string;
  label: string;
  h: number;
  s: number;
  l: number;
}

// Ten deliberately calm, muted tones — no alarming/alarm-red, consistent with the
// non-shaming design principle (see plan). Only one HSL base value is stored per
// color; the "not done" (matte/dark) and "done" (saturated/bright) states are both
// derived from it at render time, see colorFor() below.
export const COLOR_CATALOG: ColorDef[] = [
  { id: 'sage', label: 'Salbeigrün', h: 100, s: 30, l: 42 },
  { id: 'dustyBlue', label: 'Staubblau', h: 205, s: 35, l: 45 },
  { id: 'lavender', label: 'Lavendel', h: 255, s: 30, l: 52 },
  { id: 'ochre', label: 'Ocker', h: 40, s: 55, l: 42 },
  { id: 'petrol', label: 'Petrol', h: 185, s: 45, l: 32 },
  { id: 'terracotta', label: 'Terrakotta', h: 18, s: 55, l: 48 },
  { id: 'mauve', label: 'Altrosa', h: 335, s: 35, l: 52 },
  { id: 'sand', label: 'Sandbraun', h: 35, s: 30, l: 48 },
  { id: 'plum', label: 'Pflaume', h: 290, s: 30, l: 40 },
  { id: 'mint', label: 'Minzgrün', h: 165, s: 40, l: 42 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findColor(colorId: string): ColorDef {
  return COLOR_CATALOG.find((c) => c.id === colorId) ?? COLOR_CATALOG[0];
}

// done=false → matte/dark (reduced saturation+lightness), done=true → saturated/bright
// (increased saturation+lightness). See plan's "Design-Sprache" section.
export function colorFor(colorId: string, done: boolean): string {
  const def = findColor(colorId);
  const s = clamp(def.s + (done ? 20 : -10), 0, 100);
  const l = clamp(def.l + (done ? 15 : -12), 0, 100);
  return `hsl(${def.h}, ${s}%, ${l}%)`;
}

// Representative swatch color for pickers (e.g. the habit color picker) — the
// "done" variant reads best as a swatch since it's the more saturated, legible one.
export function swatchColorFor(colorId: string): string {
  return colorFor(colorId, true);
}

// Text color must adapt: dark backgrounds (not done) need white text, light
// backgrounds (done) need dark text — never rely on a single fixed text color.
export function textColorFor(done: boolean): string {
  return done ? '#2E2B26' : '#FFFFFF';
}
