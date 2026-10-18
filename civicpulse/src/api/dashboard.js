import client, { unwrap } from './client';

export function getDashboardSummary() {
  return client.get('/dashboard/summary').then(unwrap);
}
