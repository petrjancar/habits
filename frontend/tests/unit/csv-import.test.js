import { describe, expect, it } from "vitest";
import {
  parseCsv,
  parseDate,
  parseSchedule,
  planImport,
} from "../../src/lib/csv-import.js";
import { scheduleLabel, toCsv } from "../../src/lib/habits.js";

const TODAY = "2026-10-25";

const habit = (props = {}) => ({
  id: "h1",
  name: "Read",
  color: "pine",
  frequency: "daily",
  days: [],
  target: 1,
  start_date: "2026-10-01",
  pauses: [],
  archived_on: "",
  sort_order: 1,
  ...props,
});

const noCheckins = () => new Map();

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, a BOM and blank lines", () => {
    const text = '﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n"multi\nline",z\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["multi\nline", "z"],
    ]);
  });

  it("detects semicolon-separated files", () => {
    expect(parseCsv("habit;done_on\nRead;2026-10-01")).toEqual([
      ["habit", "done_on"],
      ["Read", "2026-10-01"],
    ]);
  });
});

describe("parseDate", () => {
  it("accepts ISO and day.month.year dates", () => {
    expect(parseDate("2026-10-05")).toBe("2026-10-05");
    expect(parseDate("2026-1-5")).toBe("2026-01-05");
    expect(parseDate("2026-10-05T08:00:00Z")).toBe("2026-10-05");
    expect(parseDate("5.10.2026")).toBe("2026-10-05");
    expect(parseDate("5. 10. 2026")).toBe("2026-10-05");
  });

  it("rejects anything else", () => {
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("10/05/2026")).toBeNull();
    expect(parseDate("yesterday")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("parseSchedule", () => {
  it("reads back every label the export writes", () => {
    const habits = [
      { frequency: "daily" },
      { frequency: "days", days: [0, 2, 4] },
      { frequency: "days", days: [0, 1, 2, 3, 4] },
      { frequency: "days", days: [5, 6] },
      { frequency: "weekly", target: 3 },
    ];
    for (const h of habits) {
      const parsed = parseSchedule(scheduleLabel(h));
      expect(scheduleLabel(parsed)).toBe(scheduleLabel(h));
    }
  });

  it("falls back to every day", () => {
    expect(parseSchedule("")).toMatchObject({ frequency: "daily" });
    expect(parseSchedule("whenever")).toMatchObject({ frequency: "daily" });
    expect(parseSchedule("3 times a week")).toMatchObject({
      frequency: "weekly",
      target: 3,
    });
  });
});

describe("planImport", () => {
  it("round-trips an export into new habits", () => {
    const source = [
      habit({ id: "a", name: "Read", start_date: "2026-09-01" }),
      habit({
        id: "b",
        name: "Gym, weights",
        frequency: "days",
        days: [0, 3],
        sort_order: 2,
      }),
      habit({
        id: "c",
        name: "Swim",
        frequency: "weekly",
        target: 2,
        archived_on: "2026-10-10",
        sort_order: 3,
      }),
    ];
    const done = {
      a: new Map([
        ["2026-10-01", "x"],
        ["2026-10-02", "y"],
      ]),
      b: new Map(),
      c: new Map([["2026-10-05", "z"]]),
    };
    const csv = toCsv(source, (id) => done[id]);

    const plan = planImport(csv, [], noCheckins, TODAY);
    expect(plan.counts).toEqual({
      newHabits: 3,
      existingHabits: 0,
      checkins: 3,
      duplicates: 0,
      problems: 0,
    });
    const [read, gym, swim] = plan.newHabits;
    expect(read).toMatchObject({
      name: "Read",
      frequency: "daily",
      start_date: "2026-09-01",
      dates: ["2026-10-01", "2026-10-02"],
      archived_on: "",
      pauses: [],
    });
    expect(gym).toMatchObject({
      name: "Gym, weights",
      frequency: "days",
      days: [0, 3],
      dates: [],
    });
    expect(swim).toMatchObject({
      frequency: "weekly",
      target: 2,
      archived_on: "2026-10-06",
    });
    expect(read.color).toBe("pine");
  });

  it("uses colours and notes from the file, otherwise spreads colours out", () => {
    const csv = [
      "habit,color,note,done_on",
      "Read,plum,Before bed,2026-10-01",
      "Run,,,2026-10-01",
      "Swim,nope,,2026-10-01",
    ].join("\n");
    const [read, run, swim] = planImport(csv, [], noCheckins, TODAY).newHabits;
    expect(read).toMatchObject({ color: "plum", note: "Before bed" });
    expect(run.color).not.toBe(swim.color);
  });

  it("adds to an existing habit with the same name and skips duplicates", () => {
    const existing = habit({ name: "Read", start_date: "2026-10-03" });
    const done = new Map([["2026-10-04", "x"]]);
    const csv = "Habit,Date\n read ,2026-10-01\nREAD,2026-10-04\n";

    const plan = planImport(csv, [existing], () => done, TODAY);
    expect(plan.newHabits).toEqual([]);
    expect(plan.existing).toEqual([
      { habit: existing, startDate: "2026-10-01", dates: ["2026-10-01"] },
    ]);
    expect(plan.counts).toMatchObject({ checkins: 1, duplicates: 1 });
  });

  it("starts a new habit at its first check-in and can pause it", () => {
    const csv = "habit,status,done_on\nRun,paused,2026-10-20\nRun,,2026-10-12";
    const [run] = planImport(csv, [], noCheckins, TODAY).newHabits;
    expect(run.start_date).toBe("2026-10-12");
    expect(run.dates).toEqual(["2026-10-12", "2026-10-20"]);
    expect(run.pauses).toEqual([{ from: "2026-10-21", to: null }]);
  });

  it("reports rows it can't use", () => {
    const csv = [
      "habit,done_on",
      ",2026-10-01",
      "Read,31.2.2026",
      "Read,2026-12-01",
      "Read,2026-10-01",
    ].join("\n");
    const plan = planImport(csv, [], noCheckins, TODAY);
    expect(plan.counts).toMatchObject({
      newHabits: 1,
      checkins: 1,
      problems: 3,
    });
    expect(plan.problems).toEqual([
      "Line 2: no habit name, skipped.",
      'Line 3: "31.2.2026" isn\'t a date, skipped.',
      "Line 4: 2026-12-01 is in the future, skipped.",
    ]);
  });

  it("refuses files without the needed columns", () => {
    expect(planImport("", [], noCheckins, TODAY).error).toMatch(/empty/);
    expect(planImport("foo,bar\n1,2", [], noCheckins, TODAY).error).toMatch(
      /"habit" column/,
    );
    expect(planImport("habit,date\n", [], noCheckins, TODAY).error).toMatch(
      /no habits/,
    );
  });
});
