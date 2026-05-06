/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    globals: false,
    restoreMocks: true,
  },
});
