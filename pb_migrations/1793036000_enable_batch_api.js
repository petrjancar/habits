/// <reference path="../pb_data/types.d.ts" />

// Turns on the batch API, which CSV import uses to save up to 100 check-ins
// per request. API rules still apply to every record in a batch.

migrate(
  (app) => {
    const settings = app.settings();
    settings.batch.enabled = true;
    settings.batch.maxRequests = 100;
    settings.batch.timeout = 10;
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.batch.enabled = false;
    app.save(settings);
  },
);
