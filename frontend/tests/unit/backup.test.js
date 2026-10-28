import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  backupFileName,
  buildBackup,
  planBackupImport,
} from "../../src/lib/backup.js";

const TODAY = "2026-10-28";

const habit = (props = {}) => ({
  id: "h1",
  name: "Read",
  color: "plum",
  frequency: "daily",
  days: [],
  target: 1,
  note: "",
  start_date: "2026-10-01",
  pauses: [],
  archived_on: "",
  sort_order: 1,
  ...props,
});

const doneOf = (sets) => (id) =>
  new Map((sets[id] || []).map((d) => [d, `c-${d}`]));
const file = (habits, extra = {}) =>
  JSON.stringify({ format: BACKUP_FORMAT, version: 1, habits, ...extra });

describe("exporting a backup", () => {
  it("writes every habit with its settings, pauses and check-ins", () => {
    const habits = [
      habit({
        id: "h2",
        name: "Gym",
        sort_order: 2,
        frequency: "weekly",
        target: 3,
      }),
      habit({
        note: "Before bed",
        pauses: [
          { from: "2026-11-05", to: "2026-11-08" },
          { from: "2026-11-02", to: "2026-11-04" },
        ],
      }),
    ];
    const backup = buildBackup(
      habits,
      doneOf({ h1: ["2026-10-03", "2026-10-02"] }),
      { appVersion: "2.0.0", now: new Date("2026-10-28T12:00:00Z") },
    );

    expect(backup).toMatchObject({
      format: "habits-backup",
      version: 1,
      app_version: "2.0.0",
      exported_at: "2026-10-28T12:00:00.000Z",
    });
    expect(backup.habits).toEqual([
      {
        name: "Read",
        color: "plum",
        frequency: "daily",
        days: [],
        target: 1,
        note: "Before bed",
        start_date: "2026-10-01",
        archived_on: "",
        // Joined: Nov 4 and Nov 5 are next to each other.
        pauses: [{ from: "2026-11-02", to: "2026-11-08" }],
        checkins: ["2026-10-02", "2026-10-03"],
      },
      expect.objectContaining({
        name: "Gym",
        frequency: "weekly",
        target: 3,
        checkins: [],
      }),
    ]);
    expect(backupFileName(TODAY)).toBe("habits-backup-2026-10-28.json");
  });

  it("reads its own export back into an empty account", () => {
    const habits = [
      habit({
        pauses: [{ from: "2026-11-02", to: "2026-11-08" }],
        archived_on: "2026-10-20",
      }),
      habit({
        id: "h2",
        name: "Gym",
        color: "teal",
        frequency: "days",
        days: [0, 3],
        sort_order: 2,
      }),
    ];
    const text = JSON.stringify(
      buildBackup(habits, doneOf({ h1: ["2026-10-02"], h2: ["2026-10-05"] })),
    );

    const plan = planBackupImport(text, [], doneOf({}), TODAY);

    expect(plan.counts).toEqual({
      newHabits: 2,
      existingHabits: 0,
      checkins: 2,
      duplicates: 0,
      pauses: 1,
      problems: 0,
    });
    expect(plan.newHabits).toEqual([
      {
        name: "Read",
        color: "plum",
        frequency: "daily",
        days: [],
        target: 1,
        note: "",
        start_date: "2026-10-01",
        archived_on: "2026-10-20",
        pauses: [{ from: "2026-11-02", to: "2026-11-08" }],
        dates: ["2026-10-02"],
      },
      expect.objectContaining({
        name: "Gym",
        color: "teal",
        days: [0, 3],
        dates: ["2026-10-05"],
      }),
    ]);
  });
});

