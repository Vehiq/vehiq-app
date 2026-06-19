import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import Footer from "./Footer";
import BottomNav from "@/components/BottomNav";
import FAB from "@/components/FAB";
import FirstUseTooltips from "@/components/FirstUseTooltips";
import DemoBanner from "@/components/DemoBanner";

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-vehiq-bg text-vehiq-text">
      <Sidebar onNavigate={() => setMobileOpen(false)} />

      {/* Mobile drawer (still available via menu icon) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 bg-vehiq-nav h-full">
            <Sidebar onNavigate={() => setMobileOpen(false)} mobile />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <DemoBanner />
        <TopBar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 md:px-8 py-6 md:py-10 max-w-[1400px] w-full mx-auto pb-24 md:pb-10" data-testid="main-content">
          <Outlet />
        </main>
        <Footer />
      </div>

      <BottomNav />
      <FAB />
      <FirstUseTooltips />
    </div>
  );
}
