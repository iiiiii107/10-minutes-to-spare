# 10 Minutes to Spare

A habit tracker for the small jobs — the ones that take almost no time but make a
real difference once they actually get done.

**Live app:** https://iiiiii107.github.io/10-minutes-to-spare/

## What it does

- **Categories** — group tasks however makes sense to you, each with its own
  emoji and colour. Every task gets a colour too.
- **Frequency, not deadlines** — say a task should happen 3× a week and it gets
  spread across the week. Miss a day and it rolls to the next one rather than
  vanishing.
- **A cap on busy days** — a weekday holds at most five tasks. Anything over
  that moves to the following day, starting with whichever task has been
  waiting the *shortest* time. Weekends are uncapped.
- **The pen** — hit *Update list*, then drag the pen across a task to cross it
  off by hand. Tapping the box does the same thing, faster.
- **Calendar** — month, week and day views, each month in its own colour.
- **Randomizer** — a wheel that picks a task at random when you're willing to
  do something but not willing to choose. Ignores frequency and history
  entirely; every task is always in the draw.
- **Timer** — 5, 10, 30 minutes or your own, with a notepad underneath and
  today's tasks as stickers you can drop onto it.
- **Stats** — streaks, monthly totals, and how much time you've reclaimed.
- **Installable** — add it to your phone's home screen; it works offline.

## Running it locally

```bash
npm install
npm run dev
```

Other commands:

```bash
npm test        # scheduling engine unit tests
npm run build   # production build into dist/
npm run preview # serve the production build
```

## How it's put together

Plain ES modules, no framework. Vite builds it; `vite-plugin-pwa` handles the
service worker and manifest.

```
src/
  lib/
    dates.js      date helpers — everything is a 'YYYY-MM-DD' string
    schedule.js   the scheduling engine (spread, roll-forward, cap)
    stats.js      streaks and totals, all derived from completed tasks
    store.js      app state and every action that changes it
    storage.js    persistence adapter — swap the backend here
    dom.js        small element helpers
  views/          one module per screen
  styles/
    tokens.css    every colour in the app, light and dark
    app.css       everything else
```

Two things worth knowing before changing anything:

- **`schedule.js` is pure.** No DOM, no storage, no clock of its own — the
  current date is passed in. That's what makes the rollover and cap rules
  testable, and `schedule.test.js` covers them. Keep it that way.
- **Colours only ever come from `tokens.css`.** Both themes are defined there
  as token values. A colour written directly into a component will break dark
  mode.

## Where your data lives

Right now: in your browser, on the device you're using. Nothing is uploaded and
there's no account.

That means it does **not** yet sync between your phone and your computer. There
is an export/import pair in Settings for moving data across by hand, and for
taking a backup before clearing browser data.

### Turning on sync

The plan is Firebase (Auth + Firestore, free tier), which also makes the app
multi-user: anyone who opens the link signs in and gets their own private
tracker. `src/lib/storage.js` already isolates persistence behind four methods
(`load`, `save`, `subscribe`, plus export/import), so switching backends means
adding a `createFirebaseStorage()` alongside `createLocalStorage()` — no view
code changes.

## Deploying

Every push to `main` runs the tests and, if they pass, builds and publishes to
GitHub Pages via `.github/workflows/deploy.yml`. Pages must be set to
**Source: GitHub Actions** in the repository settings.
