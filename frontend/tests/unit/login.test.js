import { beforeEach, describe, expect, it, vi } from "vitest";
import { loginComponent } from "../../src/pages/login.js";
import { pb } from "../../src/pb.js";
import { pbError } from "../helpers.js";

vi.mock("../../src/pb.js", () => ({
  pb: {
    authStore: { isValid: false },
    collection: vi.fn(),
  },
}));

describe("loginComponent", () => {
  let authWithPasswordMock;

  beforeEach(() => {
    vi.clearAllMocks();
    pb.authStore.isValid = false;
    authWithPasswordMock = vi.fn();
    pb.collection.mockReturnValue({ authWithPassword: authWithPasswordMock });
    window.location.href = "/login/";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("initializes with the correct default reactive state", () => {
    const comp = loginComponent();

    expect(comp.identity).toBe("");
    expect(comp.password).toBe("");
    expect(comp.loading).toBe(false);
    expect(comp.errorMessage).toBe("");
    expect(comp.infoMessage).toBe("");
  });

  it("redirects to '/' on init() if authStore is valid", () => {
    pb.authStore.isValid = true;

    loginComponent().init();

    expect(window.location.pathname).toBe("/");
  });

  it("does not redirect on init() if authStore is invalid", () => {
    loginComponent().init();

    expect(window.location.pathname).toBe("/login/");
  });

  it.each([
    ["created", "Account created. Please log in."],
    [
      "verify",
      "Account created. Check your email to verify your account, then log in.",
    ],
  ])("shows the post-registration notice for ?registered=%s", (value, text) => {
    window.location.href = `/login/?registered=${value}`;
    const comp = loginComponent();

    comp.init();

    expect(comp.infoMessage).toBe(text);
  });

  it("ignores unknown ?registered values", () => {
    window.location.href = "/login/?registered=<script>";
    const comp = loginComponent();

    comp.init();

    expect(comp.infoMessage).toBe("");
  });

  it("authenticates with identity and password, then redirects", async () => {
    authWithPasswordMock.mockResolvedValueOnce({ token: "mock-jwt-token" });
    const comp = loginComponent();
    comp.identity = "tester@example.com";
    comp.password = "SecurePassword123";

    await comp.submit();

    expect(pb.collection).toHaveBeenCalledWith("users");
    expect(authWithPasswordMock).toHaveBeenCalledWith(
      "tester@example.com",
      "SecurePassword123",
    );
    expect(comp.errorMessage).toBe("");
    expect(comp.loading).toBe(false);
    expect(window.location.pathname).toBe("/");
  });

  it.each([
    [400, "Invalid email or password."],
    [
      403,
      "Your account isn't verified yet. Check your email for the verification link.",
    ],
    [0, "Can't reach the server. Check your connection and try again."],
    [429, "Too many attempts. Please wait a moment and try again."],
    [500, "Login failed. Please try again."],
  ])("shows a specific message for status %s", async (status, message) => {
    authWithPasswordMock.mockRejectedValueOnce(pbError(status));
    const comp = loginComponent();

    await comp.submit();

    expect(comp.errorMessage).toBe(message);
    expect(comp.loading).toBe(false);
    expect(window.location.pathname).toBe("/login/");
    expect(console.error).toHaveBeenCalled();
  });
});
