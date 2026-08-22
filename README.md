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

Without sync: in your browser, on the device you're using. Nothing is uploaded
and there's no account. Settings has an export/import pair for moving data
across by hand, and for taking a backup before clearing browser data.

With sync on: in Firestore, under your own Google account, in a document only
that account can read or write. Firestore's cache means the app still works
with no connection — changes queue and go up when you're back.

## Setting up sync

Free tier throughout; no billing account needed. Takes about ten minutes.

1. **Make a project.** [console.firebase.google.com](https://console.firebase.google.com)
   → *Create a project*. Turn Google Analytics off — nothing here needs it.

2. **Turn on Google sign-in.** *Build → Authentication → Get started →
   Google → Enable*. Pick a support email, save.

3. **Make the database.** *Build → Firestore Database → Create database*.
   Choose a region near you. Start in **production mode** — the rules come from
   this repo in step 5, and test mode would leave it open to anyone.

4. **Register the web app.** *Project settings → General → Your apps → Web
   (`</>`)*. Give it a nickname, skip Firebase Hosting. Copy the
   `firebaseConfig` object it shows you.

5. **Publish the rules.** This is the part that makes each account private:
   an account can only reach `users/{its own uid}`, so no one — including
   whoever owns the project — can read anyone else's tasks.

   The Firebase console's *Rules* tab is read-only in recent versions and its
   *Develop & Test* button leads to the Firebase Studio docs rather than an
   editor. Two ways round it:

   - Publish from here: `npx -y firebase-tools login` once, then
     `npx -y firebase-tools deploy --only firestore:rules`. `firebase.json`
     and `.firebaserc` already point at the project and at
     [`firestore.rules`](firestore.rules), so the rules stay in version
     control.
   - Or paste them into the Google Cloud console, which still has a plain
     editor: *console.cloud.google.com → Firestore → Rules*.

6. **Allow the site to sign in.** *Authentication → Settings → Authorized
   domains* → add your Pages domain (e.g. `iiiiii107.github.io`). `localhost`
   is already there for development.

7. **Give the config to the app.** Copy `.env.example` to `.env.local` and put
   the config from step 4 in it, as JSON on one line:

   ```
   VITE_FIREBASE_CONFIG={"apiKey":"…","authDomain":"…","projectId":"…","storageBucket":"…","messagingSenderId":"…","appId":"…"}
   ```

   For the deployed site, add the same one-line value as a repository secret
   named `VITE_FIREBASE_CONFIG` (*repo → Settings → Secrets and variables →
   Actions → New repository secret*). The deploy workflow passes it to the
   build.

8. **Sign in.** Restart the dev server, open *Other → Settings*, and the Sync
   card will offer *Sign in with Google*. Whatever is already saved in that
   browser is uploaded the first time, so nothing is lost.

Leave any of this out and the app simply runs without sync, exactly as before.

**On the config values:** they're identifiers, not secrets — every Firebase web
app ships them to the browser, and they're visible in the built JavaScript
either way. Privacy comes from the security rules in step 5, not from hiding
them.

## Google Calendar

Tasks with a time slot are written into your Google Calendar. Tasks without
one aren't: an all-day task has nowhere to sit in a calendar, and filling one
with untimed blocks helps nobody. Nothing comes back the other way — the app
stays the source of truth and the calendar is a copy.

Setting it up, once sync is already working:

1. **Turn the API on.** Google Cloud Console → *APIs & Services → Library →
   Google Calendar API → Enable*, with the `minutes-to-spare` project selected.

2. **Let the site use the client.** *APIs & Services → Credentials* → open the
   OAuth 2.0 Client ID Firebase created for the web app → add to **Authorized
   JavaScript origins**:

   ```
   https://iiiiii107.github.io
   http://localhost:5173
   ```

3. **Give the app the client id.** Copy that client's ID and add it to
   `.env.local`, and as a repository secret named `VITE_GOOGLE_CLIENT_ID`:

   ```
   VITE_GOOGLE_CLIENT_ID=…apps.googleusercontent.com
   ```

4. **Connect.** *Other → Settings → Google Calendar → Connect*. Google asks
   once for permission to manage events; after that the app renews its own
   access quietly.

**What it writes.** The next two weeks of slotted tasks, as events carrying
the task name and its slot, with a five-minute reminder. Event ids are worked
out from the task and the date rather than stored, so the same task on the
same day is one event however many devices you sync from. Move a task and its
event moves; take its time away and the event comes out.

**The honest limit.** GitHub Pages serves files and nothing else, so there is
no server to hold a long-lived Google token. Access is granted to the browser
for about an hour at a time and renewed silently while the permission stands —
which means the calendar is brought up to date when you open the app, not
continuously in the background. If Google does want asking again, the Settings
card says so.

## Deploying

Every push to `main` runs the tests and, if they pass, builds and publishes to
GitHub Pages via `.github/workflows/deploy.yml`. Pages must be set to
**Source: GitHub Actions** in the repository settings.
