# Architecture decisions

Decisions are recorded as they are taken, with the reasoning and the trade-off accepted. Later
phases append; they do not rewrite history. If a decision is reversed, the entry stays and a new
entry explains why.

---

## Phase 1 — Project foundation

### Expo SDK 57, React Native 0.86, React 19.2

SDK 57 is the current stable release (`latest` on npm, 13 patch releases in). Expo pins the
React Native and React versions that its modules are tested against, so those are taken as given
rather than chosen.

**Trade-off:** a managed Expo project gives up the ability to drop arbitrary native code into
`ios/` and `android/` without ejecting. For this app that costs nothing — everything it needs
(auth, database, push notifications, animation) has a first-party Expo module — and it buys
cloud builds without a Mac, over-the-air updates, and one codebase for both platforms.

### npm as the package manager

npm is what Expo's tooling, documentation and EAS build images assume. pnpm's symlinked
`node_modules` needs `node-linker=hoisted` before Metro resolves native modules correctly, and
Yarn 1 is end-of-life.

**Trade-off:** npm installs are slower and the lockfile is larger. Accepted: this is a solo
project where a broken Metro resolution costs far more than a slow install.

### Dark theme only

Night Courier is a nocturnal app. Shipping a single dark palette rather than a light/dark pair
halves the styling surface and keeps the identity coherent. `app.json` pins
`userInterfaceStyle` to `dark` so the OS cannot force a light rendering.

**Trade-off:** users who prefer light interfaces get no choice. Accepted as a deliberate part of
the product identity rather than an oversight.

### Product invariants live in one typed module

`src/constants/config.ts` holds the rules that define the product — three bats per user, no
monetisation, minimum flight time, the virtual bat speed. `src/constants/config.test.ts`
asserts them.

The point is not to test that a constant equals itself. It is that "three bats, no payments" is
a promise this project makes, and a promise with no test is a comment. Anything that would turn
Night Courier into a different product now fails the build before it fails a reviewer.

The database will enforce the same rules independently from Phase 4 onward. The client is never
the authority.

### Routing: Expo Router with typed routes

File-based routing keeps navigation structure visible in the directory tree, and `typedRoutes`
makes a link to a route that does not exist a type error. `reactCompiler` is left on — it ships
with the SDK 57 template and `babel-plugin-react-compiler` is already installed.

### A design system, not per-screen styling

`src/components/` holds five primitives — `Screen`, `Text`, `Button`, `Card`, `BatMark` — and
`src/constants/theme.ts` holds the palette, spacing scale, radii and type scale behind them.

Screens choose a semantic variant and tone (`<Text variant="heading" tone="secondary">`); they
never reach for a font size or a hex value directly. The point is that sixteen screens are
coming across Phases 3–13, and a design system built after those screens exist is a rewrite,
whereas one built before them is just how they get written.

**Trade-off:** five components is more indirection than one welcome screen needs today. Accepted
on the basis of what Phases 3–13 add.

### Testing: Jest 29 via `jest-expo`, plus React Native Testing Library

`jest-expo@57` is built against Jest 29 internals (`babel-jest@^29`, `@jest/globals@^29`).
Installing Jest 30 alongside it would break the preset, so Jest is pinned to `~29.7.0`.

Two things about this setup cost real time and are worth recording:

**`render` and `fireEvent` are asynchronous in RNTL 14.** Calling them without `await` leaves
`screen` as its placeholder and every query fails with "`render` function has not been called" —
which reads like a configuration fault rather than a missing await. Every test awaits both.

**Jest replaces preset keys rather than merging them.** `jest-expo` supplies a
`moduleNameMapper` containing both the `@/` aliases it derives from `tsconfig.json` and a pin
forcing every import of `react-native` onto a single instance. Declaring `moduleNameMapper` in
`jest.config.js` silently dropped that pin. `jest.config.js` now spreads the preset's own map
back in, with the assets alias listed first because Jest takes the first match and the preset's
broader `^@/(.*)$` would otherwise resolve `@/assets/...` under `src/`.

`tsconfig.json` sets `"types": ["jest"]` explicitly — automatic `@types` discovery did not pick
it up under TypeScript 6.

