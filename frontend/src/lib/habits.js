// Pure habit logic: schedules, streaks, completion rates and statistics.
// Nothing here talks to PocketBase or the DOM, so it is easy to unit-test.
//
// A habit record (see pb_migrations) looks like:
//   { id, name, color, frequency: "daily" | "days" | "weekly",
//     days: [0..6] (0 = Monday), target: 1-7, start_date: "YYYY-MM-DD",
//     pauses: [{ from, to | null }], archived_on: "" | "YYYY-MM-DD", sort_order }
//
// `done` is anything with has(dateKey), e.g. a Set or Map of a habit's
// check-in dates; `doneOf(habitId)` returns it for a habit.

import {
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  addDays,
  addMonths,
  eachDay,
  endOfMonth,
  formatKey,
  maxKey,
  minKey,
  startOfMonth,
  startOfWeek,
  weekday,
  weekdayOrder,
} from "./dates.js";

export const HABIT_COLORS = [
  { key: "pine", label: "Pine" },
  { key: "emerald", label: "Emerald" },
  { key: "sage", label: "Sage" },
  { key: "yellow", label: "Yellow" },
  { key: "ochre", label: "Ochre" },
  { key: "brick", label: "Brick" },
  { key: "blue", label: "Blue" },
  { key: "plum", label: "Plum" },
  { key: "teal", label: "Teal" },
  { key: "sky", label: "Sky" },
  { key: "indigo", label: "Indigo" },
  { key: "rose", label: "Rose" },
  { key: "wine", label: "Wine" },
  { key: "orange", label: "Orange" },
  { key: "olive", label: "Olive" },
  { key: "slate", label: "Slate" },
];

/** CSS custom properties for a habit colour (defined in style.css). */
export function colorVars(color) {
  const key = HABIT_COLORS.some((c) => c.key === color) ? color : "pine";
  return {
    bg: `var(--color-habit-${key})`,
    fg: `var(--color-on-habit-${key})`,
  };
}

const EMPTY = { has: () => false };

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export function isPausedOn(habit, key) {
  return (habit.pauses || []).some(
    (p) => p.from <= key && (!p.to || key <= p.to),
  );
}

export const isPaused = (habit, today) => isPausedOn(habit, today);

export const isArchived = (habit) => !!habit.archived_on;

/** The habit exists on this day: started, not paused, not yet archived. */
export function isActiveOn(habit, key) {
  if (key < habit.start_date) return false;
  if (habit.archived_on && key >= habit.archived_on) return false;
  return !isPausedOn(habit, key);
}

/** The habit is due on this day (weekly habits can be done on any day). */
export function isScheduledOn(habit, key) {
  if (!isActiveOn(habit, key)) return false;
  if (habit.frequency === "days") {
    return (habit.days || []).includes(weekday(key));
  }
  return true;
}

export const isWeekly = (habit) => habit.frequency === "weekly";

/** Check-ins needed per week; at most the number of active days that week. */
function weekRequirement(habit, weekStartKey) {
  let activeDays = 0;
  for (let i = 0; i < 7; i++) {
    if (isActiveOn(habit, addDays(weekStartKey, i))) activeDays++;
  }
  return Math.min(habit.target || 1, activeDays);
}

function weekCount(habit, done, weekStartKey) {
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const key = addDays(weekStartKey, i);
    if (done.has(key) && isActiveOn(habit, key)) count++;
  }
  return count;
}

/** Progress of a weekly habit in the week containing `key`. */
export function weekProgress(habit, done, key, weekStart = "monday") {
  const start = startOfWeek(key, weekStart);
  return {
    count: weekCount(habit, done, start),
    target: weekRequirement(habit, start),
  };
}

/**
 * Where a weekly habit stands on one day of its week:
 * - "done": checked that day;
 * - "met": not checked, but the weekly goal was already reached earlier that week;
 * - "due": not checked, and the days left in the week (this one included) are
 *   no more than the check-ins still needed, so it can't be put off any longer;
 * - "optional": not checked, and there is still time later in the week.
 * Only "done" and "due" count towards a day's score (see dayStatus).
 * Only check-ins earlier in the week matter, so a day's state never depends
 * on what happened after it.
 */
