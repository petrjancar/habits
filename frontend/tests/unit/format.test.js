import { describe, expect, it } from "vitest";
import { formatDate, greeting, initials } from "../../src/format.js";

describe("formatDate", () => {
  it("formats PocketBase dates", () => {
    const expected = new Date("2026-01-31T12:00:00.000Z").toLocaleDateString(
      undefined,
      { dateStyle: "medium" },
    );
    expect(formatDate("2026-01-31 12:00:00.000Z")).toBe(expected);
  });

  it("handles empty and invalid values", () => {
    expect(formatDate("")).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("not a date")).toBe("not a date");
  });
});

describe("initials", () => {
  it("uses up to two initials from the name", () => {
    expect(initials({ name: "alice" })).toBe("A");
    expect(initials({ name: "  Alice  Bee Carter " })).toBe("AB");
  });

  it("falls back to the email, then to nothing", () => {
    expect(initials({ name: "", email: "bob@example.com" })).toBe("B");
    expect(initials(null)).toBe("");
  });
});

describe("greeting", () => {
  const at = (hour) => new Date(2026, 0, 1, hour);

  it("greets by part of day with the first name", () => {
    expect(greeting({ name: "Alice Bee" }, at(8))).toBe("Good morning, Alice");
    expect(greeting({ name: "Alice" }, at(14))).toBe("Good afternoon, Alice");
    expect(greeting({ name: "Alice" }, at(21))).toBe("Good evening, Alice");
    expect(greeting({ name: "Alice" }, at(2))).toBe("Good evening, Alice");
  });

  it("works without a name", () => {
    expect(greeting({ name: "" }, at(9))).toBe("Good morning");
    expect(greeting(null, at(9))).toBe("Good morning");
  });
});
