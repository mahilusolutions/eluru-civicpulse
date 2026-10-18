/**
 * Remove seeded demo electors / issues so only real OCR/CSV data remains.
 */
const { db } = require('../db');

const before = db.prepare('SELECT COUNT(*) AS c FROM voters').get().c;

db.exec(`
  DELETE FROM outreach;
  DELETE FROM voters;
  UPDATE booths SET voter_count = 0, coverage_pct = 0;
  DELETE FROM issues WHERE reporter_role IN ('booth_agent','volunteer','coordinator');
`);

const after = db.prepare('SELECT COUNT(*) AS c FROM voters').get().c;
console.log(`Cleared demo voters: ${before} → ${after}`);
console.log('Booth voter_count reset. Ready for OCR.');
