import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import injectHTML from "vite-plugin-html-inject";

// Folders that never contain pages.
const NON_PAGE_DIRS = new Set([
  "node_modules",
  "dist",
  "public",
  "src",
  "tests",
  "components",
]);

// Every index.html (at any depth) is a page: login/index.html -> /login/
function findPages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const skip = NON_PAGE_DIRS.has(entry.name) || entry.name.startsWith(".");
      return skip ? [] : findPages(path);
    }
    return entry.name === "index.html" ? [path] : [];
  });
}

// Vite drops blocking="render" from the page scripts when it bundles them.
// Putting it back keeps the previous page on screen until the new one is
// fully built, so pages never appear half-drawn while navigating.
const renderBlockingScripts = () => ({
  name: "render-blocking-scripts",
  transformIndexHtml: {
    order: "post",
    handler: (html) =>
      html.replace(
        /<script type="module"(?![^>]*blocking=)/g,
        '<script type="module" blocking="render"',
      ),
  },
});

// The app version comes from package.json; pages show it by writing
// %APP_VERSION% (it ends up as plain text in the HTML, no script needed).
const { version } = JSON.parse(
  readFileSync(join(import.meta.dirname, "package.json"), "utf8"),
);
const appVersion = () => ({
  name: "app-version",
  transformIndexHtml: (html) => html.replaceAll("%APP_VERSION%", version),
});

export default defineConfig({
  plugins: [tailwindcss(), injectHTML(), renderBlockingScripts(), appVersion()],
  // Scripts read the version as __APP_VERSION__, e.g. to note it in a backup.
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: "../pb_public",
    emptyOutDir: true,
    rollupOptions: {
      input: findPages(import.meta.dirname),
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8090",
      "/_": "http://127.0.0.1:8090",
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./tests/setup.js"],
  },
});
