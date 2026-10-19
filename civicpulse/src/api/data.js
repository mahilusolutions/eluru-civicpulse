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

export function uploadRollPdf(file) {
  const form = new FormData();
  form.append('file', file);
  return client
    .post('/data/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then(unwrap);
}

export function retryRollFile(id) {
  return client.post(`/data/files/${id}/retry`).then(unwrap);
}

export function importVotersJson(partNo, voters) {
  return client.post('/data/import', { part_no: partNo, voters }).then(unwrap);
}