### Linting: ESLint flat config, run directly rather than through `expo lint`

`expo lint` reported success on a codebase where `eslint .` reported ten errors: it was not
covering `scripts/`. `npm run lint` therefore calls `eslint . --max-warnings=0` so nothing is
silently skipped. `eslint-config-prettier` is applied last to switch off the stylistic rules
Prettier owns.

### Artwork generated from source

`scripts/generate-assets.mjs` defines the bat, the moon and the star field as vector paths and
rasterises them with a renderer written for this project: cubic Béziers flattened by adaptive
de Casteljau subdivision, filled with the non-zero winding rule using analytic horizontal
coverage and 6× vertical supersampling, composited with a smootherstep radial falloff for the
moon's halo, and encoded to PNG through `node:zlib`.

The first version of this used straight polygon segments, and the result read as a moth rather
than a bat: what makes the silhouette legible is the membrane between the finger tips bowing
back up toward the leading edge, and that is a curve, not a chord.

**Why not commit PNGs from a design tool:** no design tool is available in this environment, and
generated artwork can be re-rendered at any size, recoloured from the palette, and reviewed as a
diff rather than as an opaque binary. CI regenerates the assets and fails if they differ from
what is committed, so the source and the output cannot drift.

**Trade-off:** the artwork is constrained to what this renderer can express — flat fills,
gradients and radial glows, no strokes, no blur, no texture. Accepted; if the app ever gets a
designer, the generator is deleted and real assets are committed in its place.

### Strict TypeScript, plus `noUncheckedIndexedAccess`

Beyond `strict`, indexed access returns `T | undefined`. This matters for a project whose core
logic is "find an available bat" and "claim a pending delivery": the compiler will insist that
the empty case is handled.

**Trade-off:** more explicit guards in array-handling code. That is the point.

---

## Phase 2 — Supabase and authentication

### Region: Frankfurt (`eu-central-1`), not Zurich

Supabase's two EU-central regions are Frankfurt and Zurich. Frankfurt is inside the EU; Zurich is
Switzerland, which is not.

Sending the data to Zurich would be a third-country transfer under GDPR. It is lawful today —
the Commission's January 2024 adequacy decision covers Switzerland — but it is a dependency on a
decision that can be challenged and withdrawn, as _Schrems I_ and _II_ both were. Frankfurt
removes the question rather than answering it, is roughly 150 km from the operator instead of
450, and is AWS's largest European region, which is where Supabase features tend to land first.

The region is immutable after project creation, so this is worth getting right while the database
is still empty.

#### Reversed: the project is in Zurich (`eu-central-2`)

The operator chose Zurich after reading the above. Recording what that actually means, so the
choice is documented rather than merely made:

- **The transfer is lawful.** Switzerland is a third country under GDPR, but the Commission's
  adequacy decision of January 2024 covers it, so no standard contractual clauses or transfer
  impact assessment are needed for the hosting location itself.
- **Swiss data protection is not a downgrade.** The revised FADP is close in substance to the
  GDPR, and Switzerland's reputation on privacy is a legitimate reason to prefer it.
- **The residual risk is the one named above** — the arrangement rests on an adequacy decision,
  and adequacy decisions have been invalidated before. If that ever happened, the remedy would be
  migrating the project to an EU region, which means recreating it and moving the data.
- **Latency is a non-issue here.** ~300 km of extra distance is single-digit milliseconds, and
  this is an application whose entire premise is that messages take hours.

**One concrete consequence:** the privacy policy must name Switzerland as the hosting location.
GDPR Art. 13 requires telling users where their data goes, and "in the EU" would be wrong.

### Email confirmation: off during development, on before anyone else joins

Supabase's built-in email service **refuses to deliver to any address that is not on the
project's team**, and is capped at two messages per hour across the whole project. With email
confirmation enabled and no custom SMTP, a friend's signup therefore fails silently — the account
is created and the confirmation link never arrives.

