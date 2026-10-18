import client, { unwrap } from './client';

export function getVoters(params = {}) {
  return client.get('/voters', { params }).then(unwrap);
}

export function getVoter(id) {
  return client.get(`/voters/${id}`).then(unwrap);
}

export function updateVoter(id, payload) {
  return client.patch(`/voters/${id}`, payload).then(unwrap);
}
