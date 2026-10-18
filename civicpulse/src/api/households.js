import client, { unwrap } from './client';

export function getHouseholds(params = {}) {
  return client.get('/households', { params }).then(unwrap);
}
