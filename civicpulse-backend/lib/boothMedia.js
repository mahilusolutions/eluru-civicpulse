/** Booth pictures (maps, building photos, plans) cut out of page 2 of each roll PDF and kept in the database. */
const KINDS = [
  { kind: 'nazri_naksha', label: 'Nazri Naksha', col: 0, row: 0 },
  { kind: 'google_map', label: 'Google Map View', col: 1, row: 0 },
  { kind: 'building_front', label: 'Polling Station Building Front View', col: 0, row: 1 },
  { kind: 'station_front', label: 'Polling Station Front View', col: 1, row: 1 },
  { kind: 'cad_view', label: 'Cad View', col: 0, row: 2 },
  { kind: 'key_map', label: 'Key Map View', col: 1, row: 2 },
];

async function ensureBoothMediaTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.booth_media (
      part_no    int NOT NULL,
      kind       text NOT NULL,
      label      text NOT NULL,
      mime       text NOT NULL DEFAULT 'image/jpeg',
      width      int,
      height     int,
      data       bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (part_no, kind)
    )`);
}

module.exports = { KINDS, ensureBoothMediaTable };
