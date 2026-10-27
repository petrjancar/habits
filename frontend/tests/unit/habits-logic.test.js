import { describe, expect, it } from "vitest";
import { addDays, eachDay } from "../../src/lib/dates.js";
import {
  completion,
  dayStatus,
  heatLevel,
  heatmap,
  isScheduledOn,
  periodStats,
  restoredOn,
  resumedOn,
  scheduleLabel,
  streakInfo,
  toCsv,
  weekProgress,
} from "../../src/lib/habits.js";

// Sunday, October 25, 2026
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
  sort_order: 0,
  ...props,
});

const doneSet = (...dates) => new Set(dates);

describe("schedule", () => {
  it("respects start date, chosen weekdays, pauses and archiving", () => {
    const h = habit({
      frequency: "days",
      days: [0, 2, 4], // Mon, Wed, Fri
      pauses: [{ from: "2026-10-12", to: "2026-10-18" }],
      archived_on: "2026-10-23",
    });
    expect(isScheduledOn(h, "2026-09-30")).toBe(false); // before start
    expect(isScheduledOn(h, "2026-10-05")).toBe(true); // Monday
    expect(isScheduledOn(h, "2026-10-06")).toBe(false); // Tuesday
    expect(isScheduledOn(h, "2026-10-14")).toBe(false); // paused
    expect(isScheduledOn(h, "2026-10-21")).toBe(true);
    expect(isScheduledOn(h, "2026-10-23")).toBe(false); // archived
  });

  it("labels schedules", () => {
    expect(scheduleLabel(habit())).toBe("Every day");
    expect(scheduleLabel(habit({ frequency: "days", days: [4, 0, 2] }))).toBe(
      "Mon, Wed, Fri",
    );
    expect(scheduleLabel(habit({ frequency: "days", days: [5, 6] }))).toBe(
      "Weekends",
    );
    expect(scheduleLabel(habit({ frequency: "weekly", target: 3 }))).toBe(
      "3× a week",
    );
  });
});

describe("streakInfo", () => {
  it("counts consecutive done days and ignores an unfinished today", () => {
    const done = doneSet(...eachDay("2026-10-20", "2026-10-24"));
    const info = streakInfo(habit(), done, TODAY);
    expect(info.current).toBe(5);
    expect(info.unit).toBe("day");
  });

  it("includes today once it's done", () => {
    const done = doneSet(...eachDay("2026-10-20", TODAY));
    expect(streakInfo(habit(), done, TODAY).current).toBe(6);
  });

  it("breaks on a missed day and remembers the longest run", () => {
    const done = doneSet(
      ...eachDay("2026-10-01", "2026-10-10"),
      ...eachDay("2026-10-12", "2026-10-24"),
    );
    const info = streakInfo(habit(), done, TODAY);
    expect(info.current).toBe(13);
    expect(info.longest).toBe(13);
    expect(info.runs).toEqual([
      { end: "2026-10-10", length: 10 },
      { end: "2026-10-24", length: 13 },
    ]);
  });

  it("skips days that aren't scheduled", () => {
    const h = habit({ frequency: "days", days: [0, 2, 4] });
    const done = doneSet("2026-10-19", "2026-10-21", "2026-10-23");
    expect(streakInfo(h, done, TODAY).current).toBe(3);
  });

  it("keeps the streak across a pause", () => {
    const h = habit({ pauses: [{ from: "2026-10-15", to: "2026-10-20" }] });
    const done = doneSet(
      ...eachDay("2026-10-10", "2026-10-14"),
      ...eachDay("2026-10-21", "2026-10-24"),
    );
    expect(streakInfo(h, done, TODAY).current).toBe(9);
  });

  it("counts weekly habits in weeks", () => {
    const h = habit({
      frequency: "weekly",
      target: 2,
      start_date: "2026-09-28",
    });
    const done = doneSet(
      "2026-09-29",
      "2026-10-01", // week of Sep 28: met
      "2026-10-06", // week of Oct 5: missed (1 of 2)
      "2026-10-13",
      "2026-10-14", // week of Oct 12: met
      "2026-10-20",
      "2026-10-22", // week of Oct 19: met
    );
    const info = streakInfo(h, done, "2026-10-27");
    expect(info.unit).toBe("week");
    expect(info.current).toBe(2); // the current week is still open
    expect(info.longest).toBe(2);
  });
});

describe("completion", () => {
  it("counts scheduled days and leaves an unfinished today out", () => {
    const done = doneSet("2026-10-20", "2026-10-21", "2026-10-23");
    expect(
      completion(habit(), done, "2026-10-19", "2026-10-25", TODAY),
    ).toEqual({
      done: 3,
      total: 6,
    });
  });

  it("counts weekly habits per finished week, capped at the target", () => {
    const h = habit({
      frequency: "weekly",
      target: 3,
      start_date: "2026-10-05",
    });
    const done = doneSet(
      ...eachDay("2026-10-05", "2026-10-09"), // 5 of 3 -> 3/3
      "2026-10-12", // 1 of 3 -> 1/3
    );
    expect(completion(h, done, "2026-10-05", "2026-10-18", TODAY)).toEqual({
      done: 4,
      total: 6,
    });
  });

  it("reports weekly progress, limited by active days", () => {
    const h = habit({
      frequency: "weekly",
      target: 5,
      start_date: "2026-10-23",
    });
    expect(weekProgress(h, doneSet("2026-10-23"), TODAY)).toEqual({
      count: 1,
      target: 3, // only Fri-Sun are active in the first week
    });
  });

  it("treats a weekly habit as done on days its target is met", () => {
    const habits = [
      habit(),
      habit({
        id: "h2",
        frequency: "weekly",
        target: 1,
        start_date: "2026-10-01",
      }),
    ];
    const sets = { h1: doneSet(), h2: doneSet("2026-10-20") };
    const status = dayStatus(habits, (id) => sets[id], "2026-10-22");
    expect(status).toEqual({ done: 1, total: 2 });
  });
});

