import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function AuthCallback() {
  const { loginWithGoogleSession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash || "";
    const sessionMatch = hash.match(/session_id=([^&]+)/);
    if (!sessionMatch) {
      toast.error("Missing Google session");
      navigate("/login");
      return;
    }
    const sid = sessionMatch[1];
    (async () => {
      try {
        await loginWithGoogleSession(sid);
        toast.success("Logged in");
        navigate("/garage");
      } catch (e) {
        toast.error("Google login failed");
        navigate("/login");
      }
    })();
  }, [loginWithGoogleSession, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-vehiq-text" data-testid="auth-callback">
      <div className="text-vehiq-muted">Signing you in…</div>
    </div>
  );
}
