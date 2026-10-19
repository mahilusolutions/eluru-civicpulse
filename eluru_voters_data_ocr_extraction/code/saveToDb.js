/**
 * Persist OCR result into PostgreSQL voterdb (server DB).
 * Disk JSON/TXT remain optional backups.
 */
const { Pool } = require('pg');
const { parseEciOcrText, parseRollCover } = require('./ocrWorker');

let pool = null;
let schemaReady = false;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  pool = new Pool({ connectionString: url, max: 4 });
  pool.on('error', (err) => console.error('pg pool error', err.message));
  return pool;
}

function sanitizeGender(g) {
  if (!g) return 'U';
  const u = String(g).toUpperCase().slice(0, 1);
  return u === 'M' || u === 'F' || u === 'O' ? u : 'U';
}

function sanitizeRelation(r) {
  const v = String(r || 'father').toLowerCase();
  return ['father', 'mother', 'husband', 'other'].includes(v) ? v : 'father';
}

function sanitizeAge(age) {
  if (age == null || age === '') return null;
  const n = Number(age);
  if (!Number.isFinite(n) || n < 18 || n > 120) return null;
  return Math.round(n);
}

function sanitizeStatus(s) {
  const v = String(s || 'active').toLowerCase();
  const ok = ['active', 'visited', 'callback', 'shifted', 'deceased', 'duplicate', 'inactive'];
  return ok.includes(v) ? v : 'active';
}

function isJunkElectorName(n) {
  if (!n) return true;
  const s = String(n).trim();
  if (s.length < 3 || s.length > 80) return true;
  if (
    /part\s*number|section\s*no|assembly|constituency|electoral|revision|polling|eluru|s01-?65|e-?roll|draft\s*roll|electors?\s*name|photo\s*available/i.test(
      s
    )
  ) {
    return true;
  }
  if (/^\d{1,3}[-–]\s*[A-Z]{2,}/i.test(s)) return true;
  const letters = (s.match(/[A-Za-z\u0C00-\u0C7F]/g) || []).length;
  return letters < 3;
}

async function ensureElectorExtraColumns(client) {
  if (schemaReady) return;
  await client.query(`
    ALTER TABLE voterdb.electors
      ADD COLUMN IF NOT EXISTS section_no smallint,
      ADD COLUMN IF NOT EXISTS section_name text
  `);
  schemaReady = true;
}

/**
 * @param {object} payload - same shape as extracted JSON
 * @param {{ storagePath?: string }} opts
 */
