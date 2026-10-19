/** "1 - Sanivarapu Peta , Eluru Corporation" -> "Sanivarapu Peta, Eluru Corporation" */
export function stationName(raw, part) {
  const text = String(raw || '')
    .replace(/^\s*\d+\s*[-–]\s*/, '')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
  return text || (part != null ? `Booth ${part}` : '');
}

export const BOOTH_STATUS = [
  { value: 'pending', label: 'Not started', color: 'var(--viz-neutral)' },
  { value: 'active', label: 'In progress', color: 'var(--viz-active)' },
  { value: 'complete', label: 'Complete', color: 'var(--viz-good)' },
  { value: 'inactive', label: 'Inactive', color: 'var(--viz-unknown)' },
];

export function boothStatus(value) {
  return BOOTH_STATUS.find((s) => s.value === value) || BOOTH_STATUS[0];
}

/** Share of a booth's voters that have been reached, as a whole percent. */
export function reachedPct(booth) {
  if (!booth?.voters) return 0;
  return Math.round((100 * (booth.reached || 0)) / booth.voters);
}

/** One-hue steps (light = little reached, dark = most reached) for the booth overview squares. */
export const REACH_STEPS = [
  { label: 'None yet', min: 0, max: 0, color: 'var(--viz-track)' },
  { label: '1–24%', min: 1, max: 24, color: '#9ec5f4' },
  { label: '25–49%', min: 25, max: 49, color: '#5598e7' },
  { label: '50–74%', min: 50, max: 74, color: '#256abf' },
  { label: '75–100%', min: 75, max: 100, color: '#104281' },
];

export function reachStep(pctValue) {
  return REACH_STEPS.find((s) => pctValue >= s.min && pctValue <= s.max) || REACH_STEPS[0];
}

export const BOOTH_SORTS = [
  { value: 'part', label: 'Booth number' },
  { value: 'voters', label: 'Most voters' },
  { value: 'reached', label: 'Most reached' },
  { value: 'station', label: 'Polling station' },
];
