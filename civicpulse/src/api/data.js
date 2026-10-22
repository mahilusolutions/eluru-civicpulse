import client, { unwrap } from './client';

export function getRollFiles() {
  return client.get('/data/files').then(unwrap);
}

export function getOcrStatus() {
  return client.get('/data/ocr-status').then(unwrap);
}

export function getRollFile(id) {
  return client.get(`/data/files/${id}`).then(unwrap);
}

/** One roll PDF per request (the server accepts up to 50 MB per request). onProgress gets 0-100. */
export function uploadRollPdf(file, onProgress) {
  const form = new FormData();
  form.append('file', file);
  return client
    .post('/data/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 15 * 60 * 1000,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      },
    })
    .then(unwrap);
}

export function retryRollFile(id) {
  return client.post(`/data/files/${id}/retry`).then(unwrap);
}

export function importVotersJson(partNo, voters) {
  return client.post('/data/import', { part_no: partNo, voters }).then(unwrap);
}

export function getPartRollInfo(partNo) {
  return client.get(`/parts/${partNo}/roll-info`).then(unwrap);
}
