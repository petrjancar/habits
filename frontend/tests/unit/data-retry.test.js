import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStore, withRetry } from "../../src/data.js";
import { ClientResponseError } from "pocketbase";
import { pb } from "../../src/pb.js";

vi.mock("../../src/pb.js", () => ({
  pb: {
    authStore: { record: { id: "user_1" } },
    collection: vi.fn(),
    createBatch: vi.fn(),
    filter: vi.fn((expr, params) => `${expr} ${JSON.stringify(params)}`),
  },
}));

const limited = () => Object.assign(new Error("limited"), { status: 429 });

describe("withRetry", () => {
  it("tries again after a rate-limit answer", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(limited())
      .mockResolvedValueOnce("ok");
    await expect(withRetry(request, { wait: 1 })).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("also tries again when a request inside a batch was limited", async () => {
    // The error PocketBase's SDK really throws for a limited batch.
    const batchLimited = new ClientResponseError({
      status: 400,
      response: {
        status: 400,
        message: "Batch transaction failed.",
        data: {
          requests: {
            0: {
              code: "batch_request_failed",
              response: { status: 429, message: "Too Many Requests." },
            },
          },
        },
      },
    });
    const request = vi
      .fn()
      .mockRejectedValueOnce(batchLimited)
      .mockResolvedValueOnce("ok");
    await expect(withRetry(request, { wait: 1 })).resolves.toBe("ok");
  });

  it("doesn't retry a batch that failed for another reason", async () => {
    const invalid = new ClientResponseError({
      status: 400,
      response: {
        data: {
          requests: {
            3: {
              response: { status: 400, message: "Failed to create record." },
            },
          },
        },
      },
    });
    const request = vi.fn().mockRejectedValue(invalid);
    await expect(withRetry(request, { wait: 1 })).rejects.toBe(invalid);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last try and passes other errors straight on", async () => {
    const always = vi.fn().mockRejectedValue(limited());
    await expect(withRetry(always, { tries: 3, wait: 1 })).rejects.toThrow(
      "limited",
    );
    expect(always).toHaveBeenCalledTimes(3);

    const broken = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    await expect(withRetry(broken, { wait: 1 })).rejects.toThrow("bad");
    expect(broken).toHaveBeenCalledTimes(1);
  });
});

describe("resetHabit", () => {
  const TODAY = "2026-10-28";
  const habit = (props = {}) => ({
    id: "h1",
    name: "Read",
    start_date: "2026-09-01",
    pauses: [],
    sort_order: 1,
    ...props,
  });
  const records = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}` }));

  let batches, update, getFullList, calls;
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    batches = [];
    update = vi.fn(async (id, data) => {
      calls.push("update");
      return { ...habit(), ...data };
    });
    getFullList = vi.fn(async () => records(250));
    pb.collection.mockImplementation((name) =>
      name === "habits" ? { update } : { getFullList },
    );
    pb.createBatch.mockImplementation(() => {
      const ids = [];
      batches.push(ids);
      return {
        collection: () => ({ delete: (id) => ids.push(id) }),
        send: vi.fn(async () => {
          calls.push("batch");
        }),
      };
    });
  });

  const storeWith = (h = habit()) => {
    const store = createStore();
    store.habits = [h];
    store.checkins = new Map([["h1", new Map([["2026-10-20", "c0"]])]]);
    return store;
  };

  it("deletes the check-ins 100 at a time, then moves the start date", async () => {
    const store = storeWith();

    const count = await store.resetHabit("h1", TODAY);

    expect(count).toBe(250);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(calls).toEqual(["batch", "batch", "batch", "update"]);
    expect(update).toHaveBeenCalledWith("h1", {
      start_date: TODAY,
      pauses: [],
    });
    expect(store.habit("h1").start_date).toBe(TODAY);
    expect(store.doneOf("h1").size).toBe(0);
  });

  it("asks the server for the check-ins of that habit only", async () => {
    await storeWith().resetHabit("h1", TODAY);

    expect(getFullList).toHaveBeenCalledWith(
      expect.objectContaining({ fields: "id", batch: 1000 }),
    );
    expect(pb.filter).toHaveBeenCalledWith("habit = {:habit}", { habit: "h1" });
  });

  it("works for a habit without check-ins", async () => {
    getFullList.mockResolvedValueOnce([]);

    expect(await storeWith().resetHabit("h1", TODAY)).toBe(0);
    expect(pb.createBatch).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("keeps the habit as it was if deleting fails part way", async () => {
    const store = storeWith();
    let sent = 0;
    pb.createBatch.mockImplementation(() => ({
      collection: () => ({ delete: () => {} }),
      send: vi.fn(async () => {
        if (++sent === 2) throw Object.assign(new Error("down"), { status: 0 });
      }),
    }));

    await expect(store.resetHabit("h1", TODAY)).rejects.toThrow("down");

    expect(update).not.toHaveBeenCalled();
    expect(store.habit("h1").start_date).toBe("2026-09-01");
  });

  it("forgets the check-ins already deleted when it fails part way", async () => {
    const store = storeWith();
    store.checkins.get("h1").set("2026-10-21", "c150");
    let sent = 0;
    pb.createBatch.mockImplementation(() => ({
      collection: () => ({ delete: () => {} }),
      send: vi.fn(async () => {
        if (++sent === 2) throw Object.assign(new Error("down"), { status: 0 });
      }),
    }));

    await expect(store.resetHabit("h1", TODAY)).rejects.toThrow("down");

    // c0 went in the first batch; c150 was in the one that failed.
    expect([...store.doneOf("h1").keys()]).toEqual(["2026-10-21"]);
  });

  it("tries a limited batch again", async () => {
    getFullList.mockResolvedValueOnce(records(3));
    let sent = 0;
    pb.createBatch.mockImplementation(() => ({
      collection: () => ({ delete: () => {} }),
      send: vi.fn(async () => {
        if (++sent === 1)
          throw Object.assign(new Error("slow"), { status: 429 });
      }),
    }));
    vi.useFakeTimers();

    const done = storeWith().resetHabit("h1", TODAY);
    await vi.runAllTimersAsync();
    await done;
    vi.useRealTimers();

    expect(sent).toBe(2);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("keeps a pause that is running, starting today", async () => {
    const store = storeWith(
      habit({ pauses: [{ from: "2026-10-10", to: null }] }),
    );

    await store.resetHabit("h1", TODAY);

    expect(update).toHaveBeenCalledWith("h1", {
      start_date: TODAY,
      pauses: [{ from: TODAY, to: null }],
    });
  });

  it("keeps a planned pause", async () => {
    const store = storeWith(
      habit({ pauses: [{ from: "2026-11-02", to: "2026-11-08" }] }),
    );

    await store.resetHabit("h1", TODAY);

    expect(update).toHaveBeenCalledWith("h1", {
      start_date: TODAY,
      pauses: [{ from: "2026-11-02", to: "2026-11-08" }],
    });
  });

  it("drops pauses that are over", async () => {
    const store = storeWith(
      habit({ pauses: [{ from: "2026-10-01", to: "2026-10-05" }] }),
    );

    await store.resetHabit("h1", TODAY);

    expect(update).toHaveBeenCalledWith("h1", {
      start_date: TODAY,
      pauses: [],
    });
  });
});

describe("updateHabits", () => {
  it("saves several habits in one batch and keeps the store in step", async () => {
    vi.clearAllMocks();
    const sent = [];
    pb.createBatch.mockImplementation(() => ({
      collection: () => ({
        update: (id, data) => sent.push({ id, data }),
      }),
      send: vi.fn(async () =>
        sent.map(({ id, data }) => ({ status: 200, body: { id, ...data } })),
      ),
    }));
    const store = createStore();
    store.habits = [
      { id: "a", name: "A", sort_order: 1, pauses: [] },
      { id: "b", name: "B", sort_order: 2, pauses: [] },
      { id: "c", name: "C", sort_order: 3, pauses: [] },
    ];
    const pauses = [{ from: "2026-11-02", to: "2026-11-08" }];

    await store.updateHabits([
      { id: "a", data: { name: "A", sort_order: 1, pauses } },
      { id: "c", data: { name: "C", sort_order: 3, pauses } },
    ]);

    expect(pb.createBatch).toHaveBeenCalledTimes(1);
    expect(sent.map((s) => s.id)).toEqual(["a", "c"]);
    expect(store.habits.map((h) => h.pauses.length)).toEqual([1, 0, 1]);
  });

  it("does nothing for no changes", async () => {
    vi.clearAllMocks();
    expect(await createStore().updateHabits([])).toEqual([]);
    expect(pb.createBatch).not.toHaveBeenCalled();
  });
});

describe("importPlan", () => {
  it("creates habits, updates existing ones and adds check-ins in batches", async () => {
    vi.clearAllMocks();
    const create = vi.fn(async (data) => ({ id: "new1", ...data }));
    const update = vi.fn(async (id, data) => ({ id, ...data }));
    const getFullList = vi.fn(async () => []);
    pb.collection.mockImplementation(() => ({ create, update, getFullList }));
    const sent = [];
    pb.createBatch.mockImplementation(() => ({
      collection: () => ({ create: (data) => sent.push(data) }),
      send: vi.fn(async () => []),
    }));
    pb.authStore.record = { id: "user_1" };
    const store = createStore();
    const read = {
      id: "h1",
      name: "Read",
      start_date: "2026-10-01",
      sort_order: 4,
      pauses: [],
    };
    store.habits = [read];
    const pauses = [{ from: "2026-11-02", to: "2026-11-08" }];

    const saved = await store.importPlan({
      newHabits: [
        { name: "Gym", color: "teal", pauses: [], dates: ["2026-10-05"] },
      ],
      existing: [
        { habit: read, startDate: "2026-09-20", dates: ["2026-09-20"], pauses },
        { habit: read, startDate: "2026-10-01", dates: [] },
      ],
    });

    expect(create).toHaveBeenCalledWith(
      { name: "Gym", color: "teal", pauses: [], user: "user_1", sort_order: 5 },
      { requestKey: null },
    );
    // The second entry changes nothing, so there's no request for it.
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      "h1",
      { start_date: "2026-09-20", pauses },
      { requestKey: null },
    );
    expect(sent).toEqual([
      { user: "user_1", habit: "new1", date: "2026-10-05" },
      { user: "user_1", habit: "h1", date: "2026-09-20" },
    ]);
    expect(saved).toBe(2);
  });
});
