import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerComponent } from "../../src/pages/register.js";
import { pb } from "../../src/pb.js";
import { pbError } from "../helpers.js";

vi.mock("../../src/pb.js", () => ({
  pb: {
    authStore: { isValid: false },
    collection: vi.fn(),
  },
}));

function filledForm() {
  const comp = registerComponent();
  comp.name = "Tester";
  comp.email = "tester@example.com";
  comp.password = "SecurePassword123";
  comp.passwordConfirm = "SecurePassword123";
  return comp;
}

describe("registerComponent", () => {
  let createMock;
  let authWithPasswordMock;
  let requestVerificationMock;

  beforeEach(() => {
    vi.clearAllMocks();
    pb.authStore.isValid = false;
    createMock = vi.fn();
    authWithPasswordMock = vi.fn();
    requestVerificationMock = vi.fn().mockResolvedValue(true);
    pb.collection.mockReturnValue({
      create: createMock,
      authWithPassword: authWithPasswordMock,
      requestVerification: requestVerificationMock,
    });
    window.location.href = "/register/";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("initializes with the correct default reactive state", () => {
    const comp = registerComponent();

    expect(comp.name).toBe("");
    expect(comp.email).toBe("");
    expect(comp.password).toBe("");
    expect(comp.passwordConfirm).toBe("");
    expect(comp.loading).toBe(false);
    expect(comp.errorMessage).toBe("");
    expect(comp.fieldErrors).toEqual({});
  });

  it("redirects to '/' on init() if authStore is valid", () => {
    pb.authStore.isValid = true;

    registerComponent().init();

    expect(window.location.pathname).toBe("/");
  });

  it("requires a name without calling PocketBase", async () => {
    const comp = filledForm();
    comp.name = "   ";

    await comp.submit();

    expect(comp.fieldErrors).toEqual({ name: "Please enter your name." });
    expect(pb.collection).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords without calling PocketBase", async () => {
    const comp = filledForm();
    comp.passwordConfirm = "DifferentPassword123";

    await comp.submit();

    expect(comp.fieldErrors).toEqual({
      passwordConfirm: "Passwords do not match.",
    });
    expect(comp.loading).toBe(false);
    expect(pb.collection).not.toHaveBeenCalled();
  });

  it("rejects passwords shorter than eight characters", async () => {
    const comp = filledForm();
    comp.password = "short";
    comp.passwordConfirm = "short";

    await comp.submit();

    expect(comp.fieldErrors).toEqual({
      password: "Password must be at least 8 characters long.",
    });
    expect(pb.collection).not.toHaveBeenCalled();
  });

  it("creates the account, authenticates, and redirects on success", async () => {
    createMock.mockResolvedValueOnce({ id: "user_123" });
    authWithPasswordMock.mockResolvedValueOnce({ token: "mock-token" });
    const comp = filledForm();
    comp.name = "  Tester  ";

    await comp.submit();

    expect(createMock).toHaveBeenCalledWith({
      email: "tester@example.com",
      password: "SecurePassword123",
      passwordConfirm: "SecurePassword123",
      name: "Tester",
    });
    expect(authWithPasswordMock).toHaveBeenCalledWith(
      "tester@example.com",
      "SecurePassword123",
    );
    expect(comp.errorMessage).toBe("");
    expect(comp.loading).toBe(false);
    expect(window.location.pathname).toBe("/");
  });

  it("shows a specific message when the email is already registered", async () => {
    createMock.mockRejectedValueOnce(
      pbError(400, {
        email: {
          code: "validation_not_unique",
          message: "Value must be unique.",
        },
      }),
    );
    const comp = filledForm();

    await comp.submit();

    expect(comp.fieldErrors).toEqual({
      email: "This email is already registered.",
    });
    expect(comp.errorMessage).toBe("");
    expect(comp.loading).toBe(false);
    expect(authWithPasswordMock).not.toHaveBeenCalled();
  });

  it("shows PocketBase's own message for other field errors", async () => {
    createMock.mockRejectedValueOnce(
      pbError(400, {
        email: {
          code: "validation_is_email",
          message: "Must be a valid email address.",
        },
      }),
    );
    const comp = filledForm();

    await comp.submit();

    expect(comp.fieldErrors).toEqual({
      email: "Must be a valid email address.",
    });
  });

  it("shows a general message when the error is not about a field", async () => {
    createMock.mockRejectedValueOnce(pbError(0));
    const comp = filledForm();

    await comp.submit();

    expect(comp.fieldErrors).toEqual({});
    expect(comp.errorMessage).toBe(
      "Can't reach the server. Check your connection and try again.",
    );
  });

  it("sends unverified users to login and requests a verification email", async () => {
    createMock.mockResolvedValueOnce({ id: "user_123" });
    authWithPasswordMock.mockRejectedValueOnce(pbError(403));
    const comp = filledForm();

    await comp.submit();

    expect(requestVerificationMock).toHaveBeenCalledWith("tester@example.com");
    expect(window.location.pathname).toBe("/login/");
    expect(window.location.search).toBe("?registered=verify");
    expect(comp.errorMessage).toBe("");
    expect(comp.loading).toBe(false);
  });

  it("still redirects when the verification email request fails", async () => {
    createMock.mockResolvedValueOnce({ id: "user_123" });
    authWithPasswordMock.mockRejectedValueOnce(pbError(403));
    requestVerificationMock.mockRejectedValueOnce(pbError(400));
    const comp = filledForm();

    await comp.submit();

    expect(window.location.search).toBe("?registered=verify");
  });

  it("sends the user to login when auto-login fails for another reason", async () => {
    createMock.mockResolvedValueOnce({ id: "user_123" });
    authWithPasswordMock.mockRejectedValueOnce(pbError(0));
    const comp = filledForm();

    await comp.submit();

    expect(requestVerificationMock).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/login/");
    expect(window.location.search).toBe("?registered=created");
    expect(comp.errorMessage).toBe("");
  });
});
