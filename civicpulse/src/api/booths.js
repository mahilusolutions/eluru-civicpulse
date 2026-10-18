import client, { unwrap } from './client';

export function getBooths() {
  return client.get('/booths').then(unwrap);
}

export function getBooth(part) {
  return client.get(`/booths/${part}`).then(unwrap);
}

export function updateBooth(part, payload) {
  return client.patch(`/booths/${part}`, payload).then(unwrap);
}
