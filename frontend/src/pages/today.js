import { pb } from "../pb.js";
import { requireAuth } from "../auth.js";
import { createStore } from "../data.js";
import { describeError } from "../errors.js";
import { greeting } from "../format.js";
import { createCalendar } from "../components/calendar.js";
import {
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  addDays,
  formatKey,
  isDateKey,
  startOfWeek,
  todayKey,
  weekday,
} from "../lib/dates.js";
import {
  colorVars,
  dayStatus,
  firstDay,
  habitsOnDay,
  heatLevel,
  heatmap,
  canSkip,
  isArchived,
  isPausedOn,
  isScheduledOn,
  isSkippedOn,
  isWeekly,
  percent,
  scheduleLabel,
  streakInfo,
  streakLabel,
  skipDay,
  totalOver,
  unskipDay,
  weekProgress,
  weeklyState,
  wouldBeScheduledOn,
} from "../lib/habits.js";

/** "+2 weekly": weekly habits on the list that aren't counted that day. */
// Non-breaking spaces keep each short phrase on one line.
export const weeklyNote = (optional) =>
  optional ? `+${optional}\u00a0weekly` : "";

/** The day's score in words, e.g. "1 of 1 done · +1 weekly". */
export function statusText({ done, total, optional }) {
  const parts = [total ? `${done} of ${total} done` : "nothing due"];
  if (optional) parts.push(weeklyNote(optional));
  return parts.join(" · ");
}

/** "3 habits scheduled" for an upcoming day. */
export function scheduledText({ total, optional }) {
  const count = total + optional;
  if (!count) return "nothing scheduled";
  return `${count} habit${count === 1 ? "" : "s"} scheduled`;
}

