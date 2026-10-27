import { pb } from "../pb.js";
import { requireAuth } from "../auth.js";
import { createStore } from "../data.js";
import { describeError } from "../errors.js";
import { greeting } from "../format.js";
import {
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  addDays,
  formatKey,
  startOfWeek,
  todayKey,
  weekday,
} from "../lib/dates.js";
import {
  colorVars,
  dayStatus,
  habitsOnDay,
  heatmap,
  isArchived,
  isWeekly,
  percent,
  scheduleLabel,
  streakInfo,
  streakLabel,
  totalOver,
  weekProgress,
} from "../lib/habits.js";

/** Days that can still be checked off on this page: today and the 6 before. */
export const EDITABLE_DAYS = 7;

export const todayComponent = ({
  store = createStore(),
  now = () => new Date(),
} = {}) => ({
  greeting,
  loading: true,
  error: "",
  today: "",
  selected: "",
  hasHabits: false,
  days: [],
  items: [],
  subtitle: "",
  listTitle: "",
  summary: { done: 0, total: 0, pct: 0, allDone: false, isToday: true },
  weekPct: null,
  heat: { cells: [], months: [], weekdays: [] },

  async init() {
    if (!requireAuth()) {
      return;
    }
    this.today = todayKey(now());
    this.selected = this.today;
    // Draw right away from the last known data, then refresh it.
    if (store.loadCached()) {
      this.loading = false;
      this.refresh();
    }
    await this.load();

    // Roll over to the new day when the page comes back after midnight.
    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        todayKey(now()) !== this.today
      ) {
        this.today = todayKey(now());
        this.selected = this.today;
        this.load();
      }
    });
  },

  async load() {
    this.error = "";
    try {
      await store.load();
    } catch (err) {
      console.error(err);
      this.error = describeError(
        err,
        "Couldn't load your habits. Please reload the page.",
      );
    } finally {
      this.loading = false;
    }
    this.refresh();
  },

  weekStart() {
    return pb.authStore.record?.week_start || "monday";
  },

  activeHabits() {
    return store.habits.filter((h) => !isArchived(h));
  },

  refresh() {
    const today = this.today;
    const weekStart = this.weekStart();
    const habits = this.activeHabits();
    const doneOf = (id) => store.doneOf(id);
    this.hasHabits = habits.length > 0;

    this.days = Array.from({ length: EDITABLE_DAYS }, (_, i) => {
      const key = addDays(today, i - (EDITABLE_DAYS - 1));
      const { done, total } = dayStatus(habits, doneOf, key, weekStart);
      const deg = total ? Math.round((360 * done) / total) : 0;
      return {
        key,
        label: WEEKDAY_SHORT[weekday(key)],
        num: Number(key.slice(8)),
        selected: key === this.selected,
        ring: `conic-gradient(var(--color-lamp) ${deg}deg, var(--color-track) 0deg)`,
        aria: `${formatKey(key, { weekday: "long", month: "long", day: "numeric" })}, ${done} of ${total} done`,
      };
    });

    const selected = this.selected;
    this.items = habitsOnDay(habits, selected).map((habit) => {
      const done = doneOf(habit.id);
      const streak = streakInfo(habit, done, today, weekStart);
      let sub = scheduleLabel(habit);
      if (isWeekly(habit)) {
        const { count, target } = weekProgress(
          habit,
          done,
          selected,
          weekStart,
        );
        sub = `${count} of ${target} this week`;
      }
      return {
        id: habit.id,
        name: habit.name,
        sub,
        done: done.has(selected),
        color: colorVars(habit.color),
        streak: streak.current,
        streakText: streakLabel(streak.current, streak.unit),
      };
    });

    const status = dayStatus(habits, doneOf, selected, weekStart);
    this.summary = {
      ...status,
      pct: percent(status.done, status.total) ?? 0,
      allDone: status.total > 0 && status.done === status.total,
      isToday: selected === today,
    };

    const weekFrom = startOfWeek(today, weekStart);
    const week = totalOver(
      habits,
      doneOf,
      weekFrom,
      addDays(weekFrom, 6),
      today,
      weekStart,
    );
    this.weekPct = percent(week.done, week.total);

    const dayName =
      selected === today
        ? formatKey(selected, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })
        : `${WEEKDAY_LONG[weekday(selected)]}, ${formatKey(selected, { month: "long", day: "numeric" })}`;
    this.subtitle = status.total
      ? `${dayName} · ${status.done} of ${status.total} done`
      : dayName;
    this.listTitle =
      selected === today ? "Today's habits" : "Habits on this day";
    this.heat = heatmap(store.habits, doneOf, today, weekStart, 12);
  },

  select(key) {
    this.selected = key;
    this.refresh();
  },

  async toggle(item) {
    this.error = "";
    const ok = await store.toggle(item.id, this.selected, () => this.refresh());
    if (!ok) {
      this.error =
        "Couldn't save that change. Check your connection and try again.";
    }
  },
});
