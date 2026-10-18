import client, { unwrap } from './client';

export function getElectionDay() {
  return client.get('/election-day').then(unwrap);
}

export function updateElectionDay(part, payload) {
  return client.patch(`/election-day/${part}`, payload).then(unwrap);
}
