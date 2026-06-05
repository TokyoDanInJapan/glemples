import { defineConfig } from "vite";
import yaml from "@modyfi/vite-plugin-yaml";

export default defineConfig({
  assetsInclude: ["**/*.glsl"],
  plugins: [yaml()],
});