So the order is: confirmation **off** while the only account is the operator's; configure custom
SMTP (Resend, Postmark, SES) before inviting anyone; then turn confirmation **on**. It stays
worth turning on, because password reset is only a recovery route if the address is real, and a
typo'd address on a project with no support desk is a permanent lockout.

Because that setting lives in the Supabase dashboard rather than in this repository, `signUp`
**reports** which case occurred rather than assuming one: Supabase returns a user but no session
when confirmation is pending, and a session immediately when it is not. The sign-up screen
branches on that. Telling someone to check an inbox when no email was sent leaves them waiting
forever, and both tests for it are in `src/tests/sign-up-screen.test.tsx`.

### The database is tested, not just written

`src/tests/db` replays the real migrations against Postgres compiled to WebAssembly (PGlite) and
asserts against the result. RLS policies are the security boundary of this whole application; a
policy that is merely reviewed is a policy that is guessed at.

Two things this harness deliberately does not do, recorded so nobody later mistakes a green run
for more than it is:

- It stubs Supabase's `auth` schema — `auth.users`, `auth.uid()`, and the `anon` and
  `authenticated` roles. Faithful to the contract, not to Supabase's implementation.
- It cannot test concurrency. PGlite is a single embedded connection, so two transactions cannot
  race. **The concurrent-send test that Phase 7 requires cannot be satisfied here** and needs a
  real Postgres with two connections.

The tests must also `set role authenticated`: PGlite connects as a superuser, and superusers
bypass RLS entirely, so a test that forgot this would pass no matter what the policies said.

**These tests run under `node --test`, not Jest.** PGlite resolves its WebAssembly bundles
relative to `import.meta.url`, which Jest's CommonJS transform leaves undefined. Supplying the
bundles by hand did not help — the loader still wanted a URL. Native ESM has no such problem and
Node's built-in runner costs no extra dependency, so `npm run test:db` sits alongside `npm test`
and `npm run verify` runs both.

### `search_path = ''` on every function

Every function in the migrations sets an empty `search_path` and fully qualifies its identifiers.
For `SECURITY DEFINER` functions this is mandatory — without it a caller can create objects that
shadow the ones the function meant to use, and the function runs them with the owner's rights.
Applying it everywhere removes the question of which functions needed it.

### `force row level security`

`enable row level security` does not apply policies to the table's owner. `force` does. Without
it, anything running as the owner silently sees every row.

### Account deletion is a SQL function, not an Edge Function

`delete_own_account()` is `SECURITY DEFINER` and takes **no arguments**, so there is no id to
tamper with and it can only ever delete its caller. Deleting the auth user cascades to the
profile and to everything later phases hang off it.

The alternative — an Edge Function holding the service-role key — is more moving parts, another
deploy target, and a second place the privileged key exists. Both satisfy Apple Guideline
5.1.1(v) and GDPR Art. 17; this one has less surface.

### Refusing to start on a service-role key

Expo inlines `EXPO_PUBLIC_*` into the bundle. That is correct for the anon key, which is designed
to be public and is protected by RLS, and catastrophic for the service-role key, which bypasses
RLS entirely — shipping it would hand every reader of the app full access to every message.

`src/lib/env.ts` detects both key shapes Supabase issues (the `sb_secret_` prefix, and the
`role: service_role` claim in a legacy JWT) and throws at startup. The mistake is a single paste
away, so it is worth making impossible rather than merely documenting.

### Sessions live in the keychain, chunked

Auth tokens are bearer credentials and belong in the keychain, not in AsyncStorage, which is
plain text on disk. But SecureStore becomes unreliable above roughly 2 KB per entry and a
Supabase session — two JWTs plus user metadata — routinely exceeds that.

`src/lib/secure-storage.ts` splits values across numbered entries with a manifest in the primary
key, writes chunks before the manifest so an interrupted write leaves the previous complete set
intact, and treats a partially readable value as absent. The alternative, quietly falling back to
AsyncStorage, trades a visible failure for an invisible one.

---

## Phase 3 - Profiles and city selection

### City coordinates live in Postgres, not in the app bundle

