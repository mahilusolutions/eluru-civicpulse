const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { ensureAuditTable } = require('./lib/audit');
const { ensureAuthTables } = require('./lib/authStore');
const { ensureBoothMediaTable } = require('./lib/boothMedia');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG === '1' ? ['query', 'error', 'warn'] : ['error'],
});

/** Indexes that keep search and filters fast once all ~250k voters are loaded. Each one is optional. */
async function ensureSearchIndexes() {
  const steps = [
    'ALTER TABLE voterdb.electors ADD COLUMN IF NOT EXISTS phone text',
    'CREATE EXTENSION IF NOT EXISTS pg_trgm',
    'CREATE INDEX IF NOT EXISTS idx_electors_name_trgm ON voterdb.electors USING gin (name gin_trgm_ops)',
    'CREATE INDEX IF NOT EXISTS idx_electors_epic_trgm ON voterdb.electors USING gin (epic gin_trgm_ops)',
    'CREATE INDEX IF NOT EXISTS idx_electors_house_trgm ON voterdb.electors USING gin (house_no gin_trgm_ops)',
    'CREATE INDEX IF NOT EXISTS idx_electors_relname_trgm ON voterdb.electors USING gin (relation_name gin_trgm_ops)',
    'CREATE INDEX IF NOT EXISTS idx_electors_part_section ON voterdb.electors (part_no, section_no)',
    'CREATE INDEX IF NOT EXISTS idx_electors_part_age ON voterdb.electors (part_no, age)',
    'CREATE INDEX IF NOT EXISTS idx_electors_part_gender ON voterdb.electors (part_no, gender)',
    'CREATE INDEX IF NOT EXISTS idx_outreach_elector_created ON public.outreach (elector_id, created_at DESC)',

    // Phone numbers are matched to voters by Voter ID (EPIC), so exact lookups by EPIC must be instant; phones are searchable.
    'CREATE INDEX IF NOT EXISTS idx_electors_epic ON voterdb.electors (epic)',
    'CREATE INDEX IF NOT EXISTS idx_electors_phone_trgm ON voterdb.electors USING gin (phone gin_trgm_ops)',

    // Search box: section (road) name too.
    'CREATE INDEX IF NOT EXISTS idx_electors_section_trgm ON voterdb.electors USING gin (section_name gin_trgm_ops)',

    // Voter list sorting (each sort the page offers) so Postgres can read rows already in order.
    'CREATE INDEX IF NOT EXISTS idx_electors_serial_part ON voterdb.electors (serial_no, part_no)',
    'CREATE INDEX IF NOT EXISTS idx_electors_lname ON voterdb.electors (lower(name), part_no, serial_no)',
    'CREATE INDEX IF NOT EXISTS idx_electors_age_sort ON voterdb.electors (age, part_no, serial_no)',
    'CREATE INDEX IF NOT EXISTS idx_electors_house_sort ON voterdb.electors (house_no, part_no, serial_no)',

    // Filters combined with a booth.
    'CREATE INDEX IF NOT EXISTS idx_electors_part_status ON voterdb.electors (part_no, status)',
    'CREATE INDEX IF NOT EXISTS idx_electors_part_support ON voterdb.electors (part_no, support_lean)',
    'CREATE INDEX IF NOT EXISTS idx_electors_section_all ON voterdb.electors (section_no, part_no)',

    // "Needs a check" lists and counts: tiny indexes that hold only the incomplete rows.
    'CREATE INDEX IF NOT EXISTS idx_electors_missing_age ON voterdb.electors (part_no) WHERE age IS NULL',
    "CREATE INDEX IF NOT EXISTS idx_electors_missing_gender ON voterdb.electors (part_no) WHERE gender = 'U'",
    "CREATE INDEX IF NOT EXISTS idx_electors_missing_epic ON voterdb.electors (part_no) WHERE epic IS NULL OR epic = ''",
    "CREATE INDEX IF NOT EXISTS idx_electors_missing_house ON voterdb.electors (part_no) WHERE house_no IS NULL OR house_no = ''",

    // Contacts page and dashboard.
    'CREATE INDEX IF NOT EXISTS idx_outreach_outcome ON public.outreach (outcome)',
    'CREATE INDEX IF NOT EXISTS idx_outreach_type_created ON public.outreach (type, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_issues_created ON public.issues (created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_booth_media_part ON public.booth_media (part_no)',
  ];
  for (const sql of steps) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      console.warn('index step skipped:', sql.slice(0, 60), '-', String(err.message).split(/\r?\n/)[0]);
    }
  }
  // Fresh statistics so the planner picks the new indexes.
  await prisma.$executeRawUnsafe('ANALYZE voterdb.electors').catch(() => {});
  await prisma.$executeRawUnsafe('ANALYZE public.outreach').catch(() => {});
}

async function initDb() {
  await prisma.$connect();
  await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS voterdb');
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE voterdb.electors
        ADD COLUMN IF NOT EXISTS section_no smallint,
        ADD COLUMN IF NOT EXISTS section_name text
    `);
  } catch (err) {
    console.warn('elector column ensure:', err.message);
  }
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE public.outreach ADD COLUMN IF NOT EXISTS updated_at timestamptz');
    await ensureAuditTable(prisma);
    await ensureAuthTables(prisma);
    await ensureBoothMediaTable(prisma);
  } catch (err) {
    console.warn('audit table ensure:', err.message);
  }
  await ensureSearchIndexes();
  const rows = await prisma.$queryRaw`
    SELECT current_database() AS db, current_user AS usr
  `;
  console.log(`PostgreSQL (Prisma): ${rows[0].db} as ${rows[0].usr}`);
  console.log('Schemas: public (app) + voterdb (OCR extraction)');

  await prisma.setting.upsert({
    where: { key: 'workspace' },
    create: {
      key: 'workspace',
      value: { city: 'Eluru', ac_code: 'S01-65', product: 'CivicPulse' },
    },
    update: {},
  });
}

module.exports = {
  prisma,
  initDb,
  DATABASE_URL: process.env.DATABASE_URL || '',
};
