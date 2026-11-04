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
bats home on time, the moment anybody involved looked. The worker makes delivery timely, not
correct.

The two modes lock differently, and the first version got this wrong. The worker uses `skip locked`
so overlapping runs divide the work. The per-caller path originally did too, and the end-to-end run
caught the consequence: at the moment a bat was due, the home screen asked for the roost and the
badges at once, both tried to land the same letter, and the one that skipped it reported the bat
as still flying - with nothing left to prompt another fetch, so the roost stayed stuck. The
per-caller path now waits for the lock (milliseconds) and rereads; every caller takes locks in the
same `(deliver_at, id)` order, so it cannot deadlock. A concurrency test reproduces the original
race and fails against the old code. The app also re-asks, with backoff, while a landing it expects
is overdue (`src/lib/use-refresh-at.ts`), so no single lost response can freeze a countdown.

### A new city takes a day

Coordinates live on the server so a client cannot invent a location, but a courier still chooses
their own city, and changing it is one request. Review found the consequence: switch to a friend's
city, send a twenty-minute letter, switch back - a flight time of the sender's choosing, which is
precisely what computing delivery on the server exists to prevent.

A new city therefore becomes where a courier's letters leave from, and arrive at, only
`RELOCATION_HOURS` (24) after the move; `private.flight_city()` is the one place every distance
reads a city from. A first city counts at once, so a new account can write immediately; moving back
within the day cancels the move; moving on again restarts the wait; clearing the city does not skip
it. Borrowing a city now means living in it for a day, during which every letter, to everyone,
leaves from there - which is not borrowing. The profile, the compose screen and the city picker say
so while it applies.

**Trade-off:** someone who genuinely moves waits a day before their letters fly from the new place.
For an app whose letters take hours anyway, that is in character.

**Confirmed** by the operator on 2 November 2026.

### Nothing reads the bats table directly

The roost comes from `get_roost()`, which lands whatever is due for its caller before answering, so
its answer depends only on the time. A direct read did not: a due letter is landed by whichever
request touches it first, and if that was the recipient opening the app between two scheduler runs,
the sender polling `bats` saw their bat come home at that moment - a trace of when their friend was
online, which this product shows nobody. The app never used the direct read; the grant and the
policy are gone, and a homecoming is stamped with the letter's landing time rather than with the
moment a request noticed it.

### A send can be repeated safely

A phone can lose the answer to a send that succeeded - a network change, the OS suspending the app
mid-request - and the courier, told it failed, taps Send again. That used to send a copy on a second
bat. The app now names each letter with a `client_ref` it keeps across retries of the same words
to the same friend, and changes when either changes; `send_message` answers a repeated ref with the
letter that went. Two repeats arriving at once are settled by a unique index, and the loser's claim
on a bat is undone with it - a concurrency test holds the original open while the retry runs.

### An unusable page cursor is reported, not answered with nothing

A page is asked for after the id of the last letter held. If that letter has since gone - deleted
with its sender's account - an empty page would read as the end of the list, and every older letter
would be out of reach until the screen was left. The list functions refuse it as
`cursor_not_found`, which a foreign letter's id also gets, and the app starts the list again from
the top.

### Account deletion takes letters from both sides

A letter is kept until either correspondent deletes their account, and then it is deleted - from the
recipient's inbox as well as the sender's list. Anonymising instead ("from a deleted account")
would keep the body, which is the sender's personal data under Art. 17. A trigger returns the
sender's bat when a letter still in the air is deleted by that cascade; without it, deleting an
account would have cost a friend one of their three bats forever.

Deletion takes the caller's letters first, in the same `(deliver_at, id)` order delivery uses,
before anything else. The cascades used to reach bats before letters while delivery locks letters
before bats - opposite orders, which review reproduced as deadlocks three ways (a letter landing as
its sender deletes their account, a send to someone deleting theirs, two friends deleting at once).
Postgres broke each by failing one side, so nothing was corrupted, but a request failed or a minute
of the worker's landings rolled back.

