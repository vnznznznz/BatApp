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
- Once a letter has gone to or from you, a new city takes a day to become where your bats fly
  from. Otherwise anyone could borrow a friend's city for one short flight and move straight
  back - choosing their own delivery time. Before your first letter there is no flight to
  shorten, so a change of city counts at once, as the first choice does.
- Anyone can be blocked, at any time, and is never told. A block ends the friendship and hides
  their letters; a report goes to the person who runs the service, and the person reported is not
  told who made it, unless the law requires it.
- No push notifications: what has landed is there the next time you open the app.

## Status

The product works end to end. You can sign up, choose your city, ask friends by username, write
to a friend, watch your bat fly the real distance, and read what lands in your inbox - with the
delivery time decided by the database, three bats that are really three, and no read receipts.
A new account's address is confirmed, and a forgotten password replaced, with a code from an
email, typed into the app (see "Email codes" below). Phases 1–9, 11 and 12 are done; see
[`docs/ROADMAP.md`](docs/ROADMAP.md) for what lands when, and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the decisions and why. A review of the whole
project in November 2026 found defects across it - in the database, signing in, the screens, the
tests and the documents - and what it found is fixed, but for what the roadmap lists as still open.

Reporting and blocking are built (13a, which App Review checks), with house rules that every new
account agrees to; operators, see "Handling a report" in [`docs/GO-LIVE.md`](docs/GO-LIVE.md). There
are no push notifications, by decision. The flight animation (12) is built: wing beat, drift and a
drawn flight. Under Reduce Motion the wings and the drift stop; where each bat is on its way still
updates. Not done yet: the hosted Supabase project (see
"Setting up the hosted project" in GO-LIVE), the custom SMTP its emails need before anyone else can
sign up, and testing on real devices.

## Requirements

- Node.js 22, version 22.13 or newer (developed on 22.23; CI runs 22). Node 24.3+ also fits
  what the installed packages declare. Node 20 does not: the Supabase client and the test
  library both ask for 22. `engines` in `package.json` says the same, so `npm install` warns on
  a Node that does not fit, and CI installs with `--engine-strict`, which refuses one.
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
project, with a personal access token in `SUPABASE_ACCESS_TOKEN` and the project's database
password in `SUPABASE_DB_PASSWORD`:

```bash
npx supabase@3.2.0 link --project-ref <your-project-ref>
npx supabase@3.2.0 config diff                  # read what the next command will change
npx supabase@3.2.0 config push --yes
[ -n "$SUPABASE_DB_PASSWORD" ] && npx supabase@3.2.0 db push --remote --dry-run   # which migrations, and into which database
[ -n "$SUPABASE_DB_PASSWORD" ] && npx supabase@3.2.0 db push --remote --yes
```

Every command names the CLI version, on purpose: `npx supabase` alone runs whatever is newest, and
the versions differ in what the same words do. With this one:

- A command changes the hosted project only when it is given `--yes`. Without it the command asks,
  and where nobody can answer - a script, a session - it stops and changes nothing.
- `db push` goes to the **local** stack unless it is given `--remote`, even in a linked directory.
- `db push --remote` connects to the project's Postgres with the database password, which it reads
  from `SUPABASE_DB_PASSWORD`. Without one it does not stop: it connects through a temporary login
  role that it asks the API for, a way not yet tried on a real project. The `[ -n ... ]` in front
  makes the command do nothing instead, and exit with 1. A session gives each command a shell of
  its own, so a variable exported by one command is gone in the next: GO-LIVE keeps the password
  in a file and hands it to each command.
- Each command first prints where it is going: `Target: project <name> (<ref>)`. Read that line.

`db push --remote` applies everything in `supabase/migrations`: the tables, the row level security,
the functions the app calls, the 4,308 cities, and the three scheduled jobs - delivery, the end of
old reports and the nightly tidy-up (pg_cron is enabled by the migrations). Run it again whenever a
migration is added. It does not run `supabase/seed.sql`. `config push` sends the settings that
`supabase/config.toml` declares, the email templates in `supabase/templates` among them, and leaves
everything else on the project as it is - read the note at the top of that file first.

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

### Email codes

