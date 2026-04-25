import { useEffect } from "react";
import "@/App.css";
import "@/i18n";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/layout/Layout";
import CookieBanner from "@/components/CookieBanner";

import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import Garage from "@/pages/Garage";
import AddVehicle from "@/pages/AddVehicle";
import VehicleProfile from "@/pages/VehicleProfile";
import Marketplace from "@/pages/Marketplace";
import CreateListing from "@/pages/CreateListing";
import ListingDetail from "@/pages/ListingDetail";
import Messages from "@/pages/Messages";
import Forum from "@/pages/Forum";
import NewThread from "@/pages/NewThread";
import ThreadDetail from "@/pages/ThreadDetail";
import Profile from "@/pages/Profile";
import LegalPage from "@/pages/LegalPage";
import PublicVehicle from "@/pages/PublicVehicle";
import NotFound from "@/pages/NotFound";

import AdminLogin from "@/pages/admin/AdminLogin";
import AdminChangePassword from "@/pages/admin/AdminChangePassword";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminVehicles from "@/pages/admin/AdminVehicles";
import AdminMarketplace from "@/pages/admin/AdminMarketplace";
import AdminForum from "@/pages/admin/AdminForum";
import AdminLegal from "@/pages/admin/AdminLegal";
import AdminContent from "@/pages/admin/AdminContent";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminSecurity from "@/pages/admin/AdminSecurity";
import AdminApiKeys from "@/pages/admin/AdminApiKeys";
import AdminAnalytics from "@/pages/admin/AdminAnalytics";

import api from "@/lib/api";
import { useTranslation } from "react-i18next";
import ErrorBoundary from "@/components/ErrorBoundary";
import { PasswordResetRequest, PasswordResetConfirm } from "@/pages/PasswordReset";

function PageTracker() {
  useEffect(() => {
    const sid = localStorage.getItem("vehiq_session") || crypto.randomUUID();
    localStorage.setItem("vehiq_session", sid);
    const send = () => {
      api.post("/track", {
        path: window.location.pathname,
        session_id: sid,
        device: window.innerWidth < 768 ? "mobile" : "desktop",
      }).catch(() => {});
    };
    send();
    window.addEventListener("popstate", send);
    return () => window.removeEventListener("popstate", send);
  }, []);
  return null;
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-vehiq-muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  // Force first-time onboarding for new users (skip already on /onboarding)
  if (user.onboarded === false && window.location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

function PublicHomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-vehiq-muted">Loading…</div>;
  return <Navigate to={user ? "/garage" : "/login"} replace />;
}

function LangSync() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  useEffect(() => {
    if (user?.language && i18n.language !== user.language) {
      i18n.changeLanguage(user.language);
    }
  }, [user, i18n]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <LangSync />
          <PageTracker />
          <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: "#161829", border: "1px solid rgba(201,168,76,0.2)", color: "#F4F1EC" } }} />
          <CookieBanner />

        <Routes>
          {/* Public auth */}
          <Route path="/" element={<PublicHomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/password-reset" element={<PasswordResetRequest />} />
          <Route path="/password-reset/confirm" element={<PasswordResetConfirm />} />
          <Route path="/onboarding" element={<PrivateRoute><Onboarding /></PrivateRoute>} />

          {/* Legal pages (public) */}
          <Route path="/legal/:slug" element={<LegalPage />} />

          {/* Public vehicle profile (shareable) */}
          <Route path="/vehicles/:slug" element={<PublicVehicle />} />

          {/* Admin (separate, no Layout) */}
          <Route path="/gv91-admin" element={<AdminLogin />} />
          <Route path="/gv91-admin/change-password" element={<AdminChangePassword />} />
          <Route path="/gv91-admin/*" element={<AdminLayout />}>
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="vehicles" element={<AdminVehicles />} />
            <Route path="marketplace" element={<AdminMarketplace />} />
            <Route path="forum" element={<AdminForum />} />
            <Route path="legal" element={<AdminLegal />} />
            <Route path="content" element={<AdminContent />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="security" element={<AdminSecurity />} />
            <Route path="api-keys" element={<AdminApiKeys />} />
            <Route path="analytics" element={<AdminAnalytics />} />
          </Route>

          {/* Authenticated app */}
          <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route path="/garage" element={<Garage />} />
            <Route path="/garage/new" element={<AddVehicle />} />
            <Route path="/garage/:id" element={<VehicleProfile />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/marketplace/messages" element={<Messages />} />
            <Route path="/marketplace/new" element={<CreateListing />} />
            <Route path="/marketplace/:id" element={<ListingDetail />} />
            <Route path="/forum" element={<Forum />} />
            <Route path="/forum/new" element={<NewThread />} />
            <Route path="/forum/:id" element={<ThreadDetail />} />
            <Route path="/profile" element={<Profile />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