export function weeklyState(habit, done, key, weekStart = "monday") {
  if (done.has(key)) return "done";
  const start = startOfWeek(key, weekStart);
  let before = 0;
  for (let d = start; d < key; d = addDays(d, 1)) {
    if (done.has(d) && isActiveOn(habit, d)) before++;
  }
  const needed = weekRequirement(habit, start) - before;
  if (needed <= 0) return "met";
  let daysLeft = 0;
  for (let d = key; d <= addDays(start, 6); d = addDays(d, 1)) {
    if (isActiveOn(habit, d)) daysLeft++;
  }
  return daysLeft <= needed ? "due" : "optional";
}

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

/**
 * Walks the habit's history and returns { current, longest, unit, runs }.
 * Units are days, or weeks for weekly habits. Unscheduled and paused days are
 * skipped, and today (or this week) only counts once it is done, so an
 * unfinished today never breaks a streak. Each run is { end, length }.
 */
export function streakInfo(habit, done = EMPTY, today, weekStart = "monday") {
  const runs = [];
  let current = 0;
  let lastEnd = null;
  const fail = () => {
    if (current > 0) runs.push({ end: lastEnd, length: current });
    current = 0;
  };

  const last = habit.archived_on
    ? minKey(today, addDays(habit.archived_on, -1))
    : today;

  if (isWeekly(habit)) {
    for (
      let week = startOfWeek(habit.start_date, weekStart);
      week <= last;
      week = addDays(week, 7)
    ) {
      const required = weekRequirement(habit, week);
      if (required === 0) continue;
      const end = addDays(week, 6);
      if (weekCount(habit, done, week) >= required) {
        current++;
        lastEnd = minKey(end, today);
      } else if (end < today) {
        fail();
      }
    }
  } else {
    for (let key = habit.start_date; key <= last; key = addDays(key, 1)) {
      if (!isScheduledOn(habit, key)) continue;
      if (done.has(key)) {
        current++;
        lastEnd = key;
      } else if (key < today) {
        fail();
      }
    }
  }
  if (current > 0) runs.push({ end: lastEnd, length: current });

  return {
    current,
    longest: runs.reduce((max, r) => Math.max(max, r.length), 0),
    unit: isWeekly(habit) ? "week" : "day",
    runs,
  };
}

