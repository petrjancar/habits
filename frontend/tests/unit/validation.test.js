import { describe, expect, it } from "vitest";
import { validateNewPassword } from "../../src/validation.js";

describe("validateNewPassword", () => {
  it("accepts a long enough, matching password", () => {
    expect(validateNewPassword("SecurePass123", "SecurePass123")).toEqual({});
  });

  it("rejects short and mismatched passwords", () => {
    expect(validateNewPassword("short", "other")).toEqual({
      password: "Password must be at least 8 characters long.",
      passwordConfirm: "Passwords do not match.",
    });
  });
});