export const todayComponent = ({
  store = createStore(),
  now = () => new Date(),
} = {}) => ({
  greeting,
  loading: true,
  error: "",
  today: "",
  selected: "",
  isFuture: false,
  emptyText: "",
  cal: createCalendar(),
  hasHabits: false,
  days: [],
  weekTitle: "",
  items: [],
  // Habits that would be due but are skipped or paused on the selected day.
  skipped: [],
  canSkipDay: false,
  hasDaySkips: false,
  busy: false,
  subtitle: "",
  listTitle: "",
  summary: {
    done: 0,
    total: 0,
    optional: 0,
    weekly: "",
    pct: 0,
    allDone: false,
    isToday: true,
  },
  weekPct: null,
  heat: { cells: [], months: [], weekdays: [] },

  async init() {
    if (!requireAuth()) {
      return;
    }
    this.today = todayKey(now());
    this.cal.setup({
      view: "days",
      weekStart: () => this.weekStart(),
      today: () => this.today,
      selected: () => this.selected,
      level: (key) => this.dayLevel(key),
      onPick: (key) => this.select(key),
    });
    // ?date=YYYY-MM-DD opens that day.
    const asked = new URLSearchParams(window.location.search).get("date");
    this.selected = isDateKey(asked) ? asked : this.today;
    // Draw right away from the last known data, then refresh it.
    if (store.loadCached()) {
      this.loading = false;
      this.refresh();
    }
    await this.load();

    // Roll over to the new day when the page comes back after midnight. If
    // today was showing, the new today shows; a day picked on purpose stays.
    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        todayKey(now()) !== this.today
      ) {
        const wasToday = this.selected === this.today;
        this.today = todayKey(now());
        if (wasToday) this.selected = this.today;
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

  /** How much was done on a day, for the calendar: 0-4, or null if nothing was due. */
  dayLevel(key) {
    const { done, total } = dayStatus(
      this.activeHabits(),
      (id) => store.doneOf(id),
      key,
      this.weekStart(),
    );
    return total ? heatLevel(done, total) : null;
  },

  setUrl() {
    const url = new URL(window.location.href);
    if (this.selected === this.today) url.searchParams.delete("date");
    else url.searchParams.set("date", this.selected);
    window.history.replaceState?.(null, "", url);
  },

  refresh() {
    const today = this.today;
    const weekStart = this.weekStart();
    const habits = this.activeHabits();
    const doneOf = (id) => store.doneOf(id);
    this.hasHabits = habits.length > 0;

    const selected = this.selected || today;
    const future = selected > today;
    this.isFuture = future;

    const weekFrom = startOfWeek(selected, weekStart);
    this.days = Array.from({ length: 7 }, (_, i) => {
      const key = addDays(weekFrom, i);
      const status = dayStatus(habits, doneOf, key, weekStart);
      const { done, total } = status;
      const upcoming = key > today;
      const deg = total && !upcoming ? Math.round((360 * done) / total) : 0;
      const date = formatKey(key, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      return {
        key,
        label: WEEKDAY_SHORT[weekday(key)],
        num: Number(key.slice(8)),
        selected: key === selected,
        isToday: key === today,
        upcoming,
        ring: `conic-gradient(var(--color-lamp) ${deg}deg, var(--color-track) 0deg)`,
        aria: `${date}${key === today ? ", today" : ""}, ${upcoming ? scheduledText(status) : statusText(status)}`,
      };
    });
    this.weekTitle = formatKey(selected, { month: "long", year: "numeric" });

    this.items = habitsOnDay(habits, selected).map((habit) => {
      const done = doneOf(habit.id);
      const streak = streakInfo(habit, done, today, weekStart);
      let sub = scheduleLabel(habit);
      let optional = false;
      if (isWeekly(habit)) {
        const { count, target } = weekProgress(
          habit,
          done,
          selected,
          weekStart,
        );
        const state = weeklyState(habit, done, selected, weekStart);
        // Not counted in the day's score: shown as optional, not as missed.
        optional = state === "optional" || state === "met";
        const when = selected === today ? "today" : future ? "" : "past";
        const note = {
          optional: when === "today" ? "optional\u00a0today" : "optional",
          met: "goal\u00a0met",
          due: { today: "due\u00a0today", past: "was\u00a0due", "": "due" }[
            when
          ],
        }[state];
        sub = [`${count} of ${target} this week`, note]
          .filter(Boolean)
          .join(" · ");
      }
      return {
        id: habit.id,
        name: habit.name,
        sub,
        optional,
        done: done.has(selected),
        // "Skip the day" takes every habit that isn't done; the row's own
        // Skip button is left off weekly habits on days they're optional,
        // where a skip rarely changes anything.
        skippable: canSkip(habit, done, selected),
        canSkip: canSkip(habit, done, selected) && !optional,
        locked: future,
        color: colorVars(habit.color),
        streak: streak.current,
        streakText: streakLabel(streak.current, streak.unit),
      };
    });

    const status = dayStatus(habits, doneOf, selected, weekStart);
    this.summary = {
      ...status,
      weekly: weeklyNote(status.optional),
      pct: percent(status.done, status.total) ?? 0,
      allDone: !future && status.total > 0 && status.done === status.total,
      isToday: selected === today,
      isFuture: future,
      scheduled: scheduledText(status),
    };

    const thisWeek = startOfWeek(today, weekStart);
    const week = totalOver(
      habits,
      doneOf,
      thisWeek,
      addDays(thisWeek, 6),
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
    this.subtitle = future
      ? `${dayName} · ${scheduledText(status)}`
      : status.total || status.optional
        ? `${dayName} · ${statusText(status)}`
        : dayName;
    this.listTitle =
      selected === today
        ? "Today's habits"
        : future
          ? "Scheduled for this day"
          : "Habits on this day";
    this.skipped = habits
      .filter(
        (h) =>
          isPausedOn(h, selected) &&
          wouldBeScheduledOn(h, selected) &&
          !isScheduledOn(h, selected),
      )
      .map((habit) => {
        const skip = isSkippedOn(habit, selected);
        const pause = (habit.pauses || []).find(
          (p) => p.from <= selected && (!p.to || selected <= p.to),
        );
        return {
          id: habit.id,
          name: habit.name,
          color: colorVars(habit.color),
          skip,
          sub: skip
            ? "Skipped"
            : pause?.to
              ? `Paused until ${formatKey(pause.to, { month: "short", day: "numeric" })}`
              : "Paused",
        };
      });
    this.canSkipDay = this.items.some((i) => i.skippable);
    const skips = this.skipped.filter((s) => s.skip).length;
    this.hasDaySkips = skips > 0;
    if (skips) this.subtitle += ` · ${skips}\u00a0skipped`;

    this.emptyText =
      selected < firstDay(habits, today)
        ? "None of your habits had started yet."
        : this.skipped.length
          ? "Everything is skipped or paused on this day."
          : "Nothing is scheduled for this day.";
    this.heat = heatmap(store.habits, doneOf, today, weekStart, 12);
  },

  select(key) {
    if (!isDateKey(key)) return;
    this.selected = key;
    this.setUrl();
    this.refresh();
  },

  /** Moves the strip by whole weeks, keeping the weekday. */
  shiftWeek(weeks) {
    this.select(addDays(this.selected, 7 * weeks));
  },

  goToday() {
    this.select(this.today);
  },

  /** Opens a day from the consistency calendar and brings the list into view. */
  openDay(key) {
    this.select(key);
    this.$refs?.days?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  },

  /** Runs a change to the habits, showing `failure` if it doesn't go through. */
  async run(action, failure) {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      await action();
    } catch (err) {
      console.error(err);
      this.error = describeError(err, failure);
    } finally {
      this.busy = false;
      this.refresh();
    }
  },

  /** Skips one habit on the selected day: it won't count, and the streak is kept. */
  skip(item) {
    const habit = store.habit(item.id);
    return this.run(
      () =>
        store.updateHabit(habit.id, {
          pauses: skipDay(habit, this.selected),
        }),
      "Couldn't skip the habit. Please try again.",
    );
  },

  unskip(item) {
    const habit = store.habit(item.id);
    return this.run(
      () =>
        store.updateHabit(habit.id, {
          pauses: unskipDay(habit, this.selected),
        }),
      "Couldn't undo the skip. Please try again.",
    );
  },

  /** A sick day: skips every habit on the day that isn't checked off. */
  skipTheDay() {
    const day = this.selected;
    const changes = this.items
      .filter((i) => i.skippable)
      .map((i) => {
        const habit = store.habit(i.id);
        return { id: habit.id, data: { pauses: skipDay(habit, day) } };
      });
    return this.run(
      () => store.updateHabits(changes),
      "Couldn't skip the day. Please try again.",
    );
  },

  /** Undoes every skip on the selected day (not longer pauses). */
  undoDaySkips() {
    const day = this.selected;
    const changes = this.skipped
      .filter((s) => s.skip)
      .map((s) => {
        const habit = store.habit(s.id);
        return { id: habit.id, data: { pauses: unskipDay(habit, day) } };
      });
    return this.run(
      () => store.updateHabits(changes),
      "Couldn't undo the skips. Please try again.",
    );
  },

  async toggle(item) {
    // Upcoming days can be looked at, not checked off.
    if (this.selected > this.today) return;
    this.error = "";
    const ok = await store.toggle(item.id, this.selected, () => this.refresh());
    if (!ok) {
      this.error =
        "Couldn't save that change. Check your connection and try again.";
    }
  },
});
