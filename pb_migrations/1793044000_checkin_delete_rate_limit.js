/// <reference path="../pb_data/types.d.ts" />

// Resetting a habit deletes its check-ins in batches of 100. Each one counts
// towards PocketBase's general limit (300 requests per 10 seconds), which would
// slow a reset of a long history down to a crawl, so deleting check-ins gets
// the same generous limit as creating them (see 1793040000_server_settings.js).

const LABEL = "checkins:delete";

migrate(
  (app) => {
    const settings = app.settings();
    const rules = settings.rateLimits.rules;
    if (!rules.some((rule) => rule.label === LABEL)) {
      rules.push({ label: LABEL, maxRequests: 2000, duration: 5 });
      settings.rateLimits.rules = rules;
      app.save(settings);
    }
  },
  (app) => {
    const settings = app.settings();
    settings.rateLimits.rules = settings.rateLimits.rules.filter(
      (rule) => rule.label !== LABEL,
    );
    app.save(settings);
  },
);
