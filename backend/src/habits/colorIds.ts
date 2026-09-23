// Mirrors the 10-color catalog defined on the frontend (frontend/src/colors.ts).
// The backend only needs the set of valid ids for validation, not the actual colors.
export const COLOR_IDS = [
  'sage',
  'dustyBlue',
  'lavender',
  'ochre',
  'petrol',
  'terracotta',
  'mauve',
  'sand',
  'plum',
  'mint',
] as const;

export type ColorId = (typeof COLOR_IDS)[number];

// Checks whether a string is one of the known catalog color ids.
export function isValidColorId(id: string): id is ColorId {
  return (COLOR_IDS as readonly string[]).includes(id);
}
