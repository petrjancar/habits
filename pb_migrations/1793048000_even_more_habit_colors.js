/// <reference path="../pb_data/types.d.ts" />

// Adds eight habit colours: teal, sky, indigo, rose, wine, orange, olive and
// slate. Keep in sync with HABIT_COLORS in frontend/src/lib/habits.js.

const BEFORE = [
  "pine",
  "emerald",
  "sage",
  "yellow",
  "ochre",
  "brick",
  "blue",
  "plum",
];
const ADDED = [
  "teal",
  "sky",
  "indigo",
  "rose",
  "wine",
  "orange",
  "olive",
  "slate",
];

migrate(
  (app) => {
    const habits = app.findCollectionByNameOrId("habits");
    habits.fields.getByName("color").values = [...BEFORE, ...ADDED];
    app.save(habits);
  },
  (app) => {
    // Habits using the removed colours fall back to pine first.
    app
      .db()
      .newQuery(
        `UPDATE habits SET color = 'pine' WHERE color IN (${ADDED.map((c) => `'${c}'`).join(", ")})`,
      )
      .execute();
    const habits = app.findCollectionByNameOrId("habits");
    habits.fields.getByName("color").values = BEFORE;
    app.save(habits);
  },
);
