import client, { unwrap } from './client';

export function getMe() {
  return client.get('/auth/me').then(unwrap);
}

export function signIn(username, password) {
  return client.post('/auth/login', { username, password }).then(unwrap);
}

export function signOut() {
  return client.post('/auth/logout').then(unwrap);
}

export function changePassword(currentPassword, newPassword) {
  return client.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }).then(unwrap);
}
