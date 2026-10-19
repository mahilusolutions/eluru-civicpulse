/** Parse ECI roll PDF filenames → year / part / AC. */
function parseFilename(filename) {
  const m = String(filename || '').match(/(\d{4}).*?S0?1-?65.*?ENG-(\d+)/i);
  if (m) {
    return { year: Number(m[1]), part_no: Number(m[2]), ac_code: 'S01-65' };
  }
  const partOnly =
    String(filename || '').match(/ENG-(\d+)/i) ||
    String(filename || '').match(/part[-_ ]?(\d+)/i);
  return {
    year: 2026,
    part_no: partOnly ? Number(partOnly[1]) : null,
    ac_code: 'S01-65',
  };
}

module.exports = { parseFilename };