This is a security decision rather than a storage one. Delivery time is derived from the distance
between two cities, so if the client sent latitude and longitude, any user could claim to live
next door to the recipient and forge a short flight. The client sends a `city_id` and nothing
else; `profiles.city_id` is a foreign key, so an invented id is rejected by the database rather
than validated by the app.

Search therefore runs server-side too, in `search_cities`.

### GeoNames, bundled at build time, rather than a geocoding API

`scripts/build-cities.mjs` downloads GeoNames `cities15000` and emits a migration. No geocoding
API is called, at build time or run time, because:

- no third party learns where any user lives, which is the whole point of a privacy-first app;
- there is no API key, rate limit or outage to handle;
- the same city always yields the same distance.

**Trade-off:** the list is finite - every city above 15,000 inhabitants in DE, AT and CH, plus
every city worldwide above 200,000. A village below the cut-off cannot be chosen and the user
picks the nearest town instead. At city-level granularity that changes nothing meaningful. The
data is CC BY 4.0 and attributed in the generated migration's header.

### Alias search, because GeoNames stores English names

GeoNames' primary name is frequently the English one: Vienna not Wien, Munich not München,
Nuremberg not Nürnberg. Measured against a list of 76 names a German speaker might type, **20%
were unfindable** by primary name alone.

Every city therefore carries a `search_index`: its own name plus every Latin-script alternate
name, lower-cased and diacritic-folded, pipe-delimited. Folding also means "Zurich" finds Zürich
and "Koln" finds Köln, which matters because typing umlauts on a phone is possible but nobody
bothers. Non-Latin forms are dropped - most of the volume, none of the value here.

### The folding is a tested contract, not a convention

`fold()` exists twice: in the generator that built `search_index`, and in the client that folds
the query. If they diverge, nothing throws - search simply stops finding cities, which is far
worse than a crash.

The generator therefore emits `fold-parity.fixture.json`, 200 sampled name/folded pairs weighted
toward diacritics, and a test asserts the TypeScript implementation reproduces every one.

### Search ranking, and the bug that produced it

Ranking is exact-match, then own-name-prefix, then population. The middle tier alone was not
enough: searching "wien" returned **Wiener Neustadt** above **Vienna**, because "wien" is a
prefix of Wiener Neustadt's own name but only an alias of Vienna's. An exact match on any name or
alias has to outrank a prefix match. Caught by a test, and the test stayed.

### No index on `search_index`

The alias branch needs a leading wildcard, which no btree index serves, and the table holds about
4,300 rows - a sequential scan is well under a millisecond. Worth revisiting only if the
population cut-off in the generator is lowered substantially.

### Deferred: avatars

`profiles.avatar_url` exists and is never written. Uploading images means Supabase Storage, a
bucket with its own RLS, image resizing and a moderation question for user-supplied pictures.
That is a phase of its own, not a corner of this one.

## Phases 4–11 - bats, friends, letters, delivery

### Least privilege, found on the real platform

Run against a local Supabase stack for the first time, the database turned out to differ from the
test harness in one way that mattered. Supabase's default privileges grant **every** table,
sequence and function created in `public` to `anon` and `authenticated` - INSERT, UPDATE, DELETE
and TRUNCATE included - and leave RLS as the only barrier. The PGlite harness had no such
defaults, so tests asserting "permission denied" passed for a reason that did not exist in
production, where the same request was permitted by privilege and stopped only by a policy.

Nothing was exposed - every table had RLS forced on - but the posture was one missing policy away
from being wide open. `20261031120000_least_privilege.sql` now revokes the defaults for objects
created by migrations, re-grants exactly what the app uses (on `profiles`, column-level: only
`display_name` and `city_id` are updatable, which also enforces the profile screen's promise that a
username cannot change), and creates a `private` schema the API roles cannot reach. The harness
reproduces Supabase's defaults, and `privileges.db.test.mjs` lists, in full, what each API role
holds on every table and function - so a new table or function fails a test until someone decides
its privileges.

**Trade-off:** a table created later through the dashboard is not reachable through the API until
it is granted. That is the intended failure direction.

### Bats are rows with slots

