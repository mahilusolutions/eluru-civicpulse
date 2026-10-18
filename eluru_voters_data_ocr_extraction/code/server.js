const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createQueue } = require('./queue');
const { addClient, broadcast, clientCount } = require('./events');

const PORT = Number(process.env.PORT) || 2000;
const APP_ROOT = path.resolve(__dirname, '..');
const UPLOADED = path.join(APP_ROOT, 'uploaded_files');
const EXTRACTED = path.join(APP_ROOT, 'extracted_ocr_data');

[UPLOADED, EXTRACTED].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const queue = createQueue({ uploadedDir: UPLOADED, extractedDir: EXTRACTED });

/** Keep original PDF name (sanitized path chars only) so files are easy to spot. */
function safeOriginalName(original) {
  const base = path.basename(original || 'upload.pdf');
  return base.replace(/[\\/<>:"|?*\x00-\x1f]/g, '_').trim() || 'upload.pdf';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADED),
  filename: (_req, file, cb) => {
    cb(null, safeOriginalName(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/\.pdf$/i.test(file.originalname)) {
      cb(new Error('Only PDF files allowed'));
      return;
    }
    const name = safeOriginalName(file.originalname);
    if (fs.existsSync(path.join(UPLOADED, name))) {
      cb(new Error(`Already uploaded: ${name}`));
      return;
    }
    cb(null, true);
  },
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    port: PORT,
    sse_clients: clientCount(),
    queue: queue.stats(),
  });
});

app.get('/api/jobs', (_req, res) => {
  res.json({ success: true, stats: queue.stats(), jobs: queue.listJobs() });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = queue.getJob(req.params.id);
  if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
  res.json({ success: true, job });
});

app.get('/api/results/file/:name', (req, res) => {
  const name = path.basename(req.params.name);
  if (!/\.(json|txt)$/i.test(name)) {
    return res.status(400).json({ success: false, message: 'Only .json / .txt' });
  }
  const file = path.join(EXTRACTED, name);
  if (!fs.existsSync(file)) return res.status(404).json({ success: false, message: 'Result not found' });
  res.sendFile(file);
});

app.get('/api/results/:part', (req, res) => {
  const part = req.params.part.replace(/[^0-9]/g, '');
  const file = path.join(EXTRACTED, `part-${part}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ success: false, message: 'Result not found' });
  res.sendFile(file);
});

app.get('/api/results', (_req, res) => {
  const files = fs
    .readdirSync(EXTRACTED)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const full = path.join(EXTRACTED, f);
      const st = fs.statSync(full);
      let voter_count = null;
      let part_no = null;
      let text_length = null;
      let page_count = null;
      let filename = null;
      try {
        const j = JSON.parse(fs.readFileSync(full, 'utf8'));
        voter_count = j.voter_count;
        part_no = j.part_no;
        text_length = j.text_length;
        page_count = j.page_count;
        filename = j.filename;
      } catch {
        /* ignore */
      }
      const txt = f.replace(/\.json$/i, '.txt');
      return {
        file: f,
        txt_file: fs.existsSync(path.join(EXTRACTED, txt)) ? txt : null,
        source_pdf: filename,
        part_no,
        voter_count,
        text_length,
        page_count,
        size: st.size,
        mtime: st.mtime.toISOString(),
      };
    })
    .sort((a, b) => String(a.part_no ?? a.file).localeCompare(String(b.part_no ?? b.file), undefined, { numeric: true }));
  res.json({ success: true, results: files });
});

app.get('/api/uploaded', (_req, res) => {
  const files = fs
    .readdirSync(UPLOADED)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  res.json({ success: true, files });
});

app.get('/api/disk', (_req, res) => {
  res.json({
    success: true,
    paths: {
      uploaded_files: UPLOADED,
      extracted_ocr_data: EXTRACTED,
    },
    files: queue.listDiskFiles(),
    stats: queue.stats(),
  });
});

app.post('/api/recover', (_req, res) => {
  const jobs = queue.recoverPendingFromDisk();
  res.json({
    success: true,
    recovered: jobs.length,
    jobs,
    files: queue.listDiskFiles(),
    stats: queue.stats(),
  });
});

app.post('/api/check-existing', (req, res) => {
  const names = Array.isArray(req.body?.names) ? req.body.names : [];
  const existing = names
    .map((n) => safeOriginalName(String(n)))
    .filter((n) => fs.existsSync(path.join(UPLOADED, n)));
  res.json({ success: true, existing, has_existing: existing.length > 0 });
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`);
  res.write(`event: queue_stats\ndata: ${JSON.stringify(queue.stats())}\n\n`);
  addClient(res);
  const ping = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      clearInterval(ping);
    }
  }, 25000);
  req.on('close', () => clearInterval(ping));
});

app.post('/api/upload', (req, res) => {
  upload.array('files', 50)(req, res, (err) => {
    if (err) {
      const msg = err.message || 'Upload error';
      const status = /^Already uploaded:/i.test(msg) ? 409 : 400;
      return res.status(status).json({
        success: false,
        message: msg,
        already_exists: status === 409,
      });
    }
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'No PDF files uploaded' });
    }
    const jobs = files.map((f) => {
      const savedName = f.filename || safeOriginalName(f.originalname);
      return queue.enqueue(savedName, f.path);
    });
    broadcast('queue_stats', queue.stats());
    broadcast('disk_status', { files: queue.listDiskFiles() });
    res.json({ success: true, jobs, stats: queue.stats(), files: queue.listDiskFiles() });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Eluru OCR Extract listening on http://0.0.0.0:${PORT}`);
  console.log(`Uploads:   ${UPLOADED}`);
  console.log(`Extracted: ${EXTRACTED}`);
  // Defer so HTTP answers before OCR starts (sync spawn work can stall the event loop).
  setTimeout(() => {
    const recovered = queue.recoverPendingFromDisk();
    if (recovered.length) {
      console.log(`Recovered ${recovered.length} PDF(s) from disk into OCR queue`);
    }
  }, 500);
});
