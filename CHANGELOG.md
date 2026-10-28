# Changelog

The version lives in `frontend/package.json` and is shown at the bottom of the Account page. Each release is tagged in git as `vX.Y.Z`.

## 2.0.0 – 2026-10-28

A major version because CSV export and import are replaced by JSON backups (see **Breaking changes**). Your data in `pb_data` is kept as it is.

### Breaking changes

- **CSV export and import are removed**, replaced by [JSON backups](docs/how-it-works.md#backup-and-restore). A CSV can't hold pauses or more settings later. CSV files exported from 1.0.0 can no longer be imported.
- The Docker image for this version is tagged `:2` (and `:2.0`, `:2.0.0`, `:latest`). A compose file pinned to `:1` stays on 1.0.0; see **Upgrading**.

### New

- **Planned pauses.** "Plan a pause" on a habit's page pauses it from a first to a last day, such as a holiday, optionally for all active habits at once. Running and planned pauses are listed on the habit's page, where they can be removed or resumed, and paused days have their own colour in its calendar. See [How it works](docs/how-it-works.md#planning-a-pause).
- **Skip a day.** On Today, **Skip** next to a habit skips it on the selected day (past, today or upcoming), and **Skip the day** skips everything not done yet, for a sick day. Skipped days don't count and don't break streaks. Skipped and paused habits are listed under "Skipped or paused" with **Undo skip**. See [How it works](docs/how-it-works.md#skipping-a-day).
- **Reset progress.** On a habit's page, deletes its check-ins and starts it over from today; the habit and its running and planned pauses stay. It asks for confirmation and can't be undone. See [How it works](docs/how-it-works.md#resetting-a-habit).
- **Any day on Today.** The day strip shows a whole week and pages by week (arrows or swipe). Any past day can be checked off, not just the last 7, and upcoming days show what's scheduled. The picked day is kept in the address (`?date=`). See [How it works](docs/how-it-works.md#moving-between-days).
- **Calendar picker.** The month above the days on Today opens a calendar with each day coloured by how much was done, plus a month and year view. A habit's calendar uses the same picker to jump to any month, past or future.
- Squares in the 12-week calendar on Today and the 52-week calendar in Statistics open that day on Today.
- **Eight more habit colours:** teal, sky, indigo, rose, wine, orange, olive and slate, for 16 in all.
- **JSON backups.** Export data now downloads a backup with every habit, its settings, pauses, skipped days and check-ins, and Import data reads it back, adding only what's missing. See [How it works](docs/how-it-works.md#backup-and-restore).

### Changed

- **Weekly habits** ("2× a week") no longer lower the score of days when they could still be done later in the week. On Today they show "optional today" with a dashed circle and "+1 weekly" next to the day's score; they count on the day they're checked off, or as missed once the week is running out. Streaks and weekly, monthly and yearly rates are unchanged; the per-day views (Today, the day strip, the calendars, the daily bars in Statistics) change. See [How it works](docs/how-it-works.md#weekly-habits-on-a-single-day).
- **Habit calendar day menu.** Tapping a day in a habit's calendar no longer checks it off straight away. It opens a menu for that day: **Mark done / Mark not done**, **Skip this day / Undo skip** and **Open on Today**, so scrolling past the calendar can't change a day by accident.
- A habit's calendar is no longer limited to the months since it started: earlier months show the days before the start, and upcoming months show scheduled days.
- **Statistics:** with many habits, "By habit" scrolls inside its card on large screens and shows the first 6 with "Show all" on smaller ones.
- The add and edit habit dialog keeps its title and buttons in view and scrolls only the fields, with a visible scrollbar. Scrollbars across the app are thin and use the app's colours, with a solid thumb when the system asks for more contrast.
- "Pause habit", "Resume" and "Restore" keep planned pauses.

### Fixed

- A rate limit hit inside a batch request was never retried, so a large import could stop part way. It is now retried like other rate limits.

### Upgrading

1. Back up `pb_data` (stop the container and copy the folder).
2. In `docker-compose.yml`, change the image tag from `ghcr.io/petrjancar/habits:1` to `ghcr.io/petrjancar/habits:2`.
3. Run `docker compose pull && docker compose up -d`.

Two migrations run on the first start:

- `1793044000_checkin_delete_rate_limit.js` adds a rate-limit rule for deleting check-ins, so resetting a habit with a long history stays fast.
- `1793048000_even_more_habit_colors.js` lets the server store the eight new colours.

Nothing else changes in the stored data; pauses and skips use the existing `pauses` field.

## 1.0.0 – 2026-10-27

First release.

- **Today:** check off habits for today or any of the last 7 days, with daily progress, this week's rate and a 12-week consistency calendar.
- **Habits:** add, edit, reorder (drag or Alt + arrow keys), pause, archive, restore and delete habits; a month calendar per habit where any past day can be changed; current and longest streaks and monthly success rate.
- **Schedules:** every day, chosen weekdays, or a number of times per week.
- **Statistics:** success rate, completions, best streak, a chart and per-habit rates for a week, month, year or all time, a 52-week calendar and a short insight.
- **Account:** name, password, light/dark/system theme, first day of the week, CSV export and import, account deletion.
- Installable on a phone's home screen; works on phones and desktops.
- **Docker deployment:** ready-made images for amd64 and arm64 on the GitHub Container Registry (`ghcr.io/petrjancar/habits`). Each release tag publishes `:X.Y.Z`, `:X.Y`, `:X` and `:latest`. Every merge to `main` also publishes `:main` and `:sha-<commit>`; those are for testing, because migrations run when the container starts.
- The admin account is set with `PB_ADMIN_EMAIL` and `PB_ADMIN_PASSWORD` in your compose file. With the placeholder email nothing is created, so an unedited file can't start an admin with a published password.
- Server settings (rate limiting, real client IPs, a required user name) are applied by a migration on the first start.
