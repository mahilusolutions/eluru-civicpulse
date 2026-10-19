const TELUGU = /[ఀ-౿]/;

/** "SAMBHASIVA sankara rao" → "Sambhasiva Sankara Rao" (roll text arrives in mixed case). */
export function niceName(value) {
  if (!value) return '';
  const text = String(value).trim().replace(/\s+/g, ' ');
  if (TELUGU.test(text)) return text;
  return text
    .toLowerCase()
    .replace(/(^|[\s\-.'(])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

export function initials(value) {
  const parts = niceName(value).split(' ').filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function genderLabel(g) {
  const u = String(g || '').toUpperCase();
  if (u === 'F') return 'Female';
  if (u === 'M') return 'Male';
  if (u === 'O') return 'Other';
  return 'Not read';
}

export function genderShort(g) {
  const u = String(g || '').toUpperCase();
  if (u === 'F' || u === 'M' || u === 'O') return u;
  return '—';
}

export function genderColor(g) {
  const u = String(g || '').toUpperCase();
  if (u === 'F') return 'var(--viz-female)';
  if (u === 'M') return 'var(--viz-male)';
  return 'var(--viz-unknown)';
}

export function relationLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'husband') return 'Husband';
  if (t === 'mother') return 'Mother';
  if (t === 'other') return 'Relative';
  return 'Father';
}

export function roadName(row) {
  if (row.section_name) return niceName(row.section_name);
  if (row.road) return niceName(String(row.road).replace(/^\d+-/, ''));
  return '';
}

/** Which key details are missing from a voter record. */
export function missingFields(row) {
  const missing = [];
  if (!row.epic) missing.push('voter ID');
  if (row.age == null) missing.push('age');
  if (!row.house_no) missing.push('house number');
  if (!row.gender || row.gender === 'U') missing.push('gender');
  return missing;
}

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Not contacted' },
  { value: 'visited', label: 'Visited' },
  { value: 'callback', label: 'Call back' },
  { value: 'shifted', label: 'Shifted' },
  { value: 'deceased', label: 'Deceased' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'inactive', label: 'Inactive' },
];

export const STATUS_COLORS = {
  active: 'var(--viz-active)',
  visited: 'var(--viz-good)',
  callback: 'var(--viz-warn)',
  shifted: 'var(--viz-serious)',
  deceased: 'var(--viz-unknown)',
  duplicate: 'var(--viz-crit)',
  inactive: 'var(--viz-neutral)',
};

export function statusLabel(value) {
  return STATUS_OPTIONS.find((s) => s.value === value)?.label || value || 'Not contacted';
}

export const SUPPORT_OPTIONS = [
  { value: 'strong_yes', label: 'Strong yes', color: 'var(--viz-yes-strong)' },
  { value: 'lean_yes', label: 'Leaning yes', color: 'var(--viz-yes)' },
  { value: 'undecided', label: 'Undecided', color: 'var(--viz-neutral)' },
  { value: 'lean_no', label: 'Leaning no', color: 'var(--viz-no)' },
  { value: 'strong_no', label: 'Strong no', color: 'var(--viz-no-strong)' },
];

export function supportLabel(value) {
  if (!value || value === 'unknown') return 'Not asked yet';
  return SUPPORT_OPTIONS.find((s) => s.value === value)?.label || value;
}

export const AGE_BANDS = ['18-24', '25-34', '35-44', '45-59', '60+'];

export const MISSING_OPTIONS = [
  { value: 'all', label: 'Any record' },
  { value: 'any', label: 'Needs checking' },
  { value: 'epic', label: 'No voter ID' },
  { value: 'age', label: 'No age' },
  { value: 'house', label: 'No house number' },
  { value: 'gender', label: 'No gender' },
];

export const SORT_OPTIONS = [
  { value: 'serial', label: 'List order' },
  { value: 'name', label: 'Name' },
  { value: 'age', label: 'Age' },
  { value: 'house', label: 'House number' },
];

export const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));

/** "1 booth" / "2 booths". */
export const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${Number(n) === 1 ? one : many}`;

export function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((100 * part) / whole);
}
