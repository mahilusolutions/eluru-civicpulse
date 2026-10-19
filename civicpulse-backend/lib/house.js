/**
 * Roll "House Number" fields sometimes carry an address after the number
 * ("1-1,flat 205,2ad flour", "1-23, DONDAPADU ROAD", "FLAT NO 203 AVIREDDY ENCLAVE").
 * Split them into the number itself and an address note so they are never confused.
 *
 *   splitHouse('1-1,flat 205,2ad flour') -> { number: '1-1', note: 'flat 205,2ad flour' }
 *   splitHouse('FLAT NO 203 AVIREDDY ENCLAVE') -> { number: 'Flat 203', note: 'AVIREDDY ENCLAVE' }
 */
const SEG = '\\d+(?:[A-Za-z](?![A-Za-z0-9]))?'; // 49, 10, 1B, 3A (one trailing letter at most)
const LONE = '[A-Za-z](?![A-Za-z0-9])'; // the "A" in 1-119/A
const NUMBER_RE = new RegExp(`(?:[A-Za-z]-)?${SEG}(?:[-/]+(?:${SEG}|${LONE}|(?=[\\s,;.]|$)))*`);
const STARTS_WITH_NUMBER = new RegExp(`^(${NUMBER_RE.source})[,;:.\\s]*(.*)$`);
const UNIT_RE = /^(FLAT|PLOT|PLAT|APPART|APARTMENT|APT)\s*[-.:]?\s*(?:NO\.?|NUMBER)?\s*[-.:]?\s*(\d+[A-Za-z]?)\b[,;:.\s]*(.*)$/i;
const LABEL_RE = /^(?:H\.?\s?NO\.?|D\.?\s?NO\.?|DR\.?\s?NO\.?|DOOR\s*NO\.?|HOUSE[\s.]*(?:NO|NUMBER)\.?)\s*[:\-]?\s*/i;

const tidyNumber = (n) => n.replace(/\s+/g, '').replace(/[-/]+$/, '');
const tidyNote = (n) => {
  const note = String(n || '').replace(/^[,;:.\-/\s]+/, '').trim();
  return /[A-Za-z0-9]/.test(note) ? note.replace(/[,;:.\s]+$/, '') : null;
};

function splitHouse(value) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/(\d)(S\/O\b)/i, '$1 $2') // 1-31S/O P. APPARAO -> 1-31 S/O P. APPARAO
    .trim();
  if (!text) return { number: null, note: null };

  // "2nd floor", "1st line": an ordinal, not a house number.
  if (/^\d+(?:st|nd|rd|th)\b/i.test(text)) return { number: null, note: tidyNote(text) };

  const unit = text.match(UNIT_RE);
  if (unit) {
    const kind = /^(FLAT|APPART|APARTMENT|APT)/i.test(unit[1]) ? 'Flat' : 'Plot';
    return { number: `${kind} ${unit[2]}`, note: tidyNote(unit[3]) };
  }

  const cleaned = text.replace(LABEL_RE, '');
  const lead = cleaned.match(STARTS_WITH_NUMBER);
  if (lead) return { number: tidyNumber(lead[1]), note: tidyNote(lead[2]) };

  // Starts with words ("S/O RAJU 7-102"): take the first number found, keep the rest as the note.
  const inner = cleaned.match(new RegExp(`\\s(${NUMBER_RE.source})(?=[\\s,;.]|$)`));
  if (inner && /\d-|\d\/|^\d{2,}/.test(inner[1])) {
    return { number: tidyNumber(inner[1]), note: tidyNote(cleaned.replace(inner[0], ' ')) };
  }
  return { number: null, note: tidyNote(cleaned) };
}

module.exports = { splitHouse };
