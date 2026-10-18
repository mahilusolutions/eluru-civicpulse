import client, { unwrap } from './client';

export function getSettings() {
  return client.get('/settings').then(unwrap);
}

export function updateSetting(key, value) {
  return client.patch(`/settings/${key}`, { value }).then(unwrap);
}
