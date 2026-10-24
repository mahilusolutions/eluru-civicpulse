/**
 * Clean text as it is typed or pasted, so a box only ever holds what it should.
 * (The server checks again; this only stops wrong characters from appearing.)
 */

/** Phone: digits only, at most 10. A pasted "+91 98480 12345" or "098480 12345" becomes the 10 digits. */
export function mobileDigits(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  else if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}

/** Reference number: letters and digits only, shown as CPR-XXXX-XXXX with the dashes added for you. */
export function formatReference(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return '';
  if (raw.length <= 3 && 'CPR'.startsWith(raw)) return raw; // still typing the CPR part
  const body = (raw.startsWith('CPR') ? raw.slice(3) : raw).slice(0, 8);
  return `CPR-${body.slice(0, 4)}${body.length > 4 ? `-${body.slice(4)}` : ''}`;
}

/** Voter ID: letters and digits only, upper case. */
export function alnumUpper(value, max = 16) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9/]/g, '').slice(0, max);
}

/** A person's name: letters (any language), spaces, dots, apostrophes and hyphens. No digits or symbols. */
export function nameOnly(value) {
  return String(value || '').replace(/[^\p{L}\p{M} .'-]/gu, '').replace(/\s{2,}/g, ' ');
}
