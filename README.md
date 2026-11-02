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
  their letters; a report goes to the people who run the service, never to the person reported.
- No push notifications: what has landed is there the next time you open the app.

## Status

The product works end to end. You can sign up, choose your city, ask friends by username, write
to a friend, watch your bat fly the real distance, and read what lands in your inbox - with the
delivery time decided by the database, three bats that are really three, and no read receipts.
Phases 1–9 and 11 are done; see [`docs/ROADMAP.md`](docs/ROADMAP.md) for what lands when,
and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the decisions and why.

Reporting and blocking are built (13a, which App Review checks), with house rules that every new
account agrees to; operators, see "Handling a report" in [`docs/GO-LIVE.md`](docs/GO-LIVE.md). There
are no push notifications, by decision. Not built yet: the flight animation (12). Not done yet: the
hosted Supabase project (see "Setting up the hosted project" in GO-LIVE), and testing on real
devices.

## Requirements

- Node.js 20.19+ (developed on 22.22)
- npm 10+
- An iOS or Android device with [Expo Go](https://expo.dev/go), or a simulator
- macOS with Xcode is only required for local native iOS builds; cloud builds via EAS do not
  need it
- Docker, only to run the backend locally with `npx supabase start`

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

### The Supabase project

The app needs its schema in your Supabase project. Once, after creating the project:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase config push
npx supabase db push
```

`db push` applies everything in `supabase/migrations`: the tables, the row level security, the
functions the app calls, the 4,310 cities, and the delivery job (pg_cron is enabled by the
migration). Run it again whenever a migration is added. `config push` applies
`supabase/config.toml`, which **replaces** dashboard auth settings - read the warning at its top
first.

### Running everything locally

With Docker, the whole backend runs on your machine and nothing touches the hosted project:

```bash
npx supabase start
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
| `npm run typecheck`       | `tsc --noEmit`                                              |
| `npm run lint`            | ESLint over the whole repo, warnings treated as errors      |
| `npm run format`          | Rewrite files with Prettier                                 |
| `npm test`                | Jest                                                        |
| `npm run test:db`         | The database tests: migrations replayed in PGlite           |
| `npm run verify`          | typecheck + lint + format check + tests (what CI runs)      |
| `npm run generate:assets` | Redraw the app artwork from source                          |
| `npm run generate:types`  | Regenerate `src/lib/database.types.ts` from the local stack |

Run `npm run verify` before every commit. CI runs exactly the same command.

The concurrency tests (`src/tests/db/concurrency.pg.test.mjs`) need a real Postgres, because the
races they check cannot happen on PGlite's single connection. CI provides one. Locally they are
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

A fresh install reports 22 advisories. All of them resolve to three issues (`image-size` ×2,
`uuid` ×1) inside Expo's and React Native's **build-time** dependency tree — asset measurement
and prebuild config. None of them are reachable from the shipped app at runtime, and there is no
non-breaking fix: `npm audit fix --force` downgrades Expo itself. They are left in place
deliberately and should be re-checked when Expo publishes an SDK bump.

## Licence and intent

This is a private, non-commercial project built for a small circle of friends. It is not
affiliated with, and does not reuse the design, artwork, branding, copy or assets of, any other
messaging application.
