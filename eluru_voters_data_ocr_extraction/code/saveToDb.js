/**
 * Persist OCR result into PostgreSQL voterdb (server DB).
 * Disk JSON/TXT remain optional backups.
 */
const { Pool } = require('pg');

let pool = null;

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

    const filename = payload.filename;
    const partNo = payload.part_no != null ? Number(payload.part_no) : null;

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
        }),
      ]
    );
    const documentId = docRes.rows[0].id;

    await client.query(`DELETE FROM voterdb.extracted_pages WHERE document_id = $1`, [documentId]);
    await client.query(`DELETE FROM voterdb.electors WHERE document_id = $1`, [documentId]);

    const pages = Array.isArray(payload.pages) ? payload.pages : [];
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
           relation_type, relation_name, house_no, age, gender, status, raw_ocr_text, raw_json
         ) VALUES (
           $1, $2, $3, $4, $5, lower(trim(regexp_replace($5, '\\s+', ' ', 'g'))),
           $6::voterdb.relation_type, $7, $8, $9, $10::voterdb.gender_code,
           $11::voterdb.voter_status, $12, $13::jsonb
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
          sanitizeStatus(v.status),
          v.raw_ocr_text || null,
          JSON.stringify(v),
        ]
      );
    }

    // Ensure public booth row for this part (app lists)
    if (partNo != null) {
      await client.query(
        `INSERT INTO public.booths (part_no, area_name, polling_station_name, status, voter_count)
         VALUES ($1, $2, $3, 'pending', $4)
         ON CONFLICT (part_no) DO UPDATE SET
           voter_count = EXCLUDED.voter_count,
           updated_at = NOW()`,
        [partNo, `Part ${partNo}`, `Polling Station Part ${partNo}`, savedElectors]
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

module.exports = { saveExtractionToDb, markRollProgress, markRollFailed, getPool };