**Confirmed** by the operator on 2 November 2026. One exception came with Phase 13a: a report keeps
its own copy of a reported letter for up to 180 days, deleted account or not - see "A report keeps a
copy, and outlives both accounts" below.

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

### Confirmations that work on the web too

React Native Web implements `Alert.alert` as an empty function, so on the web build a confirmation
built on it never appears and its action can never be taken - removing a friend and deleting an
account were impossible there. `src/lib/confirm.ts` uses the browser's own dialog on the web and
`Alert` elsewhere. The friend list also stopped hiding its actions in an alert: tapping a friend
opens a letter to them, and Remove is a button of its own.

### Accessibility, checked rather than assumed

The product review read the new screens as a VoiceOver user, a TalkBack user and someone with large
text would, and four things changed:

- **No control inside a pressable row.** iOS exposes an accessible pressable as one element, so a
  button nested in it can never be focused - a VoiceOver user could not remove a friend. A
  `ListRow` with `actions` is never pressable itself; each action is its own button.
- **Rows reflow at large text.** From a font scale of 1.2, a row's actions move below its text,
  where beside it two scaled-up buttons squeezed a requester's name to an ellipsis. 1.2, not 1.3,
  because Android reports its 130% setting as 1.2999999523162842.
- **Errors and outcomes are spoken.** `aria-invalid` reaches assistive technology only on the web.
  `TextField` announces an error as it appears and makes it the field's hint; sends, friend
  requests and saves announce how they went (`src/lib/announce.ts`).
- **Contrast and touch targets.** `textMuted` meets WCAG AA (4.5:1) on every surface it rests on,
  and compact buttons take a 44pt touch on iOS and 48dp on Android while drawn 36pt tall.

The compose screen also stopped using a `KeyboardAvoidingView` inside a scroll view under a header,
which on iOS padded too little and left "Send by bat" under the keyboard; `Screen`'s
`avoidKeyboard` lets the scroll view's insets follow the keyboard instead.

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

## Phase 12 - the flight, drawn

### Plain views and React Native's own Animated

The arc is 25 small views placed along a quadratic curve, and the bat a tinted image moved with a
transform: no drawing library, so nothing new to install, keep in step with Expo, or mock. The wing beat
(a quick squash of the silhouette) and the drift (a slow rise and fall) are two `Animated` loops on the
native driver - transforms only - so they cost the JavaScript thread nothing on a phone; the web build,
which has no native side, runs them in the browser. Where the bat is along the arc is not animated at
all: it is computed from the clock that already ticks every second for the countdowns, because a flight
lasts hours and a second's movement is invisible.

**Rejected:** Reanimated. It is installed, but nothing used it, and its worklets would have been one more
thing to set up in tests for a decoration.

### Calm until told otherwise

`useReducedMotion` starts as "reduce" and only lets the bats move once the device has said motion is
fine, and follows the setting while the screen is open: someone who gets dizzy from movement never sees
a frame of it. A bat that has landed, or is at home, does not move either.

### Decoration, described in words

The drawing is one image to a screen reader, described as "Bat 40% of the way from Berlin to Vienna";
the moving bat and the progress bar are hidden, since the countdown beside them already says when the
bat lands.

### Tests run with motion reduced

React Native's test environment has no native animated module, so an endless loop would run frame by
frame in JavaScript, and a test that lets an hour pass under fake timers ran every frame of it - slowly
enough to time out. `jest.setup.js` therefore gives every test a reader who asked for less motion, and the
animation's own tests turn motion back on to check that the loops start, stop and stay off.

## Phase 13a - blocking and reporting

Apple's Guideline 1.2 makes both a condition of review for any app with user-generated content. They
are built like the rest of the API: `public.blocks` and `public.reports` have row level security
forced, no policies and no grants, and are reached only through `block_courier`, `unblock_courier`,
`list_blocked`, `report_letter` and `report_courier`
([`20261102120000_safety.sql`](../supabase/migrations/20261102120000_safety.sql)).

### A block is one-sided and silent

