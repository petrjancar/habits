import { describe, expect, it } from "vitest";
import {
  canSkip,
  isScheduledOn,
  isSkippedOn,
  mergePauses,
  nextPause,
  pauseList,
  pauseRange,
  pausedFrom,
  pausesFrom,
  planPause,
  removePause,
  restoredOn,
  resumedOn,
  skipDay,
  streakInfo,
  unskipDay,
  wouldBeScheduledOn,
} from "../../src/lib/habits.js";

// Wednesday, October 28, 2026
const TODAY = "2026-10-28";

const habit = (pauses = [], props = {}) => ({
  id: "h1",
  name: "Read",
  frequency: "daily",
  days: [],
  target: 1,
  start_date: "2026-10-01",
  archived_on: "",
  pauses,
  ...props,
});

describe("merging pauses", () => {
  it("sorts and joins overlapping and back-to-back pauses", () => {
    expect(
      mergePauses([
        { from: "2026-11-10", to: "2026-11-12" },
        { from: "2026-11-02", to: "2026-11-08" },
        { from: "2026-11-05", to: "2026-11-09" },
        { from: "2026-12-01", to: "2026-12-03" },
      ]),
    ).toEqual([
      // Nov 9 and Nov 10 are next to each other, so these become one.
      { from: "2026-11-02", to: "2026-11-12" },
      { from: "2026-12-01", to: "2026-12-03" },
    ]);
  });

  it("lets a pause with no end take in everything after it", () => {
    expect(
      mergePauses([
        { from: "2026-11-01", to: null },
        { from: "2026-11-05", to: "2026-11-08" },
      ]),
    ).toEqual([{ from: "2026-11-01", to: null }]);
    expect(mergePauses([{ from: "2026-11-01" }])).toEqual([
      { from: "2026-11-01", to: null },
    ]);
  });

  it("doesn't change the pauses it is given", () => {
    const pauses = [
      { from: "2026-11-02", to: "2026-11-04" },
      { from: "2026-11-05", to: "2026-11-06" },
    ];
    mergePauses(pauses);
    expect(pauses[0].to).toBe("2026-11-04");
  });
});

describe("planning a pause", () => {
  it("adds a pause ahead, joined with any it touches", () => {
    const h = habit([{ from: "2026-11-09", to: "2026-11-12" }]);
    expect(
      planPause(h, { from: "2026-11-02", to: "2026-11-08" }, TODAY),
    ).toEqual({
      from: "2026-11-02",
      pauses: [{ from: "2026-11-02", to: "2026-11-12" }],
    });
  });

  it("refuses the past and a last day before the first", () => {
    expect(
      planPause(habit(), { from: "2026-10-27", to: "2026-11-01" }, TODAY).error,
    ).toMatch(/past/);
    expect(
      planPause(habit(), { from: "2026-11-05", to: "2026-11-01" }, TODAY).error,
    ).toMatch(/before the first/);
    expect(planPause(habit(), { from: "", to: "" }, TODAY).error).toMatch(
      /Pick/,
    );
  });

  it("starts tomorrow when today is already checked off", () => {
    expect(
      planPause(habit(), { from: TODAY, to: "2026-11-01" }, TODAY, true),
    ).toEqual({
      from: "2026-10-29",
      pauses: [{ from: "2026-10-29", to: "2026-11-01" }],
    });
    expect(
      planPause(habit(), { from: TODAY, to: TODAY }, TODAY, true).error,
    ).toMatch(/already checked off/);
    // Not checked off: today is paused too.
    expect(
      planPause(habit(), { from: TODAY, to: TODAY }, TODAY).pauses,
    ).toEqual([{ from: TODAY, to: TODAY }]);
  });

  it("hides the habit on planned days and keeps its streak", () => {
    const h = habit([{ from: "2026-10-20", to: "2026-10-22" }]);
    const done = new Set(
      [
        "2026-10-17",
        "2026-10-18",
        "2026-10-19",
        "2026-10-23",
        "2026-10-24",
      ].concat(["2026-10-25", "2026-10-26", "2026-10-27"]),
    );
    expect(isScheduledOn(h, "2026-10-21")).toBe(false);
    expect(streakInfo(h, done, TODAY).current).toBe(8);
  });
});

describe("removing and resuming", () => {
  const planned = { from: "2026-11-04", to: "2026-11-08" };
  const running = { from: "2026-10-20", to: "2026-11-01" };

  it("removes a planned pause completely", () => {
    expect(removePause(habit([running, planned]), planned, TODAY)).toEqual([
      running,
    ]);
  });

  it("keeps the days of a running pause that are already over", () => {
    expect(removePause(habit([running, planned]), running, TODAY)).toEqual([
      { from: "2026-10-20", to: "2026-10-27" },
      planned,
    ]);
    // One that only started today goes away.
    const fromToday = { from: TODAY, to: "2026-11-01" };
    expect(removePause(habit([fromToday]), fromToday, TODAY)).toEqual([]);
  });

  it("resumes from a planned pause that is running, keeping later ones", () => {
    expect(resumedOn(habit([running, planned]), TODAY)).toEqual([
      { from: "2026-10-20", to: "2026-10-27" },
      planned,
    ]);
  });

  it("pausing now joins a planned pause into one open pause", () => {
    expect(pausedFrom(habit([planned]), TODAY)).toEqual([
      { from: TODAY, to: null },
    ]);
  });

  it("keeps planned pauses when an archived habit is restored", () => {
    const h = habit([planned], { archived_on: "2026-10-20" });
    expect(restoredOn(h, TODAY)).toEqual([
      { from: "2026-10-20", to: "2026-10-27" },
      planned,
    ]);
  });

  it("keeps running and planned pauses for a reset, from today on", () => {
    const h = habit([
      { from: "2026-09-01", to: "2026-09-05" },
      running,
      planned,
    ]);
    expect(pausesFrom(h, TODAY)).toEqual([
      { from: TODAY, to: "2026-11-01" },
      planned,
    ]);
  });
});

