import client, { unwrap } from './client';

export function getMapBooths() {
  return client.get('/map/booths').then(unwrap);
}
