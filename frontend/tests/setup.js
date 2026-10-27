// Runs before every test file (see test.setupFiles in vite.config.js).
import { beforeEach } from "vitest";

// happy-dom navigates for real when location.href is set, so every test gets
// a stub instead. Assigning href resolves the URL relative to the current one
// and updates pathname/search, which lets tests assert on redirects:
//
//   window.location.href = "/login/";              // start a test on a page
//   expect(window.location.pathname).toBe("/");    // assert a redirect
function stubLocation(url) {
  let currentUrl = new URL(url);
  delete window.location;
  window.location = {
    get href() {
      return currentUrl.href;
    },
    set href(value) {
      currentUrl = new URL(value, currentUrl.href);
    },
    get pathname() {
      return currentUrl.pathname;
    },
    get search() {
      return currentUrl.search;
    },
  };
}

beforeEach(() => {
  stubLocation("http://localhost/");
});
