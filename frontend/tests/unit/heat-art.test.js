import { describe, expect, it } from "vitest";
import { heatArt, heatArtLevels } from "../../src/components/heat-art.js";

describe("heatArt", () => {
  it("gives every cell a brightness from 0 to 3", () => {
    const levels = heatArtLevels(49);
    expect(levels).toHaveLength(49);
    expect(levels.every((l) => l >= 0 && l <= 3)).toBe(true);
  });

  it("lights the cells that aren't dark, in waves from left to right", () => {
    const grid = document.createElement("div");
    grid.innerHTML = '<div class="heat-art-cell"></div>'.repeat(14);
    const values = [0.1, 0.9];
    let i = 0;
    const art = heatArt({ random: () => values[i++ % 2] });
    art.$el = grid;

    art.init();

    const cells = grid.querySelectorAll(".heat-art-cell");
    expect(cells[0].classList.contains("lit")).toBe(false);
    expect(cells[1].classList.contains("lit")).toBe(true);
    expect(cells[1].style.animationDelay).toBe("0.50s");
  });
});
