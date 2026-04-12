import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { TelemetryProvider } from "./context/TelemetryContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import MachineView from "./pages/MachineView";
import Alerts from "./pages/Alerts";
import Login from "./pages/Login";

export default function App() {
  return (
    <AuthProvider>
      <TelemetryProvider>
        <BrowserRouter>
          <Routes>
            {/* Public route */}
            <Route path="/login" element={<Login />} />

            {/* Protected routes — all wrapped with layout */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <div className="min-h-screen bg-gray-50">
                    <Navbar />
                    <main>
                      <Routes>
                        <Route
                          path="/"
                          element={
                            <ProtectedRoute permission="dashboard">
                              <Dashboard />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/machines/:machineId"
                          element={
                            <ProtectedRoute permission="machines">
                              <MachineView />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/alerts"
                          element={
                            <ProtectedRoute permission="alerts">
                              <Alerts />
                            </ProtectedRoute>
                          }
                        />
                        {/* Fallback for unknown routes */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </main>
                  </div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </TelemetryProvider>
    </AuthProvider>
  );
}