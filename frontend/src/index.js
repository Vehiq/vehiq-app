import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { runStorageMigration } from "@/lib/storageMigration";

// Migrate legacy vehiq_* localStorage keys → sharago_* (rebrand 2026).
// Runs before render so AuthContext can read either prefix on first mount.
runStorageMigration();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
