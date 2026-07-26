import { defineConfig } from "vitest/config";
import yaml from "@modyfi/vite-plugin-yaml";

export default defineConfig({
  // The YAML plugin is needed so `src/app/config.ts` can import config.yaml.
  plugins: [yaml()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The entry point is DOM lookup and wiring only — everything it drives
      // lives in app/app.ts. Ambient types have no logic at all.
      exclude: ["src/main.ts", "src/vite-env.d.ts"],
      reporter: ["text", "html"],
    },
  },
});
