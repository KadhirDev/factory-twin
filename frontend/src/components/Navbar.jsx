import { Link, useLocation } from "react-router-dom";
import { Factory, LayoutDashboard, Bell } from "lucide-react";

export default function Navbar() {
  const { pathname } = useLocation();
  const links = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/alerts", label: "Alerts", icon: Bell },
  ];

  return (
    <nav className="bg-gray-900 text-white px-6 py-3 flex items-center gap-8 shadow-lg">
      <div className="flex items-center gap-2 text-blue-400 font-bold text-lg">
        <Factory size={22} />
        <span>Factory Twin</span>
      </div>
      <div className="flex gap-4">
        {links.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition
              ${pathname === to
                ? "bg-blue-600 text-white"
                : "text-gray-300 hover:bg-gray-700"
              }`}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}