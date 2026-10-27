/** Formats a PocketBase date ("2026-01-31 12:00:00.000Z") for display. */
export function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Up to two initials for an avatar, from the name or else the email. */
export function initials(user) {
  const name = user?.name?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }
  return (user?.email?.[0] ?? "").toUpperCase();
}

/** "Good morning, Alice" (first name only), based on the local time. */
export function greeting(user, now = new Date()) {
  const hour = now.getHours();
  const partOfDay =
    hour >= 5 && hour < 12
      ? "morning"
      : hour >= 12 && hour < 18
        ? "afternoon"
        : "evening";
  const firstName = user?.name?.trim().split(/\s+/)[0];
  return firstName ? `Good ${partOfDay}, ${firstName}` : `Good ${partOfDay}`;
}
