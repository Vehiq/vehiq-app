import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { LayoutDashboard, Users, Car, Store, MessagesSquare, FileText, Edit3, Settings, Shield, BarChart3, KeyRound, LogOut } from "lucide-react";

const SECTIONS = [
  { to: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "users", icon: Users, label: "Users" },
  { to: "vehicles", icon: Car, label: "Vehicles" },
  { to: "marketplace", icon: Store, label: "Marketplace" },
  { to: "forum", icon: MessagesSquare, label: "Forum" },
  { to: "legal", icon: FileText, label: "Legal Pages" },
  { to: "content", icon: Edit3, label: "Content CMS" },
  { to: "api-keys", icon: KeyRound, label: "API Keys & SMTP" },
  { to: "security", icon: Shield, label: "Security" },
  { to: "settings", icon: Settings, label: "App Settings" },
  { to: "analytics", icon: BarChart3, label: "Analytics" },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem("vehiq_admin_token")) navigate("/gv91-admin");
  }, [navigate]);

  const logout = () => {
    localStorage.removeItem("vehiq_admin_token");
    navigate("/gv91-admin");
  };

  return (
    <div className="min-h-screen flex bg-[#0a0b13] text-[#F4F1EC]" data-testid="admin-layout">
      <aside className="w-60 bg-[#0F1120] border-r border-[#222540] flex flex-col">
        <div className="p-4 border-b border-[#222540]">
          <div className="text-xs uppercase tracking-[0.3em] text-[#C9A84C]">VEHIQ Admin</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {SECTIONS.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={`/gv91-admin/${to}`} data-testid={`admin-nav-${to}`}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded text-sm transition ${
                  isActive ? "bg-[#C9A84C] text-[#0D0F1A]" : "text-[#9CA1C2] hover:bg-[#161829] hover:text-[#F4F1EC]"
                }`}>
              <Icon size={16}/> <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className="m-3 flex items-center gap-2 px-3 py-2 rounded text-sm text-[#9CA1C2] hover:bg-[#161829]" data-testid="admin-logout">
          <LogOut size={16}/> Logout
        </button>
      </aside>
      <main className="flex-1 p-6 overflow-auto"><Outlet /></main>
    </div>
  );
}