export function streakLabel(length, unit = "day") {
  if (!length) return "No streak";
  return `${length} ${unit}${length === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

/**
 * How much of what was due between `from` and `to` got done: { done, total }.
 * Days count per scheduled day; weekly habits count per week (a week belongs
 * to the range its last day falls in). An unfinished today or current week
 * isn't counted as missed.
 */
export function completion(
  habit,
  done = EMPTY,
  from,
  to,
  today,
  weekStart = "monday",
) {
  const end = minKey(to, today);
  let doneCount = 0;
  let total = 0;
  if (end < from) return { done: 0, total: 0 };

  if (isWeekly(habit)) {
    for (
      let week = startOfWeek(from, weekStart);
      week <= end;
      week = addDays(week, 7)
    ) {
      const weekEnd = addDays(week, 6);
      const assigned = minKey(weekEnd, today);
      if (assigned < from || assigned > end) continue;
      const required = weekRequirement(habit, week);
      if (required === 0) continue;
      const count = Math.min(weekCount(habit, done, week), required);
      if (weekEnd < today || count >= required) {
        doneCount += count;
        total += required;
      } else {
        doneCount += count;
        total += count;
      }
    }
  } else {
    for (
      let key = maxKey(from, habit.start_date);
      key <= end;
      key = addDays(key, 1)
    ) {
      if (!isScheduledOn(habit, key)) continue;
      if (done.has(key)) {
        doneCount++;
        total++;
      } else if (key < today) {
        total++;
      }
    }
  }
  return { done: doneCount, total };
}

export const percent = (done, total) =>
  total > 0 ? Math.round((100 * done) / total) : null;

/** The earliest day worth showing: when the first of these habits started. */
export function firstDay(habits, today) {
  return habits.reduce((first, h) => minKey(first, h.start_date), today);
}

/** Habits on the day's list, e.g. on the Today page. */
export function habitsOnDay(habits, key) {
  return habits.filter((h) => isScheduledOn(h, key));
}

/**
 * The day's list completion: { done, total, optional }. A weekly habit only
 * counts on the day it is checked, or when it is due (see weeklyState);
 * otherwise it is left out of the score and counted in `optional` instead, so
 * a rest day of a "2× a week" habit isn't a missed day.
 */
export function dayStatus(habits, doneOf, key, weekStart = "monday") {
  let doneCount = 0;
  let total = 0;
  let optional = 0;
  for (const habit of habitsOnDay(habits, key)) {
    const done = doneOf(habit.id);
    if (isWeekly(habit)) {
      const state = weeklyState(habit, done, key, weekStart);
      if (state === "done") {
        doneCount++;
        total++;
      } else if (state === "due") {
        total++;
      } else {
        optional++;
      }
    } else {
      total++;
      if (done.has(key)) doneCount++;
    }
  }
  return { done: doneCount, total, optional };
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

export function heatLevel(done, total) {
  if (!total || !done) return 0;
  const ratio = done / total;
  if (ratio >= 1) return 4;
  if (ratio >= 0.6) return 3;
  if (ratio >= 0.3) return 2;
  return 1;
}

/**
 * The last `weeks` weeks as a grid with one row per weekday. Returns
 * { cells (row by row, ready for a CSS grid), months (label or "" per column),
 * weekdays (Mon / Wed / Fri or "" per row) }.
 */
export function heatmap(
  habits,
  doneOf,
  today,
  weekStart = "monday",
  weeks = 12,
) {
  const first = addDays(startOfWeek(today, weekStart), -7 * (weeks - 1));
  const cells = [];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < weeks; col++) {
      const key = addDays(first, col * 7 + row);
      if (key > today) {
        cells.push({ key, future: true, level: 0, title: "" });
        continue;
      }
      const { done, total } = dayStatus(habits, doneOf, key, weekStart);
      const date = formatKey(key, { month: "short", day: "numeric" });
      cells.push({
        key,
        future: false,
        level: heatLevel(done, total),
        title: total ? `${date}: ${done} of ${total}` : `${date}: nothing due`,
      });
    }
  }
  const months = [];
  for (let col = 0; col < weeks; col++) {
    const weekFirst = addDays(first, col * 7);
    const startsMonth = eachDay(weekFirst, addDays(weekFirst, 6)).find((k) =>
      k.endsWith("-01"),
    );
    months.push(startsMonth ? formatKey(startsMonth, { month: "short" }) : "");
  }
  const weekdays = weekdayOrder(weekStart).map((d) =>
    d === 0 || d === 2 || d === 4 ? WEEKDAY_SHORT[d] : "",
  );
  return { cells, months, weekdays };
}

// ---------------------------------------------------------------------------
// Statistics page
// ---------------------------------------------------------------------------

export const PERIODS = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All time" },
];

/** completion() summed over several habits. */
export function totalOver(habits, doneOf, from, to, today, weekStart) {
  let done = 0;
  let total = 0;
  for (const habit of habits) {
    const c = completion(habit, doneOf(habit.id), from, to, today, weekStart);
    done += c.done;
    total += c.total;
  }
  return { done, total };
}

const quarterOf = (key) => Math.floor((Number(key.slice(5, 7)) - 1) / 3);
const quarterStart = (key) =>
  `${key.slice(0, 4)}-${String(quarterOf(key) * 3 + 1).padStart(2, "0")}-01`;

/** The period's date range, its title and the buckets of its bar chart. */
export function periodRange(period, habits, today, weekStart = "monday") {
  if (period === "week") {
    const from = startOfWeek(today, weekStart);
    const to = addDays(from, 6);
    const sameMonth = from.slice(0, 7) === to.slice(0, 7);
    const title = sameMonth
      ? `${formatKey(from, { month: "long", day: "numeric" })} – ${Number(to.slice(8))}, ${to.slice(0, 4)}`
      : `${formatKey(from, { month: "short", day: "numeric" })} – ${formatKey(to, { month: "short", day: "numeric", year: "numeric" })}`;
    return {
      from,
      to,
      title,
      chartTitle: "Done by day",
      perDay: true,
      buckets: eachDay(from, to).map((key) => ({
        from: key,
        to: key,
        label: WEEKDAY_SHORT[weekday(key)],
      })),
    };
  }

  if (period === "month") {
    const from = startOfMonth(today);
    const to = endOfMonth(today);
    const buckets = [];
    for (let start = from; start <= to;) {
      const end = minKey(addDays(startOfWeek(start, weekStart), 6), to);
      const month = formatKey(start, { month: "short" });
      const label =
        start === end
          ? `${month} ${Number(start.slice(8))}`
          : `${month} ${Number(start.slice(8))}–${Number(end.slice(8))}`;
      buckets.push({ from: start, to: end, label });
      start = addDays(end, 1);
    }
    return {
      from,
      to,
      title: formatKey(today, { month: "long", year: "numeric" }),
      chartTitle: "Done by week",
      buckets,
    };
  }

  if (period === "year") {
    const from = `${today.slice(0, 4)}-01-01`;
    const to = `${today.slice(0, 4)}-12-31`;
    const buckets = [];
    for (let m = from; m <= today; m = addMonths(m, 1)) {
      buckets.push({
        from: m,
        to: endOfMonth(m),
        label: formatKey(m, { month: "short" }),
      });
    }
    return {
      from,
      to,
      title: today.slice(0, 4),
      chartTitle: "Done by month",
      buckets,
    };
  }

  // All time: from the first habit's start, in quarters.
  const first = habits.reduce(
    (min, h) => (h.start_date < min ? h.start_date : min),
    today,
  );
  const buckets = [];
  for (let q = quarterStart(first); q <= today; q = addMonths(q, 3)) {
    buckets.push({
      from: q,
      to: addDays(addMonths(q, 3), -1),
      label: `Q${quarterOf(q) + 1} ’${q.slice(2, 4)}`,
    });
  }
  return {
    from: first,
    to: today,
    title: `Since ${formatKey(first, { month: "long", day: "numeric", year: "numeric" })}`,
    chartTitle: "Done by quarter",
    buckets,
  };
}

/** Everything the statistics page shows for one period. */
export function periodStats(
  period,
  habits,
  doneOf,
  today,
  weekStart = "monday",
) {
  const range = periodRange(period, habits, today, weekStart);
  const { from, to } = range;
  const overall = totalOver(habits, doneOf, from, to, today, weekStart);

  const bars = range.buckets.map((b) => {
    if (b.from > today) return { label: b.label, value: null, current: false };
    const c = range.perDay
      ? dayStatus(habits, doneOf, b.from, weekStart)
      : totalOver(habits, doneOf, b.from, b.to, today, weekStart);
    return {
      label: b.label,
      value: percent(c.done, c.total),
      current: b.from <= today && today <= b.to,
    };
  });

  const perHabit = habits
    .map((habit) => {
      const c = completion(habit, doneOf(habit.id), from, to, today, weekStart);
      return { habit, ...c, pct: percent(c.done, c.total) };
    })
    .filter((row) => row.total > 0);

  // Best streak: the longest run that ended (or is still going) in the period.
  let best = null;
  for (const habit of habits) {
    const info = streakInfo(habit, doneOf(habit.id), today, weekStart);
    for (const run of info.runs) {
      if (run.end < from || run.end > to) continue;
      const days = info.unit === "week" ? run.length * 7 : run.length;
      if (!best || days > best.days) {
        best = { days, length: run.length, unit: info.unit, habit };
      }
    }
  }

  return {
    ...range,
    done: overall.done,
    total: overall.total,
    pct: percent(overall.done, overall.total),
    bars,
    perHabit,
    best,
    insight: insightFor(
      period,
      habits,
      doneOf,
      from,
      to,
      today,
      weekStart,
      bars,
      perHabit,
    ),
  };
}

function insightFor(
  period,
  habits,
  doneOf,
  from,
  to,
  today,
  weekStart,
  bars,
  perHabit,
) {
  const withData = bars.filter((b) => b.value !== null);
  if (!perHabit.length) {
    return "Check off a few habits and insights will show up here.";
  }

  if (period === "year" || period === "all") {
    const best = withData.reduce(
      (a, b) => (b.value > a.value ? b : a),
      withData[0],
    );
    const unit = period === "year" ? "month" : "quarter";
    let text = `Your best ${unit} so far is ${best.label} (${best.value}%).`;
    if (withData.length >= 2) {
      const change = withData.at(-1).value - withData[0].value;
      if (change !== 0) {
        text += ` That's ${change > 0 ? "up" : "down"} ${Math.abs(change)} points since ${withData[0].label}.`;
      }
    }
    return text;
  }

  // Week or month: the weakest weekday and the most skipped habit.
  const byWeekday = Array.from({ length: 7 }, () => ({ done: 0, total: 0 }));
  for (const key of eachDay(from, minKey(to, today))) {
    const { done, total } = dayStatus(habits, doneOf, key, weekStart);
    // An unfinished today isn't a weak day yet.
    if (key === today && done < total) continue;
    byWeekday[weekday(key)].done += done;
    byWeekday[weekday(key)].total += total;
  }
  const days = weekdayOrder(weekStart)
    .map((d) => ({ d, pct: percent(byWeekday[d].done, byWeekday[d].total) }))
    .filter((x) => x.pct !== null);
  const parts = [];
  if (days.length >= 2) {
    const weakest = days.reduce((a, b) => (b.pct < a.pct ? b : a));
    if (weakest.pct < 100) {
      parts.push(
        `Your weakest day ${period === "week" ? "this week" : "this month"} was ${WEEKDAY_LONG[weakest.d]} (${weakest.pct}%).`,
      );
    }
  }
  const missed = perHabit
    .filter((row) => row.total >= 2 && row.pct < 100)
    .reduce((a, b) => (!a || b.pct < a.pct ? b : a), null);
  if (missed) parts.push(`Most often skipped: ${missed.habit.name}.`);
  if (!parts.length) return "Nothing missed so far. Keep it going.";
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Labels and export
// ---------------------------------------------------------------------------