Three rows per courier rather than a counter: a row can be locked by the reservation, carries its
own state, and shows up in the roost as a distinct thing. "Exactly three" is a property of the
schema - `slot between 1 and 3` and `unique (owner_id, slot)` - rather than of the code that
inserts them, so a fourth bat is unrepresentable rather than merely unwritten. They are issued by an
`after insert` trigger on `profiles`, inside the signup transaction, and backfilled for accounts
that predate them.

The status is stored (`available`/`flying`) rather than derived from whether a letter is in the
air, because the reservation has to lock and update something: with a derived status, two sends
could both see a bat as free in their snapshots and only the unique index would stop the second -
as an error instead of a different bat.

### Delivery time lives in SQL

`private.flight_duration(distance)` is `greatest(20 minutes, distance / 80 km/h) × multiplier`,
and `private.distance_km` is the haversine formula on the mean Earth radius. Both read only from
the `cities` table, so the client never sends a coordinate, a distance or a time. The multiplier
lives in `private.flight_settings` - one row, `(0, 1]`, operator-only - and scales the floor too,
so a development project at 0.01 lands a same-city letter in 12 seconds. The 20 and the 80 are
duplicated from `src/constants/config.ts`; `parity.db.test.mjs` reads that file and fails if they
drift.

`flight_duration` is `STRICT`. It was not at first, and `greatest()` skips nulls, so every route
with a missing city quoted the 20-minute floor as if it were a real flight time.

### Friendship is one row per pair

A unique index on `(least(a, b), greatest(a, b))` makes "are these two friends" have one answer,
whichever of them asked. `request_friend` treats asking someone who already asked you as accepting,
and reports what happened (`requested`, `already_requested`, `accepted`, `already_friends`) rather
than raising for cases that are not mistakes. Usernames are matched exactly, never by prefix, so
the service cannot be browsed; that a username exists is revealed, which is inherent in finding
friends by username.

Profiles remain readable only by their owner. `list_friends()` picks columns by hand: a name is
shown once a person has asked you or accepted you, a city only to friends. A policy letting friends
read each other's profile row would have handed over whole rows, to strangers with pending
requests included.

**Unfriending does not recall letters already in the air.** They were sent between friends, and a
bat cannot be recalled. Block (Phase 13a) is where stopping them belongs.

### No client reads the messages table

`messages` has RLS forced on, no policies and no grants. Every read is a `SECURITY DEFINER`
function that returns exactly what its side of a letter may see: the recipient sees nothing until
it lands - not the letter, not that a bat is coming - and the sender never sees `opened_at`. That
column exists for the recipient's unread marker; a SELECT policy for senders would have returned
it, and a whole row is a read receipt. `privileges.db.test.mjs` pins that `authenticated` holds
nothing on the table, and `messages.db.test.mjs` pins the exact columns of the sender's list.

Errors use one contract: business-rule refusals raise SQLSTATE `P0001` with a stable `hint`
(`no_available_bat`, `not_friends`, ...), which PostgREST passes through, and `src/lib/rpc-error.ts`
turns into the app's words. The database's own messages stay free to be written for logs.

### The reservation

```sql
update bats set status = 'flying'
where id = (select id from bats where owner_id = $caller and status = 'available'
            order by slot limit 1 for update skip locked)
  and status = 'available'
```

`skip locked` lets concurrent sends take different bats instead of queueing for one; after taking
the lock Postgres rechecks the row, so a bat that left between snapshot and lock is skipped; the
outer recheck and a partial unique index on in-flight bats (`messages(bat_id) where delivered_at
is null`) are second and third lines of defence. `concurrency.pg.test.mjs` holds four overlapping
transactions open against a real Postgres and checks that three get a bat each and the fourth is
refused. A mutation test - removing `for update skip locked` - makes it fail, which is how we know
it tests something.

### Delivery: a worker, and every read

`private.deliver_due_messages()` lands every due letter and brings its bat home in one statement,
idempotently (only while `delivered_at` is null). pg_cron runs it every minute, inside the
database: the worker is one SQL statement, so an Edge Function would add a deploy target, a network
hop and a service-role key for nothing. The migration schedules it only where pg_cron exists, which
includes hosted and local Supabase and excludes PGlite and plain CI Postgres.

