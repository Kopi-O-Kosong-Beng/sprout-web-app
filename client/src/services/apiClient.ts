import axios from 'axios';

// VITE_API_URL lets this point at a local server today and a deployed one
// later, without a code change — set it in Vercel project settings.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

export default apiClient;
export { API_BASE_URL };
