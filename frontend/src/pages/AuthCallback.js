import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Lands here after Google OAuth callback redirects from
 * `/api/auth/google/callback`. Reads `?token=<jwt>&next=<path>` from the
 * URL, persists the token, then forwards to the requested page.
 *
 * Backward-compat: also handles the legacy `#session_id=...` hash from the
 * old Emergent-managed OAuth flow. That code path is harmless once the
 * cached frontend bundles age out and can be removed later.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { adoptToken, loginWithGoogleSession } = useAuth();

  useEffect(() => {
    // New flow: ?token=<jwt>&next=<path>
    const token = search.get("token");
    const next = search.get("next") || "/garage";
    const errorCode = search.get("error");

    if (errorCode) {
      toast.error(`Google login failed: ${errorCode}`);
      navigate(`/login?error=${encodeURIComponent(errorCode)}`, { replace: true });
      return;
    }

    if (token) {
      adoptToken(token)
        .then(() => {
          toast.success("Zalogowano przez Google");
          navigate(next.startsWith("/") ? next : "/garage", { replace: true });
        })
        .catch(() => {
          toast.error("Nie udało się zakończyć logowania");
          navigate("/login?error=adopt_failed", { replace: true });
        });
      return;
    }

    // Legacy fallback — Emergent OAuth `#session_id=...`
    const hash = window.location.hash || "";
    const sessionMatch = hash.match(/session_id=([^&]+)/);
    if (sessionMatch && loginWithGoogleSession) {
      loginWithGoogleSession(sessionMatch[1])
        .then(() => {
          toast.success("Logged in");
          navigate("/garage", { replace: true });
        })
        .catch(() => {
          toast.error("Google login failed");
          navigate("/login?error=legacy_session", { replace: true });
        });
      return;
    }

    toast.error("Brak tokenu logowania");
    navigate("/login?error=no_token", { replace: true });
  }, [search, navigate, adoptToken, loginWithGoogleSession]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-vehiq-text" data-testid="auth-callback">
      <div className="text-vehiq-muted">Logowanie...</div>
    </div>
  );
}