describe("heatmap", () => {
  it("maps ratios to levels", () => {
    expect(heatLevel(0, 0)).toBe(0);
    expect(heatLevel(0, 4)).toBe(0);
    expect(heatLevel(1, 4)).toBe(1);
    expect(heatLevel(2, 4)).toBe(2);
    expect(heatLevel(3, 4)).toBe(3);
    expect(heatLevel(4, 4)).toBe(4);
  });

  it("lays out weeks in columns, weekdays in rows", () => {
    const sets = { h1: doneSet(TODAY) };
    const { cells, months } = heatmap(
      [habit()],
      (id) => sets[id],
      TODAY,
      "monday",
      4,
    );
    expect(cells).toHaveLength(28);
    expect(months).toHaveLength(4);
    // Last column, Sunday row = today.
    expect(cells[6 * 4 + 3]).toMatchObject({ key: TODAY, level: 4 });
    expect(cells[0].key).toBe("2026-09-28");
  });

  it("labels Mon, Wed and Fri rows, following the week start", () => {
    const labels = (weekStart) =>
      heatmap([habit()], () => new Set(), TODAY, weekStart, 4).weekdays;
    expect(labels("monday")).toEqual(["Mon", "", "Wed", "", "Fri", "", ""]);
    expect(labels("sunday")).toEqual(["", "Mon", "", "Wed", "", "Fri", ""]);
  });
});

describe("periodStats", () => {
  const habits = [
    habit({ id: "a", name: "Read" }),
    habit({ id: "b", name: "Run", frequency: "days", days: [0, 2, 4] }),
  ];
  const sets = {
    a: doneSet(...eachDay("2026-10-01", "2026-10-24")),
    b: doneSet("2026-10-19", "2026-10-21"),
  };
  const doneOf = (id) => sets[id];

  it("summarises the week", () => {
    const stats = periodStats("week", habits, doneOf, TODAY);
    expect(stats.from).toBe("2026-10-19");
    expect(stats.title).toBe("October 19 – 25, 2026");
    expect(stats.bars).toHaveLength(7);
    // Read: 6 of 6 (today pending), Run: 2 of 3
    expect(stats.done).toBe(8);
    expect(stats.total).toBe(9);
    expect(stats.best).toMatchObject({ length: 24, unit: "day" });
    expect(stats.insight).toMatch(/Friday/);
    expect(stats.insight).toMatch(/Most often skipped: Run/);
  });

  it("groups the month by week and the year by month", () => {
    expect(periodStats("month", habits, doneOf, TODAY).bars[0].label).toBe(
      "Oct 1–4",
    );
    const year = periodStats("year", habits, doneOf, TODAY);
    expect(year.bars.map((b) => b.label).at(-1)).toBe("Oct");
    expect(year.bars).toHaveLength(10);
  });

  it("starts all time at the first habit", () => {
    const all = periodStats("all", habits, doneOf, TODAY);
    expect(all.title).toBe("Since October 1, 2026");
    expect(all.bars.map((b) => b.label)).toEqual(["Q4 ’26"]);
  });
});

describe("pausing and archiving", () => {
  it("closes an open pause yesterday, or drops it if it began today", () => {
    expect(
      resumedOn(habit({ pauses: [{ from: "2026-10-20", to: null }] }), TODAY),
    ).toEqual([{ from: "2026-10-20", to: "2026-10-24" }]);
    expect(
      resumedOn(habit({ pauses: [{ from: TODAY, to: null }] }), TODAY),
    ).toEqual([]);
  });

  it("turns the archived days into a pause when restoring", () => {
    expect(restoredOn(habit({ archived_on: "2026-10-20" }), TODAY)).toEqual([
      { from: "2026-10-20", to: addDays(TODAY, -1) },
    ]);
  });
});

it("exports check-ins as CSV", () => {
  const habits = [
    habit({ name: 'Say "hi", daily' }),
    habit({ id: "h2", name: "Run" }),
  ];
  const sets = { h1: doneSet("2026-10-02", "2026-10-01"), h2: doneSet() };
  const csv = toCsv(habits, (id) => sets[id]);
  expect(csv.split("\r\n")).toEqual([
    "habit,schedule,started,status,color,note,done_on",
    '"Say ""hi"", daily",Every day,2026-10-01,active,pine,,2026-10-01',
    '"Say ""hi"", daily",Every day,2026-10-01,active,pine,,2026-10-02',
    "Run,Every day,2026-10-01,active,pine,,",
  ]);
});
