// Calendar days as "YYYY-MM-DD" keys in the user's local calendar.
// Arithmetic runs in UTC, so daylight-saving changes never skip or repeat a day.

const DAY_MS = 86_400_000;

const pad = (n) => String(n).padStart(2, "0");

const fromUTC = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const toUTC = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Today's key in local time. */
export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(key, days) {
  return fromUTC(new Date(toUTC(key).getTime() + days * DAY_MS));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekday(key) {
  return (toUTC(key).getUTCDay() + 6) % 7;
}

/** First day of the week containing `key`; weeks start on "monday" or "sunday". */
export function startOfWeek(key, weekStart = "monday") {
  const offset = weekStart === "sunday" ? (weekday(key) + 1) % 7 : weekday(key);
  return addDays(key, -offset);
}

export function startOfMonth(key) {
  return `${key.slice(0, 7)}-01`;
}

export function endOfMonth(key) {
  const date = toUTC(startOfMonth(key));
  return fromUTC(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)),
  );
}

export function addMonths(key, months) {
  const date = toUTC(startOfMonth(key));
  return fromUTC(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)),
  );
}

/** Every key from `from` to `to`, inclusive. */
export function eachDay(from, to) {
  const days = [];
  for (let key = from; key <= to; key = addDays(key, 1)) {
    days.push(key);
  }
  return days;
}

export const minKey = (a, b) => (a < b ? a : b);
export const maxKey = (a, b) => (a > b ? a : b);

/** Formats a key with Intl options, e.g. { month: "long", day: "numeric" }. */
export function formatKey(key, options, locale = "en-US") {
  return toUTC(key).toLocaleDateString(locale, { ...options, timeZone: "UTC" });
}

/** Weekday names in display order for the given week start. */
export function weekdayOrder(weekStart = "monday") {
  return weekStart === "sunday" ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
}

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