A block ends whatever was between the two - a friendship, or a request either way - so the blocked
courier no longer sees the blocker's city. Letters then stop both ways, because letters only travel
between friends, and the blocked courier cannot ask again.

They are never told. Asking to be friends with someone who has blocked you is refused with the
unknown-username refusal, message and all, so the answer says no more than it would about a deleted
account. Their own letters land, as far as they can see, the way letters always land: the app has no
read receipts to withhold. The blocker, by contrast, is told plainly why they cannot ask someone they
have blocked.

What a block cannot hide is everything else that stays as it was, and a blocked courier who looks
can tell a block from a deleted account (review compared the two call by call):

- the letters the blocker sent them stay in their inbox, and their own letters to the blocker stay
  in their sent list, still readable, and a bat still flying there stays out until it lands - where
  a deleted account's letters would all have gone, and the bat come home;
- `block_courier` or `report_courier` with the blocker's id, which they hold from their friends
  list, answers as for a courier who exists, where a deleted one would be `courier_not_found`.

Hiding all of that would mean deleting letters on a block, from both sides - taking the blocker's
own words out of someone's inbox without asking, and making blocking destroy things, which would
make people slower to use it - and pretending existing couriers do not exist. Not worth it: the
refusal to a new request, which is what a blocked courier is most likely to meet, gives nothing
away, and nothing ever says "blocked".

**Rejected:** telling the blocked person, or a softer "this courier is not accepting requests". Both
announce the block to the person most likely to react badly to it.

### Hidden, not deleted

Letters from a blocked courier - those already received, and any still in the air - are left out of
the inbox, the unread count and `read_message` for as long as the block stands, and come back when it
is lifted. Deleting them instead would look more like a deleted account from the other side (see
above), but it would make a block irreversible and would delete the letters a report might need. A
letter still in the air when the block is made lands as usual and its bat comes home; only the
blocker stops seeing it.

A blocked courier's display name stops reaching the blocker too. It is theirs to change at any
time, to anything - "I know where you live" - and the blocker would otherwise still see it on every
letter they ever sent them and on a bat flying there. `get_roost`, `list_sent` and `read_message`
name someone the caller has blocked by username alone, as `list_blocked` always did. (Found in
review.)

Unblocking does not restore the friendship. Being friends again takes a new request and a yes, as it
did the first time.

### A request and a block take the same lock

A block sweeps away the pair's friendship rows; a request inserts one. Run at the same moment, the
sweep cannot see a row whose insert has not committed, and a request from someone already blocked
would survive in the blocker's list. Both therefore take a transaction-scoped advisory lock on the
pair first (`private.lock_pair`), and decide only once they hold it. Two real-Postgres tests hold one
side's transaction open while the other arrives, in each order; each fails when the lock is removed
from either function. `accept_friend` needs no lock: an update and a delete of the same row already
serialise.

### A report keeps a copy, and outlives both accounts

A report stores what it is about as it was: the courier's username and display name, and for a
letter its text and when it was sent. Without the copy, a report would point at nothing as soon as
the letter went - and letters go from both sides when either person deletes their account, so
deleting an account would be a way to take back a threat along with the only copy of it. The
reporter and the reported courier are referenced with `on delete set null`, so the report survives
either account without the ids.

Reports are for the operator only. No API role can read the table, not even the reporter, and the
reported courier is never told who reported them.

**Trade-off:** the reported text outlives the sender's own deletion request, until the report is
180 days old - and so does what a reporter wrote in their own report. That is the narrow case
Art. 17(3)(e) and legitimate interest (Art. 6(1)(f)) exist for: handling abuse, and keeping what a
victim might need. The privacy policy has to say so, and the account deletion dialog does.

### Limits, and how long reports are kept

- A reason from a fixed list (`REPORT_REASONS`), a note of at most 500 characters, and one open
  report per letter or per courier: a repeated report returns `already_reported` and adds nothing.
  Once the operator has resolved a report, the same letter or courier can be reported again - with
  something new to say, after a "no action".
