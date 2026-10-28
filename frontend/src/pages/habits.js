import Sortable from "sortablejs";
import { pb } from "../pb.js";
import { requireAuth } from "../auth.js";
import { createStore } from "../data.js";
import { describeError, getFieldErrors } from "../errors.js";
import {
  WEEKDAY_SHORT,
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  formatKey,
  startOfMonth,
  startOfWeek,
  isDateKey,
  todayKey,
  weekdayOrder,
} from "../lib/dates.js";
import { createCalendar } from "../components/calendar.js";
import {
  HABIT_COLORS,
  colorVars,
  completion,
  isActiveOn,
  isArchived,
  canSkip,
  isPaused,
  isPausedOn,
  isScheduledOn,
  isSkippedOn,
  isWeekly,
  nextPause,
  pauseList,
  pauseRange,
  pausedFrom,
  percent,
  planPause,
  removePause,
  restoredOn,
  resumedOn,
  skipDay,
  unskipDay,
  scheduleLabel,
  streakInfo,
  streakLabel,
} from "../lib/habits.js";

export const FREQUENCIES = [
  { key: "daily", label: "Every day", hint: "Shows up every day." },
  {
    key: "days",
    label: "Some days",
    hint: "Shows up only on the days you pick. Other days don't break the streak.",
  },
  {
    key: "weekly",
    label: "Per week",
    hint: "Done when you reach the weekly goal, on any days. The streak counts weeks.",
  },
];

const emptyForm = () => ({
  mode: "new",
  name: "",
  color: "yellow",
  frequency: "daily",
  days: [true, false, true, false, true, false, false],
  target: 3,
  note: "",
});

/** The question asked before a habit is reset. */
export function resetText(name, checkins) {
  const start = `start “${name}” over from today`;
  if (!checkins) return `Reset “${name}”? Its start date moves to today.`;
  const count = `${checkins} check-in${checkins === 1 ? "" : "s"}`;
  return `Delete ${count} and ${start}? Its streaks and statistics will be lost, and this can't be undone.`;
}

const mediumDate = (key) =>
  formatKey(key, { month: "short", day: "numeric", year: "numeric" });

/** "Mon, Nov 2" for the pause form's date buttons. */
export const pauseDay = (key) =>
  key
    ? formatKey(key, { weekday: "short", month: "short", day: "numeric" })
    : "";

/** For the habits list: "Paused", "Paused until Nov 8" or "Pause from Nov 2". */
export function pauseNote(habit, today) {
  const [first] = pauseList(habit, today);
  if (first?.now) {
    if (first.skip) return "Skipped today";
    return first.to ? `Paused until ${shortDay(first.to)}` : "Paused";
  }
  const next = nextPause(habit, today);
  if (!next) return "";
  return next.from === next.to
    ? `Skip on ${shortDay(next.from)}`
    : `Pause from ${shortDay(next.from)}`;
}

const shortDay = (key) => formatKey(key, { month: "short", day: "numeric" });

/** The note on a paused habit's page. */
export function pausedText(habit, today) {
  const [first] = pauseList(habit, today);
  if (!first?.now) return "";
  if (first.skip) {
    return "This habit is skipped today. It doesn't count, and its streak is kept.";
  }
  return first.to
    ? `This habit is paused until ${mediumDate(first.to)}. Its streak is kept, and it's back on Today the day after.`
    : "This habit is paused. Its streak is kept, and it's hidden from Today until you resume it.";
}

