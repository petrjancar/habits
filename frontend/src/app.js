import Alpine from "alpinejs";
import { pb } from "./pb.js";
import { navComponent } from "./components/nav.js";
import { passwordField } from "./components/password-field.js";
import { heatArt } from "./components/heat-art.js";
import { applyTheme } from "./theme.js";
import { clearCache } from "./data.js";

// Components available on every page.
const sharedComponents = { navComponent, passwordField, heatArt };

// Styles are linked from each page's <head> (not imported here), so the browser
// applies them before the first paint. Importing CSS from JS makes the dev
// server inject it after the scripts run, which flashes unstyled content.

/**
 * Boots Alpine for a page: registers the shared auth store, shared components
 * and the page's own components, then starts Alpine.
 *
 *   startApp({ accountComponent });
 */
export function startApp(components = {}) {
  // $store.auth.user always mirrors pb.authStore.record: it updates on login,
  // logout, token refresh, profile saves and changes made in other tabs.
  Alpine.store("auth", { user: null });
  pb.authStore.onChange((_token, record) => {
    Alpine.store("auth").user = record;
    if (record) {
      applyTheme(record.theme);
    } else {
      // Logged out (or the session ended): drop the cached habit data.
      clearCache();
    }
  }, true);

  for (const [name, factory] of Object.entries({
    ...sharedComponents,
    ...components,
  })) {
    Alpine.data(name, factory);
  }

  if (import.meta.env.DEV) {
    window.Alpine = Alpine;
  }
  Alpine.start();
}
