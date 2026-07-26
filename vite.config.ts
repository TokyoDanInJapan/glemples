import { defineConfig } from "vite";
import yaml from "@modyfi/vite-plugin-yaml";

export default defineConfig({
  base: "./",
  // Shaders are imported with `?raw`, so they need no assetsInclude entry.
  plugins: [yaml()],
});
