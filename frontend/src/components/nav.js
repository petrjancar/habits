import { pb } from "../pb.js";
import { LOGIN_URL } from "../auth.js";
import { initials } from "../format.js";

// The displayed user comes from $store.auth.user (see app.js).
export const navComponent = () => ({
  initials,

  /** "page" for the link to the current page (used for aria-current). */
  current(href) {
    const path = window.location.pathname;
    const here = path === "/index.html" ? "/" : path;
    return here === href ? "page" : false;
  },

  logout() {
    pb.authStore.clear();
    window.location.href = LOGIN_URL;
  },
});
