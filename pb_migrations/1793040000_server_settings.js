/// <reference path="../pb_data/types.d.ts" />

// Server settings that used to be clicked through in the dashboard after each
// deployment (see the README). Applied once, on the first start.
//
// - Real client IPs: trust X-Real-IP, which the reverse proxy (e.g. Nginx
//   Proxy Manager) sets to the visitor's address.
// - Rate limiting on, with PocketBase's suggested rules (strict on login).
//   Check-ins (each one inside a batch counts) and batches are allowed more:
//   CSV import sends a batch of 100 at most every 300 ms, which stays under
//   these limits, and it waits and retries if it is limited anyway.
// - Users must have a name (the app always asks for one).

migrate(
  (app) => {
    const settings = app.settings();

    settings.trustedProxy.headers = ["X-Real-IP"];
    settings.trustedProxy.useLeftmostIP = false;

    settings.rateLimits.enabled = true;
    settings.rateLimits.rules = [
      { label: "*:auth", maxRequests: 2, duration: 3 },
      { label: "*:create", maxRequests: 20, duration: 5 },
      // Each check-in inside a batch counts as a create: allow full batches.
      { label: "checkins:create", maxRequests: 2000, duration: 5 },
      { label: "/api/batch", maxRequests: 20, duration: 5 },
      { label: "/api/", maxRequests: 300, duration: 10 },
    ];

    app.save(settings);

    const users = app.findCollectionByNameOrId("users");
    users.fields.getByName("name").required = true;
    app.save(users);
  },
  (app) => {
    const settings = app.settings();
    settings.trustedProxy.headers = [];
    settings.rateLimits.enabled = false;
    app.save(settings);

    const users = app.findCollectionByNameOrId("users");
    users.fields.getByName("name").required = false;
    app.save(users);
  },
);
