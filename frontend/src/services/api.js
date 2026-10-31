import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Response interceptor for consistent error handling
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error || err.message || 'Unknown error';
    return Promise.reject(new Error(message));
  }
);

// ── Health ────────────────────────────────────────────────────────────────
export const checkHealth = () => api.get('/health').then((r) => r.data);

// ── Dashboard ─────────────────────────────────────────────────────────────
export const getDashboard = () => api.get('/api/dashboard').then((r) => r.data);

// ── Accounts ─────────────────────────────────────────────────────────────
export const getAccounts = () => api.get('/api/accounts').then((r) => r.data);
export const connectAccount = (token) =>
  api.post('/api/accounts/connect', { token }).then((r) => r.data);
export const disconnectAccount = (id) =>
  api.post(`/api/accounts/${id}/disconnect`).then((r) => r.data);

// ── Repositories ──────────────────────────────────────────────────────────
export const getRepositories = () => api.get('/api/repositories').then((r) => r.data);
export const connectRepository = (payload) =>
  api.post('/api/repositories/connect', payload).then((r) => r.data);
export const disconnectRepository = (id) =>
  api.post(`/api/repositories/${id}/disconnect`).then((r) => r.data);
export const scanRepository = (repo_id) =>
  api.post('/api/repositories/scan', { repo_id }).then((r) => r.data);
export const setupWebhook = (repo_id) =>
  api.post(`/api/repositories/${repo_id}/setup-webhook`).then((r) => r.data);
export const removeWebhook = (repo_id) =>
  api.post(`/api/repositories/${repo_id}/remove-webhook`).then((r) => r.data);

// ── Alerts ────────────────────────────────────────────────────────────────
export const getAlerts = (params = {}) =>
  api.get('/api/alerts', { params }).then((r) => r.data);
export const getAlert = (id) =>
  api.get(`/api/alerts/${id}`).then((r) => r.data);
export const resolveAlert = (id, resolved_by, notes) =>
  api.post(`/api/alerts/${id}/resolve`, { resolved_by, notes }).then((r) => r.data);

// ── Modifications ─────────────────────────────────────────────────────────
export const getModifications = (params = {}) =>
  api.get('/api/modifications', { params }).then((r) => r.data);
export const fetchCommits = (repo_id) =>
  api.post(`/api/repositories/${repo_id}/fetch-commits`).then((r) => r.data);

// ── Scan History ──────────────────────────────────────────────────────────
export const getScanHistory = (params = {}) =>
  api.get('/api/scan-history', { params }).then((r) => r.data);

// ── Remediation ───────────────────────────────────────────────────────────
export const getRemediationHistory = () =>
  api.get('/api/remediation-history').then((r) => r.data);
export const getRemediationStats = () =>
  api.get('/api/remediation-stats').then((r) => r.data);

// ── Demo ──────────────────────────────────────────────────────────────────
export const pushTestModification = (repo_id) =>
  api.post('/api/demo/push-test-modification', { confirmed: true, repo_id }).then((r) => r.data);

export default api;
