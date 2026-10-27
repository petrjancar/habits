import { beforeEach, describe, expect, it, vi } from "vitest";
import { todayComponent } from "../../src/pages/today.js";
import { statsComponent } from "../../src/pages/stats.js";
import { habitsComponent } from "../../src/pages/habits.js";
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
    deleteHabit: vi.fn(async (id) => {
      store.habits = store.habits.filter((h) => h.id !== id);
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
  it("lists today's habits with streaks and a 7-day strip", async () => {
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
    expect(page.days).toHaveLength(7);
    expect(page.days.at(-1)).toMatchObject({
      key: "2026-10-26",
      selected: true,
    });
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
    expect(page.detail.canNext).toBe(false);
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

  it("moves a habit with Alt+arrow keys", async () => {
    const { page, store } = await setup();
    const event = { altKey: true, key: "ArrowDown", preventDefault: vi.fn() };

    page.moveWithKeys(event, "h1");

    expect(store.reorder).toHaveBeenCalledWith(["h2", "h1"]);
  });
});
