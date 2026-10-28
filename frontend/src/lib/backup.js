// Backup files: everything about the habits in one JSON file, and a plan for
// importing one. Pure functions, no network.
//
// A backup looks like this (see docs/how-it-works.md, "Backup and restore"):
//
//   {
//     "format": "habits-backup",
//     "version": 1,
//     "app_version": "2.0.0",
//     "exported_at": "2026-10-28T13:14:00.000Z",
//     "habits": [
//       {
//         "name": "Read", "color": "plum",
//         "frequency": "days", "days": [0, 2, 4], "target": 1,
//         "note": "", "start_date": "2026-09-01", "archived_on": "",
//         "pauses": [{ "from": "2026-11-02", "to": "2026-11-08" }],
//         "checkins": ["2026-09-01", "2026-09-03"]
//       }
//     ]
//   }
//
// "version" goes up only when old apps can't read new files correctly; new,
// optional fields don't need a new version (older apps ignore them).
//
// Importing only adds: habits are matched by name (ignoring case), check-ins
// and pauses that already exist are skipped, so importing a file twice is safe.

import { HABIT_COLORS, mergePauses, sortHabits } from "./habits.js";
import { isDateKey, maxKey, minKey } from "./dates.js";

export const BACKUP_FORMAT = "habits-backup";
export const BACKUP_VERSION = 1;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const NAME_MAX = 80;
const NOTE_MAX = 1000;
const MAX_PROBLEMS = 5;
const FREQUENCIES = ["daily", "days", "weekly"];

const normalName = (name) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** The backup of `habits` as an object; JSON.stringify it to save. */
export function buildBackup(
  habits,
  doneOf,
  { appVersion = "", now = new Date() } = {},
) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app_version: appVersion,
    exported_at: now.toISOString(),
    habits: sortHabits(habits).map((h) => ({
      name: h.name,
      color: h.color,
      frequency: h.frequency,
      days: h.days || [],
      target: h.target || 1,
      note: h.note || "",
      start_date: h.start_date,
      archived_on: h.archived_on || "",
      pauses: mergePauses(h.pauses),
      checkins: [...doneOf(h.id).keys()].sort(),
    })),
  };
}

/** "habits-backup-2026-10-28.json" */
export const backupFileName = (today) => `habits-backup-${today}.json`;

/**
 * Reads one habit from a backup into the fields a habit record needs, or
 * returns { error } when it can't be used. Small problems (a bad date, an
 * unknown colour) are fixed and reported through `problem`.
 */
function readHabit(raw, today, problem) {
  if (!raw || typeof raw !== "object") return { error: "isn't a habit" };
  const name =
    typeof raw.name === "string" ? raw.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return { error: "has no name" };
  const label = `"${name.slice(0, NAME_MAX)}"`;

  let frequency = FREQUENCIES.includes(raw.frequency) ? raw.frequency : "daily";
  const days = Array.isArray(raw.days)
    ? [
        ...new Set(
          raw.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        ),
      ].sort()
    : [];
  if (frequency === "days" && !days.length) frequency = "daily";
  const target = Number.isInteger(raw.target)
    ? Math.min(7, Math.max(1, raw.target))
    : 1;

  const checkins = [];
  let badDates = 0;
  for (const date of Array.isArray(raw.checkins) ? raw.checkins : []) {
    if (isDateKey(date) && date <= today) checkins.push(date);
    else badDates++;
  }
  if (badDates) {
    problem(
      `${label}: ${badDates} check-in${badDates === 1 ? "" : "s"} with a bad or future date, skipped.`,
    );
  }
  const dates = [...new Set(checkins)].sort();

  const pauses = [];
  let badPauses = 0;
  for (const p of Array.isArray(raw.pauses) ? raw.pauses : []) {
    const to = p?.to ?? null;
    if (
      p &&
      isDateKey(p.from) &&
      (to === null || (isDateKey(to) && to >= p.from))
    ) {
      pauses.push({ from: p.from, to });
    } else {
      badPauses++;
    }
  }
  if (badPauses) {
    problem(
      `${label}: ${badPauses} pause${badPauses === 1 ? "" : "s"} with bad dates, skipped.`,
    );
  }

  const started =
    isDateKey(raw.start_date) && raw.start_date <= today ? raw.start_date : "";
  const color = HABIT_COLORS.some((c) => c.key === raw.color) ? raw.color : "";
  const archived =
    isDateKey(raw.archived_on) && raw.archived_on <= today
      ? raw.archived_on
      : "";

  return {
    name: name.slice(0, NAME_MAX),
    color,
    frequency,
    days: frequency === "days" ? days : [],
    target: frequency === "weekly" ? target : 1,
    note: typeof raw.note === "string" ? raw.note.slice(0, NOTE_MAX) : "",
    start_date: [started, dates[0]].filter(Boolean).reduce(minKey, today),
    archived_on: archived,
    pauses: mergePauses(pauses),
    dates,
  };
}