describe("importing a backup", () => {
  it("refuses files that aren't backups, or come from a newer version", () => {
    const plan = (text) => planBackupImport(text, [], doneOf({}), TODAY);
    expect(plan("habit,done_on\nRead,2026-10-01").error).toMatch(
      /isn't valid JSON/,
    );
    expect(plan('{"habits": []}').error).toMatch(/isn't a backup/);
    expect(plan(file([], { version: 2 })).error).toMatch(/newer version/);
    expect(plan(file([])).error).toMatch(/no habits/);
  });

  it("adds only what's missing to a habit with the same name", () => {
    const current = [
      habit({
        name: "read",
        pauses: [{ from: "2026-10-10", to: "2026-10-11" }],
      }),
    ];
    const text = file([
      {
        name: "Read ",
        color: "teal",
        frequency: "weekly",
        start_date: "2026-09-15",
        pauses: [{ from: "2026-11-02", to: "2026-11-08" }],
        checkins: ["2026-10-02", "2026-10-03"],
      },
    ]);

    const plan = planBackupImport(
      text,
      current,
      doneOf({ h1: ["2026-10-02"] }),
      TODAY,
    );

    expect(plan.newHabits).toEqual([]);
    expect(plan.existing).toEqual([
      {
        habit: current[0],
        // The habit's own colour and schedule stay; the start moves back.
        startDate: "2026-09-15",
        dates: ["2026-10-03"],
        pauses: [
          { from: "2026-10-10", to: "2026-10-11" },
          { from: "2026-11-02", to: "2026-11-08" },
        ],
      },
    ]);
    expect(plan.counts).toMatchObject({
      existingHabits: 1,
      checkins: 1,
      duplicates: 1,
      pauses: 1,
    });
  });

  it("finds nothing to do when the file is already imported", () => {
    const current = [
      habit({ pauses: [{ from: "2026-11-02", to: "2026-11-08" }] }),
    ];
    const text = JSON.stringify(
      buildBackup(current, doneOf({ h1: ["2026-10-02"] })),
    );

    const plan = planBackupImport(
      text,
      current,
      doneOf({ h1: ["2026-10-02"] }),
      TODAY,
    );

    expect(plan.existing).toEqual([]);
    expect(plan.newHabits).toEqual([]);
    expect(plan.counts).toMatchObject({
      checkins: 0,
      duplicates: 1,
      pauses: 0,
    });
  });

  it("fixes or skips bad parts and says so", () => {
    const text = file([
      {
        name: "Read",
        color: "neon",
        frequency: "days",
        days: [9],
        target: 40,
        checkins: ["2026-10-02", "02.10.2026", "2027-01-01", "2026-10-02"],
        pauses: [{ from: "2026-11-08", to: "2026-11-02" }],
        start_date: "nope",
      },
      { color: "plum" },
      "Gym",
      { name: "read", checkins: ["2026-10-05"] },
    ]);

    const plan = planBackupImport(text, [], doneOf({}), TODAY);

    expect(plan.newHabits).toEqual([
      {
        name: "Read",
        // Unknown colour: the next one in turn. "days" without days: daily.
        color: "pine",
        frequency: "daily",
        days: [],
        target: 1,
        note: "",
        start_date: "2026-10-02",
        archived_on: "",
        pauses: [],
        dates: ["2026-10-02", "2026-10-05"],
      },
    ]);
    expect(plan.counts.problems).toBe(5);
    expect(plan.problems).toEqual([
      '"Read": 2 check-ins with a bad or future date, skipped.',
      '"Read": 1 pause with bad dates, skipped.',
      "Habit 2 has no name, skipped.",
      "Habit 3 isn't a habit, skipped.",
      '"read" is in the file twice; the two were joined.',
    ]);
  });

  it("starts a new habit at its first check-in when that's earlier", () => {
    const text = file([
      { name: "Run", start_date: "2026-10-10", checkins: ["2026-10-01"] },
      { name: "Swim", checkins: [] },
    ]);
    const [run, swim] = planBackupImport(text, [], doneOf({}), TODAY).newHabits;
    expect(run.start_date).toBe("2026-10-01");
    expect(swim.start_date).toBe(TODAY);
  });
});
