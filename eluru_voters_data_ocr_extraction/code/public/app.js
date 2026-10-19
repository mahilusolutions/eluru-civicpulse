const $ = (id) => document.getElementById(id);

// Behind nginx at /ocr/ — set by server window.__OCR_BASE__ (default "")
const BASE = String(window.__OCR_BASE__ || '').replace(/\/$/, '');
const api = (path) => `${BASE}${path.startsWith('/') ? path : `/${path}`}`;

const state = {
  jobs: [],
  stats: { pending: 0, active: 0, done: 0, failed: 0 },
  selectedFiles: [],
  liveBlocks: [],
  liveJobId: null,
  diskFiles: [],
  paths: null,
  autoScrollLive: true,
};

function fmtEta(sec) {
  if (sec == null || Number.isNaN(sec)) return 'ETA —';
  if (sec <= 0) return 'ETA 0s';
  if (sec < 60) return `ETA ~${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `ETA ~${m}m ${s}s`;
}

function setStats(stats) {
  state.stats = stats || state.stats;
  $('statPending').textContent = state.stats.pending ?? 0;
  $('statActive').textContent = state.stats.active ?? 0;
  $('statDone').textContent = state.stats.done ?? 0;
  $('statFailed').textContent = state.stats.failed ?? 0;
}

function upsertJob(job) {
  const i = state.jobs.findIndex((j) => j.id === job.id);
  if (i >= 0) state.jobs[i] = { ...state.jobs[i], ...job };
  else state.jobs.unshift(job);
  renderJobs();
  renderActive();
}

function setLiveMeta(text) {
  const el = $('liveMeta');
  if (el) el.textContent = text;
}

function resetLiveTranscript(message) {
  state.liveBlocks = [];
  state.liveJobId = null;
  const el = $('liveTranscript');
  if (el) el.innerHTML = `<span class="idle">${escapeHtml(message || 'Waiting for OCR…')}</span>`;
  setLiveMeta('Idle');
}

function renderLiveTranscript() {
  const el = $('liveTranscript');
  if (!el) return;
  if (!state.liveBlocks.length) {
    el.innerHTML = '<span class="idle">Waiting for page OCR… (PDF render may take a minute first)</span>';
    return;
  }
  el.innerHTML = state.liveBlocks
    .map((b) => {
      const mark = `—— Page ${b.pageNo ?? '?'} · ${b.finished ?? '?'}/${b.total ?? '?'} · ${b.char_count ?? 0} chars ——`;
      return `<div class="page-mark">${escapeHtml(mark)}</div>${escapeHtml(b.text || '')}\n\n`;
    })
    .join('');
  if (state.autoScrollLive) {
    el.scrollTop = el.scrollHeight;
  }
}

function appendLivePage(d) {
  if (!d || d.text == null) return;
  if (d.job_id && state.liveJobId && d.job_id !== state.liveJobId) {
    state.liveBlocks = [];
  }
  if (d.job_id) state.liveJobId = d.job_id;
  state.liveBlocks.push({
    pageNo: d.pageNo,
    finished: d.finished,
    total: d.total,
    char_count: d.char_count,
    text: d.text,
  });
  if (state.liveBlocks.length > 100) state.liveBlocks = state.liveBlocks.slice(-100);
  setLiveMeta(`Live · page ${d.finished ?? d.pageNo ?? '?'}/${d.total ?? '?'}`);
  renderLiveTranscript();
}

function renderActive() {
  const active = state.jobs.find((j) => j.status === 'active');
  const box = $('activeBox');
  if (!active) {
    box.innerHTML = '<p class="muted">No active job</p>';
    $('progressFill').style.width = '0%';
    $('progressText').textContent = '—';
    $('etaText').textContent = 'ETA —';
    return;
  }
  const pct =
    active.total_pages > 0 ? Math.round((100 * (active.page || 0)) / active.total_pages) : 0;
  const stageLabel =
    active.stage === 'render'
      ? 'rendering PDF → images (then live text starts)'
      : active.stage || 'ocr';
  box.innerHTML = `<strong>${escapeHtml(active.filename)}</strong>
    <span class="muted">Part ${active.part_no ?? '—'} · ${stageLabel} · pages ${active.page || 0}/${active.total_pages || '?'}</span>`;
  $('progressFill').style.width = `${pct}%`;
  $('progressText').textContent = `${pct}% · ${active.page || 0}/${active.total_pages || '?'}`;
  $('etaText').textContent = fmtEta(active.eta_seconds);
  if (active.stage === 'render') {
    setLiveMeta('Rendering PDF…');
    if (!state.liveBlocks.length) {
      const el = $('liveTranscript');
      if (el) {
        el.innerHTML =
          '<span class="idle">Rendering PDF pages to images… Live text will stream here as each page finishes OCR.</span>';
      }
    }
  }
}

function renderJobs() {
  const el = $('jobList');
  if (!state.jobs.length) {
    el.innerHTML = '<p class="muted">No jobs yet</p>';
    return;
  }
  el.innerHTML = state.jobs
    .slice(0, 80)
    .map((j) => {
      const dur =
        j.duration_ms != null ? `${(j.duration_ms / 1000).toFixed(0)}s` : j.status === 'active' ? '…' : '—';
      return `<article class="job">
        <header>
          <div>
            <strong>${escapeHtml(j.filename)}</strong>
            <div class="muted">Part ${j.part_no ?? '—'} · voters ${j.voter_count ?? 0} · ${dur}</div>
          </div>
          <span class="badge ${j.status}">${j.status}</span>
        </header>
        ${j.error ? `<div class="muted">${escapeHtml(j.error)}</div>` : ''}
      </article>`;
    })
    .join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function refreshJobs() {
  const res = await fetch(api('/api/jobs'));
  const data = await res.json();
  setStats(data.stats);
  state.jobs = data.jobs || [];
  renderJobs();
  renderActive();
}

async function refreshResults() {
  const res = await fetch(api('/api/results'));
  const data = await res.json();
  const el = $('resultList');
  const results = data.results || [];
  if (!results.length) {
    el.innerHTML = '<p class="muted">No extracted files yet</p>';
    return;
  }
  el.innerHTML = results
    .map((r) => {
      const bits = [
        r.page_count != null ? `${r.page_count} pages` : null,
        r.text_length != null ? `${r.text_length.toLocaleString()} chars` : null,
        r.voter_count != null ? `${r.voter_count} voters (bonus)` : null,
      ].filter(Boolean);
      const jsonHref = api(`/api/results/file/${encodeURIComponent(r.file)}`);
      const txtLink = r.txt_file
        ? ` · <a class="link" href="${api(`/api/results/file/${encodeURIComponent(r.txt_file)}`)}" target="_blank" rel="noopener">TXT</a>`
        : '';
      return `<div class="result">
        <div>
          <strong>${escapeHtml(r.file)}</strong>
          <div class="muted">${escapeHtml(r.source_pdf || '')}${bits.length ? ` · ${bits.join(' · ')}` : ''}</div>
        </div>
        <span><a class="link" href="${jsonHref}" target="_blank" rel="noopener">JSON</a>${txtLink}</span>
      </div>`;
    })
    .join('');
}

function connectSSE() {
  const pill = $('livePill');
  const es = new EventSource(api('/api/events'));
  es.addEventListener('hello', () => {
    pill.textContent = 'Live';
    pill.classList.add('on');
  });
  es.addEventListener('queue_stats', (e) => setStats(JSON.parse(e.data)));
  es.addEventListener('job_queued', (e) => upsertJob(JSON.parse(e.data)));
  es.addEventListener('job_started', (e) => {
    const job = JSON.parse(e.data);
    upsertJob(job);
    state.liveBlocks = [];
    state.liveJobId = job.id;
    setLiveMeta('Rendering PDF…');
    const el = $('liveTranscript');
    if (el) {
      el.innerHTML = `<span class="idle">Started: ${escapeHtml(job.filename || '')}\nRendering PDF → images, then streaming OCR text page by page…</span>`;
    }
  });
  es.addEventListener('page_progress', (e) => upsertJob(JSON.parse(e.data)));
  es.addEventListener('job_completed', (e) => {
    upsertJob(JSON.parse(e.data));
    setLiveMeta('Done — full file saved');
    refreshResults();
    refreshDisk();
  });
  es.addEventListener('job_failed', (e) => {
    upsertJob(JSON.parse(e.data));
    setLiveMeta('Failed');
    refreshDisk();
  });
  es.addEventListener('text_partial', (e) => {
    appendLivePage(JSON.parse(e.data));
  });
  es.addEventListener('disk_status', (e) => {
    const d = JSON.parse(e.data);
    state.diskFiles = d.files || [];
    renderDisk();
  });
  es.onerror = () => {
    pill.textContent = 'Reconnecting…';
    pill.classList.remove('on');
  };
}

function statusLabel(s) {
  if (s === 'waiting_ocr') return 'waiting OCR';
  if (s === 'extracted') return 'extracted';
  if (s === 'pending') return 'queued';
  if (s === 'active') return 'processing';
  return s;
}

function renderDisk() {
  const el = $('diskList');
  if (state.paths) {
    $('diskPaths').innerHTML = `Uploaded: <code>${escapeHtml(state.paths.uploaded_files)}</code><br/>Extracted: <code>${escapeHtml(state.paths.extracted_ocr_data)}</code>`;
  }
  if (!state.diskFiles.length) {
    el.innerHTML = '<p class="muted">No PDFs in uploaded_files/ yet</p>';
    return;
  }
  el.innerHTML = state.diskFiles
    .map(
      (f) => `<div class="disk-item">
        <div>
          <strong>${escapeHtml(f.filename)}</strong>
          <div class="muted">Part ${f.part_no ?? '—'} · ${formatBytes(f.size)}${f.page_count != null ? ` · ${f.page_count} pages` : ''}${f.text_length != null ? ` · ${f.text_length.toLocaleString()} chars` : ''}${f.voter_count != null ? ` · ${f.voter_count} voters` : ''}${f.result_file ? ` · ${escapeHtml(f.result_file)}` : ''}</div>
        </div>
        <span class="badge ${f.status}">${statusLabel(f.status)}</span>
      </div>`
    )
    .join('');
}

async function refreshDisk() {
  const res = await fetch(api('/api/disk'));
  const data = await res.json();
  state.paths = data.paths;
  state.diskFiles = data.files || [];
  if (data.stats) setStats(data.stats);
  renderDisk();
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function renderSelectedFiles() {
  const list = $('selectedList');
  const btn = $('uploadBtn');
  const files = state.selectedFiles;
  btn.disabled = !files.length;
  if (!files.length) {
    list.hidden = true;
    list.innerHTML = '';
    return;
  }
  list.hidden = false;
  list.innerHTML = files
    .map(
      (f) => `<div class="selected-item">
        <strong>${escapeHtml(f.name)}</strong>
        <div class="size">${formatBytes(f.size)}</div>
      </div>`
    )
    .join('');
}

function setupUpload() {
  const dz = $('dropzone');
  const input = $('fileInput');
  const btn = $('uploadBtn');
  const msg = $('uploadMsg');

  const syncSelection = () => {
    state.selectedFiles = [...(input.files || [])];
    msg.textContent = '';
    msg.classList.remove('error');
    renderSelectedFiles();
  };

  dz.addEventListener('click', () => input.click());
  input.addEventListener('change', syncSelection);

  ['dragenter', 'dragover'].forEach((ev) => {
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add('drag');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove('drag');
    });
  });
  dz.addEventListener('drop', (e) => {
    const dt = new DataTransfer();
    [...e.dataTransfer.files].filter((f) => /\.pdf$/i.test(f.name)).forEach((f) => dt.items.add(f));
    input.files = dt.files;
    syncSelection();
  });

  const progressWrap = $('uploadProgressWrap');
  const progressFill = $('uploadProgressFill');
  const progressText = $('uploadProgressText');
  const progressBytes = $('uploadProgressBytes');

  function setUploadProgress(pct, loaded, total) {
    progressWrap.hidden = false;
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    progressFill.style.width = `${p}%`;
    progressText.textContent = `${p}%`;
    if (total > 0) {
      progressBytes.textContent = `${formatBytes(loaded)} / ${formatBytes(total)}`;
    } else {
      progressBytes.textContent = '';
    }
  }

  function hideUploadProgress() {
    progressWrap.hidden = true;
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    progressBytes.textContent = '';
  }

  function uploadWithProgress(formData) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', api('/api/upload'));
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) {
          msg.textContent = 'Uploading…';
          return;
        }
        const pct = (100 * e.loaded) / e.total;
        setUploadProgress(pct, e.loaded, e.total);
        msg.textContent = `Uploading… ${Math.round(pct)}%`;
      };
      xhr.upload.onload = () => {
        setUploadProgress(100, 1, 1);
        msg.textContent = 'Processing on server…';
      };
      xhr.onload = () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch {
          reject(new Error('Invalid server response'));
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          resolve(data);
        } else {
          const err = new Error(data.message || `Upload failed (${xhr.status})`);
          err.already_exists = !!data.already_exists;
          reject(err);
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });
  }

  btn.addEventListener('click', async () => {
    if (!state.selectedFiles.length) return;
    btn.disabled = true;
    msg.classList.remove('error');
    msg.textContent = 'Checking…';
    hideUploadProgress();

    try {
      const checkRes = await fetch(api('/api/check-existing'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: state.selectedFiles.map((f) => f.name) }),
      });
      const check = await checkRes.json();
      if (check.has_existing && check.existing?.length) {
        const names = check.existing.join('\n');
        window.alert(
          `Already on server — not uploading again:\n\n${names}\n\nRemove or rename the file first, or pick different PDFs.`
        );
        msg.textContent = `Already exists: ${check.existing.join(', ')}`;
        msg.classList.add('error');
        btn.disabled = false;
        return;
      }

      msg.textContent = 'Uploading… 0%';
      setUploadProgress(0, 0, state.selectedFiles.reduce((s, f) => s + f.size, 0));
      const fd = new FormData();
      state.selectedFiles.forEach((f) => fd.append('files', f));
      const data = await uploadWithProgress(fd);
      msg.textContent = `Queued ${data.jobs.length} PDF(s) — saved with original names`;
      hideUploadProgress();
      input.value = '';
      state.selectedFiles = [];
      renderSelectedFiles();
      setStats(data.stats);
      await refreshJobs();
      await refreshDisk();
    } catch (err) {
      if (err.already_exists) {
        window.alert(err.message || 'File already uploaded');
      }
      msg.textContent = err.message;
      msg.classList.add('error');
      hideUploadProgress();
      btn.disabled = !state.selectedFiles.length;
    }
  });
}

function setupRecover() {
  const btn = $('recoverBtn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const res = await fetch(api('/api/recover'), { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Recover failed');
      state.diskFiles = data.files || [];
      renderDisk();
      setStats(data.stats);
      await refreshJobs();
      window.alert(
        data.recovered
          ? `Queued ${data.recovered} waiting PDF(s) for OCR.`
          : 'No waiting PDFs — all extracted or already queued.'
      );
    } catch (err) {
      window.alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

setupUpload();
setupRecover();
connectSSE();
resetLiveTranscript('Waiting for OCR… Upload a PDF to see live extracted text here.');
const liveEl = $('liveTranscript');
if (liveEl) {
  liveEl.addEventListener('scroll', () => {
    const nearBottom = liveEl.scrollHeight - liveEl.scrollTop - liveEl.clientHeight < 80;
    state.autoScrollLive = nearBottom;
  });
}
refreshJobs();
refreshResults();
refreshDisk();
setInterval(refreshResults, 15000);
setInterval(refreshDisk, 10000);
