const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/civicpulse.sqlite'));

console.log('=== voters count ===');
console.log(db.prepare('SELECT COUNT(*) AS c FROM voters').get());

console.log('\n=== sample voters ===');
console.log(
  db
    .prepare(
      'SELECT part_no, name, age, gender, house_no, relation_name, status FROM voters LIMIT 10'
    )
    .all()
);

console.log('\n=== roll_files by status ===');
console.log(
  db
    .prepare(
      'SELECT parse_status, COUNT(*) AS c FROM roll_files GROUP BY parse_status ORDER BY c DESC'
    )
    .all()
);

console.log('\n=== booths ===');
console.log(db.prepare('SELECT COUNT(*) AS c FROM booths').get());
