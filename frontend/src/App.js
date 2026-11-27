import { useEffect, useLayoutEffect, lazy, Suspense } from "react";
import "@/App.css";
import "@/i18n";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { usePageTracking } from "@/hooks/usePageTracking";
import Layout from "@/components/layout/Layout";
import Logo from "@/components/Logo";
import CookieBanner from "@/components/CookieBanner";

import LoginPage from "@/pages/LoginPage";
import Landing from "@/pages/Landing";
import RegisterPage from "@/pages/RegisterPage";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import Garage from "@/pages/Garage";
import AddVehicle from "@/pages/AddVehicle";
import VehicleProfile from "@/pages/VehicleProfile";
const Marketplace = lazy(() => import("@/pages/Marketplace"));
const Rentals = lazy(() => import("@/pages/Rentals"));
const OpenToOffersPage = lazy(() => import("@/pages/OpenToOffersPage"));
const SwapPage = lazy(() => import("@/pages/SwapPage"));
const MyListings = lazy(() => import("@/pages/MyListings"));
const CreateListing = lazy(() => import("@/pages/CreateListing"));
const ListingDetail = lazy(() => import("@/pages/ListingDetail"));
const Messages = lazy(() => import("@/pages/Messages"));
const Forum = lazy(() => import("@/pages/Forum"));
const NewThread = lazy(() => import("@/pages/NewThread"));
const ThreadDetail = lazy(() => import("@/pages/ThreadDetail"));
import Profile from "@/pages/Profile";
import UserSearch from "@/pages/UserSearch";
import Search from "@/pages/Search";
const Services = lazy(() => import("@/pages/Services"));
const ServiceDetail = lazy(() => import("@/pages/ServiceDetail"));
const AddService = lazy(() => import("@/pages/AddService"));
const Events = lazy(() => import("@/pages/Events"));
const EventDetail = lazy(() => import("@/pages/EventDetail"));
const AddEvent = lazy(() => import("@/pages/AddEvent"));
import PublicProfile from "@/pages/PublicProfile";
import LegalPage from "@/pages/LegalPage";
import PublicVehicle from "@/pages/PublicVehicle";
import VehicleShort from "@/pages/VehicleShort";
const QuickFuelPage = lazy(() => import("@/pages/QuickFuelPage"));
// Iter 53: B2B + Stripe entry points
const DlaWarsztatow = lazy(() => import("@/pages/DlaWarsztatow"));
const DlaDealerow = lazy(() => import("@/pages/DlaDealerow"));
const BusinessRegister = lazy(() => import("@/pages/BusinessRegister"));
const WorkshopList = lazy(() => import("@/pages/WorkshopList"));
const WorkshopProfile = lazy(() => import("@/pages/WorkshopProfile"));
const BusinessDashboard = lazy(() => import("@/pages/BusinessDashboard"));
const BusinessOnboarding = lazy(() => import("@/pages/BusinessOnboarding"));
const Blog = lazy(() => import("@/pages/Blog"));
const BlogPost = lazy(() => import("@/pages/BlogPost"));
import NotFound from "@/pages/NotFound";
import { ROUTES, ADMIN_PREFIX } from "@/routes/paths";

