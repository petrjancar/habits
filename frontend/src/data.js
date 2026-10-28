// Loads and changes the user's habits and check-ins.
// Check-ins are kept as Map(habitId -> Map(date -> checkinId)), which the
// pure logic in lib/habits.js reads through doneOf(habitId).
//
// A copy is cached in localStorage, so a page can draw straight away from the
// last known data while fresh data loads in the background (no "Loading…"
// flash and no layout jump when moving between pages). The cache is per user
// and is removed on logout.

import { pb } from "./pb.js";
import { pausesFrom, sortHabits } from "./lib/habits.js";

const NO_CHECKINS = new Map();
const CACHE_PREFIX = "habits-cache:";
// Check-ins sent per request when importing or resetting (the server allows
// up to 100, see pb_migrations/*_enable_batch_api.js), and the least time
// between two such requests, which keeps them under the server's rate limits
// (pb_migrations/*_server_settings.js).
const IMPORT_BATCH = 100;
const IMPORT_BATCH_GAP_MS = 300;

/** Removes every cached copy (call on logout and account deletion). */
export function clearCache() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable: nothing was cached.
  }
}

// Rate limited: either the request itself, or a request inside a batch.
// The SDK's `err.data` is the whole response body, so a batch's per-request
// answers are at err.data.data.requests.
const isRateLimited = (err) =>
  err?.status === 429 ||
  Object.values(err?.data?.data?.requests ?? {}).some(
    (r) => r?.response?.status === 429,
  );

/**
 * Runs `request`, waiting and trying again while the server says it is rate
 * limited. Used by import, which sends many requests in a row.
 */
export async function withRetry(request, { tries = 6, wait = 1000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await request();
    } catch (err) {
      if (!isRateLimited(err) || attempt >= tries) throw err;
      await new Promise((resolve) => setTimeout(resolve, wait * attempt));
    }
  }
}