export function scheduleLabel(habit) {
  if (habit.frequency === "weekly") return `${habit.target || 1}× a week`;
  if (habit.frequency === "days") {
    const days = [...(habit.days || [])].sort();
    if (days.length === 7) return "Every day";
    if (days.length === 5 && days.every((d) => d < 5)) return "Weekdays";
    if (days.length === 2 && days[0] === 5 && days[1] === 6) return "Weekends";
    return days.map((d) => WEEKDAY_SHORT[d]).join(", ");
  }
  return "Every day";
}

/** Sorted by the user's order, then creation. */
export function sortHabits(habits) {
  return [...habits].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      String(a.created).localeCompare(String(b.created)),
  );
}

// ---------------------------------------------------------------------------
// Pauses
// ---------------------------------------------------------------------------
// A pause is { from, to }: both days are paused; `to` is null for a pause
// with no end yet. Pauses may lie in the past, run today or be planned ahead.

/** Sorted by start, with overlapping or back-to-back pauses joined into one. */
export function mergePauses(pauses) {
  const sorted = (pauses || [])
    .map((p) => ({ from: p.from, to: p.to ?? null }))
    .sort((a, b) => a.from.localeCompare(b.from));
  const merged = [];
  for (const pause of sorted) {
    const last = merged.at(-1);
    if (last && (last.to === null || addDays(last.to, 1) >= pause.from)) {
      if (last.to !== null) {
        last.to = pause.to === null ? null : maxKey(last.to, pause.to);
      }
    } else {
      merged.push(pause);
    }
  }
  return merged;
}

