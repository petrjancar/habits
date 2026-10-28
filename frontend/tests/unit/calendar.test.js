import { describe, expect, it, vi } from "vitest";
import {
  monthGrid,
  moveDay,
  moveMonth,
  sameDayIn,
  weekdayHeads,
  yearGrid,
} from "../../src/lib/calendar.js";
import { createCalendar } from "../../src/components/calendar.js";

const key = (k, extra = {}) => ({ key: k, preventDefault: vi.fn(), ...extra });

describe("calendar grids", () => {
  it("fills six weeks around the month, from the week start", () => {
    const grid = monthGrid("2026-10-01", "monday");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ key: "2026-09-28", num: 28, outside: true });
    expect(grid[3]).toEqual({ key: "2026-10-01", num: 1, outside: false });
    expect(grid.at(-1).key).toBe("2026-11-08");

    expect(monthGrid("2026-10-15", "sunday")[0].key).toBe("2026-09-27");
    expect(weekdayHeads("sunday")[0]).toBe("Sun");
  });

  it("lists the months of a year", () => {
    const months = yearGrid(2027);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ key: "2027-01-01", label: "Jan" });
    expect(months[11].key).toBe("2027-12-01");
  });

  it("keeps the day of the month within shorter months", () => {
    expect(sameDayIn("2026-02-01", "2026-01-31")).toBe("2026-02-28");
    expect(sameDayIn("2026-03-01", "2026-01-15")).toBe("2026-03-15");
  });

  it("moves through days with the keyboard", () => {
    const from = "2026-10-28"; // a Wednesday
    expect(moveDay(from, key("ArrowLeft"))).toBe("2026-10-27");
    expect(moveDay(from, key("ArrowDown"))).toBe("2026-11-04");
    expect(moveDay(from, key("Home"))).toBe("2026-10-26");
    expect(moveDay(from, key("End"), "sunday")).toBe("2026-10-31");
    expect(moveDay(from, key("PageUp"))).toBe("2026-09-28");
    expect(moveDay(from, key("PageDown", { shiftKey: true }))).toBe(
      "2027-10-28",
    );
    expect(moveDay(from, key("a"))).toBe(null);
  });

  it("moves through months with the keyboard", () => {
    expect(moveMonth("2026-10-01", key("ArrowDown"))).toBe("2027-02-01");
    expect(moveMonth("2026-10-01", key("PageUp"))).toBe("2025-10-01");
    expect(moveMonth("2026-10-01", key("Enter"))).toBe(null);
  });
});

describe("calendar popover", () => {
  const dayPicker = (selected = "2026-10-20") => {
    const onPick = vi.fn();
    const cal = createCalendar();
    cal.setup({
      view: "days",
      today: () => "2026-10-28",
      selected: () => selected,
      level: (k) => (k === "2026-10-20" ? 3 : 0),
      onPick,
    });
    return { cal, onPick };
  };

  it("opens on the selected day's month", () => {
    const { cal } = dayPicker();
    cal.show();

    expect(cal.open).toBe(true);
    expect(cal.title).toBe("October 2026");
    const focused = cal.days.filter((d) => d.focus);
    expect(focused.map((d) => d.key)).toEqual(["2026-10-20"]);
    expect(cal.days.find((d) => d.key === "2026-10-20").level).toBe(3);
    // Upcoming days aren't coloured.
    expect(cal.days.find((d) => d.key === "2026-10-29").level).toBe(null);
  });

  it("goes back and forth by month and switches to a year of months", () => {
    const { cal } = dayPicker();
    cal.show();

    cal.shift(-1);
    expect(cal.title).toBe("September 2026");
    cal.switchView();
    expect(cal.view).toBe("months");
    expect(cal.title).toBe("2026");
    cal.shift(-2);
    expect(cal.title).toBe("2024");

    // Picking a month in a day picker opens its days.
    cal.pickMonth("2024-03-01");
    expect(cal.view).toBe("days");
    expect(cal.title).toBe("March 2024");
    expect(cal.open).toBe(true);
  });

  it("moves the focus with the keyboard, across months", () => {
    const { cal } = dayPicker("2026-10-31");
    cal.show();
    const event = key("ArrowRight");

    expect(cal.keydown(event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(cal.focus).toBe("2026-11-01");
    expect(cal.title).toBe("November 2026");
    expect(cal.keydown(key("x"))).toBe(false);
  });

  it("picks a day, or today", () => {
    const { cal, onPick } = dayPicker();
    cal.show();

    cal.pickDay("2026-10-05");
    expect(onPick).toHaveBeenLastCalledWith("2026-10-05");
    expect(cal.open).toBe(false);

    cal.show();
    cal.goToday();
    expect(onPick).toHaveBeenLastCalledWith("2026-10-28");
  });

  it("is a plain month picker when set up with months", () => {
    const onPick = vi.fn();
    const cal = createCalendar();
    cal.setup({
      view: "months",
      today: () => "2026-10-28",
      selected: () => "2026-06-01",
      onPick,
    });
    cal.show();

    expect(cal.canSwitch).toBe(false);
    expect(cal.months.find((m) => m.selected).key).toBe("2026-06-01");
    expect(cal.months.find((m) => m.isCurrent).key).toBe("2026-10-01");
    cal.switchView();
    expect(cal.view).toBe("months");

    cal.pickMonth("2026-02-01");
    expect(onPick).toHaveBeenCalledWith("2026-02-01");
    expect(cal.open).toBe(false);
  });
});
