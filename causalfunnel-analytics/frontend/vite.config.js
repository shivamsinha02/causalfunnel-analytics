import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api is proxied to Flask so no CORS or env setup is needed.
// For a deployed build, set VITE_API_URL to the public API origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:5000" },
  },
});
