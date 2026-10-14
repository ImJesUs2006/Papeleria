import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
    // Los tests de rutas reimportan el grafo completo de módulos (resetModules):
    // la primera importación en frío puede pasar de 5 s en equipos cargados.
    testTimeout: 30_000,
  },
});