const runsOn = (pause, key) =>
  pause.from <= key && (!pause.to || key <= pause.to);

/** Pause starting today, until resumed. Returns the new pauses array. */
export function pausedFrom(habit, today) {
  return mergePauses([...(habit.pauses || []), { from: today, to: null }]);
}

/**
 * Ends the pause running today: it stops yesterday, or goes away if it only
 * started today. Planned pauses stay.
 */
export function resumedOn(habit, today) {
  const yesterday = addDays(today, -1);
  return (habit.pauses || []).flatMap((p) => {
    if (!runsOn(p, today)) return [p];
    return p.from > yesterday ? [] : [{ from: p.from, to: yesterday }];
  });
}

/** Restoring an archived habit keeps its streak: the archived days become a pause. */
export function restoredOn(habit, today) {
  const yesterday = addDays(today, -1);
  const pauses = [...(habit.pauses || [])];
  if (habit.archived_on && habit.archived_on <= yesterday) {
    pauses.push({ from: habit.archived_on, to: yesterday });
  }
  return mergePauses(pauses);
}

/**
 * Adds a planned pause from `from` to `to` (both paused). It can't start in
 * the past. If it starts today and today is already checked off, it starts
 * tomorrow instead, so a done day never disappears.
 * Returns { pauses, from } or { error }.
 */
