import { pb } from "../pb.js";
import { requireAuth } from "../auth.js";
import { createStore } from "../data.js";
import { describeError } from "../errors.js";
import { todayKey } from "../lib/dates.js";
import {
  PERIODS,
  colorVars,
  heatmap,
  periodStats,
  streakLabel,
} from "../lib/habits.js";

const BAR_MAX_PX = 160;

export const statsComponent = ({
  store = createStore(),
  now = () => new Date(),
} = {}) => ({
  periods: PERIODS,
  period: "week",
  loading: true,
  error: "",
  hasHabits: false,
  stats: null,
  heatWide: { cells: [], months: [], weekdays: [] },
  heatNarrow: { cells: [], months: [], weekdays: [] },
  // Below the large breakpoint the habit list shows this many until "Show all".
  HABITS_SHOWN: 6,
  showAllHabits: false,

  async init() {
    if (!requireAuth()) {
      return;
    }
    const fromUrl = new URLSearchParams(window.location.search).get("period");
    if (PERIODS.some((p) => p.key === fromUrl)) {
      this.period = fromUrl;
    }
    // Draw right away from the last known data, then refresh it.
    if (store.loadCached()) {
      this.loading = false;
      this.refresh();
    }
    try {
      await store.load();
    } catch (err) {
      console.error(err);
      this.error = describeError(
        err,
        "Couldn't load your statistics. Please reload the page.",
      );
    } finally {
      this.loading = false;
    }
    this.refresh();
  },

  pick(period) {
    this.period = period;
    const url = new URL(window.location.href);
    url.searchParams.set("period", period);
    window.history.replaceState?.(null, "", url);
    this.refresh();
  },

  refresh() {
    const today = todayKey(now());
    const weekStart = pb.authStore.record?.week_start || "monday";
    const doneOf = (id) => store.doneOf(id);
    this.hasHabits = store.habits.length > 0;
    if (!this.hasHabits) {
      return;
    }

    const s = periodStats(this.period, store.habits, doneOf, today, weekStart);
    this.stats = {
      title: s.title,
      chartTitle: s.chartTitle,
      pctText: s.pct === null ? "–" : `${s.pct}%`,
      countText: `${s.done} of ${s.total}`,
      bestText: s.best ? streakLabel(s.best.length, s.best.unit) : "–",
      bestHabit: s.best ? s.best.habit.name : "No streaks yet",
      bars: s.bars.map((b) => ({
        ...b,
        text: b.value === null ? "–" : String(b.value),
        height:
          b.value === null
            ? "0px"
            : `${Math.max(4, Math.round((b.value / 100) * BAR_MAX_PX))}px`,
      })),
      habits: s.perHabit.map((row) => ({
        id: row.habit.id,
        name: row.habit.name,
        color: colorVars(row.habit.color).bg,
        pctText: `${row.pct}%`,
        width: `${row.pct}%`,
      })),
      insight: s.insight,
    };
    this.heatWide = heatmap(store.habits, doneOf, today, weekStart, 52);
    this.heatNarrow = heatmap(store.habits, doneOf, today, weekStart, 18);
  },
});
