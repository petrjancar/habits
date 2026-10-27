import { describe, expect, it } from "vitest";
import {
  describeError,
  getFieldErrors,
  hasErrorCode,
} from "../../src/errors.js";
import { pbError } from "../helpers.js";

describe("errors", () => {
  const validationError = pbError(400, {
    email: { code: "validation_not_unique", message: "Value must be unique." },
    password: { code: "validation_required", message: "Cannot be blank." },
  });

  it("maps PocketBase validation errors to field messages", () => {
    expect(getFieldErrors(validationError)).toEqual({
      email: "Value must be unique.",
      password: "Cannot be blank.",
    });
  });

  it("returns no field errors for non-PocketBase errors", () => {
    expect(getFieldErrors(new Error("boom"))).toEqual({});
    expect(getFieldErrors(undefined)).toEqual({});
  });

  it("checks validation codes per field", () => {
    expect(
      hasErrorCode(validationError, "email", "validation_not_unique"),
    ).toBe(true);
    expect(
      hasErrorCode(validationError, "password", "validation_not_unique"),
    ).toBe(false);
    expect(hasErrorCode(new Error("boom"), "email", "x")).toBe(false);
  });

  it("describes network, rate-limit and other errors", () => {
    expect(describeError(pbError(0))).toMatch(/reach the server/);
    expect(describeError(pbError(429))).toMatch(/Too many attempts/);
    expect(describeError(pbError(500), "Custom fallback")).toBe(
      "Custom fallback",
    );
  });
});
