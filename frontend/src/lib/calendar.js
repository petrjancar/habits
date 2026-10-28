// Grids for the calendar popover (components/calendar.js): a month of days
// and a year of months. Pure functions over "YYYY-MM-DD" keys.

import {
  addDays,
  addMonths,
  endOfMonth,
  formatKey,
  startOfMonth,
  startOfWeek,
  weekdayOrder,
  WEEKDAY_SHORT,
} from "./dates.js";

/** Rows in the day view. Always six, so the popover keeps its height. */
export const GRID_DAYS = 42;

/**
 * The days shown for `month`: six full weeks starting on the week start, so
 * the end of the previous month and the start of the next one fill the gaps.
 */
export function monthGrid(month, weekStart = "monday") {
  const first = startOfWeek(startOfMonth(month), weekStart);
  const inMonth = month.slice(0, 7);
  return Array.from({ length: GRID_DAYS }, (_, i) => {
    const key = addDays(first, i);
    return {
      key,
      num: Number(key.slice(8)),
      outside: key.slice(0, 7) !== inMonth,
    };
  });
}

/** Short weekday names in display order, e.g. Mon ... Sun. */
export const weekdayHeads = (weekStart = "monday") =>
  weekdayOrder(weekStart).map((d) => WEEKDAY_SHORT[d]);

/** The twelve months of `year` as month keys ("2026-01-01" ...). */
export function yearGrid(year) {
  return Array.from({ length: 12 }, (_, i) => ({
    key: `${year}-${String(i + 1).padStart(2, "0")}-01`,
    label: formatKey(`${year}-${String(i + 1).padStart(2, "0")}-01`, {
      month: "short",
    }),
  }));
}

/** The same day of the month in another month, kept within that month. */
export function sameDayIn(month, key) {
  const last = Number(endOfMonth(month).slice(8));
  const day = Math.min(Number(key.slice(8)), last);
  return `${month.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

/**
 * Where a key moves in the day view: arrows by a day or a week, Home / End to
 * the start or end of the week, Page Up / Down by a month (Shift: a year).
 * Returns null for other keys.
 */
export function moveDay(key, event, weekStart = "monday") {
  const shift = event.shiftKey ? 12 : 1;
  switch (event.key) {
    case "ArrowLeft":
      return addDays(key, -1);
    case "ArrowRight":
      return addDays(key, 1);
    case "ArrowUp":
      return addDays(key, -7);
    case "ArrowDown":
      return addDays(key, 7);
    case "Home":
      return startOfWeek(key, weekStart);
    case "End":
      return addDays(startOfWeek(key, weekStart), 6);
    case "PageUp":
      return sameDayIn(addMonths(key, -shift), key);
    case "PageDown":
      return sameDayIn(addMonths(key, shift), key);
    default:
      return null;
  }
}

/**
 * Where a month moves in the month view (four columns): arrows by one month or
 * one row, Page Up / Down by a year. Returns null for other keys.
 */
export function moveMonth(month, event) {
  const by = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -4,
    ArrowDown: 4,
    PageUp: -12,
    PageDown: 12,
  }[event.key];
  return by === undefined ? null : addMonths(month, by);
}

/** "Wednesday, October 28, 2026" for screen readers. */
export const longDate = (key) =>
  formatKey(key, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