const samePauses = (a, b) =>
  JSON.stringify(mergePauses(a)) === JSON.stringify(mergePauses(b));

/**
 * Works out what importing the backup in `text` would change.
 * Returns { error } when the file can't be used at all, otherwise
 * { newHabits, existing, counts, problems }, ready for store.importPlan().
 */
export function planBackupImport(text, habits, doneOf, today) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      error: "The file isn't a backup from Habits (it isn't valid JSON).",
    };
  }
  if (!data || data.format !== BACKUP_FORMAT || !Array.isArray(data.habits)) {
    return {
      error:
        "The file isn't a backup from Habits. Use a file from Export data.",
    };
  }
  if (!Number.isInteger(data.version) || data.version > BACKUP_VERSION) {
    return {
      error:
        "This backup was made by a newer version of Habits. Update the app, then import it again.",
    };
  }

  const problems = [];
  let problemCount = 0;
  const problem = (message) => {
    problemCount++;
    if (problems.length < MAX_PROBLEMS) problems.push(message);
  };

  // Read the habits, joining any that share a name.
  const read = new Map();
  data.habits.forEach((raw, i) => {
    const habit = readHabit(raw, today, problem);
    if (habit.error) {
      problem(`Habit ${i + 1} ${habit.error}, skipped.`);
      return;
    }
    const key = normalName(habit.name);
    const same = read.get(key);
    if (!same) {
      read.set(key, habit);
      return;
    }
    problem(`"${habit.name}" is in the file twice; the two were joined.`);
    same.dates = [...new Set([...same.dates, ...habit.dates])].sort();
    same.pauses = mergePauses([...same.pauses, ...habit.pauses]);
    same.start_date = minKey(same.start_date, habit.start_date);
  });
  if (!read.size) return { error: "The file has no habits in it." };

  const byName = new Map();
  for (const habit of habits) {
    const key = normalName(habit.name);
    if (!byName.has(key)) byName.set(key, habit);
  }

  const newHabits = [];
  const existing = [];
  let checkins = 0;
  let duplicates = 0;
  let pausesAdded = 0;
  let colorIndex = habits.length;

  for (const [key, item] of read) {
    const habit = byName.get(key);
    if (habit) {
      // Only adds: new check-ins and pauses; the habit's own settings stay.
      const done = doneOf(habit.id);
      const fresh = item.dates.filter((d) => !done.has(d));
      duplicates += item.dates.length - fresh.length;
      const pauses = mergePauses([...(habit.pauses || []), ...item.pauses]);
      const newPauses = !samePauses(pauses, habit.pauses || []);
      // Move the start back so the imported days count.
      const startDate = [habit.start_date, item.start_date, fresh[0]]
        .filter(Boolean)
        .reduce(minKey);
      if (!fresh.length && !newPauses && startDate === habit.start_date)
        continue;
      checkins += fresh.length;
      if (newPauses) pausesAdded++;
      existing.push({
        habit,
        startDate,
        dates: fresh,
        ...(newPauses ? { pauses } : {}),
      });
      continue;
    }

    checkins += item.dates.length;
    if (item.pauses.length) pausesAdded++;
    const { dates, color, ...fields } = item;
    newHabits.push({
      ...fields,
      // The colour from the file, otherwise the next one in turn.
      color: color || HABIT_COLORS[colorIndex++ % HABIT_COLORS.length].key,
      // An archived habit can't have been archived before it started.
      archived_on: fields.archived_on
        ? maxKey(fields.archived_on, fields.start_date)
        : "",
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
      pauses: pausesAdded,
      problems: problemCount,
    },
    problems,
  };
}
