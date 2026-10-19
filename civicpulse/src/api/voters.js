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

export function getVoterStats(params = {}) {
  return client.get('/voters/stats', { params }).then(unwrap);
}

/** Download the voters matching the current filters as a spreadsheet file. */
export function downloadVoters(params = {}) {
  return client.get('/voters/export', { params, timeout: 120000 }).then(unwrap).then((data) => {
    const blob = new Blob(['\ufeff', data.csv || ''], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eluru-voters-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return data;
  });
}

export function deleteVoter(id, actorRole) {
  return client.delete(`/voters/${id}`, { params: { actor_role: actorRole } }).then(unwrap);
}

export function getVoterHistory(id) {
  return client.get(`/voters/${id}/history`).then(unwrap);
}
