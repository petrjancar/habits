import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountComponent } from "../../src/pages/account.js";
import { pb } from "../../src/pb.js";
import { pbError } from "../helpers.js";

vi.mock("../../src/pb.js", () => ({
  pb: {
    authStore: {
      isValid: false,
      record: null,
      token: "mock-token",
      save: vi.fn(),
      clear: vi.fn(),
      onChange: vi.fn(),
    },
    collection: vi.fn(),
  },
}));

describe("accountComponent", () => {
  let updateMock;
  let deleteMock;
  let authWithPasswordMock;

  beforeEach(() => {
    vi.clearAllMocks();
    pb.authStore.isValid = true;
    pb.authStore.record = {
      id: "user_123",
      name: "Tester",
      email: "tester@example.com",
      created: "2026-01-01 00:00:00.000Z",
    };
    pb.authStore.save.mockImplementation((_token, record) => {
      pb.authStore.record = record;
    });
    updateMock = vi.fn();
    deleteMock = vi.fn();
    authWithPasswordMock = vi.fn();
    pb.collection.mockReturnValue({
      update: updateMock,
      delete: deleteMock,
      authWithPassword: authWithPasswordMock,
    });
    window.location.href = "/account/";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("initializes fields from the authenticated profile", () => {
    const component = accountComponent();

    component.init();

    expect(component.name).toBe("Tester");
    expect(component.email).toBe("tester@example.com");
    expect(pb.authStore.onChange).toHaveBeenCalled();
  });

  it("redirects to login when no authenticated profile exists", () => {
    pb.authStore.isValid = false;
    pb.authStore.record = null;

    accountComponent().init();

    expect(window.location.pathname).toBe("/login/");
  });

  it("redirects to login when the session ends while the page is open", () => {
    accountComponent().init();
    const onChange = pb.authStore.onChange.mock.calls[0][0];

    onChange("", null);

    expect(window.location.pathname).toBe("/login/");
  });

  it("updates the name and refreshes the auth-store record", async () => {
    const updatedUser = { ...pb.authStore.record, name: "Updated Tester" };
    updateMock.mockResolvedValueOnce(updatedUser);
    const component = accountComponent();
    component.name = "  Updated Tester  ";

    await component.save();

    expect(pb.collection).toHaveBeenCalledWith("users");
    // Email is read-only, so only the name is sent.
    expect(updateMock).toHaveBeenCalledWith("user_123", {
      name: "Updated Tester",
    });
    expect(pb.authStore.save).toHaveBeenCalledWith("mock-token", updatedUser);
    expect(component.name).toBe("Updated Tester");
    expect(component.successMessage).toBe("Profile updated.");
    expect(component.loading).toBe(false);
  });

  it("does not save an empty name", async () => {
    const component = accountComponent();
    component.name = "   ";

    await component.save();

    expect(component.fieldErrors).toEqual({ name: "Name cannot be empty." });
    expect(component.loading).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("shows field errors returned by PocketBase", async () => {
    updateMock.mockRejectedValueOnce(
      pbError(400, {
        name: { code: "validation_length_out_of_range", message: "Too long." },
      }),
    );
    const component = accountComponent();
    component.name = "Tester";

    await component.save();

    expect(component.fieldErrors).toEqual({ name: "Too long." });
    expect(component.errorMessage).toBe("");
    expect(pb.authStore.save).not.toHaveBeenCalled();
  });

  it("shows a general error when updating the profile fails", async () => {
    updateMock.mockRejectedValueOnce(pbError(500));
    const component = accountComponent();
    component.name = "Tester";

    await component.save();

    expect(component.errorMessage).toBe("Profile update failed.");
    expect(component.loading).toBe(false);
    expect(pb.authStore.save).not.toHaveBeenCalled();
  });

  it("deletes the account and clears auth", async () => {
    deleteMock.mockResolvedValueOnce(true);
    const component = accountComponent();

    await component.deleteAccount();

    expect(deleteMock).toHaveBeenCalledWith("user_123");
    expect(pb.authStore.clear).toHaveBeenCalled();
  });

  it("does not delete the account while another save is running", async () => {
    const component = accountComponent();
    component.passwordLoading = true;

    await component.deleteAccount();

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("reads the saved settings", () => {
    pb.authStore.record = {
      ...pb.authStore.record,
      theme: "dark",
      week_start: "sunday",
    };
    const component = accountComponent();

    component.init();

    expect(component.theme).toBe("dark");
    expect(component.weekStart).toBe("sunday");
  });

  it("applies and saves the theme", async () => {
    updateMock.mockResolvedValueOnce({ ...pb.authStore.record, theme: "dark" });
    const component = accountComponent();

    await component.setTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(updateMock).toHaveBeenCalledWith("user_123", { theme: "dark" });
    expect(pb.authStore.save).toHaveBeenCalled();
  });

  it("reverts the week start when saving fails", async () => {
    updateMock.mockRejectedValueOnce(pbError(0));
    const component = accountComponent();
    component.weekStart = "monday";

    await component.setWeekStart("sunday");

    expect(component.weekStart).toBe("monday");
    expect(component.settingsError).toMatch(/reach the server/);
  });

  it("formats the join date for display", () => {
    const formatted = accountComponent().formatDate("2026-01-01 00:00:00.000Z");

    expect(formatted).not.toBe("");
    expect(formatted).not.toContain("00:00:00");
  });

  describe("changePassword", () => {
    function filledPasswordForm() {
      const component = accountComponent();
      component.passwordForm = {
        oldPassword: "OldPassword123",
        password: "NewPassword456",
        passwordConfirm: "NewPassword456",
      };
      return component;
    }

    it("validates the form without calling PocketBase", async () => {
      const component = accountComponent();
      component.passwordForm = {
        oldPassword: "",
        password: "short",
        passwordConfirm: "other",
      };

      await component.changePassword();

      expect(component.passwordErrors).toEqual({
        oldPassword: "Enter your current password.",
        password: "Password must be at least 8 characters long.",
        passwordConfirm: "Passwords do not match.",
      });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("changes the password and logs in again with the new one", async () => {
      updateMock.mockResolvedValueOnce({});
      authWithPasswordMock.mockResolvedValueOnce({ token: "new-token" });
      const component = filledPasswordForm();

      await component.changePassword();

      expect(updateMock).toHaveBeenCalledWith("user_123", {
        oldPassword: "OldPassword123",
        password: "NewPassword456",
        passwordConfirm: "NewPassword456",
      });
      expect(authWithPasswordMock).toHaveBeenCalledWith(
        "tester@example.com",
        "NewPassword456",
      );
      expect(component.passwordSuccess).toBe("Password changed.");
      expect(component.passwordForm).toEqual({
        oldPassword: "",
        password: "",
        passwordConfirm: "",
      });
      expect(component.passwordLoading).toBe(false);
      expect(pb.authStore.clear).not.toHaveBeenCalled();
    });

    it("reports an incorrect current password", async () => {
      updateMock.mockRejectedValueOnce(
        pbError(400, {
          oldPassword: {
            code: "validation_invalid_old_password",
            message: "Missing or invalid old password.",
          },
        }),
      );
      const component = filledPasswordForm();

      await component.changePassword();

      expect(component.passwordErrors).toEqual({
        oldPassword: "Current password is incorrect.",
      });
      expect(component.passwordForm.oldPassword).toBe("OldPassword123");
      expect(component.passwordLoading).toBe(false);
      expect(authWithPasswordMock).not.toHaveBeenCalled();
    });

    it("shows a general error for non-field failures", async () => {
      updateMock.mockRejectedValueOnce(pbError(0));
      const component = filledPasswordForm();

      await component.changePassword();

      expect(component.passwordError).toMatch(/reach the server/);
    });

    it("logs out when re-authentication fails after the change", async () => {
      updateMock.mockResolvedValueOnce({});
      authWithPasswordMock.mockRejectedValueOnce(pbError(0));
      const component = filledPasswordForm();

      await component.changePassword();

      expect(pb.authStore.clear).toHaveBeenCalled();
      expect(component.passwordLoading).toBe(false);
    });
  });
});