describe("showing pauses", () => {
  it("writes ranges with the year once", () => {
    expect(pauseRange({ from: "2026-11-02", to: "2026-11-08" })).toBe(
      "Nov 2 – Nov 8, 2026",
    );
    expect(pauseRange({ from: "2026-12-28", to: "2027-01-03" })).toBe(
      "Dec 28, 2026 – Jan 3, 2027",
    );
    expect(pauseRange({ from: "2026-11-02", to: "2026-11-02" })).toBe(
      "Nov 2, 2026",
    );
  });

  it("lists running and planned pauses, not finished ones", () => {
    const h = habit([
      { from: "2026-09-01", to: "2026-09-05" },
      { from: "2026-10-20", to: "2026-11-01" },
      { from: "2026-12-01", to: "2026-12-03" },
    ]);
    expect(pauseList(h, TODAY).map((p) => p.label)).toEqual([
      "Now, until Nov 1, 2026",
      "Dec 1 – Dec 3, 2026",
    ]);
    expect(
      pauseList(habit([{ from: "2026-10-20", to: null }]), TODAY)[0].label,
    ).toBe("Since Oct 20, 2026, until you resume");
    expect(nextPause(h, TODAY)).toEqual({
      from: "2026-12-01",
      to: "2026-12-03",
    });
    expect(nextPause(habit(), TODAY)).toBe(null);
  });
});

describe("skipping a day", () => {
  it("skips a day as a one-day pause, joined with neighbours", () => {
    expect(skipDay(habit(), "2026-10-27")).toEqual([
      { from: "2026-10-27", to: "2026-10-27" },
    ]);
    expect(
      skipDay(habit([{ from: "2026-10-28", to: "2026-11-01" }]), "2026-10-27"),
    ).toEqual([{ from: "2026-10-27", to: "2026-11-01" }]);
    // Already paused: nothing changes.
    const paused = [{ from: "2026-10-20", to: "2026-10-30" }];
    expect(skipDay(habit(paused), "2026-10-25")).toBe(paused);
  });

  it("undoes a skip, splitting a longer pause around the day", () => {
    expect(
      unskipDay(
        habit([{ from: "2026-10-27", to: "2026-10-27" }]),
        "2026-10-27",
      ),
    ).toEqual([]);
    expect(
      unskipDay(
        habit([{ from: "2026-10-20", to: "2026-10-30" }]),
        "2026-10-25",
      ),
    ).toEqual([
      { from: "2026-10-20", to: "2026-10-24" },
      { from: "2026-10-26", to: "2026-10-30" },
    ]);
    expect(
      unskipDay(habit([{ from: "2026-10-20", to: null }]), "2026-10-20"),
    ).toEqual([{ from: "2026-10-21", to: null }]);
  });

  it("only skips days that are due and not done", () => {
    const gym = habit([], { frequency: "days", days: [0, 2] }); // Mon, Wed
    expect(canSkip(gym, new Set(), "2026-10-28")).toBe(true);
    expect(canSkip(gym, new Set(), "2026-10-27")).toBe(false);
    expect(canSkip(gym, new Set(["2026-10-28"]), "2026-10-28")).toBe(false);
    expect(canSkip(gym, new Set(), "2026-09-30")).toBe(false); // before start
  });

  it("knows when a paused habit would otherwise be due", () => {
    const gym = habit([{ from: "2026-10-26", to: "2026-10-30" }], {
      frequency: "days",
      days: [0, 2],
    });
    expect(wouldBeScheduledOn(gym, "2026-10-28")).toBe(true);
    expect(wouldBeScheduledOn(gym, "2026-10-27")).toBe(false);
    expect(
      wouldBeScheduledOn(
        habit([], { archived_on: "2026-10-20" }),
        "2026-10-21",
      ),
    ).toBe(false);
  });

  it("keeps the streak over a skipped day", () => {
    const h = habit([{ from: "2026-10-26", to: "2026-10-26" }]);
    const done = new Set(["2026-10-24", "2026-10-25", "2026-10-27"]);
    expect(isSkippedOn(h, "2026-10-26")).toBe(true);
    expect(streakInfo(h, done, TODAY).current).toBe(3);
  });

  it("labels skipped days apart from longer pauses", () => {
    const h = habit([
      { from: TODAY, to: TODAY },
      { from: "2026-11-05", to: "2026-11-05" },
    ]);
    expect(pauseList(h, TODAY).map((p) => [p.label, p.skip])).toEqual([
      ["Skipped today", true],
      ["Skipped on Nov 5, 2026", true],
    ]);
  });
});
