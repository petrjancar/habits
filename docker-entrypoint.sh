#!/bin/sh
# Creates (or updates) the superuser from PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD
# when both are set, then starts PocketBase with the given arguments.
# The placeholder email from the README's compose file is ignored, so an unedited
# file never creates an admin with a published password.
set -e

if [ "$PB_ADMIN_EMAIL" = "you@example.com" ]; then
  echo "PB_ADMIN_EMAIL is still the placeholder: no admin account was created."
elif [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  /pb/pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" \
    --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations >/dev/null
  echo "Superuser $PB_ADMIN_EMAIL is ready."
fi

exec /pb/pocketbase "$@"
