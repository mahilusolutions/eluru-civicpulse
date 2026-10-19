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

export function updateOutreach(id, payload) {
  return client.put(`/outreach/${id}`, payload).then(unwrap);
}

export function deleteOutreach(id, actorRole) {
  return client.delete(`/outreach/${id}`, { params: { actor_role: actorRole } }).then(unwrap);
}

export function getOutreachHistory(id) {
  return client.get(`/outreach/${id}/history`).then(unwrap);
}
