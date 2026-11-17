# Night Courier

A private, non-commercial slow-messaging app. Instead of sending messages instantly, you send
them by bat.

You keep exactly **three bats**. Each one carries a single message, flies the real geographic
distance between your city and your friend's, and cannot be sent again until it has come home.
A message to someone across town arrives this evening. A message across a continent takes days.

## The rules

These are product invariants, not preferences. They are asserted in
[`src/constants/config.test.ts`](src/constants/config.test.ts) so a change that breaks one fails
the build.

- Every user has exactly three bats. Always.
- There is **no** payment system, no purchasable bats, no coins, no credits, no subscriptions,
  no advertising, and no monetisation of any kind.
- Nothing is ever delivered instantly.
- Delivery time is computed and stored **server-side**. The client never decides when a message
  arrives.
- No read receipts, no typing indicators, no online status, no public profiles, no feeds.
- A new city takes a day to become where your bats fly from. Otherwise anyone could borrow a
  friend's city for one short flight and move straight back - choosing their own delivery time.
- Anyone can be blocked, at any time, and is never told. A block ends the friendship and hides
  their letters; a report goes to the person who runs the service, and the person reported is not
  told who made it, unless the law requires it.
- No push notifications: what has landed is there the next time you open the app.

## Status

The product works end to end. You can sign up, choose your city, ask friends by username, write
to a friend, watch your bat fly the real distance, and read what lands in your inbox - with the
delivery time decided by the database, three bats that are really three, and no read receipts.
Phases 1–9, 11 and 12 are done; see [`docs/ROADMAP.md`](docs/ROADMAP.md) for what lands when,
and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the decisions and why.

Reporting and blocking are built (13a, which App Review checks), with house rules that every new
account agrees to; operators, see "Handling a report" in [`docs/GO-LIVE.md`](docs/GO-LIVE.md). There
are no push notifications, by decision. The flight animation (12) is built: wing beat, drift and a
drawn flight. Under Reduce Motion the wings and the drift stop; where each bat is on its way still
updates. Not done yet: the hosted Supabase project (see
"Setting up the hosted project" in GO-LIVE), and testing on real devices.

## Requirements

- Node.js 22, version 22.13 or newer (developed on 22.23; CI runs 22). Node 24.3+ also fits
  what the installed packages declare. Node 20 does not: the Supabase client and the test
  library both ask for 22.
