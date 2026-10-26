/**
 * Clear lat/lng for booths that geocoded outside Eluru city / constituency.
 * node scripts/clearOutOfEluruCoords.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { prisma } = require('../db');

const BOX = { minLat: 16.68, maxLat: 16.78, minLng: 81.03, maxLng: 81.17 };

(async () => {
  const cleared = await prisma.$executeRawUnsafe(
    `UPDATE public.booths
     SET lat = NULL, lng = NULL, updated_at = now()
     WHERE lat IS NOT NULL AND lng IS NOT NULL
       AND (lat < $1 OR lat > $2 OR lng < $3 OR lng > $4)`,
    BOX.minLat,
    BOX.maxLat,
    BOX.minLng,
    BOX.maxLng
  );
  const [{ with_loc }] = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*)::int AS with_loc FROM public.booths WHERE lat IS NOT NULL'
  );
  console.log(`Cleared ${cleared} out-of-bounds pins. Booths still with coords: ${with_loc}`);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
