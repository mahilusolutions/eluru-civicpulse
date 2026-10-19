import client, { unwrap } from './client';

export function getWards() {
  return client.get('/wards').then(unwrap);
}

export function createWard(payload) {
  return client.post('/wards', payload).then(unwrap);
}

export function updateWard(id, payload) {
  return client.patch(`/wards/${id}`, payload).then(unwrap);
}

export function deleteWard(id) {
  return client.delete(`/wards/${id}`).then(unwrap);
}
