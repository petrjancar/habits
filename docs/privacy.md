# Privacy

What Habits stores and logs, for people who run their own copy. It describes the software as shipped; it is not legal advice. If other people use your instance, you are the one responsible for their data, so check what applies where you live.

Habits has no telemetry or analytics, and the app makes no requests to anyone except your own server.

## What is stored

Everything is in PocketBase's data folder (`pb_data`), on your server:

- **Account:** email address, name and a hashed password.
- **Habits:** name, colour, schedule, optional note, start date, pauses and archive date.
- **Check-ins:** the habit and the date.

The browser also keeps a copy of the user's habits in `localStorage`, so pages can draw instantly. It is removed on logout.

Email is only sent if you set up SMTP in PocketBase (Settings → Mail settings). Then it is used for the address verification message and nothing else.

## What is logged

PocketBase keeps request logs in `pb_data`: time, URL, status, IP address and, if enabled, the user ID. Habit names, notes and check-ins are never part of a log entry. By default PocketBase keeps logs for a few days. You can shorten that, or turn off IP logging, in the admin dashboard under Settings → Logs.

Two other places outside the app also record IP addresses and are yours to manage:

- **Your reverse proxy** (for example Nginx Proxy Manager) writes its own access logs.
- **Docker** keeps container output indefinitely unless you limit it; add `logging` options with `max-size` and `max-file` to your compose file.

## Backups

A copy of `pb_data` contains all of the above, including logs, for as long as you keep the copy.

## Users' rights

- **Access and portability:** Account → Export data downloads all habits and check-ins as a CSV file.
- **Erasure:** Account → Delete account removes the user, their habits and their check-ins. Older log entries disappear when they pass the retention period, and old backups when you delete them.
