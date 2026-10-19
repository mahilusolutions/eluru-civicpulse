import axios from 'axios';
import { getApiBase } from './baseUrl';

const client = axios.create({
  baseURL: getApiBase(),
  timeout: 60000,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message ||
      error.message ||
      'Cannot reach the server right now. Please check your connection and try again.';
    return Promise.reject(new Error(message));
  }
);

export default client;

export function unwrap(response) {
  return response.data?.data;
}
