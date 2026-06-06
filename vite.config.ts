import { defineConfig } from "vite";
import yaml from "@modyfi/vite-plugin-yaml";

export default defineConfig({
  base: "./",
  assetsInclude: ["**/*.glsl"],
  plugins: [yaml()],
});
