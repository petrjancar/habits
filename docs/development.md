# Development

Implementation details for working on the code. For deploying and the basics, see the [README](../README.md).

## Stack

- **PocketBase** – single-binary backend: embedded SQLite database, authentication, admin dashboard, REST API with realtime updates (SSE).
- **Alpine.js** – small reactive framework; state and behaviour live in the HTML via `x-data`, `x-model`, `@click`, …
- **Tailwind CSS v4** – utility-first CSS with shared component classes and design tokens in `src/style.css`.
- **Vite** – dev server with hot reload and a proxy to PocketBase; bundles the production build into `pb_public/`.
- **vite-plugin-html-inject** – reusable HTML partials via `<load src="/components/x.html" />`.
- **Vitest + Happy DOM** – unit tests in Node without a browser.
- **Prettier** (with the Tailwind plugin) – formatting, including Tailwind class order.

## Running locally

| Mode        | Commands                                                            | Open                  |
| ----------- | ------------------------------------------------------------------- | --------------------- |
| Development | 1. `pocketbase serve` (root)<br>2. `npm run dev` (in `frontend/`)   | http://localhost:5173 |
| Production  | 1. `npm run build` (in `frontend/`)<br>2. `pocketbase serve` (root) | http://127.0.0.1:8090 |

In development Vite proxies `/api` and `/_` to PocketBase, so there are no CORS issues. In production PocketBase serves the built files from `pb_public/` and no Node.js is needed. The admin dashboard is at http://127.0.0.1:8090/_/. To create the first superuser from the command line: `pocketbase superuser upsert admin@example.com "StrongPassword"`.

## Frontend scripts

Run inside `frontend/`:

| Command                | What it does                                 |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Dev server with hot reload                   |
| `npm run build`        | Production build into `../pb_public`         |
| `npm run test`         | Unit tests in watch mode                     |
| `npm run test:run`     | Unit tests, single run (used in CI)          |
| `npm run format`       | Format all files with Prettier               |
| `npm run format:check` | Check formatting without changing files (CI) |

CI (`.github/workflows/ci.yml`) runs on every push and pull request to `main`. One job runs the format check, the tests and the frontend build. Another builds the Docker image (built only, not run), so a broken Dockerfile fails in CI before you deploy. A third job publishes the image to the GitHub Container Registry, and only on pushes (never pull requests) after the other two passed: a push to `main` publishes `ghcr.io/petrjancar/habits:main` and `:sha-<short commit>`, and a version tag such as `v1.0.0` publishes `:1.0.0`, `:1.0`, `:1` and `:latest`. Images are built for amd64 and arm64. `latest` therefore always means the newest release, not the newest merge. The first time, make the package public in its settings (Packages → habits → Package settings → Change visibility) so others can pull it without logging in.

## Project structure

```plaintext
habits/
├── frontend/
│   ├── index.html                 # Today (/)
│   ├── stats/, habits/, account/  # one folder with an index.html per page
│   ├── login/, register/
│   ├── components/                # HTML partials: head, nav, logo, auth panel, calendar popover
│   ├── public/                    # copied as-is (favicon, app icons, manifest.json)
│   ├── src/
│   │   ├── <page>.js              # page entry: startApp({ pageComponent })
│   │   ├── pages/<page>.js        # page components (Alpine data + logic)
│   │   ├── lib/dates.js           # "YYYY-MM-DD" calendar-day helpers
│   │   ├── lib/calendar.js        # month and year grids, keyboard moves for the calendar popover
│   │   ├── lib/habits.js          # schedules, streaks, rates, pauses and skips, statistics (pure, unit-tested)
│   │   ├── lib/backup.js          # backup file: export, and planning an import (pure, unit-tested)
│   │   ├── data.js                # loads and changes habits and check-ins
│   │   ├── theme.js               # light / dark / system theme
│   │   ├── components/            # shared Alpine components (nav, password field, heat art, calendar)
│   │   ├── app.js                 # startApp(): auth store, shared components, Alpine start
│   │   ├── pb.js                  # the single shared PocketBase client
│   │   ├── auth.js                # requireAuth(), redirectIfAuthed(), URL constants
│   │   ├── errors.js              # PocketBase error helpers (field errors, messages)
│   │   ├── validation.js          # shared client-side validation
│   │   ├── format.js              # dates, initials, greeting
│   │   └── style.css              # Tailwind, design tokens, component classes
│   ├── tests/                     # setup.js, helpers.js, unit/*.test.js
│   └── vite.config.js
├── pb_hooks/                      # optional PocketBase JS hooks (custom endpoints, events)
├── pb_migrations/                 # schema and server-settings migrations (tracked in git)
├── pb_data/                       # database and uploaded files (git-ignored)
├── pb_public/                     # production build output (git-ignored)
├── Dockerfile
├── docker-compose.yml             # yours, git-ignored: see the README for the file to create
├── docker-entrypoint.sh           # creates the superuser from your compose file, then starts PocketBase
├── docs/                          # these documents
└── pocketbase(.exe)               # PocketBase binary (git-ignored)
```

