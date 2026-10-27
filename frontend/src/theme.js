// Light / dark / system theme. The choice is saved on the user record and
// mirrored in localStorage, so the inline script in each page's <head> can
// apply it before the first paint (no flash of the wrong theme).

export const THEMES = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "system", label: "System" },
];

export function normalizeTheme(theme) {
  return theme === "light" || theme === "dark" ? theme : "system";
}

export function applyTheme(theme, root = document.documentElement) {
  const value = normalizeTheme(theme);
  if (value === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = value;
  }
  try {
    localStorage.setItem("theme", value);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies.
  }
}
