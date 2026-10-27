import { describe, expect, it } from "vitest";
import { applyTheme, normalizeTheme } from "../../src/theme.js";

describe("theme", () => {
  it("treats anything unknown as the system theme", () => {
    expect(normalizeTheme("")).toBe("system");
    expect(normalizeTheme(undefined)).toBe("system");
    expect(normalizeTheme("dark")).toBe("dark");
  });

  it("sets or clears data-theme and remembers the choice", () => {
    const root = document.createElement("html");
    applyTheme("dark", root);
    expect(root.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");

    applyTheme("system", root);
    expect(root.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("theme")).toBe("system");
  });
});
