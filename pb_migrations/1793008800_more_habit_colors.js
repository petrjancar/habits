/// <reference path="../pb_data/types.d.ts" />

// Adds two habit colours: blue and plum.

const BASE = ["pine", "emerald", "sage", "yellow", "ochre", "brick"];

migrate(
  (app) => {
    const habits = app.findCollectionByNameOrId("habits");
    habits.fields.getByName("color").values = [...BASE, "blue", "plum"];
    app.save(habits);
  },
  (app) => {
    // Habits using the removed colours fall back to pine first.
    app
      .db()
      .newQuery("UPDATE habits SET color = 'pine' WHERE color IN ('blue', 'plum')")
      .execute();
    const habits = app.findCollectionByNameOrId("habits");
    habits.fields.getByName("color").values = BASE;
    app.save(habits);
  },
);
