import { Link, useLocation } from "react-router-dom";
import { Factory, LayoutDashboard, Bell } from "lucide-react";
import { usePolling } from "../hooks/usePolling";
import { getAlerts } from "../api/client";

export default function Navbar() {
  const { pathname } = useLocation();

  // Poll unacknowledged alerts (safe, non-blocking)
  const { data: alerts } = usePolling(
    () =>
      getAlerts({ unacknowledged_only: true, limit: 100 }).then(
        (r) => r.data
      ),
    10000
  );

  const unackedCount = alerts?.length ?? 0;

  const links = [
    {
      to: "/",
      label: "Dashboard",
      icon: LayoutDashboard,
      badge: null,
    },
    {
      to: "/alerts",
      label: "Alerts",
      icon: Bell,
      badge: unackedCount,
    },
  ];

  return (
    <nav className="bg-gray-900 text-white px-6 py-3 flex items-center gap-8 shadow-lg sticky top-0 z-50">
      {/* Brand */}
      <Link
        to="/"
        className="flex items-center gap-2 text-blue-400 font-bold text-base shrink-0 hover:text-blue-300 transition-colors"
      >
        <Factory size={22} />
        <span>Factory Twin</span>
      </Link>

      {/* Links */}
      <div className="flex gap-2">
        {links.map(({ to, label, icon: Icon, badge }) => (
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
        ))}
      </div>

      {/* Live indicator */}
      <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
        <span>Live</span>
      </div>
    </nav>
  );
}