import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { runStorageMigration } from "@/lib/storageMigration";
import { initAnalytics } from "@/lib/analytics";

// Migrate legacy vehiq_* localStorage keys → sharago_* (rebrand 2026).
// Runs before render so AuthContext can read either prefix on first mount.
runStorageMigration();

// Paczka 2: GA4 Consent Mode v2 — set `analytics_storage: "denied"` BEFORE
// loading gtag.js so no `_ga` cookie is dropped until the user consents.
initAnalytics();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
