import client, { unwrap } from './client';

export function getWards() {
  return client.get('/wards').then(unwrap);
}
