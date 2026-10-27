import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Alpine from "alpinejs";
import navHtml from "../../components/nav.html?raw";
import { startApp } from "../../src/app.js";
import { navComponent } from "../../src/components/nav.js";
import { pb } from "../../src/pb.js";

// A small in-memory auth store that notifies onChange listeners like the real one.
vi.mock("../../src/pb.js", () => {
  const listeners = [];
  const authStore = {
    token: "token",
    record: { id: "user_123", name: "Alice", email: "alice@example.com" },
    onChange: vi.fn((callback, fireImmediately) => {
      listeners.push(callback);
      if (fireImmediately) {
        callback(authStore.token, authStore.record);
      }
      return () => {};
    }),
    save(token, record) {
      authStore.token = token;
      authStore.record = record;
      listeners.forEach((callback) => callback(token, record));
    },
    clear: vi.fn(() => authStore.save("", null)),
  };
  return { pb: { authStore } };
});

describe("navComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.href = "/account/";
  });

  it("clears the session and redirects to login on logout", () => {
    navComponent().logout();

    expect(pb.authStore.clear).toHaveBeenCalled();
    expect(window.location.pathname).toBe("/login/");
  });

  it("marks the link to the current page", () => {
    window.location.href = "/stats/";
    const nav = navComponent();

    expect(nav.current("/stats/")).toBe("page");
    expect(nav.current("/")).toBe(false);
  });
});

describe("nav (rendered)", () => {
  const userName = () => document.querySelector("#nav-user-name");
  const avatar = () => document.querySelector("header .avatar");

  beforeAll(() => {
    pb.authStore.save("token", {
      id: "user_123",
      name: "Alice",
      email: "alice@example.com",
    });
    document.body.innerHTML = navHtml;
    startApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.location.href = "/account/";
  });

  it("shows the logged-in user's name and initials", () => {
    expect(userName().textContent).toBe("Alice");
    expect(avatar().textContent).toBe("A");
    expect(avatar().closest("a").getAttribute("href")).toBe("/account/");
  });

  it("updates when the user record changes", async () => {
    pb.authStore.save("token", { ...pb.authStore.record, name: "Alice B" });
    await Alpine.nextTick();

    expect(userName().textContent).toBe("Alice B");
    expect(avatar().textContent).toBe("AB");
  });

  it("falls back to the email when the user has no name", async () => {
    pb.authStore.save("token", { ...pb.authStore.record, name: "" });
    await Alpine.nextTick();

    expect(userName().textContent).toBe("alice@example.com");
    expect(avatar().textContent).toBe("A");
  });

  it("logs out when the Logout button is clicked", async () => {
    document.querySelector("header button").click();
    await Alpine.nextTick();

    expect(pb.authStore.clear).toHaveBeenCalled();
    expect(window.location.pathname).toBe("/login/");
    expect(userName().textContent).toBe("");
  });
});
