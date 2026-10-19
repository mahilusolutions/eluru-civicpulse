import client, { unwrap } from './client';

export function getOutreach(params = {}) {
  return client.get('/outreach', { params }).then(unwrap);
}

export function getOutreachStats() {
  return client.get('/outreach/stats').then(unwrap);
}

export function createOutreach(payload) {
  return client.post('/outreach', payload).then(unwrap);
}