async function saveExtractionToDb(payload, opts = {}) {
  const p = getPool();
  if (!p) {
    console.warn('DATABASE_URL not set — skipping DB save');
    return { skipped: true };
  }

  const client = await p.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA IF NOT EXISTS voterdb');
    await ensureElectorExtraColumns(client);

    const filename = payload.filename;
    const partNo = payload.part_no != null ? Number(payload.part_no) : null;
    const pages = Array.isArray(payload.pages) ? payload.pages : [];
    const rollInfo = payload.roll_info || parseRollCover(pages);

    // Upsert document by filename
    const docRes = await client.query(
      `INSERT INTO voterdb.extracted_documents (
         filename, part_no, ac_code, source, mode, dpi, page_workers,
         page_count, text_length, voter_count, full_text, storage_path,
         job_id, duration_ms, extracted_at, raw_meta
       ) VALUES (
         $1, $2, 'S01-65', $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, COALESCE($14::timestamptz, NOW()), $15::jsonb
       )
       ON CONFLICT (filename) DO UPDATE SET
         part_no = EXCLUDED.part_no,
         source = EXCLUDED.source,
         mode = EXCLUDED.mode,
         dpi = EXCLUDED.dpi,
         page_workers = EXCLUDED.page_workers,
         page_count = EXCLUDED.page_count,
         text_length = EXCLUDED.text_length,
         voter_count = EXCLUDED.voter_count,
         full_text = EXCLUDED.full_text,
         storage_path = COALESCE(EXCLUDED.storage_path, voterdb.extracted_documents.storage_path),
         job_id = EXCLUDED.job_id,
         duration_ms = EXCLUDED.duration_ms,
         extracted_at = EXCLUDED.extracted_at,
         raw_meta = EXCLUDED.raw_meta
       RETURNING id`,
      [
        filename,
        partNo,
        payload.source || 'tesseract-ocr',
        payload.mode || 'full_text',
        payload.dpi ?? null,
        payload.page_workers ?? null,
        payload.page_count || 0,
        payload.text_length || 0,
        payload.voter_count || (payload.voters || []).length || 0,
        payload.full_text || null,
        opts.storagePath || null,
        payload.job_id || null,
        payload.duration_ms ?? null,
        payload.extracted_at || null,
        JSON.stringify({
          page_workers: payload.page_workers,
          roll_info: rollInfo,
          page_images_dir: payload.page_images_dir || null,
        }),
      ]
    );
    const documentId = docRes.rows[0].id;

    await client.query(`DELETE FROM voterdb.extracted_pages WHERE document_id = $1`, [documentId]);
    await client.query(`DELETE FROM voterdb.electors WHERE document_id = $1`, [documentId]);

    for (const page of pages) {
      await client.query(
        `INSERT INTO voterdb.extracted_pages (document_id, page_no, image, char_count, text)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          documentId,
          page.page ?? page.pageNo,
          page.image || null,
          page.char_count || (page.text || '').length || 0,
          page.text || '',
        ]
      );
    }

    const voters = Array.isArray(payload.voters) ? payload.voters : [];
    let savedElectors = 0;
    for (let i = 0; i < voters.length; i += 1) {
      const v = voters[i];
      if (!v?.name || isJunkElectorName(v.name)) continue;
      const serial = v.serial_no != null ? Number(v.serial_no) : i + 1;
      const pno = v.part_no != null ? Number(v.part_no) : partNo;
      if (pno == null) continue;
      savedElectors += 1;
      await client.query(
        `INSERT INTO voterdb.electors (
           document_id, part_no, serial_no, epic, name, name_normalized,
           relation_type, relation_name, house_no, age, gender,
           page_no, section_no, section_name,
           status, raw_ocr_text, raw_json
         ) VALUES (
           $1, $2, $3, $4, $5, lower(trim(regexp_replace($5, '\\s+', ' ', 'g'))),
           $6::voterdb.relation_type, $7, $8, $9, $10::voterdb.gender_code,
           $11, $12, $13,
           $14::voterdb.voter_status, $15, $16::jsonb
         )
         ON CONFLICT (part_no, serial_no) DO UPDATE SET
           document_id = EXCLUDED.document_id,
           epic = EXCLUDED.epic,
           name = EXCLUDED.name,
           name_normalized = EXCLUDED.name_normalized,
           relation_type = EXCLUDED.relation_type,
           relation_name = EXCLUDED.relation_name,
           house_no = EXCLUDED.house_no,
           age = EXCLUDED.age,
           gender = EXCLUDED.gender,
           page_no = EXCLUDED.page_no,
           section_no = EXCLUDED.section_no,
           section_name = EXCLUDED.section_name,
           status = EXCLUDED.status,
           raw_ocr_text = EXCLUDED.raw_ocr_text,
           raw_json = EXCLUDED.raw_json,
           updated_at = NOW()`,
        [
          documentId,
          pno,
          serial,
          v.epic || null,
          String(v.name).slice(0, 200),
          sanitizeRelation(v.relation_type),
          v.relation_name || null,
          v.house_no || null,
          sanitizeAge(v.age),
          sanitizeGender(v.gender),
          v.page_no != null ? Number(v.page_no) : null,
          v.section_no != null ? Number(v.section_no) : null,
          v.section_name ? String(v.section_name).slice(0, 200) : null,
          sanitizeStatus(v.status),
          v.raw_ocr_text || null,
          JSON.stringify(v),
        ]
      );
    }

    // Ensure public booth row for this part (app lists)
    if (partNo != null) {
      const area =
        (rollInfo?.sections && rollInfo.sections[0]?.section_name) ||
        rollInfo?.main_town ||
        `Part ${partNo}`;
      const station =
        rollInfo?.polling_station || `Polling Station Part ${partNo}`;
      await client.query(
        `INSERT INTO public.booths (
           part_no, area_name, polling_station_name, polling_station_address, status, voter_count
         ) VALUES ($1, $2, $3, $4, 'pending', $5)
         ON CONFLICT (part_no) DO UPDATE SET
           area_name = COALESCE(EXCLUDED.area_name, public.booths.area_name),
           polling_station_name = COALESCE(EXCLUDED.polling_station_name, public.booths.polling_station_name),
           polling_station_address = COALESCE(EXCLUDED.polling_station_address, public.booths.polling_station_address),
           voter_count = EXCLUDED.voter_count,
           updated_at = NOW()`,
        [partNo, area, station, rollInfo?.polling_address || null, savedElectors]
      );
    }

    // ready = electors present; needs_import = OCR text saved but no structured rows
    const parseStatus = savedElectors > 0 ? 'ready' : 'needs_import';

    await client.query(
      `UPDATE voterdb.extracted_documents SET voter_count = $2 WHERE id = $1`,
      [documentId, savedElectors]
    );

    await client.query(
      `INSERT INTO voterdb.roll_files (
         filename, part_no, ac_code, year, page_count, storage_path,
         parse_status, voter_count, document_id, processed_at
       ) VALUES (
         $1, $2, 'S01-65', 2026, $3, $4,
         $5::voterdb.parse_status, $6, $7, NOW()
       )
       ON CONFLICT (filename) DO UPDATE SET
         part_no = EXCLUDED.part_no,
         page_count = EXCLUDED.page_count,
         storage_path = COALESCE(EXCLUDED.storage_path, voterdb.roll_files.storage_path),
         parse_status = EXCLUDED.parse_status,
         voter_count = EXCLUDED.voter_count,
         document_id = EXCLUDED.document_id,
         error_message = NULL,
         processed_at = NOW()`,
      [
        filename,
        partNo,
        payload.page_count || pages.length,
        opts.storagePath || null,
        parseStatus,
        savedElectors,
        documentId,
      ]
    );

    await client.query('COMMIT');
    console.log(
      `DB saved: ${filename} → document #${documentId} (${pages.length} pages, ${savedElectors} electors)`
    );
    return { documentId: Number(documentId), pages: pages.length, electors: savedElectors };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('saveExtractionToDb failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Mark a roll file as OCR-in-progress (so Data page leaves "Queued").
 */
/**
 * True when this roll file has already been extracted into the database. The queue uses it so a
 * restart (or the API asking the service to "recover") never reads the same PDF a second time and
 * overwrites good data. A new upload or the Retry button sets the status back to "queued" first.
 */
async function isRollProcessed(filename) {
  const p = getPool();
  if (!p) return false;
  try {
    const res = await p.query(
      `SELECT 1 FROM voterdb.roll_files
        WHERE filename = $1 AND parse_status IN ('ready', 'needs_import') LIMIT 1`,
      [filename]
    );
    return res.rowCount > 0;
  } catch (err) {
    // If the database cannot be asked, do not start a long extraction that could not be saved anyway.
    console.warn('isRollProcessed:', err.message);
    return true;
  }
}

async function markRollProgress(filename, { page = 0, total = 0, stage = 'ocr' } = {}) {
  const p = getPool();
  if (!p || !filename) return { skipped: true };
  try {
    await p.query(
      `UPDATE voterdb.roll_files
       SET parse_status = 'ocr'::voterdb.parse_status,
           page_count = GREATEST(page_count, $2),
           error_message = NULL
       WHERE filename = $1`,
      [filename, Number(total) || Number(page) || 0]
    );
    return { ok: true, stage, page, total };
  } catch (err) {
    console.warn('markRollProgress:', err.message);
    return { ok: false, error: err.message };
  }
}

async function markRollFailed(filename, message) {
  const p = getPool();
  if (!p || !filename) return;
  try {
    await p.query(
      `UPDATE voterdb.roll_files
       SET parse_status = 'failed'::voterdb.parse_status,
           error_message = $2
       WHERE filename = $1`,
      [filename, String(message || 'OCR failed').slice(0, 500)]
    );
  } catch (err) {
    console.warn('markRollFailed:', err.message);
  }
}

/**
 * Re-parse stored page OCR text to fill section/road, page_no, and roll cover
 * without re-running Tesseract.
 */
async function enrichDocumentFromStoredPages(documentId) {
  const p = getPool();
  if (!p) return { skipped: true };
  const client = await p.connect();
  try {
    await ensureElectorExtraColumns(client);
    const docRes = await client.query(
      `SELECT id, filename, part_no, full_text, raw_meta
       FROM voterdb.extracted_documents WHERE id = $1`,
      [documentId]
    );
    if (!docRes.rows[0]) return { ok: false, error: 'document not found' };
    const doc = docRes.rows[0];
    const pagesRes = await client.query(
      `SELECT page_no AS page, image, char_count, text
       FROM voterdb.extracted_pages WHERE document_id = $1 ORDER BY page_no`,
      [documentId]
    );
    const pages = pagesRes.rows;
    const fullText =
      doc.full_text ||
      pages.map((pg) => `===== PAGE ${pg.page} =====\n${pg.text || ''}`.trimEnd()).join('\n\n');
    const partNo = doc.part_no != null ? Number(doc.part_no) : null;
    const voters = parseEciOcrText(fullText, partNo);
    const rollInfo = parseRollCover(pages);

    await client.query('BEGIN');
    let updated = 0;
    for (const v of voters) {
      if (!v?.name || isJunkElectorName(v.name)) continue;
      const serial = v.serial_no != null ? Number(v.serial_no) : null;
      if (serial == null || partNo == null) continue;
      const res = await client.query(
        `UPDATE voterdb.electors SET
           page_no = COALESCE($3, page_no),
           section_no = COALESCE($4, section_no),
           section_name = COALESCE($5, section_name),
           epic = COALESCE(NULLIF($6, ''), epic),
           relation_type = COALESCE($7::voterdb.relation_type, relation_type),
           relation_name = COALESCE($8, relation_name),
           house_no = COALESCE($9, house_no),
           age = COALESCE($10, age),
           gender = COALESCE($11::voterdb.gender_code, gender),
           raw_ocr_text = COALESCE($12, raw_ocr_text),
           raw_json = COALESCE($13::jsonb, raw_json),
           updated_at = NOW()
         WHERE part_no = $1 AND serial_no = $2`,
        [
          partNo,
          serial,
          v.page_no != null ? Number(v.page_no) : null,
          v.section_no != null ? Number(v.section_no) : null,
          v.section_name || null,
          v.epic || '',
          sanitizeRelation(v.relation_type),
          v.relation_name || null,
          v.house_no || null,
          sanitizeAge(v.age),
          sanitizeGender(v.gender),
          v.raw_ocr_text || null,
          JSON.stringify(v),
        ]
      );
      updated += res.rowCount || 0;
    }

    const prevMeta = doc.raw_meta && typeof doc.raw_meta === 'object' ? doc.raw_meta : {};
    await client.query(
      `UPDATE voterdb.extracted_documents
       SET raw_meta = $2::jsonb
       WHERE id = $1`,
      [documentId, JSON.stringify({ ...prevMeta, roll_info: rollInfo })]
    );

    if (partNo != null) {
      const area =
        (rollInfo?.sections && rollInfo.sections[0]?.section_name) ||
        rollInfo?.main_town ||
        `Part ${partNo}`;
      await client.query(
        `UPDATE public.booths SET
           area_name = COALESCE($2, area_name),
           polling_station_name = COALESCE($3, polling_station_name),
           polling_station_address = COALESCE($4, polling_station_address),
           updated_at = NOW()
         WHERE part_no = $1`,
        [
          partNo,
          area,
          rollInfo?.polling_station || null,
          rollInfo?.polling_address || null,
        ]
      );
    }

    await client.query('COMMIT');
    return {
      ok: true,
      documentId: Number(documentId),
      updated,
      voters: voters.length,
      sections: rollInfo?.sections?.length || 0,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function enrichAllDocuments() {
  const p = getPool();
  if (!p) return { skipped: true };
  const docs = await p.query(`SELECT id FROM voterdb.extracted_documents ORDER BY id`);
  const results = [];
  for (const row of docs.rows) {
    results.push(await enrichDocumentFromStoredPages(row.id));
  }
  return { ok: true, documents: results.length, results };
}

module.exports = {
  saveExtractionToDb,
  markRollProgress,
  markRollFailed,
  isRollProcessed,
  getPool,
  enrichDocumentFromStoredPages,
  enrichAllDocuments,
  ensureElectorExtraColumns,
};