## How the frontend works

- **Pages.** Every `index.html` under `frontend/` is a page, picked up by the build automatically: `notes/index.html` is served at `/notes/`. Restart `npm run dev` after adding a page folder.
- **Page scripts.** Each page loads one entry script, e.g. `src/notes.js`, which only calls `startApp({ notesComponent })`. The component itself lives in `src/pages/notes.js` as an exported factory function so it can be unit-tested without starting Alpine.
- **Styles.** The stylesheet is linked in `components/head.html`. Don't import CSS from JavaScript; in dev mode that applies styles only after the scripts run and makes the page flash unstyled.
- **Auth.** `$store.auth.user` always holds the logged-in user and updates on login, logout, token refresh and changes in other tabs. Pages that need a user call `requireAuth()` in `init()`; guest-only pages call `redirectIfAuthed()`.
- **Errors.** Use the helpers in `src/errors.js` to show PocketBase validation errors under the right field (`fieldErrors.<field>`) and readable messages for network and rate-limit errors.
- **Design.** Colours, fonts and dark-mode values are tokens at the top of `src/style.css` (habit colours are `--color-habit-*`, heatmap shades `--color-heat-0..4`). Dark mode applies when the user picks "Dark", or "System" on a device in dark mode. Recurring elements use component classes (`.card`, `.input`, `.btn btn-primary`, `.segmented`, …); add Tailwind utilities next to them for one-off tweaks. The font (Hanken Grotesk) is bundled, so pages work without internet access.
- **Head.** Every page's `<head>` is `<load src="/components/head.html" />` (meta tags, manifest, favicon, stylesheet and a script that applies the saved theme before the first paint) followed by its `<title>`.
- **Password fields** use the shared `passwordField` component for the show/hide toggle; copy the markup from an existing password field.
- **No layout jumps between pages.** Pages draw straight from a copy of the user's data in `localStorage` (`data.js`, removed on logout) and refresh it in the background. The active nav tab and user name are in the initial HTML, scripts use `blocking="render"` (restored by a plugin in `vite.config.js`, which Vite would otherwise strip), `scrollbar-gutter: stable` reserves scrollbar space, and `@view-transition` cross-fades pages with the header kept still. Keep controls that must not pop in (segmented switches, headings) in the static HTML rather than generating them with `x-for`.

## Docker

The `Dockerfile` builds the frontend, downloads the pinned PocketBase release for the host architecture (amd64/arm64, checksum-verified) and runs it as a non-root user through `docker-entrypoint.sh`, which creates the superuser from `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` when they are set. Data lives in `pb_data/` next to your compose file, mounted into the container (git-ignored).

- Migrations in `pb_migrations/` and hooks in `pb_hooks/` are copied into the image and applied on startup. Auto-migrations are disabled in the container, so schema changes made in the server's dashboard are **not** saved as migration files. Make schema changes locally instead (see below).
- To bundle a different PocketBase version, change `PB_VERSION` in the `Dockerfile` (or `docker compose build --build-arg PB_VERSION=x.y.z`) and use the same version locally.

## Data model

