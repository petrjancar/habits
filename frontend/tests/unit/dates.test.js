import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  diffDays,
  eachDay,
  endOfMonth,
  startOfWeek,
  todayKey,
  weekday,
} from "../../src/lib/dates.js";

describe("dates", () => {
  it("formats today's local date", () => {
    expect(todayKey(new Date(2026, 9, 5, 23, 59))).toBe("2026-10-05");
  });

  it("adds days across month, year and DST boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-29", -1)).toBe("2026-03-28");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });

  it("counts days between keys", () => {
    expect(diffDays("2026-10-01", "2026-10-25")).toBe(24);
    expect(diffDays("2026-10-25", "2026-10-01")).toBe(-24);
  });

  it("numbers weekdays from Monday", () => {
    expect(weekday("2026-10-26")).toBe(0); // Monday
    expect(weekday("2026-10-25")).toBe(6); // Sunday
  });

  it("finds the start of the week for either first day", () => {
    expect(startOfWeek("2026-10-25", "monday")).toBe("2026-10-19");
    expect(startOfWeek("2026-10-25", "sunday")).toBe("2026-10-25");
    expect(startOfWeek("2026-10-24", "sunday")).toBe("2026-10-18");
  });

  it("handles months", () => {
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-01");
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });
});
