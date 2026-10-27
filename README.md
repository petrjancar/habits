# Habits

[![Build](https://img.shields.io/github/actions/workflow/status/petrjancar/habits/ci.yml?branch=main&label=build)](https://github.com/petrjancar/habits/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/petrjancar)

A small self-hosted habit tracker: check off habits each day, keep streaks going and see how consistent you've been. A [PocketBase](https://pocketbase.io) backend with an [Alpine.js](https://alpinejs.dev) + [Tailwind CSS](https://tailwindcss.com) frontend, served by PocketBase from a single process or Docker container.

## Features

- **Today** - check off today's habits, or any of the last 7 days.
- **Habits** - add, edit, reorder, pause, archive and delete habits. Every habit has a calendar where any past day can be changed, plus its streaks.
- **Schedules** - every day, chosen weekdays, or a number of times per week.
- **Statistics** - success rate, best streak, charts and a 52-week calendar for a week, month, year or all time.
- **Account** - theme, first day of the week, CSV export and import, account deletion.
- **Installable** - on a phone's home screen as a progressive web app (PWA), and works on desktop too.

How streaks are counted and the CSV format are in [docs/how-it-works.md](docs/how-it-works.md).

What is stored and logged is in [docs/privacy.md](docs/privacy.md).

## Deploy

You need Docker with Compose. For anything beyond your own network, and to install the app on a phone as a PWA, you also want HTTPS (see below).

1. Create a folder for the app and its database.

   ```bash
   mkdir habits && cd habits && mkdir -p pb_data
   ```

2. Create `docker-compose.yml` in it and set the admin email and password.

   ```yaml
   services:
     habits:
       image: ghcr.io/petrjancar/habits:1
       container_name: habits
       restart: unless-stopped
       ports:
         - "8090:8090"
       environment:
         PB_ADMIN_EMAIL: you@example.com
         PB_ADMIN_PASSWORD: change-me-at-least-8-chars
       volumes:
         - ./pb_data:/pb/pb_data
   ```

3. Start it and open `http://localhost:8090` (or the server's address with port `8090`). The dashboard is at `/_/`.

   ```bash
   docker compose up -d
   ```

To update: `docker compose pull && docker compose up -d`.

### HTTPS and reverse proxy

Browsers only allow installing the app on a phone over HTTPS, and passwords should not travel over plain HTTP outside your own network. Put a reverse proxy that provides HTTPS (Nginx Proxy Manager, Caddy, Traefik, ...) in front of the app and forward to port `8090`.

## Develop

You need Node.js 24 and the PocketBase binary for your OS (version in the `Dockerfile`) in the project root.

```bash
cd frontend && npm install
./pocketbase serve         # in the project root, second terminal (pocketbase.exe on Windows)
npm run dev                # in frontend/, then open http://localhost:5173
```

More in [docs/development.md](docs/development.md): project structure, how the frontend works, the data model, schema changes and dependency updates.