export const habitsComponent = ({
  store = createStore(),
  now = () => new Date(),
} = {}) => ({
  colors: HABIT_COLORS.map((c) => ({ ...c, ...colorVars(c.key) })),
  pauseDay,
  frequencies: FREQUENCIES,
  loading: true,
  error: "",
  today: "",
  active: [],
  archived: [],
  archiveOpen: false,
  selectedId: "",
  month: "",
  // The calendar day whose menu is open ("" for none).
  dayMenu: "",
  cal: createCalendar(),
  // "Plan a pause": first and last paused day, and whether it's for every habit.
  pauseForm: { open: false, from: "", to: "", all: false, error: "" },
  pauseFromCal: createCalendar(),
  pauseToCal: createCalendar(),
  pauseNotice: "",
  detail: null,
  confirmDelete: false,
  confirmReset: false,
  busy: false,
  form: emptyForm(),
  formErrors: {},
  formError: "",
  saving: false,

  async init() {
    if (!requireAuth()) {
      return;
    }
    this.today = todayKey(now());
    this.cal.setup({
      view: "months",
      weekStart: () => this.weekStart(),
      today: () => this.today,
      selected: () => this.month || startOfMonth(this.today),
      onPick: (key) => this.goToMonth(key),
    });
    const pausePicker = (field, min) => ({
      view: "days",
      weekStart: () => this.weekStart(),
      today: () => this.today,
      selected: () => this.pauseForm[field],
      min,
      onPick: (key) => this.setPauseDay(field, key),
    });
    this.pauseFromCal.setup(pausePicker("from", () => this.today));
    this.pauseToCal.setup(
      pausePicker("to", () => this.pauseForm.from || this.today),
    );
    const params = new URLSearchParams(window.location.search);
    // Draw right away from the last known data, then refresh it.
    const cached = store.loadCached();
    if (cached) {
      this.loading = false;
      this.selectInitial(params);
    }
    try {
      await store.load();
    } catch (err) {
      console.error(err);
      this.error = describeError(
        err,
        "Couldn't load your habits. Please reload the page.",
      );
    } finally {
      this.loading = false;
    }

    if (!cached) {
      this.selectInitial(params);
    } else if (this.selectedId && !store.habit(this.selectedId)) {
      // The habit was deleted elsewhere since the cached copy.
      this.select(this.isWide() ? this.firstHabitId() : "");
    } else {
      this.refresh();
    }
    if (params.get("new")) {
      this.openNew();
    }
    this.$nextTick?.(() => this.setupSortable());
  },

  selectInitial(params) {
    const id = params.get("id");
    if (id && store.habit(id)) {
      this.select(id, { updateUrl: false });
    } else if (this.isWide() && store.habits.length) {
      this.select(this.firstHabitId(), { updateUrl: false });
    } else {
      this.refresh();
    }
  },

  isWide() {
    return window.matchMedia?.("(min-width: 768px)").matches ?? true;
  },

  weekStart() {
    return pb.authStore.record?.week_start || "monday";
  },

  firstHabitId() {
    return (
      (store.habits.find((h) => !isArchived(h)) ?? store.habits[0])?.id ?? ""
    );
  },

  setUrl(params) {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams(params).toString();
    window.history.replaceState?.(null, "", url);
  },

  // -------------------------------------------------------------------------
  // View model
  // -------------------------------------------------------------------------

  refresh() {
    const today = this.today;
    const weekStart = this.weekStart();
    const row = (habit, i) => {
      const streak = streakInfo(
        habit,
        store.doneOf(habit.id),
        today,
        weekStart,
      );
      return {
        id: habit.id,
        name: habit.name,
        sub: isArchived(habit)
          ? `Archived ${mediumDate(habit.archived_on)}`
          : [scheduleLabel(habit), pauseNote(habit, today)]
              .filter(Boolean)
              .join(" · "),
        color: colorVars(habit.color).bg,
        streak: streak.current,
        streakText: streakLabel(streak.current, streak.unit),
        selected: habit.id === this.selectedId,
        first: i === 0,
      };
    };
    this.active = store.habits.filter((h) => !isArchived(h)).map(row);
    this.archived = store.habits.filter(isArchived).map(row);
    this.detail = this.buildDetail();
  },

  buildDetail() {
    const habit = store.habit(this.selectedId);
    if (!habit) return null;
    const today = this.today;
    const weekStart = this.weekStart();
    const done = store.doneOf(habit.id);
    const streak = streakInfo(habit, done, today, weekStart);
    const color = colorVars(habit.color);
    const weekly = isWeekly(habit);

    const month = this.month || startOfMonth(today);
    const monthEnd = endOfMonth(month);
    const rate = completion(habit, done, month, monthEnd, today, weekStart);
    const pct = percent(rate.done, rate.total);

    const cells = [];
    const lead = diffDays(startOfWeek(month, weekStart), month);
    for (let i = 0; i < lead; i++)
      cells.push({ key: `blank-${i}`, blank: true, num: "", style: {} });
    for (let key = month; key <= monthEnd; key = addDays(key, 1)) {
      const isDone = done.has(key);
      const due = weekly ? isActiveOn(habit, key) : isScheduledOn(habit, key);
      const future = key > today;
      let state = "off";
      if (key < habit.start_date) state = "before";
      else if (isPausedOn(habit, key) && !isDone) state = "paused";
      else if (future) state = due ? "upcoming" : "future";
      else if (isDone && due) state = "done";
      else if (due && !weekly && key < today) state = "missed";
      else if (due) state = "open";
      const label = formatKey(key, { month: "long", day: "numeric" });
      const status = {
        done: "done",
        missed: "missed",
        open: "not done yet",
        off: "not scheduled",
        before: "before the habit started",
        paused: "paused",
        upcoming: "scheduled",
        future: "not scheduled",
      }[state];
      cells.push({
        key,
        blank: false,
        num: Number(key.slice(8)),
        state,
        status,
        due,
        done: state === "done",
        // Opens the day menu. Days before the start, and days that aren't
        // scheduled and have nothing checked, have nothing to offer.
        clickable: !["before", "off", "future"].includes(state) || isDone,
        isToday: key === today,
        aria: `${label}, ${status}${key === today ? ", today" : ""}`,
        style:
          state === "done" ? { background: color.bg, color: color.fg } : {},
      });
    }

    const monthName = formatKey(month, { month: "long" });
    const monthHint =
      month < startOfMonth(habit.start_date)
        ? `Started ${mediumDate(habit.start_date)}.`
        : month > startOfMonth(today)
          ? "Tap a day to skip it."
          : "Tap a day to check it off or skip it.";

    // The menu for the day picked in the calendar.
    const picked = cells.find((c) => c.key === this.dayMenu && c.clickable);
    const menu = picked
      ? {
          key: picked.key,
          title: formatKey(picked.key, {
            weekday: "long",
            month: "long",
            day: "numeric",
          }),
          status:
            isSkippedOn(habit, picked.key) && !done.has(picked.key)
              ? "Skipped"
              : picked.status[0].toUpperCase() + picked.status.slice(1),
          done: done.has(picked.key),
          canToggle:
            picked.key <= today && (done.has(picked.key) || picked.due),
          canSkip: canSkip(habit, done, picked.key),
          skipped: isSkippedOn(habit, picked.key),
          href: `/?date=${picked.key}`,
        }
      : null;
    return {
      id: habit.id,
      name: habit.name,
      sub: `${scheduleLabel(habit)} · since ${mediumDate(habit.start_date)}`,
      note: habit.note,
      color: color.bg,
      weekly,
      paused: isPaused(habit, today),
      pausedText: pausedText(habit, today),
      pauses: isArchived(habit) ? [] : pauseList(habit, today),
      archived: isArchived(habit),
      // Nothing to reset on a habit that has no check-ins and starts today.
      canReset: done.size > 0 || habit.start_date < today,
      resetText: resetText(habit.name, done.size),
      archivedText: habit.archived_on
        ? `Archived on ${mediumDate(habit.archived_on)}.`
        : "",
      streakText: streakLabel(streak.current, streak.unit),
      longestText: streakLabel(streak.longest, streak.unit),
      monthName,
      monthTitle: formatKey(month, { month: "long", year: "numeric" }),
      pctText: pct === null ? "–" : `${pct}%`,
      monthHint,
      menu,
      hasPaused: cells.some((c) => c.state === "paused"),
      futureMonth: month > startOfMonth(today),
      weekdays: weekdayOrder(weekStart).map((d) => WEEKDAY_SHORT[d]),
      cells,
    };
  },

  // -------------------------------------------------------------------------
  // Selection and calendar
  // -------------------------------------------------------------------------

  select(id, { updateUrl = true } = {}) {
    this.selectedId = id;
    this.month = startOfMonth(this.today);
    this.confirmDelete = false;
    this.confirmReset = false;
    this.closePauseForm();
    this.pauseNotice = "";
    this.dayMenu = "";
    this.error = "";
    if (updateUrl) this.setUrl(id ? { id } : {});
    this.refresh();
    if (id && !this.isWide()) window.scrollTo?.(0, 0);
  },

  back() {
    this.select("");
  },

  shiftMonth(months) {
    this.goToMonth(addMonths(this.month || startOfMonth(this.today), months));
  },

  /** Shows a month, e.g. one picked in the calendar popover. */
  goToMonth(key) {
    if (!isDateKey(key)) return;
    this.month = startOfMonth(key);
    this.dayMenu = "";
    this.refresh();
  },

  // -------------------------------------------------------------------------
  // Day menu: tapping a calendar day asks what to do with it, so scrolling
  // past the calendar can't change a day by accident.
  // -------------------------------------------------------------------------

  openDayMenu(cell) {
    if (!cell.clickable) return;
    this.dayMenu = this.dayMenu === cell.key ? "" : cell.key;
    this.refresh();
    if (this.dayMenu) {
      this.$nextTick?.(() => document.getElementById("day-menu")?.focus());
    }
  },

  /** Closes the menu; `refocus` puts the focus back on its day. */
  closeDayMenu(refocus = false) {
    const key = this.dayMenu;
    this.dayMenu = "";
    this.refresh();
    if (refocus && key) {
      this.$nextTick?.(() =>
        document.querySelector(`[data-day="${key}"]`)?.focus(),
      );
    }
  },

  async toggleDay(key) {
    // Not while a reset or another change to the habit is running.
    if (this.busy) return;
    this.error = "";
    this.closeDayMenu(true);
    const ok = await store.toggle(this.selectedId, key, () => this.refresh());
    if (!ok) {
      this.error =
        "Couldn't save that change. Check your connection and try again.";
    }
  },

  skipCalendarDay(key) {
    const habit = store.habit(this.selectedId);
    this.closeDayMenu(true);
    return this.run(
      () => store.updateHabit(habit.id, { pauses: skipDay(habit, key) }),
      "Couldn't skip the day. Please try again.",
    );
  },

  unskipCalendarDay(key) {
    const habit = store.habit(this.selectedId);
    this.closeDayMenu(true);
    return this.run(
      () => store.updateHabit(habit.id, { pauses: unskipDay(habit, key) }),
      "Couldn't undo the skip. Please try again.",
    );
  },

  // -------------------------------------------------------------------------
  // Actions on the selected habit
  // -------------------------------------------------------------------------

  async run(action, failure) {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      await action();
    } catch (err) {
      console.error(err);
      this.error = describeError(err, failure);
    } finally {
      this.busy = false;
      this.refresh();
    }
  },

  togglePause() {
    const habit = store.habit(this.selectedId);
    const pauses = isPaused(habit, this.today)
      ? resumedOn(habit, this.today)
      : pausedFrom(habit, this.today);
    return this.run(
      () => store.updateHabit(habit.id, { pauses }),
      "Couldn't change the habit. Please try again.",
    );
  },

  // -------------------------------------------------------------------------
  // Planned pauses
  // -------------------------------------------------------------------------

  openPauseForm() {
    const tomorrow = addDays(this.today, 1);
    this.confirmReset = false;
    this.confirmDelete = false;
    this.pauseNotice = "";
    this.pauseForm = {
      open: true,
      from: tomorrow,
      to: addDays(tomorrow, 6),
      all: false,
      error: "",
    };
  },

  closePauseForm() {
    this.pauseForm.open = false;
    this.pauseFromCal.hide();
    this.pauseToCal.hide();
  },

  /** A day picked in the form; the last day never ends up before the first. */
  setPauseDay(field, key) {
    this.pauseForm[field] = key;
    if (field === "from" && this.pauseForm.to < key) this.pauseForm.to = key;
    this.pauseForm.error = "";
  },

  /** How many habits "All active habits" would pause. */
  activeCount() {
    return store.habits.filter((h) => !isArchived(h)).length;
  },

  savePause() {
    const today = this.today;
    const { from, to, all } = this.pauseForm;
    const habit = store.habit(this.selectedId);
    const own = planPause(
      habit,
      { from, to },
      today,
      store.isDone(habit.id, today),
    );
    if (own.error && !all) {
      this.pauseForm.error = own.error;
      return;
    }
    const targets = all ? store.habits.filter((h) => !isArchived(h)) : [habit];
    const changes = [];
    let movedToTomorrow = false;
    for (const h of targets) {
      const result =
        h.id === habit.id
          ? own
          : planPause(h, { from, to }, today, store.isDone(h.id, today));
      // The dates are the same for every habit, so the only error left for
      // another habit is "today is done and the pause is just today".
      if (result.error) {
        if (h.id === habit.id && !/checked off/.test(result.error)) {
          this.pauseForm.error = result.error;
          return;
        }
        continue;
      }
      if (result.from !== from) movedToTomorrow = true;
      changes.push({ id: h.id, data: { pauses: result.pauses } });
    }
    if (!changes.length) {
      this.pauseForm.error = own.error;
      return;
    }
    const range = pauseRange({ from, to });
    return this.run(async () => {
      await store.updateHabits(changes);
      this.closePauseForm();
      const who = all
        ? `${changes.length} habit${changes.length === 1 ? "" : "s"}`
        : "this habit";
      this.pauseNotice = `Pause planned for ${who}: ${range}.${
        movedToTomorrow
          ? all
            ? " Habits already checked off today start it tomorrow."
            : " Today is already checked off, so it starts tomorrow."
          : ""
      }`;
    }, "Couldn't plan the pause. Please try again.");
  },

  removePlannedPause(pause) {
    const habit = store.habit(this.selectedId);
    this.pauseNotice = "";
    return this.run(
      () =>
        store.updateHabit(habit.id, {
          pauses: removePause(habit, pause, this.today),
        }),
      "Couldn't remove the pause. Please try again.",
    );
  },

  toggleArchive() {
    const habit = store.habit(this.selectedId);
    const data = isArchived(habit)
      ? { archived_on: "", pauses: restoredOn(habit, this.today) }
      : { archived_on: this.today };
    if (!isArchived(habit)) this.archiveOpen = true;
    return this.run(
      () => store.updateHabit(habit.id, data),
      "Couldn't change the habit. Please try again.",
    );
  },

  resetHabit() {
    const id = this.selectedId;
    return this.run(async () => {
      await store.resetHabit(id, this.today);
      this.confirmReset = false;
      this.month = startOfMonth(this.today);
    }, "Couldn't reset the habit. Please try again.");
  },

  deleteHabit() {
    const id = this.selectedId;
    return this.run(async () => {
      await store.deleteHabit(id);
      this.confirmDelete = false;
      this.select(this.isWide() ? this.firstHabitId() : "");
    }, "Couldn't delete the habit. Please try again.");
  },

  // -------------------------------------------------------------------------
  // Reordering
  // -------------------------------------------------------------------------

  setupSortable() {
    const list = this.$refs?.list;
    if (!list || list._sortable) return;
    list._sortable = Sortable.create(list, {
      handle: ".drag-handle",
      draggable: "[data-id]",
      animation: 150,
      onEnd: (evt) => {
        const ids = [...list.querySelectorAll("[data-id]")].map(
          (el) => el.dataset.id,
        );
        // Put the node back where Alpine rendered it; Alpine re-renders the
        // list in the new order from the data.
        const { item, oldDraggableIndex } = evt;
        item.remove();
        const rows = list.querySelectorAll("[data-id]");
        list.insertBefore(item, rows[oldDraggableIndex] ?? null);
        this.saveOrder(ids);
      },
    });
  },

  /** Alt+Up / Alt+Down on a row moves it, for keyboard users. */
  moveWithKeys(event, id) {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const ids = this.active.map((r) => r.id);
    const from = ids.indexOf(id);
    const to = from + (event.key === "ArrowUp" ? -1 : 1);
    if (to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    this.saveOrder(ids).then(() =>
      this.$nextTick?.(() =>
        this.$refs?.list?.querySelector(`[data-id="${id}"] button`)?.focus(),
      ),
    );
  },

  async saveOrder(activeIds) {
    const archivedIds = store.habits.filter(isArchived).map((h) => h.id);
    const save = store.reorder([...activeIds, ...archivedIds]);
    this.refresh();
    try {
      await save;
    } catch (err) {
      console.error(err);
      this.error = describeError(
        err,
        "Couldn't save the new order. Please try again.",
      );
    }
  },

  // -------------------------------------------------------------------------
  // Add / edit form
  // -------------------------------------------------------------------------

  formDays() {
    return weekdayOrder(this.weekStart()).map((d) => ({
      index: d,
      label: WEEKDAY_SHORT[d],
    }));
  },

  frequencyHint() {
    return FREQUENCIES.find((f) => f.key === this.form.frequency)?.hint ?? "";
  },

  openNew() {
    this.form = emptyForm();
    this.formErrors = {};
    this.formError = "";
    this.showDialog();
  },

  openEdit() {
    const habit = store.habit(this.selectedId);
    if (!habit) return;
    this.form = {
      mode: "edit",
      name: habit.name,
      color: habit.color,
      frequency: habit.frequency,
      days: [0, 1, 2, 3, 4, 5, 6].map((d) => (habit.days || []).includes(d)),
      target: habit.target || 3,
      note: habit.note || "",
    };
    this.formErrors = {};
    this.formError = "";
    this.showDialog();
  },

  showDialog() {
    const dialog = this.$refs?.dialog;
    if (dialog && !dialog.open) dialog.showModal();
  },

  closeForm() {
    this.$refs?.dialog?.close();
    if (new URLSearchParams(window.location.search).get("new")) {
      this.setUrl(this.selectedId ? { id: this.selectedId } : {});
    }
  },

  setTarget(delta) {
    this.form.target = Math.min(7, Math.max(1, this.form.target + delta));
  },

  validateForm() {
    const errors = {};
    if (!this.form.name.trim()) errors.name = "Give the habit a name.";
    if (this.form.frequency === "days" && !this.form.days.some(Boolean)) {
      errors.days = "Pick at least one day.";
    }
    return errors;
  },

  formData() {
    const f = this.form;
    return {
      name: f.name.trim(),
      color: f.color,
      frequency: f.frequency,
      days:
        f.frequency === "days"
          ? f.days.flatMap((on, i) => (on ? [i] : []))
          : [],
      target: f.frequency === "weekly" ? f.target : 1,
      note: f.note.trim(),
    };
  },

  async saveForm() {
    this.formError = "";
    this.formErrors = this.validateForm();
    if (Object.keys(this.formErrors).length) return;

    this.saving = true;
    try {
      if (this.form.mode === "edit") {
        await store.updateHabit(this.selectedId, this.formData());
        this.closeForm();
        this.refresh();
      } else {
        const record = await store.createHabit({
          ...this.formData(),
          start_date: this.today,
          pauses: [],
        });
        this.closeForm();
        this.select(record.id);
      }
    } catch (err) {
      console.error(err);
      this.formErrors = getFieldErrors(err);
      if (!Object.keys(this.formErrors).length) {
        this.formError = describeError(
          err,
          "Couldn't save the habit. Please try again.",
        );
      }
    } finally {
      this.saving = false;
    }
  },
});
