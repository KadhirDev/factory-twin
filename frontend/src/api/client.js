import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1";
const TOKEN_KEY = "factory_twin_token";

const client = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

// ── Request interceptor: inject Bearer token ──────────────────────────────────
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: handle 401 / normalize errors ───────────────────────
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Token expired or invalid — clear storage and redirect to login
      localStorage.removeItem(TOKEN_KEY);
      // Only redirect if not already on login page
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }

    const message =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message ||
      "Unknown error";

    return Promise.reject(new Error(message));
  }
);

// ── Machines ──────────────────────────────────────────────────────────────────
export const getMachines = () => client.get("/machines/");
export const getMachine = (id) => client.get(`/machines/${id}`);
export const createMachine = (data) => client.post("/machines/", data);
export const getMachineTwin = (id) => client.get(`/machines/${id}/twin`);

// ── Telemetry ─────────────────────────────────────────────────────────────────
export const getLatestTelemetry = (machineId) =>
  client.get(`/telemetry/${machineId}/latest`);
export const getTelemetryHistory = (machineId, limit = 60) =>
  client.get(`/telemetry/${machineId}?limit=${limit}`);

// ── AI anomaly endpoints ──────────────────────────────────────────────────────
export const getAnomalies = (machineId, limit = 30) =>
  client.get(`/telemetry/${machineId}/anomalies?limit=${limit}`);
export const getAnomalyStats = (machineId) =>
  client.get(`/telemetry/${machineId}/anomaly-stats`);

// ── Alerts ────────────────────────────────────────────────────────────────────
export const getAlerts = (params = {}) => client.get("/alerts/", { params });
export const acknowledgeAlert = (alertId) =>
  client.patch(`/alerts/${alertId}/acknowledge`, { acknowledged: true });

// ── Dashboard / Stats ─────────────────────────────────────────────────────────
export const getStats = () => client.get("/stats/");

export default client;