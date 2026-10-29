/// <reference path="../pb_data/types.d.ts" />

// PocketBase serves the app's files without a Cache-Control header, so
// browsers guess how long to keep them. After an update a browser could reuse
// an old page whose style and script files no longer exist, and the page
// loaded unstyled.
//
// "no-cache" makes the browser check pages with the server on every load
// (a quick 304 when nothing changed). Hashed files in /assets/ are left
// alone: their names change with every build, so they can't go stale. The API
// and the admin dashboard (/_/) keep PocketBase's own headers.
routerUse((e) => {
  const path = e.request.url.path;
  const skip =
    path.startsWith("/api/") ||
    path === "/_" ||
    path.startsWith("/_/") ||
    path.startsWith("/assets/");

  if (!skip) {
    e.response.header().set("Cache-Control", "no-cache");
  }

  return e.next();
});