- At most 20 reports per courier per day. Past that, a report returns `limit_reached` and is not
  recorded - an answer, not a refusal, because a refusal rolls back the whole request, and with it
  the block that "also block" asked for. (Found in review: the limit used to cancel the block, while
  telling the courier to block instead.) Reports by one courier are counted one request at a time,
  under a lock: counted side by side, forty sent at once had all been recorded. A real-Postgres test
  sends 25 at once and fails without the lock.
- Reports are deleted 180 days after they were made, by a pg_cron job
  (`private.forget_old_reports`) that runs hourly, so the 180 days hold to within the hour. As with
  delivery, the job is scheduled only where pg_cron exists.
- The numbers live in `src/constants/config.ts` and the migration, and a parity test fails if they
  drift apart.

### Deleting two accounts that had blocked or reported each other

Account deletion takes its blocks and clears its id from reports, both ways, and the cascade reaches
each pair's two rows in opposite orders for its two people. Two couriers who had blocked or reported
each other, deleting their accounts at the same moment, deadlocked (8 pairs in 200 in review).
`delete_own_account` now takes those rows first, in one order for everyone - after the letters and
bats, as before - so the second deletion waits for the first. Two real-Postgres tests delete both
accounts at once and fail without it.

### Reporting blocks by default

"Also block" is on when the report screen opens. Someone reporting a letter almost always wants it to
stop, and a report alone changes nothing they can see until the operator acts. It can be turned off,
for a report about someone the reporter still wants to hear from.

Blocking first and reporting later must also work, and once someone is blocked their letters and
their page are out of reach. The blocked list therefore has Report beside Unblock. Unblocking asks
first: one stray tap would bring back the letters of someone blocked for a reason and let them ask
again.

### Contact and privacy links are configuration

Guideline 1.2 asks for published contact information and 5.1.1 for an in-app link to the privacy
policy. Both addresses come from the build's environment (`EXPO_PUBLIC_CONTACT_URL`,
`EXPO_PUBLIC_PRIVACY_POLICY_URL`; see `src/lib/links.ts`) rather than from the source, because this
repository is public and the operator's address must never be in it. Only `https:` and `mailto:` are
accepted, and an unset link hides its button - fine for development, and caught by GO-LIVE's
checklist before a build for anyone else.

### The house rules live outside the signed-in group

`/rules` has to be readable from the sign-up form, before an account exists, and from the profile.
It is the one route outside `(app)` that the root guard lets a signed-in courier stay on. Creating an
account agrees to the rules, and the form says so beside the button - the zero-tolerance terms App
Review asks of apps with user content.

### What the review changed on the client

- Going back from a report that blocked showed the letter that had just been hidden: the letter
  screen kept its old data through the failed reload. After such a report, Done, Android's back
  button and the (now hidden) header back button all go past it, and the letter screen shows "This
  letter is no longer here" whenever a reload says `message_not_found` - `useRemote` now says why a
  fetch was refused.
- Leaving after a block goes to the list by name (`dismissTo`), not one step back, which would pop
  whatever the courier had opened meanwhile; and Write back is disabled while a block is on its way.
- The roost sits under every signed-in screen (`initialRouteName`), so a screen opened from a link
  or a web reload still has somewhere to go back to.
- On the web, `announce` writes into a live region, since React Native Web's
  `announceForAccessibility` does nothing; the reason radios use `aria-checked`, which it reads and
  `accessibilityState` it does not; after a report, focus moves to what happened.

**Known gaps:**

- With more than 100 letters loaded, a blocked courier's letters beyond the first 100 stay in the
  list until it is opened afresh, because a refresh re-fetches at most 100 and keeps the older ones
  it holds. Opening one says it is no longer here. Rare enough to leave.
