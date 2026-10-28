import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HABIT_COLORS, colorVars } from "../../src/lib/habits.js";

const root = join(import.meta.dirname, "../..");
const css = readFileSync(join(root, "src/style.css"), "utf8");
const keys = HABIT_COLORS.map((c) => c.key);

describe("habit colours", () => {
  it("has 16 different colours", () => {
    expect(keys).toHaveLength(16);
    expect(new Set(keys).size).toBe(16);
  });

  it("defines every colour and its text colour in both themes", () => {
    for (const key of keys) {
      for (const token of [
        `--color-habit-${key}:`,
        `--color-on-habit-${key}:`,
      ]) {
        // Once for the light theme, once for the dark one.
        expect(css.split(token).length - 1, token).toBe(2);
      }
    }
  });

  it("lets the server store every colour (latest colour migration)", () => {
    const dir = join(root, "../pb_migrations");
    const latest = readdirSync(dir)
      .filter((f) => f.includes("colors"))
      .sort()
      .at(-1);
    const source = readFileSync(join(dir, latest), "utf8");
    for (const key of keys) expect(source, key).toContain(`"${key}"`);
  });

  it("falls back to pine for an unknown colour", () => {
    expect(colorVars("nope").bg).toBe("var(--color-habit-pine)");
    expect(colorVars("slate").fg).toBe("var(--color-on-habit-slate)");
  });
});
