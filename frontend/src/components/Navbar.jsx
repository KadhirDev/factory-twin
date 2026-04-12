import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Factory, LayoutDashboard, Bell, LogOut, User } from "lucide-react";
import { usePolling } from "../hooks/usePolling";
import { getAlerts } from "../api/client";
import { useAuth } from "../context/AuthContext";

// ── Role badge colors ─────────────────────────────────────────────────────────
const ROLE_STYLES = {
  admin: "bg-purple-100 text-purple-700",
  engineer: "bg-blue-100 text-blue-700",
  operator: "bg-green-100 text-green-700",
  viewer: "bg-gray-100 text-gray-600",
};

export default function Navbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout, can } = useAuth();

  // Alert badge — only fetched when user can see alerts
  const { data: unackedAlerts = [] } = usePolling(
    () =>
      can("alerts")
        ? getAlerts({ unacknowledged_only: true, limit: 100 }).then((r) => r.data)
        : Promise.resolve([]),
    10_000
  );

  const unackedCount = unackedAlerts?.length ?? 0;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navLinks = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard" },
    { to: "/alerts", label: "Alerts", icon: Bell, perm: "alerts", badge: unackedCount },
  ];

  return (
    <nav className="bg-gray-900 text-white px-6 py-3 flex items-center gap-6 shadow-lg sticky top-0 z-50">
      {/* Brand */}
      <Link
        to="/"
        className="flex items-center gap-2 text-blue-400 font-bold text-base shrink-0 hover:text-blue-300 transition-colors"
      >
        <Factory size={22} />
        <span>Factory Twin</span>
      </Link>

      {/* Nav links */}
      <div className="flex gap-2">
        {navLinks.map(({ to, label, icon: Icon, perm, badge }) => {
          if (!can(perm)) return null;

          return (
            <Link
              key={to}
              to={to}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors
                ${
                  pathname === to
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
            >
              <Icon size={15} />
              {label}
              {badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Right side: live indicator + role + user + logout */}
      <div className="ml-auto flex items-center gap-3">
        {/* Live indicator */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
          <span>Live</span>
        </div>

        {user && (
          <>
            {/* Role badge */}
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                ROLE_STYLES[user.role] || ROLE_STYLES.viewer
              }`}
            >
              {user.role}
            </span>

            {/* Username */}
            <div className="flex items-center gap-1.5 text-sm text-gray-300">
              <User size={14} className="text-gray-500" />
              <span className="font-medium">{user.username}</span>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-400 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-800"
              title="Sign out"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
}