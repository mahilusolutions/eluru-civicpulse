import client, { unwrap } from './client';

export function getTeam() {
  return client.get('/team').then(unwrap);
}

export function createTeamMember(payload) {
  return client.post('/team', payload).then(unwrap);
}

export function updateTeamMember(id, payload) {
  return client.patch(`/team/${id}`, payload).then(unwrap);
}

export function deleteTeamMember(id) {
  return client.delete(`/team/${id}`).then(unwrap);
}
