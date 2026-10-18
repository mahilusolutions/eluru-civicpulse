import axios from 'axios';

const client = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:4000/api',
  timeout: 60000,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message ||
      error.message ||
      'Network error — start civicpulse-backend (npm start on port 4000).';
    return Promise.reject(new Error(message));
  }
);

export default client;

export function unwrap(response) {
  return response.data?.data;
}
