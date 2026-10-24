import axios from 'axios';
import { getApiBase } from './baseUrl';

const client = axios.create({
  baseURL: getApiBase(),
  timeout: 60000,
  withCredentials: true, // sends the sign-in cookie
  headers: { 'X-Requested-With': 'CivicPulse' }, // the server refuses change requests without it (blocks forged forms)
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error.response?.data;
    const status = error.response?.status;
    const message =
      (typeof data?.message === 'string' && data.message) ||
      error.message ||
      'Cannot reach the server right now. Please check your connection and try again.';
    const err = new Error(message);
    err.status = status;
    err.code = data?.code;
    err.errors = data?.errors; // per-field messages from the server
    // The session ended (timed out, signed out elsewhere, account disabled): tell the app so it can show the sign-in page.
    if (status === 401 && data?.code === 'AUTH_REQUIRED' && !/\/auth\/(login|me)$/.test(error.config?.url || '')) {
      window.dispatchEvent(new Event('civicpulse:session-ended'));
    }
    if (status === 403 && data?.code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new Event('civicpulse:password-change-required'));
    }
    return Promise.reject(err);
  }
);

export default client;

export function unwrap(response) {
  return response.data?.data;
}
