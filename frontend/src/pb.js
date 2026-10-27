import PocketBase from "pocketbase";

export const pb = new PocketBase(import.meta.env.VITE_PB_URL || "/");

if (import.meta.env.DEV) {
  window.pb = pb;
}

// Refresh the token and the cached user record on page load. A rejected
// session clears the auth store, which logs the user out everywhere.
if (pb.authStore.isValid) {
  pb.collection("users")
    .authRefresh()
    .catch((err) => {
      if (err.status === 401 || err.status === 403) {
        pb.authStore.clear();
      }
    });
}