Every function the app reads through first runs the same delivery for the caller. Correctness
therefore never depends on the schedule: if pg_cron stopped, letters would still be readable and
bats home on time, the moment anybody involved looked. The worker makes delivery timely - which
push notifications will need - not correct.

The two modes lock differently, and the first version got this wrong. The worker uses `skip locked`
so overlapping runs divide the work. The per-caller path originally did too, and the end-to-end run
caught the consequence: at the moment a bat was due, the home screen asked for the roost and the
badges at once, both tried to land the same letter, and the one that skipped it reported the bat
as still flying - with nothing left to prompt another fetch, so the roost stayed stuck. The
per-caller path now waits for the lock (milliseconds) and rereads; every caller takes locks in the
same `(deliver_at, id)` order, so it cannot deadlock. A concurrency test reproduces the original
race and fails against the old code. The app also re-asks, with backoff, while a landing it expects
is overdue (`src/lib/use-refresh-at.ts`), so no single lost response can freeze a countdown.

### Account deletion takes letters from both sides

A letter is kept until either correspondent deletes their account, and then it is deleted - from the
recipient's inbox as well as the sender's list. Anonymising instead ("from a deleted account")
would keep the body, which is the sender's personal data under Art. 17. A trigger returns the
sender's bat when a letter still in the air is deleted by that cascade; without it, deleting an
account would have cost a friend one of their three bats forever.

### Client: three small hooks, no query library

`useRemote` (load on focus and on return from background, newest request wins), `usePaged`
(keyset pages; a focus refresh splices the new first page onto older pages instead of jumping to
the top) and `useRefreshAt` (fetch again when a bat is due). Countdowns tick from the server's
`deliver_at` via `useNow`, which stops when its screen is not focused. A query library would earn
its place if screens started sharing cached data; today each screen owns what it shows.

Generated database types (`npm run generate:types`, from the local stack) type the names and
arguments of tables and functions. Each feature still declares its own row types, because the
generator marks every column a `returns table (...)` function returns as non-null - including, for
example, the flight fields of a bat that is at home.

### Navigation

A native header carrying only a back button on every signed-in screen but the roost, painted in the
background colour; the serif titles stay in the content. The root layout owns the way in: a session
appearing anywhere outside the app - restored at launch, or created by the form on screen - sends
the user to the roost with the stack cleared. That guard did not exist before Phase 4, though the
sign-in screen's comments said it did: sign-in and sign-up both succeeded and then left the user on
the form.

### Configuration inlining

Expo inlines `EXPO_PUBLIC_*` variables only where the code reads `process.env.EXPO_PUBLIC_NAME`
literally; at run time `process.env` itself is empty. `src/lib/supabase.ts` had passed it whole
since Phase 2, so every real build threw at launch while every test passed. `supabase.test.ts`
now runs the file through `babel-preset-expo` and asserts both values are inlined and no read of
`process.env` remains. The URL check also accepts plain http for loopback and private-network
addresses, so the app can run against `npx supabase start` - from a phone too.

## Deferred to later phases

Recorded here so the reasoning is not lost between phases.

- **Environment configuration and secrets** (Phase 2). No `.env.example` yet because there is
  nothing to configure. The Supabase anon key is publishable by design; the service-role key
  must never reach the app bundle, and enforcing that is a Phase 2 decision.
- ~~**Delivery time algorithm** (Phase 8).~~ Built: see "Delivery time lives in SQL" above.
- ~~**Scheduled delivery** (Phase 9).~~ Built: pg_cron calling a SQL function directly; see
  "Delivery: a worker, and every read" above.
- **Push notifications** (Phase 10). The worker is where a landing becomes known. The push itself
  needs an HTTP call to Expo's service, which SQL should not make inline: the expected shape is
  the worker recording landings in an outbox table that `pg_net` or an Edge Function drains, so a
  failed push can be retried without touching the letter's state - which is the Phase 10 test.
- **Nocturnal delivery.** Still undecided (see the roadmap). It would change only
  `private.flight_duration`, which is why that function takes nothing but a distance.
