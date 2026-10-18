import client, { unwrap } from './client';

export function getTeam() {
  return client.get('/team').then(unwrap);
}

export function createTeamMember(payload) {
  return client.post('/team', payload).then(unwrap);
}
