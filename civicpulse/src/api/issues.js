import client, { unwrap } from './client';

export function getIssues() {
  return client.get('/issues').then(unwrap);
}

export function createIssue(payload) {
  return client.post('/issues', payload).then(unwrap);
}

export function updateIssue(id, payload) {
  return client.patch(`/issues/${id}`, payload).then(unwrap);
}
