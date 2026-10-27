import { pb } from "./pb.js";

export const LOGIN_URL = "/login/";
export const HOME_URL = "/";

export function isLoggedIn() {
  return pb.authStore.isValid && !!pb.authStore.record;
}

/**
 * Guard for pages that need a logged-in user.
 * Redirects to the login page and returns false when there is no valid session.
 * While the page stays open, it also redirects as soon as the session ends
 * (logout in another tab, token rejected on refresh, account deleted).
 */
export function requireAuth(redirectTo = LOGIN_URL) {
  if (!isLoggedIn()) {
    window.location.href = redirectTo;
    return false;
  }

  pb.authStore.onChange((token, record) => {
    if (!token || !record) {
      window.location.href = redirectTo;
    }
  });
  return true;
}

/**
 * Guard for guest-only pages (login, register).
 * Redirects away and returns true when the user is already logged in.
 */
export function redirectIfAuthed(redirectTo = HOME_URL) {
  if (pb.authStore.isValid) {
    window.location.href = redirectTo;
    return true;
  }
  return false;
}
