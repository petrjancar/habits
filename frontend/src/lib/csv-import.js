// Reading a CSV file into an import plan. Pure functions, no network.
//
// The expected format is the one "Export data" writes:
//   habit, schedule, started, status, color, note, done_on
// Only "habit" and "done_on" are required, so a hand-made sheet with just a
// habit name and a date per row works too. Column names are matched loosely
// ("name" / "date" are accepted) and comma or semicolon separated files both
// work (Excel saves with semicolons in many European locales).
//
// Importing only adds: habits are matched by name (ignoring case), check-ins
// that already exist are skipped, so importing the same file twice is safe.

import { HABIT_COLORS } from "./habits.js";
import { WEEKDAY_SHORT, addDays, maxKey, minKey } from "./dates.js";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const NAME_MAX = 80;
const MAX_PROBLEMS = 5;

/** Splits CSV text into rows of cells (RFC 4180 quoting, either line ending). */
export function parseCsv(text) {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.slice(0, source.search(/\r?\n|$/));
  const delimiter =
    (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length
      ? ";"
      : ",";

  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Drop blank lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const pad = (n) => String(n).padStart(2, "0");

/** "2026-10-26", "2026-10-26T…" or "26.10.2026" -> "2026-10-26"; else null. */
export function parseDate(value) {
  const text = String(value ?? "").trim();
  let y, m, d;
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (match) {
    [, y, m, d] = match.map(Number);
  } else if ((match = text.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/))) {
    [, d, m, y] = match.map(Number);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return `${y}-${pad(m)}-${pad(d)}`;
}

const DAY_NAMES = WEEKDAY_SHORT.map((d) => d.toLowerCase());

/** The inverse of scheduleLabel(). Anything unrecognised means every day. */
export function parseSchedule(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  const weekly = text.match(/^(\d)\s*(?:×|x|times)\s*(?:a|per)\s*week$/);
  if (weekly) {
    const target = Math.min(7, Math.max(1, Number(weekly[1])));
    return { frequency: "weekly", days: [], target };
  }
  if (text === "weekdays") {
    return { frequency: "days", days: [0, 1, 2, 3, 4], target: 1 };
  }
  if (text === "weekends") {
    return { frequency: "days", days: [5, 6], target: 1 };
  }
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const days = parts.map((p) => DAY_NAMES.indexOf(p.slice(0, 3)));
  if (parts.length && days.every((d) => d >= 0)) {
    const unique = [...new Set(days)].sort();
    if (unique.length < 7) {
      return { frequency: "days", days: unique, target: 1 };
    }
  }
  return { frequency: "daily", days: [], target: 1 };
}

const COLUMN_NAMES = {
  habit: ["habit", "name", "habit name"],
  schedule: ["schedule", "frequency"],
  started: ["started", "start", "start date", "start_date"],
  status: ["status"],
  color: ["color", "colour"],
  note: ["note", "notes"],
  date: ["done_on", "done on", "date", "day"],
};

function findColumns(header) {
  const names = header.map((h) => h.trim().toLowerCase());
  const columns = {};
  for (const [key, aliases] of Object.entries(COLUMN_NAMES)) {
    const index = names.findIndex((n) => aliases.includes(n));
    if (index >= 0) columns[key] = index;
  }
  return columns;
}

const normalName = (name) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Works out what importing `text` would change.
 * Returns { error } when the file can't be used at all, otherwise
 * { newHabits, existing, counts, problems } (see README "CSV import").
 */
export function planImport(text, habits, doneOf, today) {
  const rows = parseCsv(text);
  if (!rows.length) return { error: "The file is empty." };

  const columns = findColumns(rows[0]);
  if (columns.habit === undefined || columns.date === undefined) {
    return {
      error:
        'The file needs a "habit" column and a "done_on" (or "date") column. Use a file from Export data as a template.',
    };
  }

  const problems = [];
  let problemCount = 0;
  const problem = (line, message) => {
    problemCount++;
    if (problems.length < MAX_PROBLEMS)
      problems.push(`Line ${line}: ${message}`);
  };
  const cell = (row, key) =>
    columns[key] === undefined ? "" : (row[columns[key]] ?? "").trim();

  // Group the rows by habit name.
  const groups = new Map();
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const name = cell(row, "habit").replace(/\s+/g, " ").slice(0, NAME_MAX);
    if (!name) {
      problem(line, "no habit name, skipped.");
      return;
    }
    const key = normalName(name);
    if (!groups.has(key)) {
      groups.set(key, {
        name,
        schedule: "",
        started: "",
        status: "",
        color: "",
        note: "",
        dates: new Set(),
      });
    }
    const group = groups.get(key);
    for (const field of ["schedule", "started", "status", "color", "note"]) {
      if (!group[field]) group[field] = cell(row, field);
    }
    const rawDate = cell(row, "date");
    if (!rawDate) return;
    const date = parseDate(rawDate);
    if (!date) {
      problem(line, `"${rawDate}" isn't a date, skipped.`);
    } else if (date > today) {
      problem(line, `${date} is in the future, skipped.`);
    } else {
      group.dates.add(date);
    }
  });

  if (!groups.size) {
    return { error: "The file has no habits in it." };
  }

  const byName = new Map();
  for (const habit of habits) {
    const key = normalName(habit.name);
    if (!byName.has(key)) byName.set(key, habit);
  }

  const newHabits = [];
  const existing = [];
  let checkins = 0;
  let duplicates = 0;
  let colorIndex = habits.length;

  for (const [key, group] of groups) {
    const dates = [...group.dates].sort();
    const habit = byName.get(key);

    if (habit) {
      const done = doneOf(habit.id);
      const fresh = dates.filter((d) => !done.has(d));
      duplicates += dates.length - fresh.length;
      if (!fresh.length) continue;
      checkins += fresh.length;
      // Move the start back so the imported days count.
      const startDate =
        fresh[0] < habit.start_date ? fresh[0] : habit.start_date;
      existing.push({ habit, startDate, dates: fresh });
      continue;
    }

    const started = parseDate(group.started);
    const startDate = [started, dates[0]].filter(Boolean).reduce(minKey, today);
    // Paused or archived from the day after the last check-in.
    const stopFrom = minKey(
      today,
      maxKey(startDate, dates.length ? addDays(dates.at(-1), 1) : startDate),
    );
    const status = group.status.toLowerCase();
    const color = group.color.toLowerCase();
    checkins += dates.length;
    newHabits.push({
      name: group.name,
      // A known colour from the file, otherwise the next one in turn.
      color: HABIT_COLORS.some((c) => c.key === color)
        ? color
        : HABIT_COLORS[colorIndex++ % HABIT_COLORS.length].key,
      ...parseSchedule(group.schedule),
      note: group.note.slice(0, 1000),
      start_date: startDate,
      pauses: status === "paused" ? [{ from: stopFrom, to: null }] : [],
      archived_on: status === "archived" ? stopFrom : "",
      dates,
    });
  }

  return {
    newHabits,
    existing,
    counts: {
      newHabits: newHabits.length,
      existingHabits: existing.length,
      checkins,
      duplicates,
      problems: problemCount,
    },
    problems,
  };
}
