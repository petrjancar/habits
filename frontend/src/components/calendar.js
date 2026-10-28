// State for the calendar popover (components/calendar-popover.html). A page
// keeps one as `cal` and sets it up in init():
//
//   this.cal.setup({
//     view: "days",                       // or "months" to pick a month
//     weekStart: () => this.weekStart(),
//     today: () => this.today,
//     selected: () => this.selected,      // a day, or a month's first day
//     level: (key) => 0..4 or null,       // how much was done that day
//     onPick: (key) => this.select(key),  // the day or month picked
//     min: () => this.today,              // optional: no earlier days
//   });

import { addMonths, formatKey, startOfMonth } from "../lib/dates.js";
import {
  longDate,
  monthGrid,
  moveDay,
  moveMonth,
  sameDayIn,
  weekdayHeads,
  yearGrid,
} from "../lib/calendar.js";

export function createCalendar() {
  let config = {
    view: "days",
    weekStart: () => "monday",
    today: () => "",
    selected: () => "",
    level: () => null,
    onPick: () => {},
    min: () => "",
  };

  return {
    open: false,
    // "days" (a month of days) or "months" (a year of months).
    view: "days",
    // The month shown in the day view, and the year in the month view.
    month: "",
    year: 0,
    // The day or month that has keyboard focus (the only one with tabindex 0).
    focus: "",
    title: "",
    heads: [],
    days: [],
    months: [],
    // Only a day picker can switch between days and months.
    canSwitch: true,

    setup(options) {
      config = { ...config, ...options };
      this.view = config.view;
      this.canSwitch = config.view === "days";
    },

    /** Opens on the selected day or month. */
    show() {
      const selected = config.selected() || config.today();
      this.view = config.view;
      this.month = startOfMonth(selected);
      this.year = Number(selected.slice(0, 4));
      this.focus = this.view === "days" ? selected : this.month;
      this.render();
      this.open = true;
    },

    hide() {
      this.open = false;
    },

    toggle() {
      if (this.open) this.hide();
      else this.show();
    },

    render() {
      const today = config.today();
      const selected = config.selected();
      if (this.view === "days") {
        this.title = formatKey(this.month, { month: "long", year: "numeric" });
        this.heads = weekdayHeads(config.weekStart());
        const min = config.min();
        this.days = monthGrid(this.month, config.weekStart()).map((d) => {
          const level = d.key > today ? null : config.level(d.key);
          return {
            ...d,
            level,
            disabled: Boolean(min) && d.key < min,
            isToday: d.key === today,
            selected: d.key === selected,
            focus: d.key === this.focus,
            aria: `${longDate(d.key)}${d.key === today ? ", today" : ""}`,
          };
        });
      } else {
        this.title = String(this.year);
        const thisMonth = startOfMonth(today);
        this.months = yearGrid(this.year).map((m) => ({
          ...m,
          isCurrent: m.key === thisMonth,
          selected: m.key === startOfMonth(selected),
          focus: m.key === this.focus,
          aria: formatKey(m.key, { month: "long", year: "numeric" }),
        }));
      }
    },

    /** Previous / next month in the day view, year in the month view. */
    shift(by) {
      if (this.view === "days") {
        this.month = addMonths(this.month, by);
        this.focus = sameDayIn(this.month, this.focus);
      } else {
        this.year += by;
        this.focus = `${this.year}${this.focus.slice(4)}`;
      }
      this.render();
    },

    /** The title switches the day view to the month view, and back. */
    switchView() {
      if (this.view === "days") {
        this.view = "months";
        this.year = Number(this.month.slice(0, 4));
        this.focus = this.month;
      } else if (config.view === "days") {
        this.view = "days";
        this.month = startOfMonth(this.focus);
        this.focus = sameDayIn(this.month, config.selected() || this.month);
      }
      this.render();
    },

    pickDay(key) {
      const min = config.min();
      if (min && key < min) return;
      this.hide();
      config.onPick(key);
    },

    /** In a day picker, a month opens its days; otherwise it is the pick. */
    pickMonth(key) {
      if (config.view === "days") {
        this.view = "days";
        this.month = key;
        this.focus = sameDayIn(key, config.selected() || key);
        this.render();
      } else {
        this.hide();
        config.onPick(key);
      }
    },

    /** "Today" picks today; in a month picker, "This month" picks this month. */
    goToday() {
      const today = config.today();
      if (config.view === "days") this.pickDay(today);
      else this.pickMonth(startOfMonth(today));
    },

    /** Arrow keys and friends move the focus; returns true if it moved. */
    keydown(event) {
      if (this.view === "days") {
        let next = moveDay(this.focus, event, config.weekStart());
        if (!next) return false;
        const min = config.min();
        if (min && next < min) next = min;
        this.focus = next;
        this.month = startOfMonth(next);
      } else {
        const next = moveMonth(this.focus, event);
        if (!next) return false;
        this.focus = next;
        this.year = Number(next.slice(0, 4));
      }
      event.preventDefault();
      this.render();
      return true;
    },
  };
}
