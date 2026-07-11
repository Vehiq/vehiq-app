import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { LayoutDashboard, Users, Car, Store, MessagesSquare, FileText, Edit3, Settings, Shield, ShieldAlert, BarChart3, KeyRound, LogOut, BookOpen, Star, Share2 } from "lucide-react";

const SECTIONS = [
  { to: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "users", icon: Users, label: "Users" },
  { to: "vehicles", icon: Car, label: "Vehicles" },
  { to: "marketplace", icon: Store, label: "Marketplace" },
  { to: "founding", icon: Star, label: "Founding 100" },
  { to: "referrals", icon: Share2, label: "Referrals" },
  { to: "forum", icon: MessagesSquare, label: "Forum" },
  { to: "blog", icon: BookOpen, label: "Blog" },
  { to: "legal", icon: FileText, label: "Legal Pages" },
  { to: "content", icon: Edit3, label: "Content CMS" },
  { to: "api-keys", icon: KeyRound, label: "API Keys & SMTP" },
  { to: "security-monitor", icon: ShieldAlert, label: "Security Monitor" },
  { to: "security", icon: Shield, label: "Admin Auth Log" },
  { to: "settings", icon: Settings, label: "App Settings" },
  { to: "analytics", icon: BarChart3, label: "Analytics" },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem("sharago_admin_token")) navigate("/gv91-admin");
  }, [navigate]);

  const logout = () => {
    localStorage.removeItem("sharago_admin_token");
    navigate("/gv91-admin");
  };

  return (
    <div className="min-h-screen flex bg-[#0A1220] text-[#FFFFFF]" data-testid="admin-layout">
      <aside className="w-60 bg-[#0A1220] border-r border-[#1E2A42] flex flex-col">
        <div className="p-4 border-b border-[#1E2A42]">
          <div className="text-xs uppercase tracking-[0.3em] text-[#2B7FE8]">Sharago Admin</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {SECTIONS.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={`/gv91-admin/${to}`} data-testid={`admin-nav-${to}`}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded text-sm transition ${
                  isActive ? "bg-[#2B7FE8] text-[#0D1626]" : "text-[#9CA1C2] hover:bg-[#162035] hover:text-[#FFFFFF]"
                }`}>
              <Icon size={16}/> <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className="m-3 flex items-center gap-2 px-3 py-2 rounded text-sm text-[#9CA1C2] hover:bg-[#162035]" data-testid="admin-logout">
          <LogOut size={16}/> Logout
        </button>
      </aside>
      <main className="flex-1 p-6 overflow-auto"><Outlet /></main>
    </div>
  );
}
