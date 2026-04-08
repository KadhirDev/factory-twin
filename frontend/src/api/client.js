import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1";

const client = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

// Machines
export const getMachines = () => client.get("/machines/");
export const getMachine = (id) => client.get(`/machines/${id}`);
export const createMachine = (data) => client.post("/machines/", data);
export const getMachineTwin = (id) => client.get(`/machines/${id}/twin`);

// Telemetry
export const getLatestTelemetry = (machineId) =>
  client.get(`/telemetry/${machineId}/latest`);
export const getTelemetryHistory = (machineId, limit = 60) =>
  client.get(`/telemetry/${machineId}?limit=${limit}`);

// Alerts
export const getAlerts = (params = {}) =>
  client.get("/alerts/", { params });
export const acknowledgeAlert = (alertId) =>
  client.patch(`/alerts/${alertId}/acknowledge`, { acknowledged: true });