import { beforeEach, describe, expect, it, vi } from "vitest";
import { scheduledText, todayComponent } from "../../src/pages/today.js";
import { firstDay } from "../../src/lib/habits.js";
import { statsComponent } from "../../src/pages/stats.js";
import { habitsComponent, resetText } from "../../src/pages/habits.js";
import { pb } from "../../src/pb.js";
import { pbError } from "../helpers.js";

vi.mock("../../src/pb.js", () => ({
  pb: {
    authStore: { isValid: true, record: null, onChange: vi.fn() },
    collection: vi.fn(),
  },
}));

// Monday, October 26, 2026
const now = () => new Date(2026, 9, 26, 9, 0);

const habit = (props) => ({
  id: "h1",
  name: "Read",
  color: "pine",
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

/** An in-memory stand-in for data.js's store. */
function fakeStore(habits, checkins = {}) {
  const maps = new Map(
    Object.entries(checkins).map(([id, dates]) => [
      id,
      new Map(dates.map((d) => [d, `c-${d}`])),
    ]),
  );
  const store = {
    habits,
    load: vi.fn(async () => {}),
    loadCached: vi.fn(() => false),
    doneOf: (id) => maps.get(id) ?? new Map(),
    isDone: (id, date) => maps.get(id)?.has(date) ?? false,
    habit: (id) => store.habits.find((h) => h.id === id),
    toggle: vi.fn(async (id, date, onChange) => {
      if (!maps.has(id)) maps.set(id, new Map());
      const m = maps.get(id);
      m.has(date) ? m.delete(date) : m.set(date, "x");
      onChange();
      return true;
    }),
    updateHabit: vi.fn(async (id, data) => {
      store.habits = store.habits.map((h) =>
        h.id === id ? { ...h, ...data } : h,
      );
    }),
    createHabit: vi.fn(async (data) => {
      const record = habit({ ...data, id: "new1" });
      store.habits = [...store.habits, record];
      return record;
    }),
    updateHabits: vi.fn(async (changes) => {
      for (const { id, data } of changes) {
        store.habits = store.habits.map((h) =>
          h.id === id ? { ...h, ...data } : h,
        );
      }
    }),
    deleteHabit: vi.fn(async (id) => {
      store.habits = store.habits.filter((h) => h.id !== id);
    }),
    resetHabit: vi.fn(async (id, today) => {
      const count = maps.get(id)?.size ?? 0;
      maps.delete(id);
      store.habits = store.habits.map((h) =>
        h.id === id ? { ...h, start_date: today, pauses: [] } : h,
      );
      return count;
    }),
    reorder: vi.fn(async () => {}),
  };
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  pb.authStore.isValid = true;
  pb.authStore.record = { id: "user_1", week_start: "monday" };
  window.matchMedia = () => ({ matches: true });
  window.history.replaceState = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("todayComponent", () => {
  it("lists today's habits with streaks and this week's strip", async () => {
    const store = fakeStore(
      [
        habit(),
        habit({ id: "h2", name: "Gym", frequency: "days", days: [1, 3] }),
        habit({ id: "h3", name: "Old", archived_on: "2026-10-10" }),
      ],
      { h1: ["2026-10-24", "2026-10-25"] },
    );
    const page = todayComponent({ store, now });

    await page.init();

    expect(page.items.map((i) => i.name)).toEqual(["Read"]);
    expect(page.items[0].streakText).toBe("2 days");
    // The week starts on Monday, October 26, which is today.
    expect(page.days).toHaveLength(7);
    expect(page.days[0]).toMatchObject({
      key: "2026-10-26",
      selected: true,
      isToday: true,
      upcoming: false,
    });
    expect(page.days.at(-1)).toMatchObject({
      key: "2026-11-01",
      upcoming: true,
    });
    expect(page.weekTitle).toBe("October 2026");
    expect(page.subtitle).toBe("Monday, October 26 · 0 of 1 done");
  });

  it("checks a habit off and updates the summary", async () => {
    const store = fakeStore([habit()]);
    const page = todayComponent({ store, now });
    await page.init();

    await page.toggle(page.items[0]);

    expect(store.toggle).toHaveBeenCalledWith(
      "h1",
      "2026-10-26",
      expect.any(Function),
    );
    expect(page.summary).toMatchObject({
      done: 1,
      total: 1,
      allDone: true,
      pct: 100,
    });
  });

  it("switches to an earlier day", async () => {
    const page = todayComponent({ store: fakeStore([habit()]), now });
    await page.init();

    page.select("2026-10-24");

    expect(page.listTitle).toBe("Habits on this day");
    expect(page.summary.isToday).toBe(false);
  });

  it("shows a weekly habit with time left as optional, outside the score", async () => {
    const gym = habit({
      id: "h2",
      name: "Gym",
      frequency: "weekly",
      target: 2,
    });
    const store = fakeStore([habit(), gym]);
    const page = todayComponent({ store, now });
    await page.init();

    expect(page.items[1]).toMatchObject({
      name: "Gym",
      optional: true,
      sub: "0 of 2 this week · optional\u00a0today",
    });
    expect(page.summary).toMatchObject({
      done: 0,
      total: 1,
      optional: 1,
      weekly: "+1\u00a0weekly",
    });
    expect(page.subtitle).toBe(
      "Monday, October 26 · 0 of 1 done · +1\u00a0weekly",
    );
    expect(page.days[0].aria).toBe(
      "Monday, October 26, today, 0 of 1 done · +1\u00a0weekly",
    );

    // Checking it off counts it for the day.
    await page.toggle(page.items[1]);
    expect(page.items[1]).toMatchObject({
      optional: false,
      sub: "1 of 2 this week",
    });
    expect(page.summary).toMatchObject({ done: 1, total: 2, weekly: "" });
  });

  it("starts at the earliest habit and counts what's scheduled", () => {
    expect(
      firstDay([habit({ start_date: "2026-03-01" }), habit()], "2026-10-26"),
    ).toBe("2026-03-01");
    expect(firstDay([], "2026-10-26")).toBe("2026-10-26");
    expect(scheduledText({ total: 1, optional: 0 })).toBe("1 habit scheduled");
    expect(scheduledText({ total: 2, optional: 1 })).toBe("3 habits scheduled");
    expect(scheduledText({ total: 0, optional: 0 })).toBe("nothing scheduled");
  });

  describe("picking a day", () => {
    it("opens the day in the address", async () => {
      window.location.href = "/?date=2026-10-12";
      const page = todayComponent({ store: fakeStore([habit()]), now });
      await page.init();

      expect(page.selected).toBe("2026-10-12");
      expect(page.days[0].key).toBe("2026-10-12");
      expect(page.listTitle).toBe("Habits on this day");
    });

    it("goes to any day, before the first habit or years ahead", async () => {
      window.location.href = "/?date=2020-01-01";
      const page = todayComponent({ store: fakeStore([habit()]), now });
      await page.init();
      expect(page.selected).toBe("2020-01-01");
      expect(page.items).toEqual([]);
      expect(page.emptyText).toBe("None of your habits had started yet.");

      page.select("2030-01-01");
      expect(page.selected).toBe("2030-01-01");
      expect(page.items.map((i) => i.name)).toEqual(["Read"]);
      expect(page.emptyText).toBe("Nothing is scheduled for this day.");

      page.select("not a day");
      expect(page.selected).toBe("2030-01-01");
    });

    it("picks a day from the calendar, coloured by how much was done", async () => {
      const store = fakeStore([habit()], { h1: ["2026-10-20"] });
      const page = todayComponent({ store, now });
      await page.init();

      page.cal.show();
      const day = (key) => page.cal.days.find((d) => d.key === key);
      expect(page.cal.title).toBe("October 2026");
      expect(day("2026-10-20").level).toBe(4);
      expect(day("2026-10-21").level).toBe(0);
      // Nothing was due before the start, and upcoming days aren't scored.
      expect(day("2026-09-30").level).toBe(null);
      expect(day("2026-10-27").level).toBe(null);
      expect(day("2026-10-26")).toMatchObject({
        isToday: true,
        selected: true,
      });

      page.cal.pickDay("2026-10-20");
      expect(page.cal.open).toBe(false);
      expect(page.selected).toBe("2026-10-20");
    });

    it("ignores a broken date in the address", async () => {
      window.location.href = "/?date=2026-02-30";
      const page = todayComponent({ store: fakeStore([habit()]), now });
      await page.init();

      expect(page.selected).toBe("2026-10-26");
    });

    it("puts the picked day in the address, and takes it out for today", async () => {
      const page = todayComponent({ store: fakeStore([habit()]), now });
      await page.init();

      page.select("2026-10-20");
      expect(String(window.history.replaceState.mock.lastCall[2])).toMatch(
        /\?date=2026-10-20$/,
      );

      page.goToday();
      expect(String(window.history.replaceState.mock.lastCall[2])).not.toMatch(
        /date=/,
      );
      expect(page.selected).toBe("2026-10-26");
    });

    it("moves by whole weeks, keeping the weekday", async () => {
      const page = todayComponent({ store: fakeStore([habit()]), now });
      await page.init();
      page.select("2026-10-28");

      page.shiftWeek(-1);
      expect(page.selected).toBe("2026-10-21");
      page.shiftWeek(2);
      expect(page.selected).toBe("2026-11-04");
    });

    it("can change any past day since the habit started", async () => {
      const store = fakeStore([habit()]);
      const page = todayComponent({ store, now });
      await page.init();
      page.select("2026-10-02");

      await page.toggle(page.items[0]);

      expect(store.toggle).toHaveBeenCalledWith(
        "h1",
        "2026-10-02",
        expect.any(Function),
      );
    });

    it("shows an upcoming day without letting it be checked off", async () => {
      const gym = habit({
        id: "h2",
        name: "Gym",
        frequency: "weekly",
        target: 2,
      });
      const store = fakeStore([habit(), gym]);
      const page = todayComponent({ store, now });
      await page.init();

      page.select("2026-10-28");

      expect(page.listTitle).toBe("Scheduled for this day");
      expect(page.items[0]).toMatchObject({ name: "Read", locked: true });
      expect(page.items[1].sub).toBe("0 of 2 this week · optional");
      expect(page.summary).toMatchObject({
        isFuture: true,
        allDone: false,
        scheduled: "2 habits scheduled",
      });
      expect(page.subtitle).toBe("Wednesday, October 28 · 2 habits scheduled");
      expect(page.days[2]).toMatchObject({ key: "2026-10-28", upcoming: true });

      await page.toggle(page.items[0]);
      expect(store.toggle).not.toHaveBeenCalled();

      // On the last day of the week, a weekly habit still short is due.
      page.select("2026-11-01");
      expect(page.items[1].sub).toBe("0 of 2 this week · due");
    });

    it("follows today past midnight, but stays on a day picked on purpose", async () => {
      let clock = new Date(2026, 9, 26, 23, 0);
      const page = todayComponent({
        store: fakeStore([habit()]),
        now: () => clock,
      });
      await page.init();
      const wake = () => document.dispatchEvent(new Event("visibilitychange"));

      clock = new Date(2026, 9, 27, 8, 0);
      wake();
      expect(page.selected).toBe("2026-10-27");

      page.select("2026-10-20");
      clock = new Date(2026, 9, 28, 8, 0);
      wake();
      expect(page.today).toBe("2026-10-28");
      expect(page.selected).toBe("2026-10-20");
    });
  });

  describe("skipping", () => {
    // Today is Monday, October 26, 2026.
    const twoHabits = () =>
      fakeStore([habit(), habit({ id: "h2", name: "Gym", sort_order: 2 })], {
        h1: ["2026-10-24", "2026-10-25"],
      });

    it("skips one habit, which moves to the skipped group and keeps its streak", async () => {
      const store = twoHabits();
      const page = todayComponent({ store, now });
      await page.init();
      expect(page.items.map((i) => i.canSkip)).toEqual([true, true]);

      await page.skip(page.items[0]);

      expect(store.updateHabit).toHaveBeenCalledWith("h1", {
        pauses: [{ from: "2026-10-26", to: "2026-10-26" }],
      });
      expect(page.items.map((i) => i.name)).toEqual(["Gym"]);
      expect(page.skipped).toMatchObject([
        { id: "h1", name: "Read", skip: true, sub: "Skipped" },
      ]);
      expect(page.summary).toMatchObject({ done: 0, total: 1 });
      expect(page.hasDaySkips).toBe(true);

      await page.unskip(page.skipped[0]);
      expect(page.items.map((i) => i.name)).toEqual(["Read", "Gym"]);
      expect(page.skipped).toEqual([]);
    });

    it("leaves the row's Skip off weekly habits on optional days, but skips them with the day", async () => {
      const gym = habit({
        id: "h2",
        name: "Gym",
        frequency: "weekly",
        target: 2,
      });
      const store = fakeStore([habit(), gym]);
      const page = todayComponent({ store, now });
      await page.init();
      expect(page.items[1]).toMatchObject({
        optional: true,
        canSkip: false,
        skippable: true,
      });

      await page.skipTheDay();

      expect(store.updateHabits.mock.calls[0][0].map((c) => c.id)).toEqual([
        "h1",
        "h2",
      ]);
      expect(page.subtitle).toBe("Monday, October 26 · 2\u00a0skipped");
      expect(page.summary.total).toBe(0);
      expect(page.hasDaySkips).toBe(true);
    });

    it("says how many habits are skipped in the day's line", async () => {
      const store = fakeStore([
        habit(),
        habit({ id: "h2", name: "Gym", sort_order: 2 }),
      ]);
      const page = todayComponent({ store, now });
      await page.init();

      await page.skip(page.items[0]);
      expect(page.subtitle).toBe(
        "Monday, October 26 · 0 of 1 done · 1\u00a0skipped",
      );
    });

    it("doesn't offer to skip a habit that's already done", async () => {
      const store = fakeStore([habit()], { h1: ["2026-10-26"] });
      const page = todayComponent({ store, now });
      await page.init();

      expect(page.items[0].canSkip).toBe(false);
      expect(page.canSkipDay).toBe(false);
    });

    it("skips the rest of the day, and undoes it", async () => {
      const store = fakeStore(
        [habit(), habit({ id: "h2", name: "Gym", sort_order: 2 })],
        { h2: ["2026-10-26"] },
      );
      const page = todayComponent({ store, now });
      await page.init();
      expect(page.canSkipDay).toBe(true);

      await page.skipTheDay();

      // Gym is done, so only Read is skipped.
      expect(store.updateHabits).toHaveBeenCalledWith([
        {
          id: "h1",
          data: { pauses: [{ from: "2026-10-26", to: "2026-10-26" }] },
        },
      ]);
      expect(page.summary).toMatchObject({ done: 1, total: 1, allDone: true });
      expect(page.canSkipDay).toBe(false);
      expect(page.hasDaySkips).toBe(true);

      await page.undoDaySkips();
      expect(page.summary).toMatchObject({ done: 1, total: 2 });
    });

    it("skips past and upcoming days too", async () => {
      const store = twoHabits();
      const page = todayComponent({ store, now });
      await page.init();

      page.select("2026-10-20");
      await page.skip(page.items[1]);
      expect(store.updateHabit).toHaveBeenLastCalledWith("h2", {
        pauses: [{ from: "2026-10-20", to: "2026-10-20" }],
      });

      page.select("2026-11-03");
      expect(page.items[0].canSkip).toBe(true);
    });

    it("lists habits in a longer pause without an undo", async () => {
      const store = fakeStore([
        habit({ pauses: [{ from: "2026-10-20", to: "2026-10-30" }] }),
      ]);
      const page = todayComponent({ store, now });
      await page.init();

      expect(page.items).toEqual([]);
      expect(page.skipped).toMatchObject([
        { skip: false, sub: "Paused until Oct 30" },
      ]);
      expect(page.emptyText).toBe(
        "Everything is skipped or paused on this day.",
      );
    });
  });

  it("says nothing is due when only optional weekly habits are left", async () => {
    const gym = habit({ name: "Gym", frequency: "weekly", target: 2 });
    const page = todayComponent({ store: fakeStore([gym]), now });
    await page.init();

    expect(page.summary).toMatchObject({ total: 0, weekly: "+1\u00a0weekly" });
    expect(page.subtitle).toBe(
      "Monday, October 26 · nothing due · +1\u00a0weekly",
    );
  });

  it("marks a weekly habit as due when the week is running out", async () => {
    const gym = habit({ name: "Gym", frequency: "weekly", target: 2 });
    const store = fakeStore([gym], { h1: ["2026-10-20"] });
    const page = todayComponent({ store, now });
    await page.init();

    // Sunday, October 25 was the last day of the previous week.
    page.select("2026-10-25");

    expect(page.items[0]).toMatchObject({
      optional: false,
      sub: "1 of 2 this week · was\u00a0due",
    });
    expect(page.summary).toMatchObject({ done: 0, total: 1, optional: 0 });
  });

  it("shows an error when saving fails", async () => {
    const store = fakeStore([habit()]);
    store.toggle.mockResolvedValueOnce(false);
    const page = todayComponent({ store, now });
    await page.init();

    await page.toggle(page.items[0]);

    expect(page.error).toMatch(/Couldn't save/);
  });

  it("reports a failed load", async () => {
    const store = fakeStore([]);
    store.load.mockRejectedValueOnce(pbError(0));
    const page = todayComponent({ store, now });

    await page.init();

    expect(page.error).toMatch(/reach the server/);
    expect(page.loading).toBe(false);
  });
});

describe("statsComponent", () => {
  it("builds the statistics for the chosen period", async () => {
    const store = fakeStore([habit()], { h1: ["2026-10-24", "2026-10-25"] });
    const page = statsComponent({ store, now });
    await page.init();

    expect(page.stats.title).toBe("Oct 26 – Nov 1, 2026");
    page.pick("month");

    expect(page.period).toBe("month");
    expect(page.stats.countText).toBe("2 of 25");
    expect(page.stats.bestText).toBe("2 days");
    expect(page.heatWide.cells).toHaveLength(52 * 7);
  });
});

describe("habitsComponent", () => {
  const setup = async (
    habits = [habit(), habit({ id: "h2", name: "Gym", sort_order: 2 })],
  ) => {
    const store = fakeStore(habits);
    const page = habitsComponent({ store, now });
    page.$refs = {
      dialog: { open: false, showModal: vi.fn(), close: vi.fn() },
    };
    await page.init();
    return { store, page };
  };

  it("selects the first habit on wide screens and builds its calendar", async () => {
    const { page } = await setup();

    expect(page.selectedId).toBe("h1");
    expect(page.detail.monthTitle).toBe("October 2026");
    // October 1, 2026 is a Thursday: three blanks before it.
    expect(page.detail.cells.filter((c) => c.blank)).toHaveLength(3);
    expect(page.detail.cells.find((c) => c.key === "2026-10-26").isToday).toBe(
      true,
    );
  });

  it("goes to any month, showing days before the start and upcoming ones", async () => {
    const { page } = await setup();

    page.shiftMonth(-1);
    expect(page.detail.monthTitle).toBe("September 2026");
    expect(page.detail.monthHint).toBe("Started Oct 1, 2026.");
    const before = page.detail.cells.find((c) => c.key === "2026-09-15");
    expect(before).toMatchObject({ state: "before", clickable: false });
    expect(before.aria).toBe("September 15, before the habit started");

    page.shiftMonth(2);
    expect(page.detail.monthTitle).toBe("November 2026");
    expect(page.detail.monthHint).toBe("Tap a day to skip it.");
    const cell = page.detail.cells.find((c) => c.key === "2026-11-02");
    // Upcoming days open the day menu, to skip them.
    expect(cell).toMatchObject({ state: "upcoming", clickable: true });
    expect(cell.aria).toBe("November 2, scheduled");
  });

  it("picks a month from the calendar", async () => {
    const { page } = await setup();

    page.cal.show();
    expect(page.cal.view).toBe("months");
    expect(page.cal.title).toBe("2026");
    expect(page.cal.months.find((m) => m.selected).key).toBe("2026-10-01");

    page.cal.shift(-3);
    page.cal.pickMonth("2023-02-01");
    expect(page.cal.open).toBe(false);
    expect(page.detail.monthTitle).toBe("February 2023");

    page.cal.show();
    page.cal.goToday();
    expect(page.detail.monthTitle).toBe("October 2026");
  });

  describe("planned pauses", () => {
    // Today is Monday, October 26, 2026.
    it("plans a pause for one habit, from tomorrow for a week by default", async () => {
      const { page, store } = await setup();

      page.openPauseForm();
      expect(page.pauseForm).toMatchObject({
        open: true,
        from: "2026-10-27",
        to: "2026-11-02",
        all: false,
      });
      page.pauseFromCal.pickDay("2026-11-02");
      page.pauseToCal.pickDay("2026-11-08");
      await page.savePause();

      expect(store.updateHabits).toHaveBeenCalledWith([
        {
          id: "h1",
          data: { pauses: [{ from: "2026-11-02", to: "2026-11-08" }] },
        },
      ]);
      expect(page.pauseForm.open).toBe(false);
      expect(page.pauseNotice).toBe(
        "Pause planned for this habit: Nov 2 – Nov 8, 2026.",
      );
      expect(page.detail.pauses.map((p) => p.label)).toEqual([
        "Nov 2 – Nov 8, 2026",
      ]);
      expect(page.active[0].sub).toBe("Every day · Pause from Nov 2");
    });

    it("moves the last day along when the first day passes it", async () => {
      const { page } = await setup();
      page.openPauseForm();

      page.pauseFromCal.pickDay("2026-12-01");
      expect(page.pauseForm.to).toBe("2026-12-01");
      // The calendars can't go before today, or before the first day.
      page.pauseFromCal.pickDay("2026-10-20");
      page.pauseToCal.pickDay("2026-11-20");
      expect(page.pauseForm).toMatchObject({
        from: "2026-12-01",
        to: "2026-12-01",
      });
    });

    it("pauses every active habit at once", async () => {
      const store = fakeStore(
        [
          habit(),
          habit({ id: "h2", name: "Gym", sort_order: 2 }),
          habit({
            id: "h3",
            name: "Old",
            sort_order: 3,
            archived_on: "2026-10-10",
          }),
        ],
        { h2: ["2026-10-26"] },
      );
      const page = habitsComponent({ store, now });
      page.$refs = {
        dialog: { open: false, showModal: vi.fn(), close: vi.fn() },
      };
      await page.init();
      page.select("h1");

      page.openPauseForm();
      expect(page.activeCount()).toBe(2);
      page.pauseForm.from = "2026-10-26";
      page.pauseForm.to = "2026-10-30";
      page.pauseForm.all = true;
      await page.savePause();

      // Gym is already done today, so its pause starts tomorrow.
      expect(store.updateHabits).toHaveBeenCalledWith([
        {
          id: "h1",
          data: { pauses: [{ from: "2026-10-26", to: "2026-10-30" }] },
        },
        {
          id: "h2",
          data: { pauses: [{ from: "2026-10-27", to: "2026-10-30" }] },
        },
      ]);
      expect(page.pauseNotice).toBe(
        "Pause planned for 2 habits: Oct 26 – Oct 30, 2026. Habits already checked off today start it tomorrow.",
      );
      expect(page.detail.paused).toBe(true);
      expect(page.detail.pausedText).toMatch(/paused until Oct 30, 2026/);
      expect(page.active.map((h) => h.sub)).toEqual([
        "Every day · Paused until Oct 30",
        "Every day · Pause from Oct 27",
      ]);
    });

    it("shows paused days in the habit's calendar", async () => {
      const { page } = await setup([
        habit({ pauses: [{ from: "2026-10-20", to: "2026-10-28" }] }),
      ]);
      const cell = (key) => page.detail.cells.find((c) => c.key === key);

      expect(cell("2026-10-21")).toMatchObject({
        state: "paused",
        clickable: true,
      });
      expect(cell("2026-10-21").aria).toBe("October 21, paused");
      expect(cell("2026-10-29").state).toBe("upcoming");
      expect(page.detail.hasPaused).toBe(true);
    });

    it("explains why a pause can't be planned", async () => {
      const store = fakeStore([habit()], { h1: ["2026-10-26"] });
      const page = habitsComponent({ store, now });
      page.$refs = {
        dialog: { open: false, showModal: vi.fn(), close: vi.fn() },
      };
      await page.init();

      page.openPauseForm();
      page.pauseForm.from = "2026-10-26";
      page.pauseForm.to = "2026-10-26";
      await page.savePause();

      expect(page.pauseForm.error).toMatch(/already checked off/);
      expect(store.updateHabits).not.toHaveBeenCalled();
    });

    it("removes a planned pause, and resumes a running one", async () => {
      const { page, store } = await setup([
        habit({
          pauses: [
            { from: "2026-10-20", to: "2026-10-28" },
            { from: "2026-11-10", to: "2026-11-12" },
          ],
        }),
      ]);
      expect(page.detail.pauses.map((p) => [p.label, p.now])).toEqual([
        ["Now, until Oct 28, 2026", true],
        ["Nov 10 – Nov 12, 2026", false],
      ]);

      await page.removePlannedPause(page.detail.pauses[1]);
      expect(store.updateHabit).toHaveBeenLastCalledWith("h1", {
        pauses: [{ from: "2026-10-20", to: "2026-10-28" }],
      });

      await page.removePlannedPause(page.detail.pauses[0]);
      expect(store.updateHabit).toHaveBeenLastCalledWith("h1", {
        pauses: [{ from: "2026-10-20", to: "2026-10-25" }],
      });
      expect(page.detail.paused).toBe(false);
    });
  });

  describe("day menu", () => {
    // Today is Monday, October 26, 2026.
    const cell = (page, key) => page.detail.cells.find((c) => c.key === key);

    it("asks what to do instead of changing a day on tap", async () => {
      const { page, store } = await setup();

      page.openDayMenu(cell(page, "2026-10-20"));

      expect(store.toggle).not.toHaveBeenCalled();
      expect(page.detail.menu).toMatchObject({
        key: "2026-10-20",
        title: "Tuesday, October 20",
        status: "Missed",
        done: false,
        canToggle: true,
        canSkip: true,
        skipped: false,
        href: "/?date=2026-10-20",
      });

      // Tapping the same day again closes it.
      page.openDayMenu(cell(page, "2026-10-20"));
      expect(page.detail.menu).toBe(null);
    });

    it("checks a day off from the menu and closes it", async () => {
      const { page, store } = await setup();
      page.openDayMenu(cell(page, "2026-10-20"));

      await page.toggleDay("2026-10-20");

      expect(store.toggle).toHaveBeenCalledWith(
        "h1",
        "2026-10-20",
        expect.any(Function),
      );
      expect(page.detail.menu).toBe(null);
      expect(cell(page, "2026-10-20").state).toBe("done");

      page.openDayMenu(cell(page, "2026-10-20"));
      expect(page.detail.menu).toMatchObject({
        status: "Done",
        done: true,
        canSkip: false,
      });
    });

    it("skips a day and undoes it", async () => {
      const { page, store } = await setup();
      page.openDayMenu(cell(page, "2026-10-20"));

      await page.skipCalendarDay("2026-10-20");
      expect(store.updateHabit).toHaveBeenLastCalledWith("h1", {
        pauses: [{ from: "2026-10-20", to: "2026-10-20" }],
      });
      expect(cell(page, "2026-10-20").state).toBe("paused");

      page.openDayMenu(cell(page, "2026-10-20"));
      expect(page.detail.menu).toMatchObject({
        status: "Skipped",
        skipped: true,
        canSkip: false,
        canToggle: false,
      });
      await page.unskipCalendarDay("2026-10-20");
      expect(store.updateHabit).toHaveBeenLastCalledWith("h1", { pauses: [] });
    });

    it("offers only skipping for upcoming days", async () => {
      const { page } = await setup();
      page.shiftMonth(1);

      page.openDayMenu(cell(page, "2026-11-03"));
      expect(page.detail.menu).toMatchObject({
        status: "Scheduled",
        canToggle: false,
        canSkip: true,
      });
    });

    it("closes when the month or habit changes", async () => {
      const { page } = await setup();
      page.openDayMenu(cell(page, "2026-10-20"));

      page.shiftMonth(-1);
      expect(page.dayMenu).toBe("");
      expect(cell(page, "2026-09-30").clickable).toBe(false); // before start
    });
  });

  it("validates and creates a habit", async () => {
    const { page, store } = await setup();
    page.openNew();
    page.form.frequency = "days";
    page.form.days = [false, false, false, false, false, false, false];

    await page.saveForm();
    expect(page.formErrors).toEqual({
      name: "Give the habit a name.",
      days: "Pick at least one day.",
    });

    page.form.name = "  Stretch ";
    page.form.days[2] = true;
    await page.saveForm();

    expect(store.createHabit).toHaveBeenCalledWith({
      name: "Stretch",
      color: "yellow",
      frequency: "days",
      days: [2],
      target: 1,
      note: "",
      start_date: "2026-10-26",
      pauses: [],
    });
    expect(page.selectedId).toBe("new1");
  });

  it("pauses, resumes and archives the selected habit", async () => {
    const { page, store } = await setup();

    await page.togglePause();
    expect(store.updateHabit).toHaveBeenLastCalledWith("h1", {
      pauses: [{ from: "2026-10-26", to: null }],
    });
    expect(page.detail.paused).toBe(true);

    await page.togglePause();
    expect(page.detail.paused).toBe(false);

    await page.toggleArchive();
    expect(page.archived.map((r) => r.name)).toEqual(["Read"]);
  });

  it("deletes the selected habit and moves on to the next", async () => {
    const { page, store } = await setup();

    await page.deleteHabit();

    expect(store.deleteHabit).toHaveBeenCalledWith("h1");
    expect(page.selectedId).toBe("h2");
  });

  describe("reset progress", () => {
    const withCheckins = async () => {
      const store = fakeStore([habit({ start_date: "2026-10-01" })], {
        h1: ["2026-10-20", "2026-10-21"],
      });
      const page = habitsComponent({ store, now });
      page.$refs = {
        dialog: { open: false, showModal: vi.fn(), close: vi.fn() },
      };
      await page.init();
      return { store, page };
    };

    it("asks first, saying how many check-ins go", async () => {
      const { page } = await withCheckins();

      expect(page.detail.canReset).toBe(true);
      expect(page.detail.resetText).toBe(
        "Delete 2 check-ins and start “Read” over from today? Its streaks and statistics will be lost, and this can't be undone.",
      );
      expect(page.confirmReset).toBe(false);
    });

    it("doesn't change days while the reset runs", async () => {
      const { page, store } = await withCheckins();
      let finish;
      store.resetHabit.mockImplementationOnce(
        () => new Promise((resolve) => (finish = resolve)),
      );
      const running = page.resetHabit();
      const cell = page.detail.cells.find((c) => c.key === "2026-10-22");

      await page.toggleDay(cell.key);
      finish();
      await running;

      expect(store.toggle).not.toHaveBeenCalled();
    });

    it("deletes the check-ins and starts over from today", async () => {
      const { page, store } = await withCheckins();
      page.shiftMonth(-1);
      page.confirmReset = true;

      await page.resetHabit();

      expect(store.resetHabit).toHaveBeenCalledWith("h1", "2026-10-26");
      expect(page.confirmReset).toBe(false);
      expect(page.detail.sub).toContain("since Oct 26, 2026");
      expect(page.detail.streakText).toBe("No streak");
      expect(page.detail.monthTitle).toBe("October 2026");
      // Nothing left to reset.
      expect(page.detail.canReset).toBe(false);
    });

    it("keeps the confirmation open and reports an error when it fails", async () => {
      const { page, store } = await withCheckins();
      store.resetHabit.mockRejectedValueOnce(pbError(0));
      page.confirmReset = true;

      await page.resetHabit();

      expect(page.error).toMatch(/reach the server|Couldn't reset/);
      expect(page.confirmReset).toBe(true);
    });

    it("closes the confirmation when another habit is picked", async () => {
      const { page } = await setup();
      page.confirmReset = true;

      page.select("h2");

      expect(page.confirmReset).toBe(false);
    });

    it("has nothing to reset on a habit that has no check-ins and starts today", async () => {
      const { page } = await setup([habit({ start_date: "2026-10-26" })]);

      expect(page.detail.canReset).toBe(false);
    });

    it("words the question for a habit without check-ins, and for one", () => {
      expect(resetText("Read", 0)).toBe(
        "Reset “Read”? Its start date moves to today.",
      );
      expect(resetText("Read", 1)).toMatch(/^Delete 1 check-in and start/);
    });
  });

  it("moves a habit with Alt+arrow keys", async () => {
    const { page, store } = await setup();
    const event = { altKey: true, key: "ArrowDown", preventDefault: vi.fn() };

    page.moveWithKeys(event, "h1");

    expect(store.reorder).toHaveBeenCalledWith(["h2", "h1"]);
  });
});
