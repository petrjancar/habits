# Changelog

The version lives in `frontend/package.json` and is shown at the bottom of the Account page. Each release is tagged in git as `vX.Y.Z`.

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
