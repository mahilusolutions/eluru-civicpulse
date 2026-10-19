const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { ocrPdfToVoters, partFromFilename } = require('./ocrWorker');
const { broadcast } = require('./events');
const { saveExtractionToDb, markRollProgress, markRollFailed, isRollProcessed } = require('./saveToDb');

const PAGE_WORKERS = Number(process.env.OCR_PAGE_WORKERS) || 3;
const DPI = Number(process.env.OCR_DPI) || 160;

function createQueue({ uploadedDir, extractedDir }) {
  /** @type {Map<string, object>} */
  const jobs = new Map();
  /** @type {string[]} */
  const pending = [];
  let activeId = null;
  let running = false;

  function stats() {
    const list = [...jobs.values()];
    return {
      pending: list.filter((j) => j.status === 'pending').length,
      active: list.filter((j) => j.status === 'active').length,
      done: list.filter((j) => j.status === 'done').length,
      failed: list.filter((j) => j.status === 'failed').length,
      total: list.length,
      activeJobId: activeId,
      pageWorkers: PAGE_WORKERS,
      dpi: DPI,
    };
  }

  function emitStats() {
    broadcast('queue_stats', stats());
  }

  function publicJob(job) {
    return {
      id: job.id,
      filename: job.filename,
      part_no: job.part_no,
      status: job.status,
      created_at: job.created_at,
      started_at: job.started_at,
      finished_at: job.finished_at,
      page: job.page,
      total_pages: job.total_pages,
      eta_seconds: job.eta_seconds,
      voter_count: job.voter_count,
      recent_voters: job.recent_voters || [],
      live_pages: job.live_pages || [],
      duration_ms: job.duration_ms,
      error: job.error,
      result_file: job.result_file,
      stage: job.stage,
    };
  }

  function enqueue(filename, absPath) {
    const id = uuidv4();
    const part_no = partFromFilename(filename);
    const job = {
      id,
      filename,
      absPath,
      part_no,
      status: 'pending',
      created_at: new Date().toISOString(),
      started_at: null,
      finished_at: null,
      page: 0,
      total_pages: 0,
      eta_seconds: null,
      voter_count: 0,
      recent_voters: [],
      live_pages: [],
      duration_ms: null,
      error: null,
      result_file: null,
      stage: 'queued',
    };
    jobs.set(id, job);
    pending.push(id);
    broadcast('job_queued', publicJob(job));
    emitStats();
    pump();
    return publicJob(job);
  }

  async function pump() {
    if (running) return;
    running = true;
    try {
      while (pending.length) {
        const id = pending.shift();
        const job = jobs.get(id);
        if (!job) continue;
        activeId = id;
        job.status = 'active';
        job.started_at = new Date().toISOString();
        job.stage = 'render';
        broadcast('job_started', publicJob(job));
        emitStats();
        markRollProgress(job.filename, { stage: 'render' }).catch(() => {});

        try {
          const partNo = job.part_no != null ? job.part_no : Date.now() % 100000;
          let lastDbProgress = 0;
          const stem = path.parse(job.filename).name;
          const imageDir = path.join(uploadedDir, 'page_images', stem);
          const result = await ocrPdfToVoters(job.absPath, partNo, {
            dpi: DPI,
            pageWorkers: PAGE_WORKERS,
            startPage: 1,
            imageDir,
            onProgress: (p) => {
              job.stage = p.stage;
              job.page = p.page || 0;
              job.total_pages = p.total || 0;
              job.eta_seconds = p.etaSeconds;
              // Throttle DB progress writes (every page or every 3s)
              const now = Date.now();
              if (p.page && (p.page !== lastDbProgress || now - (job._lastDbAt || 0) > 3000)) {
                lastDbProgress = p.page;
                job._lastDbAt = now;
                markRollProgress(job.filename, {
                  page: p.page,
                  total: p.total,
                  stage: p.stage || 'ocr',
                }).catch(() => {});
              }
              if (p.pageVoters && p.pageVoters.length) {
                job.recent_voters = [...p.pageVoters, ...job.recent_voters].slice(0, 40);
                broadcast('voters_partial', {
                  job_id: job.id,
                  part_no: partNo,
                  page: p.page,
                  total: p.total,
                  page_voter_count: p.pageVoterCount || 0,
                  sample: p.pageVoters,
                });
              }
              if (p.pageText != null && String(p.pageText).length) {
                const block = {
                  pageNo: p.pageNo ?? p.page,
                  finished: p.page,
                  total: p.total,
                  char_count: p.pageCharCount || 0,
                  text: p.pageText,
                  at: new Date().toISOString(),
                };
                job.live_pages = [...(job.live_pages || []), block].slice(-80);
                broadcast('text_partial', {
                  job_id: job.id,
                  part_no: partNo,
                  filename: job.filename,
                  ...block,
                });
              }
              // Keep page_progress light (no full text) so UI stays snappy
              const slim = publicJob(job);
              slim.live_pages = (job.live_pages || []).map((lp) => ({
                pageNo: lp.pageNo,
                finished: lp.finished,
                total: lp.total,
                char_count: lp.char_count,
                at: lp.at,
              }));
              broadcast('page_progress', slim);
            },
          });

          // Always name outputs after the PDF so any document is easy to find
          const outName = `${stem}.json`;
          const txtName = `${stem}.txt`;
          const outPath = path.join(extractedDir, outName);
          const txtPath = path.join(extractedDir, txtName);
          const payload = {
            part_no: partNo,
            filename: job.filename,
            source: 'tesseract-ocr',
            mode: 'full_text',
            dpi: DPI,
            page_workers: PAGE_WORKERS,
            page_count: result.pageCount,
            text_length: result.textLength,
            voter_count: result.voters.length,
            duration_ms: result.durationMs,
            extracted_at: new Date().toISOString(),
            job_id: job.id,
            pages: result.pages,
            full_text: result.full_text,
            voters: result.voters,
            roll_info: result.roll_info || null,
            page_images_dir: imageDir,
          };
          // Optional disk backup (default on). Set OCR_SAVE_DISK=0 to DB-only.
          const saveDisk = process.env.OCR_SAVE_DISK !== '0';
          if (saveDisk) {
            fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
            fs.writeFileSync(txtPath, result.full_text || '', 'utf8');
            if (job.part_no != null) {
              fs.writeFileSync(
                path.join(extractedDir, `part-${job.part_no}.json`),
                JSON.stringify(payload, null, 2),
                'utf8'
              );
              fs.writeFileSync(
                path.join(extractedDir, `part-${job.part_no}.txt`),
                result.full_text || '',
                'utf8'
              );
            }
          }

          // Primary store: PostgreSQL voterdb on the server
          try {
            const dbResult = await saveExtractionToDb(payload, { storagePath: job.absPath });
            job.db_document_id = dbResult.documentId;
            job.stage = 'done';
          } catch (dbErr) {
            console.error('DB save failed (disk backup kept if enabled):', dbErr.message);
            job.error = `DB save: ${String(dbErr.message).slice(0, 200)}`;
            // Still mark OCR done if disk written; Data page can re-import
          }

          job.status = 'done';
          job.finished_at = new Date().toISOString();
          job.voter_count = result.voters.length;
          job.total_pages = result.pageCount;
          job.page = result.pageCount;
          job.duration_ms = result.durationMs;
          job.eta_seconds = 0;
          job.result_file = outName;
          job.recent_voters = result.voters.slice(0, 40);
          if (!job.stage) job.stage = 'done';
          broadcast('job_completed', publicJob(job));
          broadcast('disk_status', { files: listDiskFiles() });
        } catch (err) {
          job.status = 'failed';
          job.finished_at = new Date().toISOString();
          job.error = String(err.message || err).slice(0, 500);
          job.stage = 'failed';
          markRollFailed(job.filename, job.error).catch(() => {});
          broadcast('job_failed', publicJob(job));
          broadcast('disk_status', { files: listDiskFiles() });
        }

        activeId = null;
        emitStats();
      }
    } finally {
      running = false;
    }
  }

  function listJobs() {
    return [...jobs.values()]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(publicJob);
  }

  function getJob(id) {
    const job = jobs.get(id);
    return job ? publicJob(job) : null;
  }

  function resultFileForPdf(filename) {
    const stem = path.parse(filename).name;
    const byName = path.join(extractedDir, `${stem}.json`);
    if (fs.existsSync(byName)) return { resultFile: `${stem}.json`, resultAbs: byName };
    const part_no = partFromFilename(filename);
    if (part_no != null) {
      const byPart = path.join(extractedDir, `part-${part_no}.json`);
      if (fs.existsSync(byPart)) return { resultFile: `part-${part_no}.json`, resultAbs: byPart };
    }
    return { resultFile: `${stem}.json`, resultAbs: byName };
  }

  function listDiskFiles() {
    const pdfs = fs
      .readdirSync(uploadedDir)
      .filter((f) => f.toLowerCase().endsWith('.pdf'));
    return pdfs
      .map((filename) => {
        const absPath = path.join(uploadedDir, filename);
        const st = fs.statSync(absPath);
        const part_no = partFromFilename(filename);
        const { resultFile, resultAbs } = resultFileForPdf(filename);
        const extracted = fs.existsSync(resultAbs);
        let voter_count = null;
        let text_length = null;
        let page_count = null;
        if (extracted) {
          try {
            const j = JSON.parse(fs.readFileSync(resultAbs, 'utf8'));
            voter_count = j.voter_count;
            text_length = j.text_length;
            page_count = j.page_count;
          } catch {
            /* ignore */
          }
        }
        const live = [...jobs.values()].find((j) => j.filename === filename);
        let status = 'on_disk';
        if (extracted) status = 'extracted';
        else if (live) status = live.status;
        else status = 'waiting_ocr';
        return {
          filename,
          part_no,
          size: st.size,
          mtime: st.mtime.toISOString(),
          status,
          extracted,
          result_file: extracted ? resultFile : null,
          voter_count,
          text_length,
          page_count,
          job_id: live ? live.id : null,
          paths: {
            uploaded: absPath,
            extracted: resultAbs,
          },
        };
      })
      .sort((a, b) => String(a.part_no ?? a.filename).localeCompare(String(b.part_no ?? b.filename), undefined, { numeric: true }));
  }

  function isQueuedOrActive(filename) {
    return [...jobs.values()].some(
      (j) => j.filename === filename && (j.status === 'pending' || j.status === 'active')
    );
  }

  /**
   * Queue PDFs on disk that still need reading (survives a restart). Files already extracted
   * into the database are left alone.
   */
  async function recoverPendingFromDisk() {
    const recovered = [];
    for (const row of listDiskFiles()) {
      if (row.extracted) continue;
      if (isQueuedOrActive(row.filename)) continue;
      if (await isRollProcessed(row.filename)) continue;
      const abs = path.join(uploadedDir, row.filename);
      recovered.push(enqueue(row.filename, abs));
    }
    broadcast('disk_status', { files: listDiskFiles() });
    return recovered;
  }

  return {
    enqueue,
    listJobs,
    getJob,
    stats,
    listDiskFiles,
    recoverPendingFromDisk,
    uploadedDir,
    extractedDir,
  };
}

module.exports = { createQueue };