export function planPause(habit, { from, to }, today, doneToday = false) {
  if (!from || !to) return { error: "Pick the first and the last day." };
  if (from < today) return { error: "A pause can't start in the past." };
  if (to < from) return { error: "The last day can't be before the first." };
  const start = from === today && doneToday ? addDays(today, 1) : from;
  if (start > to) {
    return {
      error: "Today is already checked off, so there's nothing to pause.",
    };
  }
  return {
    pauses: mergePauses([...(habit.pauses || []), { from: start, to }]),
    from: start,
  };
}

/**
 * Removes a running or planned pause. The days of a running pause that are
 * already over stay paused, so past statistics don't change.
 */
export function removePause(habit, pause, today) {
  return (habit.pauses || []).flatMap((p) => {
    if (p.from !== pause.from || (p.to ?? null) !== (pause.to ?? null)) {
      return [p];
    }
    return p.from < today ? [{ from: p.from, to: addDays(today, -1) }] : [];
  });
}

/** The pauses from today on (running or planned), cut to start today at the earliest. */
export function pausesFrom(habit, today) {
  return mergePauses(
    (habit.pauses || [])
      .filter((p) => !p.to || p.to >= today)
      .map((p) => ({ from: maxKey(p.from, today), to: p.to ?? null })),
  );
}

const shortDate = (key) => formatKey(key, { month: "short", day: "numeric" });
const fullDate = (key) =>
  formatKey(key, { month: "short", day: "numeric", year: "numeric" });

/** "Nov 2 – 8, 2026"-style range: the year once, at the end. */
export function pauseRange({ from, to }) {
  if (!to) return `From ${fullDate(from)}`;
  if (from === to) return fullDate(from);
  if (from.slice(0, 4) !== to.slice(0, 4)) {
    return `${fullDate(from)} – ${fullDate(to)}`;
  }
  return `${shortDate(from)} – ${fullDate(to)}`;
}

/**
 * The running and planned pauses for a habit's page, soonest first:
 * [{ from, to, now, label }].
 */
export function pauseList(habit, today) {
  return mergePauses(habit.pauses)
    .filter((p) => !p.to || p.to >= today)
    .map((p) => {
      const now = p.from <= today;
      // A pause of a single day is a skipped day.
      const skip = p.from === p.to;
      let label;
      if (skip) {
        label = now ? "Skipped today" : `Skipped on ${fullDate(p.from)}`;
      } else if (now) {
        label = p.to
          ? `Now, until ${fullDate(p.to)}`
          : `Since ${fullDate(p.from)}, until you resume`;
      } else {
        label = pauseRange(p);
      }
      return { ...p, now, skip, label };
    });
}

/** The next planned pause that hasn't started yet, if any. */
export function nextPause(habit, today) {
  return mergePauses(habit.pauses).find((p) => p.from > today) ?? null;
}

// ---------------------------------------------------------------------------
// Skipping a day
// ---------------------------------------------------------------------------
// Skipping a habit on a day ("sick day") is a pause of that one day, so it
// never counts and never breaks the streak, like any paused day.

/**
 * Whether the habit would be on the day's list if it weren't paused: started,
 * not archived yet, and on one of its days.
 */
export function wouldBeScheduledOn(habit, key) {
  if (key < habit.start_date) return false;
  if (habit.archived_on && key >= habit.archived_on) return false;
  if (habit.frequency === "days") {
    return (habit.days || []).includes(weekday(key));
  }
  return true;
}

/** A day that can be skipped: the habit is due, and it isn't checked off. */
export function canSkip(habit, done, key) {
  return isScheduledOn(habit, key) && !done.has(key);
}

/** Pauses with `key` skipped. */
export function skipDay(habit, key) {
  if (isPausedOn(habit, key)) return habit.pauses || [];
  return mergePauses([...(habit.pauses || []), { from: key, to: key }]);
}

/**
 * Pauses with `key` no longer paused. A longer pause around it is split in
 * two, so only that day changes.
 */
export function unskipDay(habit, key) {
  return mergePauses(
    (habit.pauses || []).flatMap((p) => {
      if (!(p.from <= key && (!p.to || key <= p.to))) return [p];
      const parts = [];
      if (p.from < key) parts.push({ from: p.from, to: addDays(key, -1) });
      if (!p.to || p.to > key)
        parts.push({ from: addDays(key, 1), to: p.to ?? null });
      return parts;
    }),
  );
}

/** True if `key` is a skipped day: a pause of just that day. */
export function isSkippedOn(habit, key) {
  return (habit.pauses || []).some((p) => p.from === key && p.to === key);
}
