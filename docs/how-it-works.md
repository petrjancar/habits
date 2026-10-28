# How it works

What the app does with your data, for people using it.

- [How streaks and rates are counted](#how-streaks-and-rates-are-counted)
- [Habit types and states](#habit-types-and-states)
- [Weekly habits on a single day](#weekly-habits-on-a-single-day)
- [Moving between days](#moving-between-days)
- [Planning a pause](#planning-a-pause)
- [Skipping a day](#skipping-a-day)
- [Resetting a habit](#resetting-a-habit)
- [Backup and restore](#backup-and-restore)

## How streaks and rates are counted

- Days that aren't scheduled, paused days and days before a habit's start never break a streak.
- Today (or the current week for weekly habits) only counts once it's done, so an unfinished today never lowers a streak or a rate.
- Archived habits are hidden from Today but keep counting in statistics up to the day they were archived. Restoring one turns the archived days into a pause, so its streak survives.
- Changing a habit's schedule also changes how its past days are counted.
- Weekly habits ("3× a week") count streaks in weeks.
- A new habit starts today, so earlier days can't be logged for it, unless you import them.

## Habit types and states

### Types (schedules)

| Type            | Example                     | Due on                                 | Streak counted in |
| --------------- | --------------------------- | -------------------------------------- | ----------------- |
| Every day       | "Every day"                 | every active day                       | days              |
| Chosen weekdays | "Weekdays", "Mon, Wed, Fri" | the chosen weekdays only               | days              |
| Times per week  | "3× a week"                 | any day; the goal is a number per week | weeks             |

"Every day" and "chosen weekdays" are the same type underneath: every day is all seven weekdays.

### Habit states

A habit is in exactly one of these at any time:

- **Active**: shown on Today, counted in statistics.
- **Paused**: on a paused day nothing is due and nothing is missed, so the streak is kept. "Pause habit" pauses from today until you resume; a [planned pause](#planning-a-pause) has a first and a last day, and a [skipped day](#skipping-a-day) is a pause of a single day. Pauses also cover the days a habit was archived before it was restored.
- **Archived**: hidden from Today, kept in statistics up to the day it was archived. Restoring it turns the archived days into a pause.
- **Not started yet**: days before the start date never count. A new habit starts today; importing older check-ins moves the start back.

Deleting a habit removes it and its check-ins entirely. [Resetting](#resetting-a-habit) keeps the habit but starts it over.

### Day states

For every day a habit that is due (every day and chosen weekdays types) is:

| State                                        | Meaning                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| **Done**                                     | checked off                                                                   |
| **Missed**                                   | due, not checked, and the day is over                                         |
| **Pending**                                  | due, not checked, and it's today. It becomes missed only after today ends     |
| **Upcoming**                                 | a future day. Can't be checked off yet                                        |
| **Not scheduled**                            | a weekday that isn't chosen. Never counts, never breaks a streak              |
| **Paused** / **Before start** / **Archived** | the habit doesn't exist that day. Never counts. A skipped day is a paused day |

A **times per week** habit has the same "doesn't exist" states (paused, before start, archived) and these on other days, see [Weekly habits on a single day](#weekly-habits-on-a-single-day):

| State        | Meaning                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Done**     | checked that day                                                                                                 |
| **Optional** | not checked, and there is still time later in the week. Doesn't count either way                                 |
| **Due**      | not checked, and the days left in the week are no more than the check-ins still needed. Counts as missed if left |
| **Goal met** | the weekly goal was already reached earlier in the week. Doesn't count                                           |

A week's requirement is the target, or fewer if paused, archived or not-yet-started days leave fewer active days than the target. The week is **met** with that many check-ins and **missed** otherwise, and that is what its streak and rate use.

## Weekly habits on a single day

A weekly habit is on the day's list every day, but it only counts towards that day's score (the Today card, the day strip, the calendars and the daily bars in Statistics) when it is:

- **checked that day**, which counts as done, or
- **due**: the days left in the week, that day included, are no more than the check-ins still needed (for "2× a week" with one done, that is the last day of the week). Not checking it then counts as missed.

On other days it is **optional**: it shows a dashed circle, "optional today" and "+1 weekly" next to the score, and doesn't count either way. Once the weekly goal is met, the rest of the week shows "goal met" and isn't counted either. Paused days and days before the habit's start don't count as days left.

Whether a day was due only depends on check-ins earlier that week, so checking off a later day never changes how an earlier day is scored, but changing an earlier day can change the days after it.

Weekly and longer rates, per-habit rates and streaks count weekly habits per week, as above, and aren't affected by this.

## Moving between days

- The Today page shows one week at a time. Use the arrows (or swipe the days) to move by a week, or tap a square in the 12-week calendar. "Today" brings you back.
- Tap the month above the days for a calendar: each day is coloured by how much was done, like the consistency calendar. Tap its title to pick a month and year. Arrow keys, Page Up / Down and Esc work too.
- In a habit's calendar, the month title opens the same calendar for picking a month.
- The day you pick is in the address (`/?date=2026-10-12`), so a reload or a bookmark opens the same day. Squares in the Statistics calendar open their day on Today.
- There's no limit in either direction. Any past day since a habit started can be changed, on Today or in its calendar. Days before a habit's start show without it.
- Tapping a day in a habit's calendar doesn't change it straight away. It opens a small menu for that day with **Mark done** (or **Mark not done**), **Skip this day** (or **Undo skip**) and **Open on Today**, so scrolling past the calendar can't change a day by accident.
- Upcoming days show what's scheduled but can't be checked off yet. Weekly habits show as optional, or as due once the week is running out.
- If the page stays open past midnight, it moves on to the new day, unless you had picked a different day.

## Planning a pause

"Plan a pause" on a habit's page pauses it for a set time, such as a holiday or a week off.

- Pick the first and the last paused day. Both are paused, and the habit is back on Today the day after the last one. A pause can start today or later, not in the past, so past statistics never change.
- Tick **All active habits** to pause every active habit for the same days at once. Each habit gets its own copy, which can be removed on its own.
- If the pause starts today and the habit is already checked off today, it starts tomorrow instead, so a done day isn't hidden.
- Pauses that overlap or follow each other on consecutive days are joined into one.
- The habit's page lists the pauses that are running or still ahead. **Remove** cancels a planned one. **Resume** ends a running one: its earlier days stay paused, so the streak is kept. Changing the dates means removing the pause and planning it again.
- Paused days have their own colour in the habit's calendar, and the habits list shows "Paused until Nov 8" or "Pause from Nov 2".
- Resetting a habit keeps its running and planned pauses. Backups (Export data) include all pauses and skipped days.

## Skipping a day

For a sick day, or a rest day for one habit, skip it instead of leaving it missed.

- On Today, **Skip** next to a habit skips it on the day you're looking at. **Skip the day** in the summary skips every habit on that day that isn't checked off yet. Habits already done that day stay done.
- Any day can be skipped, past, today or upcoming, from the habit's start on. Skipping a past missed day means it no longer counts as missed.
- A skipped day works like a paused day: it doesn't count either way and never breaks the streak. For a weekly habit, a skipped day is one day fewer to fit its goal into, so a week can ask for fewer check-ins.
- Skipped and paused habits are listed under **Skipped or paused** for that day. **Undo skip** brings one back, and **Undo skips** in the summary brings back all of that day's skips. Longer pauses are managed on the habit's page.
- In a habit's calendar, tap a day and choose **Skip this day** or **Undo skip**. Skipped days have the paused colour, and today's or upcoming skips are listed with its pauses.

## Resetting a habit

"Reset progress" on a habit's page deletes all of its check-ins and moves its start date to today, so the habit starts over with no streak and empty statistics. The name, colour, schedule and note stay. A pause running today is kept from today on, and planned pauses stay.

A reset can't be undone. To stop tracking a habit but keep its history, use Archive instead, which keeps the habit in your statistics up to the day it was archived.

## Backup and restore

**Export data** on the Account page downloads a backup: one JSON file with every habit, its settings (name, colour, schedule, note, start date, archive date), its pauses and skipped days, and all its check-ins. Account settings (name, theme, first day of the week) aren't included. **Import data** reads such a file, so a backup can also move your data to another account or server.

- Import only adds. Habits are matched by name (ignoring case). A habit you don't have yet is created as it was. A habit you already have keeps its own settings and gets the check-ins and pauses it's missing; its start date moves back if the backup starts earlier. Nothing is deleted, so importing the same file twice changes nothing.
- The account page shows what will change before anything is saved, along with any problems in the file (a bad date, an unknown colour, a habit without a name), which are fixed or skipped.
- Check-ins are saved 100 per request through PocketBase's batch API, which a migration turns on. If the import stops part way, importing the same file again finishes it.
- Backups from a newer version of the app are refused with a message to update first. Older backups keep working.

The file looks like this (shortened):

```json
{
  "format": "habits-backup",
  "version": 1,
  "app_version": "2.0.0",
  "exported_at": "2026-10-28T13:14:00.000Z",
  "habits": [
    {
      "name": "Read",
      "color": "plum",
      "frequency": "days",
      "days": [0, 2, 4],
      "target": 1,
      "note": "",
      "start_date": "2026-09-01",
      "archived_on": "",
      "pauses": [{ "from": "2026-11-02", "to": "2026-11-08" }],
      "checkins": ["2026-09-01", "2026-09-03"]
    }
  ]
}
```

`frequency` is `daily`, `days` (on the weekdays in `days`, 0 = Monday … 6 = Sunday) or `weekly` (`target` times a week). Dates are `YYYY-MM-DD` in your own calendar. A pause with `"to": null` lasts until you resume, and a pause of a single day is a skipped day.