- A block does not survive the blocked courier deleting their account and signing up again: the
  block goes with the old account, and the username is free again at once. Sign-up is open, so a
  new username was always possible anyway; what the operator can do is keep a removed account's
  sign-in banned for two years, so that the same email cannot return (GO-LIVE, "Handling a
  report"). Retiring usernames for a while after deletion would close the rest, at the cost of more
  data kept.

### A row's text may open it, beside its actions

Friends' rows have actions (Write, Remove, Accept, Decline), and a row with actions could not itself
be pressable: VoiceOver treats a pressable row as a single element and cannot reach a button inside
it. To make a courier's page reachable from their name, `ListRow` now makes only the text a button,
beside the actions rather than around them, at any text size.

## Keeping less, for less long

Writing the privacy policy (`docs/store/`) meant listing every piece of personal data the service
holds, read from the database rather than from these notes. That turned up data kept for no reason,
or for longer than any reason lasts, and `20261104120000_privacy_housekeeping.sql` deals with it:

- **Sign-in records.** GoTrue writes an entry to `auth.audit_log_entries` for every sign-up,
  sign-in, sign-out and token refresh, with the email and IP address, and never removes one - not
  even with the account, since the entries name the user only inside a JSON payload, with no
  foreign key. Now they are kept 30 days (`private.sign_in_record_retention()`), long enough to
  look into a break-in, and deleting an account takes its own at once.
- **Sign-up details.** The username and display name typed at sign-up stay in
  `auth.users.raw_user_meta_data`, and travel in every access token, long after the profile has
  changed; GoTrue keeps another copy in the email identity. The profile is the record of who
  someone is, so both copies are removed once the profile has been made.
- **Removed accounts.** The operator removes an account with `private.remove_account`, which
  deletes everything it holds and bans its sign-in for exactly `private.ban_period()` - two years,
  the operator's decision - so that the same email cannot simply sign up again. The ban used to be
  a hundred years, set by hand, and kept for ever. When it runs out, the sign-in is deleted.
- **Moves.** The city a courier moved away from stays on their profile only while the move
  settles, then goes.
- **pg_cron's own log** is kept a week.

One daily job, `private.tidy_up()`, does all of it at 04:43. Each step that touches a table
Supabase owns is skipped, not fatal, where that table is out of reach, so one missing privilege
cannot stop the rest; deleting an account cannot fail for it either. Verified against the local
stack's real GoTrue: the records it writes, the copy in the identity, a banned account refused at
sign-in, at token refresh and at sign-up, and its sign-in deleted with its identities once the
ban has run out.

The iOS build also no longer asks for Face ID: expo-secure-store declares that permission by
default, and the app never uses biometrics, so the store's privacy questions would have had to
explain an access it never makes. And the session kept in the iOS keychain is now kept on that
device only (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`): a backup restored to another phone no longer
brings a signed-in session with it, so a new phone signs in again.

What it cannot do from SQL, and the privacy policy therefore says plainly:

- Letters are kept until one of the two people deletes their account; there is no per-letter
  deletion.
- Supabase's own request logs and backups, which follow the plan's retention, not ours.
- Sessions do not expire on their own; time-boxing them is a paid-plan setting.

## Deferred to later phases

Recorded here so the reasoning is not lost between phases.

- **Environment configuration and secrets** (Phase 2). No `.env.example` yet because there is
  nothing to configure. The Supabase anon key is publishable by design; the service-role key
  must never reach the app bundle, and enforcing that is a Phase 2 decision.
- ~~**Delivery time algorithm** (Phase 8).~~ Built: see "Delivery time lives in SQL" above.
- ~~**Scheduled delivery** (Phase 9).~~ Built: pg_cron calling a SQL function directly; see
  "Delivery: a worker, and every read" above.
- ~~**Push notifications** (Phase 10).~~ Dropped by the operator's decision on 2 November 2026:
  the app has no push notifications. A letter lands on schedule either way; its recipient sees it
  the next time they open the app. Kept for the record, should that ever change: the worker is
  where a landing becomes known, and the push should go through an outbox table that `pg_net` or
  an Edge Function drains, so that a failed push can be retried without touching the letter.
- **Nocturnal delivery.** Still undecided (see the roadmap). It would change only
  `private.flight_duration`, which is why that function takes nothing but a distance.