- npm 10+
- An iOS or Android device with [Expo Go](https://expo.dev/go), or a simulator
- macOS with Xcode is only required for local native iOS builds; cloud builds via EAS do not
  need it
- Docker, only to run the backend locally with `npx supabase@3.2.0 start`

## Getting started

```bash
npm install
cp .env.example .env    # then fill in your project's URL and anon key
npm start
```

Then scan the QR code with Expo Go, or press `i` / `a` for a simulator.

A build anyone else will use also needs `EXPO_PUBLIC_CONTACT_URL` and
`EXPO_PUBLIC_PRIVACY_POLICY_URL` in `.env` (see `.env.example`); without them the Contact and
Privacy policy buttons are hidden.

A production bundle (`npx expo export`, an EAS build) has these values written into it while it is
built. Without the Supabase URL and key, or with the placeholders of `.env.example`, it is not
built at all: `metro.config.js` stops it with a message, rather than letting an app through that
fails on its first screen. `node scripts/check-build-env.js --for-others` says beforehand whether
the values are complete, the two links included. An EAS build never sees `.env`, which is not in
git: set all four values in the EAS environment.

### The Supabase project

The app needs its settings and its schema in your Supabase project. Once, after creating the
project, with a personal access token in `SUPABASE_ACCESS_TOKEN`:

```bash
npx supabase@3.2.0 link --project-ref <your-project-ref>
npx supabase@3.2.0 config diff                  # read what the next command will change
npx supabase@3.2.0 config push --yes
npx supabase@3.2.0 db push --remote --dry-run   # which migrations, and into which database
npx supabase@3.2.0 db push --remote --yes
```

Every command names the CLI version, on purpose: `npx supabase` alone runs whatever is newest, and
the versions differ in what the same words do. With this one:

- A command changes the hosted project only when it is given `--yes`. Without it the command asks,
  and where nobody can answer - a script, a session - it stops and changes nothing.
- `db push` goes to the **local** stack unless it is given `--remote`, even in a linked directory.
- Each command first prints where it is going: `Target: project <name> (<ref>)`. Read that line.

`db push --remote` applies everything in `supabase/migrations`: the tables, the row level security,
the functions the app calls, the 4,310 cities, and the delivery job (pg_cron is enabled by the
migration). Run it again whenever a migration is added. It does not run `supabase/seed.sql`.
`config push` sends the settings that `supabase/config.toml` declares and leaves everything else on
the project as it is - read the note at the top of that file first.

For the real project, follow "Setting up the hosted project" in
[`docs/GO-LIVE.md`](docs/GO-LIVE.md): the same commands, with a check after each one that shows it
arrived.

### Running everything locally

With Docker, the whole backend runs on your machine and nothing touches the hosted project:

```bash
npx supabase@3.2.0 start
```

Put the printed API URL and publishable key into `.env` (`http://127.0.0.1:54321` - plain http is
accepted for local and private-network addresses only). To use Expo Go on a phone, use your
computer's LAN address instead of `127.0.0.1`.

The local database starts with two couriers who are already friends, from
[`supabase/seed.sql`](supabase/seed.sql) - which only ever runs locally:

| Email               | Password        | City   |
| ------------------- | --------------- | ------ |
| `anna@example.test` | `night-courier` | Berlin |
| `ben@example.test`  | `night-courier` | Munich |

Sign in as one on your phone and as the other in a browser (`npm run web`), and write.

Real flights take hours. To watch one land in under a minute, scale every flight down - on a
development project only:

```bash
psql postgres://postgres:postgres@127.0.0.1:54322/postgres \
  -c "update private.flight_settings set time_multiplier = 0.002"
```

`0.01` makes Berlin to Munich about four minutes; `1` is real time and the only value production
should ever have.

## Scripts

| Command                   | What it does                                                |
| ------------------------- | ----------------------------------------------------------- |
| `npm start`               | Start the Expo dev server                                   |
| `npm run ios` / `android` | Start and open a simulator                                  |
| `npm run typecheck`       | Generate the route types, then `tsc --noEmit`               |
| `npm run lint`            | ESLint over the whole repo, warnings treated as errors      |
| `npm run format`          | Rewrite files with Prettier                                 |
| `npm test`                | Jest                                                        |
| `npm run test:db`         | The database tests: migrations replayed in PGlite           |
| `npm run verify`          | typecheck + lint + format check + tests (CI runs it too)    |
| `npm run check:build-env` | Say whether `.env` has what a production build needs        |
| `npm run generate:assets` | Redraw the app artwork from source                          |
| `npm run generate:types`  | Regenerate `src/lib/database.types.ts` from the local stack |

Run `npm run verify` before every commit. CI runs the same command, and in a second job bundles
the app for the web and for iOS (`npx expo export`): only the bundler notices an image that is not
there or an import it cannot resolve, and nothing in `verify` builds the app.

The concurrency tests (`src/tests/db/concurrency.pg.test.mjs`) need a real Postgres, because the
races they check cannot happen on PGlite's single connection. CI provides one - version 17, which
is what the local Supabase stack and a new hosted project run. Locally they are
skipped, saying so, unless you point them at a server where they may create a scratch database:

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm run test:db
```

## Project layout

```
src/
  app/          Expo Router routes. Files here are URLs.
  components/   Design-system primitives: Screen, Text, Button, Card, ListRow, Badge, ...
  constants/    Product invariants (config.ts) and the design tokens (theme.ts)
  features/     One folder per domain - auth, profile, cities, roost, friends, messages, safety - each
                with the calls it makes and the types it maps them to
  lib/          Framework-level helpers: the Supabase client, data hooks, formatting, errors
  tests/        Screen tests (never under app/, where every file is a route) and db/, the
                database tests
supabase/       config.toml and the migrations - the schema, its policies and its functions
assets/images/  Generated artwork — do not hand-edit, see scripts/generate-assets.mjs
scripts/        Build tooling
docs/           Architecture decisions, roadmap and go-live plan
```

Screens compose the primitives and choose a semantic variant and tone —
`<Text variant="heading" tone="secondary">` — rather than reaching for a font size or a hex
value. Colours, spacing and type live in `src/constants/theme.ts` and nowhere else.

`@/` resolves to `src/`, and `@/assets/` to `assets/`. Both are configured in three places that
must stay in sync: `tsconfig.json`, `jest.config.js`, and Metro (via Expo's defaults).

## Artwork

The bat, the moon and the night sky are defined as vector data in
[`scripts/generate-assets.mjs`](scripts/generate-assets.mjs) and rasterised by a small scanline
renderer written for this project. No image library is required, and no binary asset is
hand-edited — run `npm run generate:assets` to redraw everything from source.

The visual identity is original to this project.

## A note on `npm audit`

`npm audit` reports advisories on a fresh install, and how many changes from week to week with
the advisory database - so no number is written here; run it to see today's. Nearly everything it
names is in what the build tools bring along: Expo's and React Native's command-line tools, the
linter's parser. None of that is in the app. The one exception when this was last looked at (17
November 2026, in the bundles' source maps) was `decode-uri-component`, which `expo-router`
brings in through `query-string` and which is in every bundle; the only fix npm knows of is the
`expo-router` of the next Expo SDK.

Do not answer the report with `npm audit fix`:

- With `--force`, npm says it will install another Expo SDK altogether.
- Without it, it looks harmless and is not. Tried in a separate copy on 17 November 2026, it left
  `package.json` alone but rearranged the lockfile around a second `expo-router`, from the next
  SDK, nested under `expo`. The typecheck, the linter and every test still passed, and the iOS
  and Android bundles were built - but `npm ls` called the tree invalid, and the web bundle was
  no longer built at all.

What can be taken safely is a fix that lies within the versions a package's dependents already
ask for: `npm update <package>` for that package alone, then `npm run verify` and the three
bundles (`npx expo export --platform web`, `ios` and `android`). The rest waits for the next Expo
SDK, and is worth looking at again then.

## Licence and intent

This is a private, non-commercial project built for a small circle of friends. It is not
affiliated with, and does not reuse the design, artwork, branding, copy or assets of, any other
messaging application.
