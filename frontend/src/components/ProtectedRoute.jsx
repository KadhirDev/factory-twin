import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * ProtectedRoute
 *
 * Wraps routes that require authentication (and optionally a specific permission).
 *
 * Usage:
 *   <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
 *   <Route path="/admin" element={<ProtectedRoute permission="admin"><AdminPage /></ProtectedRoute>} />
 */
export default function ProtectedRoute({ children, permission = null }) {
  const { user, loading, can } = useAuth();
  const location = useLocation();

  // Show nothing while verifying stored token
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-400">
          <span className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  // Not logged in → redirect to /login, preserving intended destination
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Logged in but lacks the required permission
  if (permission && !can(permission)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-xl">🔒</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Access Restricted</h2>
          <p className="text-sm text-gray-500">
            Your role (<strong>{user.role}</strong>) does not have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return children;
}