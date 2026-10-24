import client, { unwrap } from './client';

// ---- public: raise a request, follow it, collect the login
export function submitAccessRequest(payload) {
  return client.post('/access/requests', payload).then(unwrap);
}

export function checkRequestStatus(reference, mobile) {
  return client.post('/access/status', { reference, mobile }).then(unwrap);
}

/** The acknowledgement PDF as a Blob. */
export function downloadAcknowledgement(reference, mobile) {
  return client.post('/access/acknowledgement', { reference, mobile }, { responseType: 'blob' }).then((r) => r.data);
}

/** One-time: returns { username, password, role_label, pdf_base64, file_name }. */
export function collectCredentials(reference, mobile) {
  return client.post('/access/credentials', { reference, mobile }).then(unwrap);
}

// ---- Super Admin
export const getRequestSummary = () => client.get('/admin/access-requests/summary').then(unwrap);
export const listAccessRequests = (params = {}) => client.get('/admin/access-requests', { params }).then(unwrap);
export const approveRequest = (id, role, note) => client.post(`/admin/access-requests/${id}/approve`, { role, note }).then(unwrap);
export const rejectRequest = (id, reason) => client.post(`/admin/access-requests/${id}/reject`, { reason }).then(unwrap);

export const listUsers = () => client.get('/admin/users').then(unwrap);
export const updateUser = (id, changes) => client.patch(`/admin/users/${id}`, changes).then(unwrap);
export const resetUserPassword = (id) => client.post(`/admin/users/${id}/reset-password`).then(unwrap);
export const revokeUserSessions = (id) => client.post(`/admin/users/${id}/revoke-sessions`).then(unwrap);
