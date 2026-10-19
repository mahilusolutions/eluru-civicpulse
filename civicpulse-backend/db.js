const path = require('path');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG === '1' ? ['query', 'error', 'warn'] : ['error'],
});

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
