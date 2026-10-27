// Brand art on the login/register panel: a 7×7 grid of days that light up
// in waves, like a habit calendar filling in.

const LIT = [
  "color-mix(in srgb, var(--color-lamp) 30%, var(--color-panel-tile))",
  "color-mix(in srgb, var(--color-lamp) 65%, var(--color-panel-tile))",
  "var(--color-lamp)",
];

/** Brightness 0 (dark) to 3 for each of `count` cells, from a seed. */
export function heatArtLevels(count = 49, random = Math.random) {
  return Array.from({ length: count }, () => {
    const v = random();
    return v < 0.28 ? 0 : v < 0.48 ? 1 : v < 0.75 ? 2 : 3;
  });
}

export const heatArt = ({ random = Math.random } = {}) => ({
  init() {
    // The cells come from an x-for, which renders after init() runs.
    if (this.$nextTick) {
      this.$nextTick(() => this.light());
    } else {
      this.light();
    }
  },

  light() {
    const cells = this.$el.querySelectorAll(".heat-art-cell");
    const levels = heatArtLevels(cells.length, random);
    cells.forEach((cell, i) => {
      if (!levels[i]) return;
      const col = i % 7;
      const row = Math.floor(i / 7);
      cell.style.setProperty("--lit", LIT[levels[i] - 1]);
      cell.style.animationDelay = `${(col * 0.5 + row * 0.08).toFixed(2)}s`;
      cell.classList.add("lit");
    });
  },
});
