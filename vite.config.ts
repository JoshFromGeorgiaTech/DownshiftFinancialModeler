import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path matches the GitHub Pages project-site URL (github.io/<repo>/).
// Override with VITE_BASE if deploying somewhere else (e.g. a custom domain uses "/").
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "/DownshiftFinancialModeler/",
  test: {
    environment: "node",
  },
});
