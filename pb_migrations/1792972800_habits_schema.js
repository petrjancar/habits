/// <reference path="../pb_data/types.d.ts" />

// Initial schema for Habits:
// - users: per-user settings (theme, first day of the week)
// - habits: what to track and when
// - checkins: one record per habit per day it was done
//
// Dates are plain "YYYY-MM-DD" strings in the user's local calendar, so a day
// never shifts with time zones.

const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
const OWNER = "user = @request.auth.id";
// On update the owner can't be moved to someone else.
const OWNER_UPDATE =
  "user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)";

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(
      new SelectField({
        name: "theme",
        values: ["system", "light", "dark"],
        maxSelect: 1,
      }),
    );
    users.fields.add(
      new SelectField({
        name: "week_start",
        values: ["monday", "sunday"],
        maxSelect: 1,
      }),
    );
    app.save(users);

    const habits = new Collection({
      type: "base",
      name: "habits",
      listRule: OWNER,
      viewRule: OWNER,
      createRule:
        "@request.auth.id != '' && @request.body.user = @request.auth.id",
      updateRule: OWNER_UPDATE,
      deleteRule: OWNER,
      fields: [
        {
          type: "relation",
          name: "user",
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { type: "text", name: "name", required: true, min: 1, max: 80 },
        {
          type: "select",
          name: "color",
          required: true,
          maxSelect: 1,
          values: ["pine", "emerald", "sage", "yellow", "ochre", "brick"],
        },
        {
          type: "select",
          name: "frequency",
          required: true,
          maxSelect: 1,
          values: ["daily", "days", "weekly"],
        },
        // frequency "days": weekdays as numbers, 0 = Monday ... 6 = Sunday
        { type: "json", name: "days", maxSize: 200 },
        // frequency "weekly": check-ins needed per week (1-7)
        { type: "number", name: "target", min: 1, max: 7, onlyInt: true },
        { type: "text", name: "note", max: 1000 },
        { type: "number", name: "sort_order", onlyInt: true },
        // First day the habit counts.
        {
          type: "text",
          name: "start_date",
          required: true,
          pattern: DATE_PATTERN,
        },
        // Paused periods: [{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" | null }].
        // Days inside a pause don't count and don't break a streak.
        { type: "json", name: "pauses", maxSize: 20000 },
        // Day the habit was archived; empty while active.
        { type: "text", name: "archived_on", pattern: DATE_PATTERN },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_habits_user ON habits (user)"],
    });
    app.save(habits);

    const checkins = new Collection({
      type: "base",
      name: "checkins",
      listRule: OWNER,
      viewRule: OWNER,
      createRule:
        "@request.auth.id != '' && @request.body.user = @request.auth.id && @request.body.habit.user = @request.auth.id",
      // Check-ins are only ever created or deleted, never edited.
      updateRule: null,
      deleteRule: OWNER,
      fields: [
        {
          type: "relation",
          name: "user",
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          type: "relation",
          name: "habit",
          required: true,
          collectionId: habits.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { type: "text", name: "date", required: true, pattern: DATE_PATTERN },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_checkins_habit_date ON checkins (habit, date)",
        "CREATE INDEX idx_checkins_user_date ON checkins (user, date)",
      ],
    });
    app.save(checkins);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("checkins"));
    app.delete(app.findCollectionByNameOrId("habits"));
    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("theme");
    users.fields.removeByName("week_start");
    app.save(users);
  },
);