Every email the auth server sends carries an 8-digit code to type into the app, and no link that
could carry a session back through the app's URL scheme. The app asks for two of them: the code
that confirms a new account's address, and the one that sets a new password after "I forgot my
password". A code works for a day, and only the newest one counts (`otp_length` and `otp_expiry`
in `supabase/config.toml`; the templates are in `supabase/templates`).

Email confirmation is off in `supabase/config.toml` (`enable_confirmations = false`), on the local
stack as on a project the file is pushed to, until the project sends its email through custom SMTP:
Supabase's built-in email service delivers only to the project's own team. While it is off, a new
account is signed in at once and nobody is asked for a code. Switching it on is a step of its own
in [`docs/GO-LIVE.md`](docs/GO-LIVE.md), "Before a second person can sign up: custom SMTP".

## Scripts

| Command                   | What it does                                                        |
| ------------------------- | ------------------------------------------------------------------- |
| `npm start`               | Start the Expo dev server                                           |
| `npm run ios` / `android` | Start and open a simulator                                          |
| `npm run web`             | Start the dev server for the web build                              |
| `npm run typecheck`       | Generate the route types, then `tsc --noEmit`                       |
| `npm run generate:routes` | Generate the route types alone (`expo customize tsconfig.json`)     |
| `npm run lint`            | ESLint over the whole repo, warnings treated as errors              |
| `npm run lint:fix`        | ESLint, fixing what it can                                          |
| `npm run format`          | Rewrite files with Prettier                                         |
| `npm run format:check`    | Say which files Prettier would rewrite                              |
| `npm test`                | Jest, on the code as written                                        |
| `npm run test:watch`      | Jest, again at every change                                         |
| `npm run test:compiled`   | Jest with the React Compiler on, as in a production build           |
| `npm run test:db`         | Database tests: migrations replayed in PGlite, races on a Postgres  |
| `npm run test:scripts`    | Tests of `scripts/`, and of the commands and runbook SQL in `docs/` |
| `npm run verify`          | typecheck + lint + format check + Jest + database and script tests  |
| `npm run check:build-env` | Say whether `.env` has what a production build needs                |
| `npm run build:pages`     | Build the help page and the privacy policy from `docs/store`        |
| `npm run generate:assets` | Redraw the app artwork from source                                  |
| `npm run generate:types`  | Regenerate `src/lib/database.types.ts` from the local stack         |

Run `npm run verify` before every commit. CI runs the same command, then the Jest suite again with
the React Compiler on (`npm run test:compiled`) and a check that the committed artwork matches its
source. A second job bundles the app for the web and for iOS (`npx expo export`): only the bundler
notices an image that is not there or an import it cannot resolve, and nothing in `verify` builds
the app.

`npm test` runs the code as written, and no phone does: a production build compiles the components
and hooks with the React Compiler, which can change what one does, and leaves out without a word
any it cannot compile. `npm run test:compiled` runs the same tests on the compiled code, and
`src/tests/react-compiler.test.ts` lists what the compiler leaves out, with why.

The concurrency tests (`src/tests/db/concurrency.pg.test.mjs`) need a real Postgres, because the
races they check cannot happen on PGlite's single connection. CI provides one - version 17, which
is what the local Supabase stack and a new hosted project run - and where `CI` is set, as GitHub
sets it, a missing `DATABASE_URL` fails the run. Locally they are skipped, and the summary counts
the skip, unless you point them at a server where they may create a scratch database:

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm run test:db
```

`npm run test:scripts` takes the SQL of the operator's runbooks - GO-LIVE's "Handling a report" and
the deletion of an account on request in `docs/store/gdpr-records.md` - out of the documents and
runs it, as written, on a test database. A step that names a database function no migration creates
is skipped, saying so; with `RUNBOOKS_MUST_RUN=1`, as CI sets it, it fails instead.

`npm run build:pages` needs the operator's details and the launch state in its environment, which
keeps them out of this public repository; the command to run is at the top of
`scripts/build-store-pages.mjs`.

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
supabase/       config.toml, the email templates and the migrations - the schema, its policies
                and its functions
assets/images/  Generated artwork — do not hand-edit, see scripts/generate-assets.mjs
scripts/        Build tooling
docs/           Architecture decisions, roadmap and go-live plan; store/ holds the privacy
                policy, the help page, the store listings and the records of processing
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