The schema lives in `pb_migrations/` and is applied automatically when PocketBase starts. Calendar days are stored as `YYYY-MM-DD` text in the user's local calendar, so they never shift with time zones.

| Collection | Fields                                                                                                                                                                                              | Access                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `users`    | PocketBase defaults + `theme` (system/light/dark), `week_start` (monday/sunday)                                                                                                                     | own record                                         |
| `habits`   | `user`, `name`, `color`, `frequency` (daily/days/weekly), `days` (0 = Monday … 6 = Sunday), `target` (times per week), `note`, `sort_order`, `start_date`, `pauses` (`[{from, to}]`), `archived_on` | owner only                                         |
| `checkins` | `user`, `habit`, `date`; one record per habit per day it was done (unique)                                                                                                                          | owner only; creating one checks the habit is yours |

Deleting a user deletes their habits and check-ins; deleting a habit deletes its check-ins.

Three migrations configure the server rather than the schema: `*_enable_batch_api.js` (used by backup import, Reset progress, and pausing or skipping several habits at once), `*_server_settings.js` (rate limits, trusted proxy header, required user name) and `*_checkin_delete_rate_limit.js` (a rate limit for deleting check-ins, used by Reset progress). The rate limits for creating and deleting check-ins and for batches are set so a 100-request batch every 300 ms stays under them, which is what `importPlan()` and `resetHabit()` in `data.js` do.

The habit colours are a fixed list in three places that must match: `HABIT_COLORS` in `lib/habits.js`, the `--color-habit-*` tokens in `style.css` (light and dark) and the latest `*_habit_colors.js` migration. `tests/unit/colors.test.js` checks this.

### Changing the schema

- Make schema changes (collections, fields, API rules) in your **local** PocketBase dashboard. PocketBase writes each change as a migration file in `pb_migrations/`.
- Commit the migration files together with the frontend code that uses them.
- On the server, the Docker image applies new migrations on startup. Don't change the schema in the server's dashboard; those changes would not be recorded and would drift from git.

## Versioning and releases

Versions follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

- **MAJOR** – a change that needs action from people running the app or can't be undone: an incompatible change to the data or a migration that can't be rolled back, a changed backup file format (a new `version`) or environment variable, or a removed feature.
- **MINOR** – new features and other backwards-compatible changes, including changes to the Docker setup that need nothing from existing users.
- **PATCH** – bug fixes and small improvements. Dependency updates are patch releases unless they change how the app behaves.

The version lives only in `frontend/package.json` (and the matching two entries in `package-lock.json`). The Account page shows it, and every release gets an entry in `CHANGELOG.md`.

To release:

1. Raise the version in `package.json` and `package-lock.json` and add the entry to `CHANGELOG.md`.
2. Merge the pull request into `main` once CI is green.
3. Tag the merge commit: `git tag vX.Y.Z && git push origin vX.Y.Z`. CI publishes the image as `:X.Y.Z`, `:X.Y`, `:X` and `:latest`.

Never move or delete a release tag: people pin to these images.

## Dependency updates

`.github/dependabot.yml` makes GitHub check for updates every Monday and open pull requests for:

- npm packages in `frontend/` (minor and patch updates grouped into one PR, major updates separately; except the PocketBase SDK, see below),
- GitHub Actions used in CI,
- the `node` and `alpine` base images in the `Dockerfile` (Node stays on the major version used in CI).

CI runs on each PR; merge it when it's green.

### Updating PocketBase

PocketBase is updated by hand, because three things must move together: `PB_VERSION` in the `Dockerfile` (the server), your local `pocketbase(.exe)` binary, and the `pocketbase` JS SDK in `frontend/package.json` (Dependabot is set to ignore it). PocketBase is still pre-1.0, so releases can contain breaking changes worth reading about first.

The **PocketBase update check** workflow (`.github/workflows/pocketbase-update.yml`) runs every Monday. When a newer release than `PB_VERSION` is out, it opens an issue labelled `pocketbase-update` with a checklist for updating all three parts. It closes older reminders, and you can also run it by hand from the _Actions_ tab.