export function createStore() {
  const store = {
    habits: [],
    checkins: new Map(),
    pending: new Set(),
    changes: 0,

    userId() {
      return pb.authStore.record?.id;
    },

    doneOf(habitId) {
      return store.checkins.get(habitId) ?? NO_CHECKINS;
    },

    habit(id) {
      return store.habits.find((h) => h.id === id);
    },

    cacheKey() {
      return CACHE_PREFIX + store.userId();
    },

    /** Fills the store from the cache. Returns true if there was one. */
    loadCached() {
      try {
        const raw = localStorage.getItem(store.cacheKey());
        if (!raw) return false;
        const { habits, checkins } = JSON.parse(raw);
        store.habits = sortHabits(habits);
        store.checkins = new Map(
          Object.entries(checkins).map(([id, dates]) => [
            id,
            new Map(Object.entries(dates)),
          ]),
        );
        return true;
      } catch {
        return false;
      }
    },

    saveCache() {
      try {
        const checkins = {};
        for (const [id, dates] of store.checkins) {
          checkins[id] = Object.fromEntries(
            [...dates].filter(([, checkinId]) => checkinId !== "pending"),
          );
        }
        localStorage.setItem(
          store.cacheKey(),
          JSON.stringify({ habits: store.habits, checkins }),
        );
      } catch {
        // Full or unavailable storage only costs the instant first paint.
      }
    },

    /** Fetches everything from the server, then updates the cache. */
    async load(attempt = 1) {
      const changesBefore = store.changes;
      const [habits, checkins] = await Promise.all([
        pb.collection("habits").getFullList({ requestKey: null }),
        pb.collection("checkins").getFullList({
          fields: "id,habit,date",
          batch: 1000,
          requestKey: null,
        }),
      ]);
      store.habits = sortHabits(habits);
      store.checkins = new Map();
      for (const c of checkins) {
        if (!store.checkins.has(c.habit))
          store.checkins.set(c.habit, new Map());
        store.checkins.get(c.habit).set(c.date, c.id);
      }
      // A change made while this was loading may be missing from the result:
      // load again so the screen doesn't jump back to the old state.
      if (
        attempt < 3 &&
        (store.pending.size > 0 || store.changes !== changesBefore)
      ) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return store.load(attempt + 1);
      }
      store.saveCache();
    },

    isDone(habitId, date) {
      return store.doneOf(habitId).has(date);
    },

    /**
     * Checks a day off or un-checks it. `onChange` runs right away (the UI
     * updates optimistically) and again if the server rejects the change.
     * Returns false if the change failed and was rolled back.
     */
    async toggle(habitId, date, onChange = () => {}) {
      const key = `${habitId}:${date}`;
      if (store.pending.has(key)) return true;
      store.pending.add(key);
      store.changes++;

      if (!store.checkins.has(habitId)) store.checkins.set(habitId, new Map());
      const dates = store.checkins.get(habitId);
      const existingId = dates.get(date);

      try {
        if (existingId) {
          dates.delete(date);
          onChange();
          await pb
            .collection("checkins")
            .delete(existingId, { requestKey: null });
        } else {
          dates.set(date, "pending");
          onChange();
          const record = await pb
            .collection("checkins")
            .create(
              { user: store.userId(), habit: habitId, date },
              { requestKey: null },
            );
          dates.set(date, record.id);
        }
        store.saveCache();
        return true;
      } catch (err) {
        console.error(err);
        if (existingId) {
          dates.set(date, existingId);
        } else {
          dates.delete(date);
        }
        onChange();
        return false;
      } finally {
        store.pending.delete(key);
      }
    },

    async createHabit(data) {
      const sortOrder =
        store.habits.reduce((max, h) => Math.max(max, h.sort_order ?? 0), 0) +
        1;
      const record = await pb
        .collection("habits")
        .create({ ...data, user: store.userId(), sort_order: sortOrder });
      store.changes++;
      store.habits = sortHabits([...store.habits, record]);
      store.saveCache();
      return record;
    },

    async updateHabit(id, data) {
      store.changes++;
      const record = await pb.collection("habits").update(id, data);
      store.habits = sortHabits(
        store.habits.map((h) => (h.id === id ? record : h)),
      );
      store.saveCache();
      return record;
    },

    /**
     * Updates several habits in one batch request (all or nothing), e.g. a
     * pause planned for every habit. `changes` is [{ id, data }].
     */
    async updateHabits(changes) {
      if (!changes.length) return [];
      store.changes++;
      const records = new Map();
      // A batch holds at most 100 requests; nobody has that many habits, but
      // just in case, larger sets go in several batches.
      for (let i = 0; i < changes.length; i += IMPORT_BATCH) {
        const batch = pb.createBatch();
        for (const { id, data } of changes.slice(i, i + IMPORT_BATCH)) {
          batch.collection("habits").update(id, data);
        }
        const results = await withRetry(() => batch.send({ requestKey: null }));
        for (const r of results) records.set(r.body.id, r.body);
      }
      store.habits = sortHabits(
        store.habits.map((h) => records.get(h.id) ?? h),
      );
      store.saveCache();
      return [...records.values()];
    },

    async deleteHabit(id) {
      store.changes++;
      await pb.collection("habits").delete(id);
      store.habits = store.habits.filter((h) => h.id !== id);
      store.checkins.delete(id);
      store.saveCache();
    },

    /**
     * Carries out a plan from planBackupImport() (lib/backup.js): creates the
     * new habits, moves start dates back and adds pauses to existing ones
     * where needed, then adds the check-ins in batches.
     * `onProgress(done, total)` reports check-ins saved so far. If it fails
     * part way, what was saved stays; importing the same file again finishes
     * the rest (habits match by name and existing check-ins are skipped).
     */
    async importPlan(plan, onProgress = () => {}) {
      store.changes++;
      const user = store.userId();
      const pendingCheckins = [];
      let sortOrder = store.habits.reduce(
        (max, h) => Math.max(max, h.sort_order ?? 0),
        0,
      );

      for (const { dates, ...data } of plan.newHabits) {
        const sort_order = ++sortOrder;
        const record = await withRetry(() =>
          pb
            .collection("habits")
            .create({ ...data, user, sort_order }, { requestKey: null }),
        );
        for (const date of dates) pendingCheckins.push([record.id, date]);
      }
      for (const { habit, startDate, dates, pauses } of plan.existing) {
        const data = {};
        if (startDate !== habit.start_date) data.start_date = startDate;
        if (pauses) data.pauses = pauses;
        if (Object.keys(data).length) {
          await withRetry(() =>
            pb
              .collection("habits")
              .update(habit.id, data, { requestKey: null }),
          );
        }
        for (const date of dates) pendingCheckins.push([habit.id, date]);
      }

      const total = pendingCheckins.length;
      onProgress(0, total);
      for (let i = 0; i < total; i += IMPORT_BATCH) {
        const chunk = pendingCheckins.slice(i, i + IMPORT_BATCH);
        const started = Date.now();
        await withRetry(() => {
          const batch = pb.createBatch();
          for (const [habit, date] of chunk) {
            batch.collection("checkins").create({ user, habit, date });
          }
          return batch.send({ requestKey: null });
        });
        onProgress(Math.min(total, i + IMPORT_BATCH), total);
        const pause = IMPORT_BATCH_GAP_MS - (Date.now() - started);
        if (i + IMPORT_BATCH < total && pause > 0) {
          await new Promise((resolve) => setTimeout(resolve, pause));
        }
      }

      await store.load();
      return total;
    },

    /**
     * Starts a habit over: deletes all of its check-ins, then moves its start
     * date to `today`. Pauses end up as if the habit had just been created
     * (one that is paused now stays paused from today). The check-ins go first,
     * so if this fails part way the habit is still intact and doing it again
     * finishes the job. Returns how many check-ins were deleted.
     */
    async resetHabit(id, today) {
      const habit = store.habit(id);
      store.changes++;

      // Ask the server, not the cache: another device may have added more.
      const records = await withRetry(() =>
        pb.collection("checkins").getFullList({
          filter: pb.filter("habit = {:habit}", { habit: id }),
          fields: "id",
          batch: 1000,
          requestKey: null,
        }),
      );

      for (let i = 0; i < records.length; i += IMPORT_BATCH) {
        const chunk = records.slice(i, i + IMPORT_BATCH);
        const started = Date.now();
        await withRetry(() => {
          const batch = pb.createBatch();
          for (const { id: checkinId } of chunk) {
            batch.collection("checkins").delete(checkinId);
          }
          return batch.send({ requestKey: null });
        });
        // Forget what's gone, so a failure later on doesn't leave deleted
        // days showing as done.
        const gone = new Set(chunk.map((r) => r.id));
        const dates = store.checkins.get(id);
        for (const [date, checkinId] of dates || []) {
          if (gone.has(checkinId)) dates.delete(date);
        }
        const pause = IMPORT_BATCH_GAP_MS - (Date.now() - started);
        if (i + IMPORT_BATCH < records.length && pause > 0) {
          await new Promise((resolve) => setTimeout(resolve, pause));
        }
      }

      // Running and planned pauses stay; the ones that are over go with
      // the history.
      const record = await pb.collection("habits").update(id, {
        start_date: today,
        pauses: pausesFrom(habit, today),
      });
      store.habits = sortHabits(
        store.habits.map((h) => (h.id === id ? record : h)),
      );
      store.checkins.delete(id);
      store.saveCache();
      return records.length;
    },

    /** Saves a new order; `ids` lists habits top to bottom. */
    async reorder(ids) {
      const changed = [];
      ids.forEach((id, index) => {
        const habit = store.habit(id);
        if (habit && habit.sort_order !== index + 1) {
          habit.sort_order = index + 1;
          changed.push(habit);
        }
      });
      store.changes++;
      store.habits = sortHabits(store.habits);
      store.saveCache();
      await Promise.all(
        changed.map((h) =>
          pb
            .collection("habits")
            .update(h.id, { sort_order: h.sort_order }, { requestKey: null }),
        ),
      );
    },
  };
  return store;
}
