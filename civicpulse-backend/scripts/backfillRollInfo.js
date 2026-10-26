/**
 * Re-parse stored roll_info.page1_text / page2_text (Telugu covers) into assembly, pin, etc.
 *   node scripts/backfillRollInfo.js
 *   node scripts/backfillRollInfo.js --apply
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { prisma } = require('../db');
const { parseRollCover } = require('../../eluru_voters_data_ocr_extraction/code/parseRollMeta');

const APPLY = process.argv.includes('--apply');

(async () => {
  const docs = await prisma.$queryRaw`
    SELECT id, part_no, raw_meta
    FROM voterdb.extracted_documents
    WHERE raw_meta->'roll_info' IS NOT NULL
    ORDER BY part_no NULLS LAST`;

  let updated = 0;
  let skipped = 0;
  for (const doc of docs) {
    const meta = doc.raw_meta && typeof doc.raw_meta === 'object' ? doc.raw_meta : {};
    const prev = meta.roll_info || {};
    const pages = [
      { page: 1, text: prev.page1_text || '' },
      { page: 2, text: prev.page2_text || '' },
    ];
    if (!pages[0].text && !pages[1].text) {
      skipped += 1;
      continue;
    }
    const parsed = parseRollCover(pages);
    const next = {
      ...prev,
      assembly: parsed.assembly || prev.assembly || null,
      part_number: parsed.part_number || prev.part_number || doc.part_no || null,
      pin_code: parsed.pin_code || prev.pin_code || null,
      qualifying_date: parsed.qualifying_date || prev.qualifying_date || null,
      publication_date: parsed.publication_date || prev.publication_date || null,
      main_town: parsed.main_town || prev.main_town || null,
      post_office: parsed.post_office || prev.post_office || null,
      tehsil: parsed.tehsil || prev.tehsil || null,
      district: parsed.district || prev.district || null,
      total_pages: parsed.total_pages || prev.total_pages || null,
      polling_station: parsed.polling_station || prev.polling_station || null,
      polling_address: parsed.polling_address || prev.polling_address || null,
      sections: parsed.sections?.length ? parsed.sections : prev.sections || [],
    };
    const changed =
      next.assembly !== prev.assembly ||
      next.pin_code !== prev.pin_code ||
      next.publication_date !== prev.publication_date ||
      next.main_town !== prev.main_town ||
      next.part_number !== prev.part_number;
    if (!changed) {
      skipped += 1;
      continue;
    }
    updated += 1;
    if (updated <= 5) {
      console.log(`part ${doc.part_no}:`, {
        assembly: next.assembly,
        pin: next.pin_code,
        pub: next.publication_date,
        town: next.main_town,
      });
    }
    if (APPLY) {
      await prisma.$executeRaw`
        UPDATE voterdb.extracted_documents
        SET raw_meta = jsonb_set(COALESCE(raw_meta, '{}'::jsonb), '{roll_info}', ${JSON.stringify(next)}::jsonb, true)
        WHERE id = ${doc.id}`;
    }
  }
  console.log(`${APPLY ? 'Updated' : 'Would update'}: ${updated}, unchanged: ${skipped}, total: ${docs.length}`);
  if (!APPLY) console.log('DRY RUN — add --apply to save.');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
