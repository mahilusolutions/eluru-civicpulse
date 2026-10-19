import client, { unwrap } from './client';

export function getHouseholds(params = {}) {
  return client.get('/households', { params }).then(unwrap);
}

export function getHouseholdMembers(part, house) {
  return client.get('/households/members', { params: { part, house } }).then(unwrap);
}
