# How it works

What the app does with your data, for people using it.

## How streaks and rates are counted

- Days that aren't scheduled, paused days and days before a habit's start never break a streak.
- Today (or the current week for weekly habits) only counts once it's done, so an unfinished today never lowers a streak or a rate.
- Archived habits are hidden from Today but keep counting in statistics up to the day they were archived. Restoring one turns the archived days into a pause, so its streak survives.
- Changing a habit's schedule also changes how its past days are counted.
- Weekly habits ("3× a week") count streaks in weeks.
- A new habit starts today, so earlier days can't be logged for it, unless you import them.

## CSV export and import

Export writes one row per check-in (plus one row for each habit without any): `habit, schedule, started, status, color, note, done_on`. Import reads the same format, so an export can move your data to another account or server.

- Only `habit` and `done_on` (or `date`) are required, so a hand-made sheet with a name and a date per row works. Comma and semicolon separated files both work, and dates can be `2026-10-26` or `26.10.2026`.
- Import only adds. Habits are matched by name (ignoring case); check-ins that are already there are skipped, so importing the same file twice changes nothing. Imported days before a habit's start move the start back.
- A new habit starts at the earlier of `started` and its first check-in. A `paused` or `archived` habit is paused or archived from the day after its last check-in.
- The account page shows what will change before anything is saved. Check-ins are saved 100 per request through PocketBase's batch API, which a migration turns on. If the import stops part way, importing the same file again finishes it.