const AdminLogin = lazy(() => import("@/pages/admin/AdminLogin"));
const AdminChangePassword = lazy(() => import("@/pages/admin/AdminChangePassword"));
const AdminResetPassword = lazy(() => import("@/pages/admin/AdminResetPassword"));
const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminVehicles = lazy(() => import("@/pages/admin/AdminVehicles"));
const AdminMarketplace = lazy(() => import("@/pages/admin/AdminMarketplace"));
const AdminForum = lazy(() => import("@/pages/admin/AdminForum"));
const AdminLegal = lazy(() => import("@/pages/admin/AdminLegal"));
const AdminContent = lazy(() => import("@/pages/admin/AdminContent"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminSecurity = lazy(() => import("@/pages/admin/AdminSecurity"));
const AdminSecurityMonitor = lazy(() => import("@/pages/admin/AdminSecurityMonitor"));
const AdminApiKeys = lazy(() => import("@/pages/admin/AdminApiKeys"));
const AdminAnalytics = lazy(() => import("@/pages/admin/AdminAnalytics"));
const AdminBlog = lazy(() => import("@/pages/admin/AdminBlog"));
const AdminFoundingMembers = lazy(() => import("@/pages/admin/AdminFoundingMembers"));
const AdminReferrals = lazy(() => import("@/pages/admin/AdminReferrals"));
const AdminBusinesses = lazy(() => import("@/pages/admin/AdminBusinesses"));
const AdminWaitlist = lazy(() => import("@/pages/admin/AdminWaitlist"));
const VerifyEmailPage = lazy(() => import("@/pages/VerifyEmailPage"));
const AdminEmails = lazy(() => import("@/pages/admin/AdminEmails"));

import api from "@/lib/api";
import { useTranslation } from "react-i18next";
import ErrorBoundary from "@/components/ErrorBoundary";
import { PasswordResetRequest, PasswordResetConfirm } from "@/pages/PasswordReset";

function PageTracker() {
  // Iter 41: emit GA4 page_view on every React Router navigation. Without
  // this the SPA looked like a single-page site to GA — only the initial
  // load was tracked and every internal nav was invisible.
  usePageTracking();
  const { pathname } = useLocation();
  // Reset per-page head before the new page's effects set their own (no stale title/canonical).
  useLayoutEffect(() => {
    document.title = "Sharago — Wirtualny Garaż";
    document.head.querySelectorAll('link[rel="canonical"], link[rel="alternate"][hreflang], meta[data-admin-robots]').forEach((el) => el.remove());
    if (pathname.toLowerCase().startsWith(ADMIN_PREFIX)) {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      meta.setAttribute("content", "noindex, nofollow");
      meta.setAttribute("data-admin-robots", "");
      document.head.appendChild(meta);
    }
  }, [pathname]);
  useEffect(() => {
    const sid = localStorage.getItem("sharago_session") || crypto.randomUUID();
    localStorage.setItem("sharago_session", sid);
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
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} replace />;
  // Force first-time onboarding for new users (skip already on /onboarding)
  if (user.onboarded === false && window.location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

// Listing links open without login: logged-in users get the app layout, guests a plain page.
function ListingRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Layout />;
  return (
    <div className="min-h-screen bg-vehiq-bg">
      <header className="border-b border-vehiq-border"><div className="max-w-5xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
        <a href="/" data-testid="listing-public-logo"><Logo size="md" /></a>
        <a href="/login" className="vehiq-btn-secondary text-xs" data-testid="listing-public-login">Zaloguj / Log in</a>
      </div></header>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6"><ListingDetail /></div>
    </div>
  );
}

function PublicHomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-vehiq-muted">Loading…</div>;
  // Iter 35: authenticated visitors still go to their garage. Anonymous visitors
  // see the public marketing landing page (was previously a redirect to /login).
  if (user) return <Navigate to="/garage" replace />;
  return <Landing />;
}

function LangSync() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  useEffect(() => {
    if (user?.language && i18n.language !== user.language) {
      i18n.changeLanguage(user.language);
    }
  }, [user, i18n]);
  useEffect(() => {
    document.documentElement.lang = i18n.language?.startsWith("en") ? "en" : "pl";
  }, [i18n.language]);
  return null;
}

// Bug 16 (Iter 50): scroll to top on every route change so users don't
// land mid-page after navigation (esp. hitting AI Mechanic tab from a long
// vehicle profile). Tab-internal state changes DO NOT trigger this — those
// stay in place because pathname doesn't change.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

function App() {
  return (
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <LangSync />
            <PageTracker />
            <ScrollToTop />
            <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: "#162035", border: "1px solid rgba(43,127,232,0.2)", color: "#FFFFFF" } }} />
            <CookieBanner />

        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-vehiq-muted">…</div>}>
        <Routes>
          {/* Public auth */}
          <Route path={ROUTES.home} element={<PublicHomeRedirect />} />
          <Route path={ROUTES.login} element={<LoginPage />} />
          <Route path={ROUTES.register} element={<RegisterPage />} />
          {/* Iter 53: B2B marketing + registration */}
          <Route path={ROUTES.forWorkshops} element={<DlaWarsztatow />} />
          <Route path={ROUTES.forDealers} element={<DlaDealerow />} />
          <Route path={ROUTES.registerBusiness} element={<BusinessRegister />} />
          {/* Iter 54b — public workshop directory */}
          <Route path={ROUTES.workshops} element={<WorkshopList />} />
          <Route path={ROUTES.workshop} element={<WorkshopProfile />} />
          <Route path={ROUTES.authCallback} element={<AuthCallback />} />
          <Route path={ROUTES.passwordReset} element={<PasswordResetRequest />} />
          <Route path={ROUTES.passwordResetConfirm} element={<PasswordResetConfirm />} />
          <Route path={ROUTES.onboarding} element={<PrivateRoute><Onboarding /></PrivateRoute>} />

          {/* Legal pages (public) */}
          <Route path={ROUTES.legal} element={<LegalPage />} />

          {/* Public vehicle profile (shareable) */}
          <Route path={ROUTES.publicVehicle} element={<PublicVehicle />} />
          <Route path={ROUTES.publicHistory} element={<PublicVehicle />} />
          <Route path={ROUTES.vehicleShort} element={<VehicleShort />} />
          <Route path={ROUTES.publicProfile} element={<PublicProfile />} />
          <Route path={ROUTES.verifyEmail} element={<VerifyEmailPage />} />
          <Route path={ROUTES.listing} element={<ListingRoute />}><Route index element={<ListingDetail />} /></Route>

          {/* Blog (public) */}
          <Route path={ROUTES.blog} element={<Blog />} />
          <Route path={ROUTES.blogPost} element={<BlogPost />} />

          {/* Admin (separate, no Layout) */}
          <Route path={ROUTES.adminLogin} element={<AdminLogin />} />
          <Route path={ROUTES.adminResetPassword} element={<AdminResetPassword />} />
          <Route path={ROUTES.adminChangePassword} element={<AdminChangePassword />} />
          <Route path={ROUTES.adminArea} element={<AdminLayout />}>
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="vehicles" element={<AdminVehicles />} />
            <Route path="marketplace" element={<AdminMarketplace />} />
            <Route path="forum" element={<AdminForum />} />
            <Route path="legal" element={<AdminLegal />} />
            <Route path="content" element={<AdminContent />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="security" element={<AdminSecurity />} />
            <Route path="security-monitor" element={<AdminSecurityMonitor />} />
            <Route path="api-keys" element={<AdminApiKeys />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="blog" element={<AdminBlog />} />
            <Route path="founding" element={<AdminFoundingMembers />} />
            <Route path="referrals" element={<AdminReferrals />} />
            <Route path="businesses" element={<AdminBusinesses />} />
            <Route path="waitlist" element={<AdminWaitlist />} />
            <Route path="emails" element={<AdminEmails />} />
          </Route>

          {/* Authenticated app */}
          <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route path={ROUTES.garage} element={<Garage />} />
            <Route path={ROUTES.garageNew} element={<AddVehicle />} />
            <Route path={ROUTES.garageVehicle} element={<VehicleProfile />} />
            <Route path={ROUTES.marketplace} element={<Marketplace />} />
            <Route path={ROUTES.marketplaceMine} element={<MyListings />} />
            <Route path={ROUTES.marketplaceMessages} element={<Messages />} />
            <Route path={ROUTES.marketplaceNew} element={<CreateListing />} />
            <Route path={ROUTES.marketplaceEdit} element={<CreateListing />} />
              <Route path={ROUTES.rentalsPl} element={<Rentals />} />
            <Route path={ROUTES.rentals} element={<Rentals />} />
            <Route path={ROUTES.openToOffers} element={<OpenToOffersPage />} />
            <Route path={ROUTES.swaps} element={<SwapPage />} />
            <Route path={ROUTES.forum} element={<Forum />} />
            <Route path={ROUTES.forumNew} element={<NewThread />} />
            <Route path={ROUTES.thread} element={<ThreadDetail />} />
            <Route path={ROUTES.profile} element={<Profile />} />
            <Route path={ROUTES.userSearch} element={<UserSearch />} />
            <Route path={ROUTES.search} element={<Search />} />
            <Route path={ROUTES.services} element={<Services />} />
            <Route path={ROUTES.servicesNew} element={<AddService />} />
            <Route path={ROUTES.service} element={<ServiceDetail />} />
            <Route path={ROUTES.events} element={<Events />} />
            <Route path={ROUTES.eventsNew} element={<AddEvent />} />
            <Route path={ROUTES.event} element={<EventDetail />} />
            <Route path={ROUTES.quickFuel} element={<QuickFuelPage />} />
            {/* Iter 54b — B2B dashboard for workshops */}
            <Route path="/business" element={<Navigate to={ROUTES.businessDashboard} replace />} />
            <Route path={ROUTES.businessDashboard} element={<BusinessDashboard />} />
            <Route path={ROUTES.businessOnboarding} element={<BusinessOnboarding />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
