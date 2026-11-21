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

On Android the look of the navigation bar is settled once, at launch, from the phone's own theme,
before the app makes itself dark. So a phone in light theme with three-button navigation may draw
a bright bar with dark buttons under every screen - read in React Native's source, not seen. It is
to be looked at on such a phone before anyone else gets a build (decided on the operator's behalf);
if it shows, `expo-navigation-bar` can set the bar dark as the app starts.

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

_Corrected in November 2026:_ that was the intention, and until then it did not hold. The route
types are generated into `.expo/types`, never committed, and `tsconfig.json` excluded `.expo` -
which wins over the include beside it - so `npm run typecheck` and CI passed whatever a link
said. `npm run typecheck` now generates the types first (`npm run generate:routes`, which is
`expo customize tsconfig.json`) and the exclude is gone. `src/tests/app-config.test.ts` holds a link to a screen that does not exist, marked as an
expected error: if the route types ever go missing from the typecheck again, that mark fails it.
No link in the app was broken when this was switched on.

_Found in November 2026:_ the compiler was on for every build and in no test. `babel-preset-expo`
runs it only when Metro asks for it, so Jest tested the code as written, which no phone runs. The
compiler memoizes what it can prove it may; where a component breaks a rule of React it cannot see,
the compiled one behaves differently. `npm run test:compiled` (`jest.compiled.config.js`) runs the
whole suite again with the code compiled as a production build compiles it, and CI runs it after
`npm run verify`. A test known to fail compiled would be listed in `jest.compiled.setup.js` with
the check it fails on; the list is empty since the auth provider's sign-out moved out of the
component, where the compiler had folded a count taken before an `await` into a comparison with
itself, and announced every sign-out twice.

The compiler also leaves out, without a word, any component or hook it cannot compile - one with a
`finally` in it, for one. It still works, but draws again whenever anything above it does.
`src/tests/react-compiler.test.ts` compiles the app as a production build does and lists what is
left out, with why: six screens (the blocked list, a courier's page, Friends, a letter, the
profile, the report) and two hooks (`useRemote`, `usePaged`), all for a `finally`. A change to the
list is a decision: the compose screen came back by writing its `finally` as a `then`, and the
forms and the auth provider by waiting with `settled()` (`src/features/auth/settled.ts`) instead
of a `try` (`src/tests/forms-compiled.test.ts`).

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

Two more, added in November 2026:

**`fireEvent` does not touch the control.** It looks up the tree for the first prop named
`onPress` or `onChangeText` and calls it, and the first it finds is on the app's own wrapper - a
`Button`, a `ListRow`, a `TextField`. A wrapper that stopped handing its handler on to React
Native's control would leave every button in the app doing nothing, and every screen test green.
`src/components/wiring.test.tsx` therefore presses and types with `userEvent`, which delivers the
touch, and each keystroke, to the native control itself.

**One time limit for every file.** With a cold transform cache - a fresh checkout, CI - the first
render in a file compiles React Native's components, seconds of work that count against whichever
test runs first. `testTimeout` is set once, to 20 seconds, in `jest.config.js`, rather than raised
in the files that happened to time out once.

### Linting: ESLint flat config, run directly rather than through `expo lint`

`expo lint` reported success on a codebase where `eslint .` reported ten errors: it was not
covering `scripts/`. `npm run lint` therefore calls `eslint . --max-warnings=0` so nothing is
silently skipped. `eslint-config-prettier` is applied last to switch off the stylistic rules
Prettier owns.

Since November 2026 it also refuses a test left focused, in `src` and `scripts`: `.only` on a test
or a group, wherever Jest keeps it (`it.only.each`, `test.concurrent.only`), and `fit` and
`fdescribe`. Jest runs a focused test alone in its file, skips the rest without a failure and exits
with success, so the typecheck, the format check and CI would all stay green with tests not run.

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

_Superseded below. Written when the operator was assumed to live in Germany, which is where the
distances and the third-country reasoning in it come from._

Supabase's two EU-central regions are Frankfurt and Zurich. Frankfurt is inside the EU; Zurich is
Switzerland, which is not.

Sending the data to Zurich would be a third-country transfer under GDPR. It is lawful today —
the Commission's adequacy decision for Switzerland (Decision 2000/518/EC, kept in force by Art.
45(9) GDPR; the Commission's January 2024 review found the protection still adequate) covers it —
but it is a dependency on a decision that can be challenged and withdrawn, as _Schrems I_ and _II_
both were. Frankfurt removes the question rather than answering it, is roughly 150 km from the
operator instead of 450, and is AWS's largest European region, which is where Supabase features
tend to land first.

The region is immutable after project creation, so this is worth getting right while the database
is still empty.

#### Reversed: the project is in Zurich (`eu-central-2`)

The operator chose Zurich after reading the above. Recording what that actually means, so the
choice is documented rather than merely made. Since 5 November 2026 it is recorded that the
operator lives in Switzerland, as a private individual, so the Swiss Federal Act on Data
Protection (FADP) applies to the operator, and the GDPR applies to the data of people in the EU and
the EEA, because the app is offered to them (Art. 3(2)(a) GDPR):

- **For the operator, the data stays at home.** Switzerland is the operator's own country, so
  storing the database there is not a disclosure abroad under the FADP.
- **For people in the EU, the adequacy decision covers it.** Switzerland is a third country under
  the GDPR, but the Commission's adequacy decision for Switzerland (Decision 2000/518/EC, kept in
  force by Art. 45(9) GDPR; the Commission's January 2024 review found the protection still
  adequate) covers it, so no standard contractual clauses or transfer impact assessment are needed
  for the hosting location itself. This is no longer about an operator in the EU sending data to
  Switzerland: the controller is in Switzerland too.
- **Swiss data protection is not a downgrade.** The revised FADP is close in substance to the
  GDPR, and Switzerland's reputation on privacy is a legitimate reason to prefer it.
- **The residual risk has changed shape.** For people in the EU the arrangement still leans on an
  adequacy decision, and adequacy decisions have been invalidated before. But moving the project
  to an EU region would no longer settle it, since the operator, who runs the database, is in
  Switzerland as well; what would then be needed for people in the EU is **to check**.
- **The USA is where data goes abroad.** Supabase Inc. is a US company and may reach the data from
  there (support, sub-processors); so do Microsoft for the contact mailbox and GitHub for the web
  pages. Under the FADP that rests on the Swiss-US Data Privacy Framework (recognised by the
  Federal Council, in effect since 15 September 2024) for certified companies, otherwise on
  contractual safeguards such as the SCCs in Supabase's DPA; whether each company is certified is
  **to check** (`docs/store/gdpr-records.md`, 5.1).
- **Latency is a non-issue here.** A few hundred kilometres of extra distance is single-digit
  milliseconds, and this is an application whose entire premise is that messages take hours.

**One concrete consequence:** the privacy policy must name the countries: Switzerland, where the
database is, and the USA (Supabase Inc., Microsoft for the mailbox, GitHub for the web pages; Apple
and Google for testers). Art. 19 FADP asks for the countries and safeguards of any disclosure
abroad, GDPR Art. 13 for where data goes, and "in the EU" would be wrong.

### Email confirmation: off during development, on before anyone else joins

Supabase's built-in email service **refuses to deliver to any address that is not on the
project's team**, and is capped at two messages per hour across the whole project. With email
confirmation enabled and no custom SMTP, a friend's signup therefore fails silently — the account
is created and the confirmation code never arrives. (A link, when this was written; the emails
carry a code since November 2026, see "Codes, not links" below.)

So the order is: confirmation **off** while the only account is the operator's; configure custom
SMTP (Resend, Postmark, SES) before inviting anyone; then turn confirmation **on**. It stays
worth turning on, because password reset is only a recovery route if the address is real, and a
typo'd address on a project with no support desk is a permanent lockout.

Because that setting is the project's rather than the app's - `supabase/config.toml` declares it
(`enable_confirmations`), and the dashboard can change it - `signUp` **reports** which case
occurred rather than assuming one: Supabase returns a user but no session when confirmation is
pending, and a session immediately when it is not. The sign-up screen branches on that: with
confirmation on it asks for the code emailed to the address, and with it off the session arrives
and the root layout takes the courier in. Telling someone to check an inbox when no email was sent
leaves them waiting forever, and the tests for both are in `src/tests/sign-up-screen.test.tsx`.

An address that has an account already is answered as a new one is while confirmation is on (see
"Who can tell whether an address has an account" below). With it off, a new address is signed in
at once anyway, so the form says plainly "There is already an account with that email address.
Sign in instead." Which of the two the project does is read from `mailer_autoconfirm` in the
settings the auth server shows anyone (`GET /auth/v1/settings`), and taken for "on" when that
cannot be read: the form then says what is true either way.

**Known gap:** while confirmation is off, a sign-up for the address of an account that is still
unconfirmed - one the operator made by hand without confirming it, or one left from a time
confirmation was on - is answered with a session in that account. Whoever signed up is in it, with
its username and name, and without the password they typed (seen on the local stack, with an
account made by hand). The tidy-up deletes such accounts after a week (see "Keeping less, for less
long"), and GO-LIVE keeps confirmation in `supabase/config.toml`, so that a push does not turn it
off again.

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

The same holds for whoever writes a row. Since November 2026 the stub also has Supabase Auth's own
role, `supabase_auth_admin`, and the tests sign people up as it (`createUser` in
`src/tests/db/harness.mjs`), as GoTrue does on the platform. A trigger on `auth.users` runs with
that role's rights, which reach nothing in the `private` schema, and a check constraint runs as
whoever writes the row. Signed up as a superuser, the tests would pass a trigger that refuses every
sign-up on the platform.

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

A `SECURITY DEFINER` function reads the tables as its owner, and with `force` the policies hold for
that owner too. On the platform the owner, `postgres`, is no superuser: it passes row level
security by, and it is also a member of `authenticated`, whom the policies let read the cities -
either is enough for `search_cities`, which runs with its owner's rights since November 2026. The
database tests run as a superuser, which passes every policy by, so one test runs `search_cities`
under an owner that is neither superuser nor allowed past the policies, and only a member of
`authenticated`.

### Account deletion is a SQL function, not an Edge Function

`delete_own_account()` is `SECURITY DEFINER` and takes **no arguments**, so there is no id to
tamper with and it can only ever delete its caller. Deleting the auth user cascades to the
profile and to everything later phases hang off it.

The alternative — an Edge Function holding the service-role key — is more moving parts, another
deploy target, and a second place the privileged key exists. Both satisfy Apple Guideline
5.1.1(v) and GDPR Art. 17; this one has less surface.

Since November 2026 it refuses an account the operator has suspended or removed, and it takes the
account's rows in the one order everything that ends an account takes them; what the app does
around it is under "Deleting an account" in "The whole-project review" below.

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

_Corrected in November 2026:_ the chunks were written before the manifest, but over the chunks of
the value before, so an interrupted write left neither value whole. A chunked value is now written
to one of two sets of entries in turn (`<key>.a.<n>`, `<key>.b.<n>`), never over the set the
manifest names; the manifest (`ncchunks:<count>:<set>`), one entry and so one write, switches from
the old set to the new, and the old set is cleared after it. Every write and every removal also
clears what an earlier write or clean-up that was cut short left behind, in either set or in the
old layout - as far as the manifest says, and at least eight chunks of each - so that signing out
leaves no piece of a session in the keychain. Values in the old layout are still read. A read the
keychain refuses counts as nothing stored and leaves the entry alone, and a write or a removal goes
ahead without it.

The session's entry is named by the app, `night-courier.session` (`src/lib/session-store.ts`),
rather than by supabase-js, which derives a name from the project's address that the app does not
know - and for some addresses one the keychain refuses. Named, the entry can be read by the app as
well as by the client (see "Sessions" in "The whole-project review" below). On the web it is the
browser's storage, held in memory where the browser refuses it. An app updated from a build before
the change finds no session under the new name, and signs in again; its old entry stays in the
keychain unread.

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

Each run writes a new migration, because a database runs a migration once and never again: it
brings the table up to date and takes no town away, since a courier may live there. Since November
2026 the generator leaves out a city with no name to search by, and the two rows a migration took
out; and it no longer works out what tells two towns of the same name apart, but ends every
migration it writes by calling `private.qualify_cities()`, which does that over the whole table.
Both are under "Cities" in "The whole-project review" below.

### Alias search, because GeoNames stores English names

GeoNames' primary name is frequently the English one: Vienna not Wien, Munich not München,
Nuremberg not Nürnberg. Measured against a list of 76 names a German speaker might type, **20%
were unfindable** by primary name alone.

Every city therefore carries a `search_index`: its own name plus every Latin-script alternate
name, lower-cased and diacritic-folded, pipe-delimited. Folding also means "Zurich" finds Zürich
and "Koln" finds Köln, which matters because typing umlauts on a phone is possible but nobody
bothers. Non-Latin forms are dropped - most of the volume, none of the value here.

The folding learnt the ways people write saints' towns, brackets and slashes in November 2026: see
"How a town is typed" under "Cities" in "The whole-project review" below.

### The folding is a tested contract, not a convention

`fold()` exists twice: in the generator that built `search_index`, and in the client that folds
the query. If they diverge, nothing throws - search simply stops finding cities, which is far
worse than a crash.

The generator therefore emits `fold-parity.fixture.json`, 200 sampled name/folded pairs weighted
toward diacritics, and a test asserts the TypeScript implementation reproduces every one. Since
November 2026 the fixture also holds typed spellings ("St. Gallen", "Biel/Bienne"), which the
database tests look towns up by, and the spelling rules exist a third time, in SQL, held to the
fixture's spellings that need no letter folded (see "How a town is typed").

### Search ranking, and the bug that produced it

Ranking is exact-match, then own-name-prefix, then population. The middle tier alone was not
enough: searching "wien" returned **Wiener Neustadt** above **Vienna**, because "wien" is a
prefix of Wiener Neustadt's own name but only an alias of Vienna's. An exact match on any name or
alias has to outrank a prefix match. Caught by a test, and the test stayed.

The own-name tier reads the first term of the index, which is the city's own name as it is
written; since November 2026, once a whole saint has been typed, its form with "sankt" counts too
(see "How a town is typed").

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

_Corrected in November 2026:_ "in full" was not yet true. The audit asked about whole tables only,
and passed a column of letters granted to a signed-out visitor, and a view over them. It now
counts views as tables and privileges on single columns as privileges - there are exactly two,
UPDATE on `profiles.display_name` and `profiles.city_id` - checks that nothing in the `private`
schema can be executed by the API roles or by Supabase Auth's own role, and is itself tested on a
scratch database that grants a column and a view.

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

Values far below 0.01 are not refused (decided on the operator's behalf: the multiplier is a
developer's setting, and production has 1). At about one ten-billionth every same-city send fails
on the table's rule that nothing lands at the moment it is sent (`messages_never_instant`), and
review saw a deletion deadlock once against the delivery worker with flights shorter than the
deletion took.

`flight_duration` is `STRICT`. It was not at first, and `greatest()` skips nulls, so every route
with a missing city quoted the 20-minute floor as if it were a real flight time.

### Friendship is one row per pair

A unique index on `(least(a, b), greatest(a, b))` makes "are these two friends" have one answer,
whichever of them asked. `request_friend` treats asking someone who already asked you as accepting,
and reports what happened (`requested`, `already_requested`, `accepted`, `already_friends`) rather
than raising for cases that are not mistakes. Usernames are matched exactly, never by prefix, so
the service cannot be browsed; that a username exists is revealed, which is inherent in finding
friends by username.

_Corrected in November 2026:_ "cannot be browsed" said too much. Usernames can be guessed: a
request to a name nobody has is refused as often as it is tried, and leaves nothing behind to
count. What is limited is how many couriers one account can reach - twenty new requests an hour -
and with that how many usernames it can confirm to exist, each confirmation putting a request with
the asker's name in front of that person (see "Friend requests" under "Database" in "The
whole-project review"). A short username gives no privacy.

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
hop and a service-role key for nothing. The migration schedules it only where pg_cron is available,
which includes hosted and local Supabase and excludes PGlite and plain CI Postgres. So the database
tests went the way that schedules nothing, and none went the way the hosted project goes, until
November 2026: `src/tests/db/cron.db.test.mjs` gives PGlite a stand-in pg_cron before the
migrations run - pg_cron's table of jobs, its log of runs, and `cron.schedule` in SQL - so that
each migration finds it and schedules its job as written. The three jobs (delivery, old reports,
the tidy-up) are read back from `cron.job`, and each command is run as pg_cron runs it.

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

_Changed in November 2026:_ until a courier's first letter, sent or received, a move counts at once
as the first city does, because there is no flight to shorten yet; the city picker asks before it
saves; and the roost says so too while a move settles. See "Moves before the first letter" under
"Cities" in "The whole-project review" below.

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
bat. The app now names each letter with a `client_ref`, and the same words to the same friend keep
their ref for as long as an earlier send of them is unanswered, or known not to have gone;
`send_message` answers a repeated ref with the letter that went. A send without an answer is not
taken for a failure: the app asks `sent_letter(client_ref)` what became of it - at once, again while
the letter is on screen, and before any other words may go out under a new ref. Until the server has
answered, changed words are held back rather than sent as a second letter
(`src/features/messages/sending.ts`). A question the server refuses - it refuses a suspended account
everything - is reported, and the letter stays in doubt without being asked after again until it is
opened anew (a letter just noted as in doubt is first asked after once more, a moment later). A send
refused for the suspension says nothing about its ref either: `send_message` refuses before it
looks. On the server,
everything about one send of one courier - the send, a repeat of it, the question - takes its turn
behind `private.lock_send(caller, client_ref)`, an advisory lock held to the end of the transaction:
a repeat that overlaps its original finds the letter that went, or that none did, never half of it.
The unique index on `(sender_id, client_ref)` stays as the table's own guarantee. Concurrency tests
hold the original open while the repeat and the question run.

A repeated ref is answered with the letter that went even when the words or the friend differ: the
second words are dropped, and the send is reported as gone. That is by design (decided on the
operator's behalf): the app makes a new ref for new words or another friend, so only a mistake in a
later client could send other words under an old ref - and that letter would be lost without a
word.

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

_Grown in November 2026:_ a load that got no answer is made again by itself (`useRetry`), the
profile has a hook of its own (`useProfile`), a long wait says so (`useLingering`), and two things
are no longer owned by a screen: a letter not sent yet, and the sending of it. See "Loading, and
loading again" and "Compose" in "The whole-project review" below. Still no query library.

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
  because Android reports its 130% setting as 1.2999999523162842. Since November 2026 a row can
  ask for its actions below at every size (`ListRow`'s `actionsBelow`), and "Your friends" does:
  on a 360dp phone a name and a username beside Write and Remove were cut to a few characters. In
  "Asking you", Accept and Decline sit under the name for the same reason. A row can also give
  its subtitle and detail every line they need (`subtitleLines`, `detailLines`), which the friends'
  routes, compose's chooser and the two letters lists use for a town told apart from its twin (see
  "Cities").
- **Errors and outcomes are spoken.** `aria-invalid` reaches assistive technology only on the web.
  `TextField` announces an error as it appears and makes it the field's hint; sends, friend
  requests and saves announce how they went (`src/lib/announce.ts`).
- **Contrast and touch targets.** `textMuted` meets WCAG AA (4.5:1) on every surface it rests on,
  and compact buttons take a 44pt touch on iOS and 48dp on Android while drawn 36pt tall.

The compose screen also stopped using a `KeyboardAvoidingView` inside a scroll view under a header,
which on iOS padded too little and left "Send by bat" under the keyboard; `Screen`'s
`avoidKeyboard` lets the scroll view's insets follow the keyboard instead.

The sign-in, sign-up and reset forms followed in November 2026: inside a scroll view a
`KeyboardAvoidingView` pads itself without end. Android needed more. The app is drawn edge to edge
there, and the system no longer makes the window smaller for the keyboard, so whatever lay under it
stayed there: every `Screen` now pads its bottom by the keyboard's height from `keyboardDidShow` -
the keyboard's inset less the navigation bar's - adding the bar where the safe area does not pad
the bottom edge already. On the forms the keyboard's "next" key moves to the next field without
closing the keyboard (`submitBehavior="submit"`). None of it has been seen on a device yet.

### Navigation

A native header carrying only a back button on every signed-in screen but the roost, painted in the
background colour; the serif titles stay in the content. The root layout owns the way in: a session
appearing anywhere outside the app - restored at launch, or created by the form on screen - sends
the user to the roost with the stack cleared. That guard did not exist before Phase 4, though the
sign-in screen's comments said it did: sign-in and sign-up both succeeded and then left the user on
the form.

Since November 2026 the guard also holds the way in while a code from an email is checked, or has
signed the courier in with their password still to be saved: it keeps them on the screen that asked
for the code, wherever else they find themselves (see "A code holds the way in" in "The
whole-project review"). And the app has a page of its own for a link that leads nowhere
(`src/app/+not-found.tsx`): one sentence and "Back to the start". Without it Expo Router showed its
own page, with a link to its sitemap - a list of every screen, which a production build served at
`/_sitemap`. The sitemap is off (`"sitemap": false` for the `expo-router` plugin in `app.json`), and
the guard lets anyone stay on the not-found page, as on the house rules, so that a courier sees
why the link did not take them where it pointed.

### Configuration inlining

Expo inlines `EXPO_PUBLIC_*` variables only where the code reads `process.env.EXPO_PUBLIC_NAME`
literally; at run time `process.env` itself is empty. `src/lib/supabase.ts` had passed it whole
since Phase 2, so every real build threw at launch while every test passed. `supabase.test.ts`
now runs the file through `babel-preset-expo` and asserts both values are inlined and no read of
`process.env` remains. The URL check also accepts plain http for loopback and private-network
addresses, so the app can run against a local Supabase stack - from a phone too.

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
time, to any name the rules allow - "I know where you live" is one (see "Names and letters with
something to see") - and the blocker would otherwise still see it on every letter they ever sent
them and on a bat flying there. `get_roost`, `list_sent` and `read_message` name someone the
caller has blocked by username alone, as `list_blocked` always did. (Found in review.)

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
reported courier is not told who reported them, unless the law requires it.

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
  delivery, the job is scheduled only where pg_cron is available, and `cron.db.test.mjs` runs its
  command as scheduled.
- At the limit the report screen says the report was not recorded, and counts the limit as the
  last 24 hours ("24 hours from now", not "tomorrow"). For a letter whose sender it has just
  blocked, it says how to report that letter later - unblock, open the letter, report again - since
  a report from the blocked list carries no letter, which the blocked list says too. The block
  itself is made at the limit, deliberately: it protects now, and the report can wait.
- The numbers live in `src/constants/config.ts` and the migration, and a parity test fails if they
  drift apart.
- A courier can report someone they have never been friends with (decided on the operator's
  behalf): a stranger can send a request under an offensive name, and the courier's page, opened
  from the request, is where it is reported. Throwaway accounts can therefore fill the queue with
  reports about any courier whose id they hold, each at most 20 a day.

### Deleting two accounts that had blocked or reported each other

Account deletion takes its blocks and clears its id from reports, both ways, and the cascade reaches
each pair's two rows in opposite orders for its two people. Two couriers who had blocked or reported
each other, deleting their accounts at the same moment, deadlocked (8 pairs in 200 in review).
`delete_own_account` now takes those rows first, in one order for everyone - after the letters and
bats, as before - so the second deletion waits for the first. Two real-Postgres tests delete both
accounts at once and fail without it.

The order left out friendships, and the nightly tidy-up took nothing before it deleted; and an
order can only take the rows there are. Both were found in November 2026, and what closes them -
one order for every way an account ends, and a gate for each courier - is under "One order for
every row, and a gate for each courier" in "The whole-project review" below.

### Reporting blocks by default

"Also block" is on when the report screen opens. Someone reporting a letter almost always wants it to
stop, and a report alone changes nothing they can see until the operator acts. It can be turned off,
for a report about someone the reporter still wants to hear from - and reporting the same letter, or
the same courier without a letter, again starts from the choice made last time, while the app runs
and until someone signs out (in memory only, `src/features/safety/safety.ts`). Another letter starts
from on again. Only a choice made with a report that was recorded is kept: from the blocked list
there is no choice to make, and over the daily limit nothing is recorded.

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

_Grown in November 2026:_ Contact is no longer only in the profile and the house rules. It stands
beside the end of an account (`AccountClosedActions`), on the welcome screen after a suspension, on
the reset's code stage, and on the code screen beside the words for a sign-in ended before the
account was finished. The words that send a courier to a person - a suspension, that sign-in -
name whom to write to only in a build with a contact address: one without shows no Contact and no
address anywhere, and the words sent the courier to someone it gave no way to reach. (Found in
review; see "Accounts that are gone, or suspended" and "A code holds the way in" in "The
whole-project review".)

### The house rules live outside the signed-in group

`/rules` has to be readable from the sign-up form, before an account exists, and from the profile.
It is the one route outside `(app)` that the root guard lets a signed-in courier stay on - with the
not-found page, since November 2026 (see "Navigation"). Creating an account agrees to the rules,
and the form says so beside the button - the zero-tolerance terms App Review asks of apps with user
content.

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
- Usernames are first come, and sign-up is open to anyone who has a build, which carries the
  project's address and publishable key. Someone can take the username a relative is expected to
  choose before the relative joins, and the requests meant for them then reach that someone. Who
  is given a build is the only gate.

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
  someone is, so both copies are removed once the profile has been made. Since November 2026 what a
  sign-in may carry is bounded as well (see "Bounds" under "Database" in "The whole-project
  review").
- **Removed accounts.** The operator removes an account with `private.remove_account`, which
  deletes everything it holds and bans its sign-in for exactly `private.ban_period()` - two years
  from the removal, the operator's decision - so that the same email cannot simply sign up again.
  The ban used to be a hundred years, set by hand, and kept for ever. When it runs out, the sign-in
  is deleted. Since November 2026 it says "there is no account …" when the courier deleted the
  account while it waited, and refuses a second run on an account already removed, saying when the
  ban ends, rather than setting it again for two years from then.
- **Accounts deleted for someone.** An account its owner asks to have deleted, a child's, an
  address that was not the person's to use: the operator deletes these with
  `private.delete_account`, which bans nothing and takes the account's rows in the order the
  courier's own deletion takes them. The dashboard's "Delete user" is not used for it: review
  showed it deadlocking against a letter that lands at that moment, and leaving an entry in the
  sign-in log that names the person (17 November 2026; the steps are in
  `docs/store/gdpr-records.md`, 5.4).
- **Sessions.** A session, with the IP address and device it was opened from, lasted until its
  owner signed out - on a phone lost years ago, for ever. Supabase limits that only on its paid
  plans, so the tidy-up ends a session nobody has used for 90 days
  (`private.idle_session_lifetime()`). GoTrue stamps `updated_at` at every renewal, about hourly
  while the app is open, so that is when it was last used; deleting it takes its refresh tokens,
  the app is refused its next renewal, and its owner signs in again.
- **Unconfirmed sign-ups.** Once email confirmation is on, a sign-up whose address is never
  confirmed can never sign in, but `handle_new_user` has already made its profile - with someone's
  email address, perhaps not the sign-up's own. The tidy-up deletes it 7 days
  (`private.unconfirmed_sign_up_lifetime()`) after the last code sent to confirm its address
  (`auth.users.confirmation_sent_at`, which GoTrue writes at sign-up, at each "Send the code again"
  and at a second sign-up for the address), or 7 days after it was made if no code was ever sent.
  A code asked for on the seventh day keeps its day - a code lasts a day - and the deletion asks
  again, so a code sent while the job waits for the account's rows keeps the account too
  (`20261121180000_tidy_up_ages.sql`; the week used to count from the sign-up, and such a code was
  refused the next morning). While confirmation is off, GoTrue confirms every address at sign-up,
  but the step still finds an account the operator makes by hand - in the dashboard, or through the
  auth server's admin API - without confirming its address. Such an account cannot sign in either,
  and it goes after the same week, with its profile and bats. Until then the username it took
  stays taken, which the code screen tells someone who has mistyped their address; and a later
  sign-up for the address under another username replaces such an account once its code is
  confirmed (see "A code holds the way in"). Known gaps: having its profile from the start, such
  an account takes friend requests as anyone's does, and when its week is up a request to it goes
  with it, out of the sender's "Waiting for an answer" with no word of why. And whoever made it can
  keep it, and its username, by asking for a new code every few days - each code goes to the owner
  of the address, who can still take the address back by signing up; signing up again after each
  deletion did as much before.
- **Moves.** The city a courier moved away from stays on their profile only while the move
  settles, then goes. Before a courier's first letter nothing of a move is kept at all: it counts
  at once. Whether a letter has ever gone to or from a courier (`profiles.has_corresponded`, since
  November 2026) is kept as long as the account, even once the letters are gone, because it is what
  makes a move take a day.
- **pg_cron's own log** is kept a week: a run's row goes a week after the run ended. A run cut off
  by a restart never ends - pg_cron marks it failed, "server restarted", and writes no end - and
  goes a week after it began; a run cut off before it began has neither time, and goes once a run
  pg_cron numbered after it began more than a week ago (`20261121180000_tidy_up_ages.sql`; both
  used to stay for ever).

One daily job, `private.tidy_up()`, does all of it at 04:43. Each step that touches a table
Supabase owns stands alone: where the platform withholds the privilege, that step is skipped and
the others still run, so one missing grant cannot stop the rest, and deleting an account cannot
fail for it either. Skipping silently would leave the privacy policy wrong without anyone knowing,
so the job returns what it skipped, with the reason; the hosted setup runs it once by hand and
expects an empty list. (A first version left the steps on `auth.users` unshielded, so one missing
grant there rolled the whole run back - found in review, and tested now with a role that lacks
it.) Any other error is a fault and fails the run. Verified against the local
stack's real GoTrue: the records it writes, the copy in the identity, a banned account refused at
sign-in, at token refresh and at sign-up, its sign-in deleted with its identities once the ban has
run out, and a session left unused for 91 days ended while one in use renews as before.

_Changed in November 2026:_ the job deletes first - sign-ups never confirmed, all together after
taking their rows in the one order everything that ends an account takes them, then expired bans -
and only then tidies the sign-in log, sessions, sign-up names, settled moves, the counts of friend
requests (once their hour began more than a day ago, so at most two days after) and pg_cron's log.
Whatever a step touches, the job holds until it ends; with the deletions done while it holds
nothing else, a courier deleting their own account at that moment waits for it and is never
waited for. Review's stress test, a courier deleting their account while the tidy-up deleted a
sign-up they had asked to be friends and reported, ended with one of the two stopped in 30 rounds
of 150. A step that Postgres still stops because it and a request were each waiting for the other
is undone alone, listed in what the run returns (`<step>: deadlock detected`) and done the next
night; and since what a nightly run returns is seen by nobody, whatever it left out is also written
to the server's log as a warning. Any other error still fails the run. The database's own refusal
of a suspended account (see "Accounts the operator has stopped") was seen against the local stack
in the merged tree. Last, `20261121180000_tidy_up_ages.sql` counts an unconfirmed sign-up's week
from the last code sent to it, and forgets pg_cron's runs that never ended (both above); the
steps, their order, the rows they take first and the errors they pass over are as before.

The iOS build also no longer asks for Face ID: expo-secure-store declares that permission by
default, and the app never uses biometrics, so the store's privacy questions would have had to
explain an access it never makes. And the session kept in the iOS keychain is now kept on that
device only (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`): a backup restored to another phone no longer
brings a signed-in session with it, so a new phone signs in again.

What it cannot do from SQL, and the privacy policy therefore says plainly:

- Letters are kept until one of the two people deletes their account; there is no per-letter
  deletion.
- Supabase's own request logs and backups, which follow the plan's retention, not ours.

## The whole-project review, November 2026

In November 2026 the whole project was reviewed at once - the database, signing in, the screens,
the tests, the setup and the documents - and each finding was verified before it was fixed. The
fixes were made in groups, each reviewed and checked again, and then merged; the seams between them
were checked against the local stack and in the browser. None of it has been run on a phone yet.
What the review changed or added is recorded here; where it made an earlier entry untrue, that
entry says so. What it left open is in the roadmap, and as a known gap under the entry it concerns.

### Sessions

**Who is signed in is a question about the device.** The client's own answer to it waits for the
server: after an hour away it first renews the token, and without a network that was half a minute
of splash screen followed by the welcome screen - for someone signed in. `AuthProvider` now reads
the stored session itself at launch (`readStoredSession`, `src/lib/session-store.ts`) and lets the
splash go at once; the client's events take over from there. The client also says "no session"
when it only could not renew one just now, so that counts only when it announces a sign-out, or
when nothing is stored any more (`isSessionStored`).

**The client's fetch.** supabase-js decides what becomes of the session from what its fetch returns
or throws, and three of its decisions cost a courier their session, or an hour of the app, for no
fault of theirs. `src/lib/guarded-fetch.ts` stands between it and the network:

- A request may take 20 seconds, its whole answer included (`REQUEST_TIMEOUT_MS`). On a phone the
  platform's own wait has no end.
- A renewal answered with anything but a new session, or the auth server's own word that this
  session is over, counts as a request that did not get through, and auth-js keeps the session. It
  used to delete it on almost any failed renewal, a rate limit or a gateway's error page included.
  After such an answer no renewal is sent for as long as its `Retry-After` asks, five minutes at
  most, or else for 30 seconds - counted from the answer, so that a clock put back ends the wait -
  and auth-js's burst of eight attempts costs one request.
- A request to the database is not sent with the publishable key in a token's place while a
  session is stored: it would be refused as a stranger's.
- A request the database refuses because its token has run out (PostgREST's `PGRST301` and
  `PGRST303`) renews the session once and is sent again. auth-js goes by the phone's clock, which a
  slow phone has wrong. If the auth server refuses that renewal too, the session is over, and the
  app signs out on the device (`renewSession` in `src/lib/supabase.ts`).

**Renewing for a press.** auth-js remembers a failed renewal for a minute
(`REFRESH_FAILURE_COOLDOWN_MS` in auth-js 2.112) and answers every request from that memory,
sending nothing. After a start without a network "Try again" sent nothing at all, and the screens
went on saying "No connection" for one to two minutes after the network was back.
`renewOnNextRequest` (`src/lib/renewal.ts`) clears the memory for a load someone pressed for - "Try
again", a pull - and for no other: loads on coming into view and on the app's return started a
renewal at every screen opened, and without a network each one is half a minute of attempts that
every request waits for, Sign out included. A load waiting to be made again is made at once when
the session has been renewed (`TOKEN_REFRESHED`). The memory is not part of auth-js's public face,
so `src/lib/renewal.test.tsx` runs on the real client and fails if a new version names it
differently.

**Signing out takes five seconds at most.** The server is asked first, since only that ends the
session on the courier's other devices as well, but for no longer than `SERVER_SIGN_OUT_WAIT_MS`
(5 seconds, in `src/features/auth/auth-context.tsx`): to be told, it may first need the session
renewed, and without a network Sign out spun for 25 to 40 seconds. Not told by then, the device
lets go regardless. The app removes the session from the keychain itself and remembers that the
server never heard (`signedOutUnheard`), and which session it let go of (`letGo`, read before the
server is asked: the client removes it itself when the server cannot be reached). That session,
announced again after that - a renewal under way as the entry went - is not taken but ended with
the server. It is known by its id, which the auth server writes into every access token it issues
(`session_id`) and keeps through every renewal; when either id cannot be read, the session counts
as that one, as every session did before. Any other session announced meanwhile is taken, and
clears the mark: on the web a sign-in in one tab of the browser is announced in every other, and
ending it signed that tab out, and the server out of every session of the account. (Found in
review.) Signing out can fail only when the keychain will not let go of the entry, and that is said
once the client is done with the server.

A logout request already sent may still reach the server after the device has let go. A session
whose token had run out cannot: the client renews it before it tells the server, and throws away a
renewal that comes back once the session is no longer stored. So when the client is done, the app
tells the server once more - a global logout with the old token, and when the server refuses that,
with a token renewed without keeping or announcing it (auth-js 2.112's private
`_refreshAccessToken`, which the provider's tests run on the real client) - and every way of
signing in waits for it. That reaches the server if the network is back by then.

What the server has still not heard the end of - that last try got no answer, or, for a token
still fresh, neither did the client's own logout, which without a network fails at once - is owed
(`owedToServer`), and told at the next sign-in on the device, and on the web when another tab
signs in: by itself, with scope `local`, the session let go and no other. Told that late, a global
logout would end the sessions begun since as well, on another device or on this one a moment
later; so nobody waits for it, and what still cannot be told stays owed. A session whose token had
run out is owed in the same way, rather than told globally, when someone has signed in meanwhile -
in another tab, on the web. (Found in review: without a network the session let go stayed live on
the server beside the one the courier signed in with a moment later.) What is owed is kept in
memory only, so closing the app forgets it, and on the web so does every reload of the page. The
server's session then lasts until the courier signs in and out again, or the tidy-up ends it after
90 days unused.

Every way a session ends on the device ends with the client announcing `SIGNED_OUT`, once: a
sign-out with or without a network, a renewal the auth server refuses, an account deleted or gone.
Where the app removed the session itself, it has the client sign out on the device alone, which
with nothing stored sends nothing and is announced - but not over someone who has signed in
meanwhile. What the app keeps for an account besides the session - the letters not sent yet and the
"Also block" choices in memory, what a code was for in the keychain - is let go of at that
announcement.

**A session ended elsewhere is told.** A sign-out on another device, the tidy-up of a session unused
for 90 days and a new password set elsewhere each end the session this device holds, and the auth
server refuses its next renewal alike: the session is over (`refresh_token_not_found`, seen on the
local stack for each). The device was signed out, and the welcome screen said nothing of why.
(Found in review.) A renewal refused with the auth server's word that the session is over - any
code but `user_banned`, which is the suspension's - now leaves the welcome screen "You were signed
out. Sign in again to go on." to say once, with no Contact button (`noteSessionEnded` in
`src/lib/farewell.ts`, in memory only; read in `src/lib/guarded-fetch.ts`). Only a renewal of the
session the device holds leaves it (`isStoredRefreshToken` in `src/lib/session-store.ts`): the
renewals the app sends to tell the server of a sign-out it may not have heard (above) say nothing.
A sign-out made on the device takes the word back as its `SIGNED_OUT` is announced - Sign out, a
deletion, Start over, the code screens' sign-outs - and a deletion or a suspension noted first
keeps its own words. A renewal refused while the access token still holds, which auth-js tries in
the token's last minute and a half, leaves the session as it is until the token runs out, and the
word waits for that end. An account deleted on another device is refused in the same way, so its
device says the same words, although signing in cannot work any more: the refusal cannot tell the
two apart.

Every way of signing in first waits until no sign-out is under way (`beforeSigningIn`): a password,
a sign-up, each code from an email, and the sign-up again after an account under another username
was removed. A sign-out goes on after the device has let go of it and ends by removing whatever
session is stored by then: someone who signed in meanwhile was signed out again within seconds, and
when the client had been renewing at the start, the server was told to end every session of
theirs. The wait has an end - no request waits more than 20 seconds, and the client starts no new
attempt at a renewal after half a minute - but with a stale session on a connection that never
answers it is about a minute. After 5 seconds of it, Sign in and Create account say under the
button, and aloud, "Finishing the last sign-out first. Without a connection, that can take a
minute." So do the two buttons that check a code from an email, the code screen's Confirm and the
reset's "Set the new password", which showed their spinner alone. "Almost there" and the reset's
"Your new password" check no code, and say nothing of a sign-out.

**Known gaps, on the web only.** The web build is for development; the apps people are given are
the iOS and Android builds (GO-LIVE, "Recommended distribution"). Two seams stay open there:

- One tab's sign-out still under way can undo another tab's sign-in. auth-js's own `signOut()`,
  still running in one tab - a logout that never answers, up to 20 seconds, or a stale token
  without a network, about half a minute - removes whatever session is stored when its request
  ends, and the browser's storage is one for every tab. A sign-in in another tab within that
  window is signed out again, and its session left on the server, or ended there with the others
  when the logout carried its token (seen in Chromium and in Jest). Within one tab
  `beforeSigningIn` prevents it; across tabs nothing does. A logout with the token read at the
  start, and the app's own removal, in place of auth-js's `signOut()` in `signOutOfDevice` would;
  it was left, as a larger change to a flow the tests hold closely.
- A sign-out the server never heard of is forgotten when the page is loaded again, as it is when
  the app is closed on a phone (above): on the web that is any reload, an address typed or a link
  followed. Keeping the owed session's refresh token in storage would let it be told after one.

### Loading, and loading again

- **`useRetry`** (`src/lib/use-retry.ts`) makes a load again by itself when it got no answer -
  after 2 seconds, then twice as long each time, up to a minute - while the screen is in front and
  the app in the foreground, and never after a refusal from the server (`RpcError.reason`), which
  would only be refused again. A load that is asked for - on coming into view, on the app's return,
  by a pull or a button - starts the pauses again from the shortest. A screen opened without a
  signal used to keep its error until the courier left it; on compose that was a letter written and
  never sent. `useRemote`, `usePaged` (its first page) and `useProfile` load through it.
- **`usePaged`** has `reload()`, the first page again quietly - no spinner, and the list as it is
  until the answer is in - beside `refresh()` for a pull, and says why a load was refused
  (`reason`), as `useRemote` does.
- **`useProfile`** used to load once per mount. It loads on coming into view and on the app's
  return, takes the newest answer only, and says when the account is gone (`isGone`): the profile
  row is made with the account, so no row of one's own means the account has been deleted or
  removed. The roost, Friends and a courier's page read the profile through it, once each time they
  come into view; the roost asking as well had made two requests for the same row. A name saved
  shows at once, before the profile is read back (`updateDisplayName`): a read that got no answer
  had left the old name beside "Saved.", under the read's error, until a later read got through.
  (Found in review.) A read that answers puts the row in its place, as the server has it.
- **`useLingering`** (`src/lib/use-lingering.ts`) says when a wait has gone on: "Still trying to
  reach Night Courier…" under the first load's spinner on the roost and on the profile, after 5
  seconds. Without a network, an hour after the app was last used, every first load waits about
  half a minute while the client tries to renew the session, and the spinners said nothing all that
  time. The profile now shows its Safety and Account sections, Sign out among them, while it is
  still loading, so that the way out does not wait for the network. The sign-in and sign-up forms,
  the code screen and the reset use `useLingering` for a sign-out still under way.
- **`useRefreshAt`** sets no timer for a landing time that is not a number, which fired at once
  after every answer. The Sent list uses it now as well: it calls a letter landed only when the
  server says `delivered`, reads "landing any moment now" until then, and asks again, quietly, when
  the next letter in the air is due. It went by the phone's clock alone, and on a phone running fast
  called a letter landed that was still in the air.

The phone's clock still decides every countdown (decided on the operator's behalf): the server
decides when a letter lands, and the countdowns only show it. On a phone whose clock runs an hour
ahead, each countdown ends an hour early and then reads "any moment now", every screen showing a
letter in the air - the roost, compose, the Sent list, the letter - asks again at least once a
minute until the landing is due by the server's clock, and auth-js, which goes by the same clock,
renews the session before almost every request: each renewal an entry in the 30-day sign-in log.

An error that says "try again" comes with a button for it where a screen has nothing else to show,
beside the hooks' own retries, and the button shows itself busy: once on the roost (the bats, the
counts and the profile together), on compose for the friends and for the bats and the profile
together, and in the letters list while no letter is held. A profile that could not be loaded holds
nothing back: only a profile known to have no city, or one still on its way, keeps "Write a letter"
and "Send by bat" off, because the server refuses a sender without a city itself. One failed request
as compose opened used to disable sending until the screen was left, and the letter with it.

Smaller things: a letter's unread mark goes when the server has answered with the letter, marked
opened (`onLetterOpened` in `src/features/messages/messages.ts`), not when its row is tapped.
`formatTimestamp` drops the time of day only for a moment more than 300 days back ("12 Oct 2025"),
and writes a moment in a year not yet begun with its year and time ("1 Jan 2027 04:18"); it dropped
the time whenever the year differed, from a landing a few hours ahead on New Year's Eve too. The
letter counter counts what will be sent, without the blank space around it. And an empty inbox
says nothing until it is known whether the courier has blocked anyone, since a block hides letters:
"Nothing has landed yet" stood over letters a block had hidden. If that cannot be found out, it
says what is true either way.

### Accounts that are gone, or suspended

An account can end while its app is open - deleted on another phone, removed or suspended by the
operator - and the API still takes its token for up to an hour. The screens offered "Try again"
under every refusal, which could not help.

- **Gone.** The roost and the profile say "This account no longer exists: it has been deleted or
  removed. All that is left to do is to sign out.", with Sign out beside it, and Contact in a build
  with a contact address (`AccountClosedActions` on the roost and on compose; the profile has both
  buttons anyway). The roost's bats are hidden, where it said "0 of 0 at home"; compose shows the
  notice in place of the friends; the profile offers neither Blocked couriers nor Delete my
  account. Every account has its bats from the start, so a roost without one makes compose read the
  profile again, which is how the end is found there. A city saved to an account that is gone says
  so.
- **Suspended.** The database refuses a suspended account everything that reaches anyone else (see
  "Accounts the operator has stopped"), with the hint `account_suspended`. The roost, compose - one
  notice, wherever it shows - the letters list, a letter, Friends, a courier's page and the blocked
  list then say why, with Sign out and Contact in place of "Try again" (`AccountClosedActions`;
  Contact only in a build with a contact address), and writing is off; Friends turns off its
  request field and button as well. A name or a city saved is refused with the same words: "This
  account has been suspended. To ask why, write to the person who runs Night Courier." They name
  whom to write to rather than a button or a page, because they also stand under a save with
  nothing beside them. A build without a contact address shows no Contact and no address anywhere,
  and there they say only "This account has been suspended." (`REFUSALS.account_suspended` in
  `src/lib/rpc-error.ts`, read as the words are shown). A renewal the auth server refuses with
  `user_banned` signs the device out, and the welcome screen then says the suspension once, with
  Contact where the build has one (`src/lib/farewell.ts`, in memory).
- **Signing in to a suspended account** is answered as a wrong password. The auth server refuses a
  banned account before it looks at the password, so whoever typed an address would learn that it
  had an account, and what became of it. Only the code of "I forgot my password", which proves the
  address, is answered with the suspension. (Decided on the operator's behalf.)
- **Friends can still write to a suspended account**, and its letters already in the air land:
  refusing either would tell its friends of the suspension. (Decided on the operator's behalf.) The
  account cannot read them.

### Deleting an account

`delete_own_account` deletes the account, and the device is then signed out without asking the
server: it has no session left to end, and answered with an error, `user_not_found`. The welcome
screen says once "Your account has been deleted." (`noteAccountDeleted` in `src/lib/farewell.ts`),
where it said nothing. That word follows only the deletion asked for in the profile. Removing an
account a code had only just confirmed - Start over, a reset's code that confirmed an account
nobody had, the sign-up again under another username - signs out the same way and leaves the
welcome screen nothing to say (`removeAccount(farewell)` in `auth-context.tsx`). A deletion whose
answer is lost is not taken for a failure: the app asks the auth server whether the account is
still there, and when that cannot be answered either it says "Your account may or may not have been
deleted - no answer came back. Check again once you are online." A suspended or removed account
cannot delete itself (see "Accounts the operator has stopped").

### Codes, not links

The auth server's emails carried a link. It came back through the app's URL scheme,
`nightcourier://`, with a whole session in it - for whichever app on the phone answered to the
scheme - and the app had no screen to finish a reset with (the roadmap's "Incomplete, and not by
design"). Every email the auth server sends to confirm an address, reset a password, sign in,
change an address, invite or reauthenticate now carries an 8-digit code to type into the app, and
no link: the six templates in `supabase/templates`, which `supabase/config.toml` names, with the
subject "Your Night Courier code". The app asks for two of them. The others carry a code too,
because anyone can ask the auth server for a sign-in code for an address with an account, a
signed-in account can ask to change its address, and the operator can invite, and the auth
server's own templates for those carry a link that signs in whoever follows it.
`src/tests/email-codes.test.ts` checks every template: the code, and no link nor any field a link
is made of.

The notices the auth server can send of its own accord - of a changed password or address, among
others (`[auth.email.notification]`) - have no template of the app's, and `config.toml` turns none
of them on; whether a new hosted project sends any is to be checked (GO-LIVE, "Setting up the
hosted project", step 2).

- `otp_length = 8`, as many digits as the code field asks for (`EMAIL_CODE_LENGTH`), and
  `otp_expiry = 86400`, a day, where the auth server's own is an hour: someone who signs up in the
  evening may open the email the next morning. What holds guessing back is the eight digits and the
  hosted project's limit on attempts from one network address; each new code replaces the one
  before, and a code works once.
- Codes are asked for after a sign-up ("Check your email"); after a sign-in the auth server answers
  with "email not confirmed", which it says only once the password is right ("Confirm your
  address"); and on the reset screen, which takes the code and the new password together. A code
  that is wrong, has run out, has been used or has been replaced gets one answer from the auth
  server (`otp_expired`), so one sentence fits them all: "That code did not work. Check it against
  the newest email, or ask for a new one."
- "I forgot my password" on the sign-in form opens the reset with the address typed there, and on
  the code screen with the address the code went to (the route's parameter `email`): it was typed
  twice. The field only starts with it - it can be changed, and is checked like any address typed
  there - and a link that names it twice is ignored, while a reset taken up again keeps its own
  address. On the web the address therefore stands in the page's address and in the browser's
  history (`/reset-password?email=…`), which matters only if a web build is ever published.
- A new code can be asked for a minute after the last, which the screens count themselves
  (`RESEND_WAIT_SECONDS`): the hosted project's own 60 seconds between two emails to an address.
  `config.toml` names no `max_frequency`, so that a push leaves those 60 seconds as they are; the
  local stack's own is one second.
- No code flow (PKCE): `createClient` says `flowType: 'implicit'` rather than leave it to a default
  a later supabase-js may change. With codes only, a verifier kept on the device protects nothing,
  and with one, each emailed code left a row on the auth server that nothing deletes
  (`auth.flow_state`), and verifier entries in the keychain until the next sign-out. Today's
  default is the same, so `src/lib/supabase.client.test.ts` runs the app's client on a supabase-js
  made to default to the code flow, and finds no code challenge sent with a sign-up or a reset, and
  no verifier kept.

**Known gaps.** There is no way to change a password while signed in: a courier who wants a new one
signs out and uses "I forgot my password", which needs an email of its own. And nothing stops
anyone from using up the project's emails for the hour on purpose, by asking again and again for
codes for addresses they know; until the hour is over, new couriers get no code to confirm their
address or set a password with. A CAPTCHA in front of the auth server's endpoints would stop it.

### A code holds the way in

A code signs the courier in before the password they chose is saved: the new one of a reset, the
one typed at sign-up, or the one signed in with (see the next section). Saving it can fail. From
the moment the code goes to be checked until the password is saved (`isSettingPassword`), the root
layout keeps the courier on the screen that asked for the code - the sign-up, sign-in or reset
screen - wherever else they find themselves: the welcome screen, the sign-in form, the house rules,
the not-found page, a screen of the app opened from a link. The app's own layout draws nothing
meanwhile, so the roost is not mounted on the way. The code screens take the swipe back and
Android's back button away while they hold (`HoldBack`), and their buttons that lead elsewhere are
off. Codes being checked are counted, not flagged: a form can send the same code twice before its
spinner shows, and the second check, refused, must not let go of the hold the first still needs.

What a code is for is kept in the keychain beside the session, under `night-courier.unfinished`
(`src/features/auth/unfinished.ts`): the address, username and name typed at sign-up, or the
address of a sign-in or a reset - never a password. It is written before the code goes, because the
client keeps the session the moment the code is answered, and an app closed in between opened in
the roost. It is forgotten once the work is done, when the account is removed, at any sign-out, as
every way of signing in begins (a code's check then writes its own), and at launch when no session
for that address is stored. At launch a stored session for the same address holds the way in
again, and the root layout takes the courier to the screen that asked for the code, which asks for
what is left: a password - the one chosen before, or a new one - on the sign-up and sign-in
screens, and the new password on the reset screen.

On the web the keychain is the browser's storage, one for every tab, and a sign-in in one tab is
announced in every other. A tab already open took the session a sign-up's code had brought in
another as it came, and showed the roost of the account the code had just confirmed - a stranger's
sign-up, perhaps, with nobody's password. (Found in review.) A session the tab did not sign in with
itself - announced while none of its own sign-ins was waiting for the client, and not the one it
holds, renewed or not - now holds the way in while the marker is read, and on, as at a launch, if
the marker is for that session's address (`lookForUnfinished`). So the session the client
announces again whenever a tab comes to the front is not looked at. A tab lets go of the hold when
another removes the marker - finished there, given up or signed out of (`watchUnfinishedElsewhere`,
on the browser's `storage` event) - so that Start over cannot remove an account the other tab has
finished. That every way of signing in forgets a marker left behind is for this too: what a
password brings is never held elsewhere.

If saving fails, the code screen becomes "Almost there". After a sign-up it offers Try again, or
Start over, which removes the account and then signs out - never a plain sign-out, which would leave
the account confirmed with whatever an earlier sign-up had given it. After signing in it offers Try
again, or Sign out, and then a password set with "I forgot my password". The form the courier goes
back to says above its fields what happened, until they try again: that the account has been
removed and they can sign up again, or that they are signed out, and need a password set with "I
forgot my password" to sign in - the sign-in form empties its password field too, since confirming
the address took that password away, and signing in with it again was answered as a wrong one.
Read aloud alone, it reached nobody who reads the screen. (Found in review.) If the session the code
brought has been ended elsewhere - a change of password ends every other session - the courier is
signed out with the reason (`SignedOutUnfinished`). After a sign-up the reason ends by naming whom
to write to, so that the account can be removed and the courier sign up again, with Contact beside
it - in a build with a contact address only, as for a suspension (`signInEndedWords`); after
signing in, it says to set a password with "I forgot my password".

**One more code, when a stranger signed up first.** GoTrue keeps an account that is waiting for its
code exactly as the first sign-up for the address made it: a second sign-up sends a new code and
changes nothing else. That first sign-up may have been anyone's - someone who typed the address,
with a password and a username of their own. So after a sign-up's code, before the way in opens,
`finishSignUp` makes the account the one the courier set up: it sets the password typed at sign-up,
then reads the profile. A username cannot be changed, so an account an earlier sign-up gave another
username is removed - nothing can have been done with it, the code having confirmed it only now -
and the courier is signed up again with what they typed, which sends a new code ("One more code").
A different name is changed to the one typed.

**An account made by asking for a sign-in code.** The auth server's sign-in by code
(`/auth/v1/otp`), which the app never uses, makes an account for an address that has none: with the
username and name the caller sends, or else `courier_` and twelve characters of its id, and
"Courier". With confirmation on, that is a stranger's sign-up like any other, and is treated as
one (decided on the operator's behalf): the account waits for its code, and the email carries a
code and no link, as every email does (seen on the local auth server that has email confirmation
on); the owner's own sign-up sends a new code and takes the account over as above, removing it when
its username is not the one they typed; and the tidy-up deletes it a week after its last code.
With confirmation off it is made confirmed, with a password nobody knows; as after a stranger's
sign-up then, its owner is told the address has an account, and writes to the operator, who
deletes it (privacy policy 3.10).

**A reset's code that confirms an account.** The auth server confirms an address with a reset's
code too, so an account a sign-up left waiting for its code - perhaps someone else's, with their
password, username and name - would become the courier's with all of that and a new password. When
a reset's code is what confirmed the account, the account is removed instead, and the courier is
asked to sign up; until it is gone, the way in is held. The test is the code's own answer: the
address confirmed within a second of the sign-in the code brings (`email_confirmed_at` and
`last_sign_in_at`, which the auth server writes in one request, milliseconds apart), and the same
test is made at launch. At first the confirmation was compared with when the reset was asked for,
and then a reset's code asked for before a sign-up's code confirmed the account, and typed within
its day, removed the courier's own finished account.

**A code whose check got no answer.** A check can reach the auth server and be carried out - the
code used up, the address confirmed and its password taken away - with its answer lost on the way
back. Every later check of that code is then refused, signing in finds no password, and asking for
a new code sends none, the address being confirmed. A check that got no answer from the auth
server, none at all or not one of its own, is thrown as `CodeUnanswered`, and the code screen keeps
the codes that got none since a code was last taken. When one of them is refused on a later check,
the screen says in place of the ordinary words that the try before may have confirmed the address:
to ask for a new code first, and if none comes within a few minutes, to set a password with "I
forgot my password" and sign in with it - with that button beside the words (`MAY_BE_CONFIRMED` in
`confirm-email.tsx`). A new code first, because auth-js cannot say whether a try left the device at
all: a request cut off before it reached the server and an answer lost after the server carried it
out come back as the same failed fetch, status 0. A code that comes means the address is not
confirmed, and it does what the first was for; a reset taken instead would have its own code
confirm the address, and remove the account (above). Another code refused gets the ordinary words
and nothing more: a code mistyped after a try that never left the device had been answered with
the hint, and its reset removed the courier's own account. (Found in review, in the browser.)

After a sign-up, an account confirmed so may be as an earlier sign-up for the address set it up -
a stranger's, perhaps, with the username and name they chose - and a reset keeps both: a username
cannot be changed. The operator's decision is that it stays so, and that the courier is told what
to do. On the sign-up path the hint ends "If the account shows a username or name you did not
choose, you can delete it in your profile and sign up again." (`NAMES_NOT_CHOSEN`), and so does the
reset's "Your new password is saved" for an account another code confirmed in the day before the
reset's sign-in (`confirmedJustBefore` in `unfinished.ts`: more than the second that marks the
reset's own code, and no more than a day, as long as a reset's code lives). After signing in, the
account is the one whose password the courier knew, names and all, and the hint says nothing of
names.

**Known gaps.** The hint also shows when the same wrong code is typed twice and the first try never
left the device, and for an old code typed again after "Send the code again" replaced it: nothing
auth-js says tells those apart from an answer lost, so any code that got no answer counts. The
words keep that from harm as far as words can - the new code they send the courier for comes - but
a reset taken at once has its own code confirm the address, and removes the courier's own
unconfirmed account. And on the web the reset's "Your new password is saved" is never drawn: the
roost replaces it before the browser draws a frame, so its words, the sentence about names among
them, reach a screen reader only, through the live region. Couriers read that sentence in the hint
before the reset. Keeping the stage on screen, with a button to go on, would change what the reset
does today, and saying the sentence on the roost is the other way: the operator's to decide. On a
phone the change of screen may show the stage for a moment - not seen.

### Confirming an address takes its password away

A stranger's sign-up first left one gap more: the password it chose worked from the moment the
owner of the address typed the code until the app had set the owner's own, one request later, and
an access token taken in that moment stayed good for up to an hour after.
`20261121160000_confirmation_clears_password.sql` closes it in the database: a trigger on
`auth.users` (`private.clear_password_on_confirmation`, before an update of `email_confirmed_at`)
empties the password in the very statement that confirms an address a code was emailed to - every
sign-up's, while confirmation is on. From the code on, no password signs in to the account until
the app sets one with the session the code brought: `finishSignUp` the one typed at sign-up,
`finishSignIn` the one typed at sign-in, `setNewPassword` the new one of a reset. With confirmation
off nothing changes: the auth server inserts each new account unconfirmed and confirms it within
the same request, nothing is emailed, and the password just chosen stays. An operator who confirms
an account by hand clears its password too, if a code had been emailed to it; its owner then sets
one with "I forgot my password". (Decided on the operator's behalf.) Whether a code was emailed is
what the row held before the statement (`old.confirmation_sent_at`): a confirmation that clears the
time the code was sent as it goes takes the password all the same (`confirmation.db.test.mjs`).
A password the admin API sets stays: in the same call that confirms (`"email_confirm": true` with a
`"password"`), or in a call before it. GoTrue's update of the password clears the time the code was
sent, and the confirmation that follows finds none - seen for both on the local auth server that
has email confirmation on. That is a password someone else chose, and GO-LIVE does not use it. On a
server without the migration, setting the password the account has already is answered as the same
password, and taken as done.

### Who can tell whether an address has an account

No screen says whether an address has an account, as far as the app can keep it so:

- Sign-up answers an address that has one as it answers a new address, and the code screen says
  what is true of both: "If … is new here, a code is on its way to it … If you already have an
  account, sign in instead." A code sent to it a moment ago counts as on its way too.
- The reset takes for sent the three answers that come only for an address with an account: a code
  sent less than a minute ago, an email that could not be sent, and the project's emails for the
  hour used up.
- The screens wait their own minute before a new code can be asked for, because the auth server's
  refusal of a second email within its minute comes only for an address that has an account.
- Signing in to a suspended or removed account is answered as a wrong password (above).

What still tells:

- A taken username. Sign-up answers it with an error - the auth server's "Database error saving
  new user", which the form shows at the username as "That username may already be taken. Try
  another." - and only for an address without an account, so anyone who knows a username can try it
  with an address. A function that says whether a username is free would make the form's guess an
  answer, and needs a database change.
- While confirmation is off, by design: a new address is signed in at once, and one with an account
  is told so.
- While the project has used up its emails for the hour: sign-up and "Send the code again" then
  answer "Too many emails have been sent for now. Try again in an hour." for an address without a
  confirmed account, and show the code screen for a confirmed one, which the auth server answers
  before it sends anything. Hiding that would leave a new courier waiting for a code that never
  comes; an hourly allowance well above the sign-ups expected keeps it rare.
- The auth server's API, whatever the app does (seen in review): inside its minute it refuses a
  second email for a known address and answers an unknown one as sent; a known address takes
  measurably longer to answer; a sign-up for a confirmed address is answered "User already
  registered" for as long as confirmation by phone is off, as `supabase/config.toml` leaves it,
  phone sign-up being off altogether; a taken username is an error; and a banned account is refused
  at sign-in whatever the password. Turning `enable_confirmations` on under `[auth.sms]` as well as
  under `[auth.email]` should make it answer that sign-up as for a new address, but no server here
  has had both on, so that is still to be checked (GO-LIVE, "Before a second person can sign up:
  custom SMTP", step 4).

### The forms check what the server checks

A mistake the auth server or the database would refuse is caught on the form, at its field, and in
the words the server's refusal gets (`src/features/auth/validation.ts`):

- Passwords are counted in bytes, as the auth server counts them: between eight and 72, the most
  bcrypt reads, a letter such as ä counting two and an emoji four. Counted in characters, the form
  had refused four umlauts, which the server takes. Nothing more is asked of a password - no kinds
  of characters (`minimum_password_length = 8` and no `password_requirements` in
  `supabase/config.toml`): length counts for most, so "12345678" is taken, and only the auth
  server's limit per network address slows guessing. The hosted project's check against leaked
  passwords is an option of the paid plans. (Decided on the operator's behalf.)
- An empty field is asked for in its form's own words: "Enter your password." at sign-in, and on
  Friends, whose field is "Their username", "Enter their username." The sign-up form, a reset's new
  password and the code screen keep "Choose a password." and "Choose a username."
  (`validatePassword` and `validateUsername` take the words for an empty field). Sign-in and
  Friends had the sign-up words too. (Found in review.)
- An address in a shape the auth server refuses - a letter such as ä anywhere, a quote or a
  bracket - is refused with "That email address was not accepted. Check it for mistakes - letters
  such as ä or é, and signs such as quotes or brackets, cannot be used." The `xn--` spelling of
  such a domain is taken.
- A display name is held to the database's rules (see "Names and letters with something to see")
  and to its 40 characters, counted as the database counts them: the auth server reports a name the
  database refuses at sign-up as the same error as a taken username.
- A username may be typed with its @, as the app writes it.
- The auth server's answers are read by their code or by their words, since it gives both. One the
  app has no words for is shown as "That did not work. Try again. (…)", with the server's words in
  the brackets, and the error is kept as the cause.

### Database

#### Accounts the operator has stopped

The operator stops an account by banning its sign-in (GO-LIVE, "Handling a report"). After a
threat the ban is set at once, for `private.ban_period()`, two years, and a week later the account
is removed, which sets the two years afresh - or the ban is lifted, if the threat proved unfounded.
After a serious or repeated breach `private.remove_account` removes the account and bans its
sign-in for the two years in one step. Supabase Auth honours a ban at sign-in and at renewal, but
an access token already held stays good at the API for up to an hour, and the database never
looked. In that hour a suspended account could go on writing to people, and delete itself - the
letters a reporter was promised a week to copy, the sign-in records kept for the police, and the
banned sign-in itself, so that the same address could sign up again at once.

Now the database looks (`20261114120000_suspended_accounts.sql`). `private.caller()`, which every
function a client can reach starts from, refuses a suspended account with the hint
`account_suspended` (`private.is_suspended`: a ban that has not run out), and so does a trigger on
the profile for an update the account makes itself, while the operator's own changes pass. Until its
token runs out such an account can read only what is its own or public: its profile row, the bare
rows of its friendships, the cities. `delete_own_account` refuses a suspended or removed account,
and the ban is a condition of the DELETE itself, so that a suspension that commits while the
deletion waits for its rows still counts. `private.remove_account` says so when the courier deleted
the account while it waited, refuses a second run and says when the ban ends, and takes the sign-in
last, after the account's other rows. `private.delete_account` deletes an account for someone, with
no ban, in the same order (see "Keeping less, for less long").

#### One order for every row, and a gate for each courier

Whatever ends an account - its owner's deletion, the operator's removal or deletion, the nightly
tidy-up - first takes every row the deletion will reach, in one order for everyone: letters, bats,
friendships, blocks, reports, each table whole before the next
(`private.lock_rows_of_couriers`, `20261114120004_one_lock_order.sql`). Friendships were missing
from it, and the tidy-up had gone into the cascade without taking anything first. With the order
comes a rule: a request that has written a row naming a courier must not afterwards wait for a row
of that courier's, which is why blocking ends a friendship before it writes the block, and a report
that blocks does so before it is written - and why a courier's count of friend requests, which a
request writes after the friendship, is not among the rows taken. That serves the rows an ending
has taken already, and no others (see below). Reading a letter takes, oldest first, the letters it
lands together with the one it marks opened, where it used to take the newer ones first
(`20261114120007_reading_in_order.sql`).

An order can only take the rows there are. A friend request written after the end of an account had
taken its rows, and then a block, deadlocked every way an account can end, and no order of the
block's two steps served that case and the other. So each courier has a gate, an advisory lock
(`20261114120008_courier_gate.sql`). Whatever writes a row that names couriers - a friend request,
a letter, a block, a report - passes their gates, shared, before it touches a row, and holds them to
its end. Whatever ends an account closes the gate first, which waits for the writes already through
it and holds back every later one until the account is gone. A write that waited asks again whether
the courier is there, and is answered as if it had come a moment later - `unknown_username`,
`courier_not_found`, `message_not_found`, `not_friends` - where it used to fail on a foreign key.
Gates are taken in the order of their keys. Accepting, withdrawing and declining a request, ending a
friendship and lifting a block write no new row, and pass no gate. `concurrency.pg.test.mjs` holds
these against each other on a real Postgres.

#### Friend requests

Review flooded one courier with 1,005 requests from throwaway accounts, and three things gave way.
The friends list came back newest first, and the API hands over at most 1,000 rows of an answer, so
the courier's real friends were cut off its end and the app said "No friends yet". Nothing limited
asking: one account could put a request, with a name of its choosing, in front of every courier
whose username it could find, and ask again the moment it was declined. And Withdraw, on a request
the other person had accepted a moment before, ended the friendship instead, telling neither of
them.

`list_friends` now lists accepted friendships first, then requests, each newest first: what the row
limit cuts off is requests (`20261114120001_friend_requests.sql`). One account can make twenty new
requests an hour (`FRIEND_REQUESTS_PER_HOUR`, with a parity test), counted one call at a time under
an advisory lock, in one row per courier in `private.friend_request_counts` - when the hour being
counted began, and how many - which goes with the account, and which the daily tidy-up deletes
once its hour began more than a day ago, so at most two days after it began. The limit is decided
before the username is looked up, so its refusal is the same for a name that exists and one that
does not. A request counts whatever becomes of it, or asking, being declined and asking again would
never run out; accepting is not asking. The app says "That is a lot of requests in a short time.
Try again in an hour." Withdrawing is `withdraw_request`, which refuses once the request is no
longer waiting, and the app then says whether they accepted in the meantime. Declining is still
`remove_friend`, but a request withdrawn before the decline is said as one no longer waiting rather
than as a friendship that ended (`declineRequest`), on Friends and on a courier's page.

#### Bounds

- **What a sign-in carries.** A sign-up sends a username and a display name, and Supabase Auth keeps
  whatever else comes with them - any JSON up to a megabyte a request, twice, on the sign-in and in
  its email identity - and a signed-in account can add to its own; it travels in every access token
  as well. A trigger on `auth.users` now refuses a sign-up, or a change, that would make a sign-in
  carry more than 4,096 bytes (`private.sign_up_details_max_bytes()`, `SIGN_UP_DETAILS_MAX_BYTES`,
  with a parity test). Only growing is refused: an account that carries more already, from before
  the bound, may stay as it is or become smaller, or one such account would stop every night's
  tidy-up. The trigger is `SECURITY DEFINER` because Supabase Auth's role writes the row, and that
  role cannot reach the `private` schema. Two known gaps: the tidy-up takes the username and the
  display name out of these details and nothing else, so whatever more a sign-up sent past the
  app, up to the 4,096 bytes, stays in them, and in every access token, for as long as the account
  exists. And the auth server writes the address into them at sign-up (`email`), where it stays
  when the operator changes an account's address: only the sign-in's own address changes, and the
  old one goes on travelling in every access token (seen in review).
- **A city search** reads the first 64 characters of its query. The query was tidied again for
  every one of the cities, over its whole length, so a search cost more the longer the query: on
  the real stack 100,000 characters ran until the API's eight-second timeout cancelled them, from
  any signed-in account. No name or alias is longer than 40 characters. PGlite, which is Postgres
  18, plans the function differently and answered in milliseconds, so the guard is tested in
  `concurrency.pg.test.mjs`, on a real Postgres.

#### Names and letters with something to see

All the database asked of a display name was its length, one to forty characters. Review stored a
name that is a single zero-width space, one of forty line breaks, one of control characters, and
one that reads as something other than it is stored, with a right-to-left override - several of
them through the app's own form (`20261114120005_visible_names.sql`). A display name is now plain
text - no control characters or line breaks, nothing that embeds, overrides or isolates the
direction of text, while the joiners and direction marks that scripts and emoji need are allowed -
with at least one character that shows. What shows nothing is Unicode's white space, its control
characters and what it calls default-ignorable, with the blank braille pattern, the annotation
marks and the hieroglyph format controls; other format characters, such as a number sign, show.
Both rules are check constraints that name their characters by code point, because what white
space is depends on the server: the three Postgres versions this project runs on, 16, 17 and 18,
disagreed about nine characters. The checks call no function, because a check runs with the rights
of whoever writes the row, and the API's role cannot reach the `private` schema. The app holds the
same two lists (`src/constants/config.ts`), the parity test compares them with the database's for
every character there is, and `config.test.ts` checks them against Unicode's own classes. Names
that broke the rules were put right before the checks were added; one with nothing left to see
became "Courier".

A letter likewise needs a character that shows (`send_message`): a letter of one zero-width space
used to cost a bat and arrive blank. The table's own check is left as it was, so that no letter
already sent is judged again.

**Known gap:** no name and no username is kept back. Anyone can call themselves "Night Courier
Team", or take the username `admin` or `support`, and look to their friends like the operator.
Until there is a list of reserved names, reports are the remedy: the operator removes such an
account.

#### Known gaps

- `sent_letter` cannot see a send that has not reached the database yet. A first send still on its
  way both times the app asks after it - in a gateway, waiting for a connection - can arrive later
  and go, and changed words sent under a new reference in between would then be a second letter.
  The window is normally milliseconds.
- Usernames can be guessed for as long as the guesses miss, and many accounts can each make their
  requests; the oldest requests beyond a thousand rows are not shown until newer ones are answered.
- An account deleted on another phone keeps its token on this one for up to an hour. The database
  answers it as an account with nothing in it, and a friend request, a block or a report from it
  fails with a database error rather than as a session that has ended.
- The dashboard's "Delete user" passes no gate, as it already passes the lock order by; the runbook
  uses `private.delete_account`.
- A signed-in client can ask PostgREST for a table's planned count (`Prefer: count=planned`), which
  it answers with the planner's estimate for the whole table, and can read `xmin` on the rows it
  may read. Both tell a little about how busy the service is - roughly how many friendships there
  are - and nothing about anyone in particular.

### Compose

**A letter not sent yet.** The words of a letter lived in the compose screen alone, so every way
out of it threw them away without a question - the header's arrow, a swipe, Android's back button,
going back to read once more the letter being answered. They are kept outside it now
(`src/features/messages/drafts.ts`): one unsent letter for each friend, for each signed-in account,
in memory only, and all of it forgotten when the client announces a sign-out. Screens read them
with `useSyncExternalStore`, so a screen shows what will still be there when it is opened again,
and compose's list of friends says to whom a letter was started. Nothing of them is written to the
device, because the privacy policy says that a letter you have started is gone when you close the
app or sign out, and that the app stores nothing on the device but the session and, while a code
from an email is in use, the note of what it is for (see "A code holds the way in").

**The sending of it.** A send outlives its screen too (`src/features/messages/sending.ts`). It runs
to its end whether or not the screen that started it is still there, notes what became of the
letter beside its words, tells every screen showing that letter, and tells the roost
(`roostChanged`, which `onRoostChanged` in `src/features/roost/roost.ts` passes on), so that the
roost and compose count the bats again: they had asked a moment too early. A screen opened onto a
letter still on its way out shows it so, rather than offering to send it again, and a second tap,
or another screen, cannot send it twice.

**Asking after a letter.** A send that ends without an answer is not taken for a failure. It ends
when the client gives up after 20 seconds, and the app asks `sent_letter(client_ref)` straight
after (see "A send can be repeated safely"). If the letter went, the confirmation is for that
letter, "has arrived" once its landing time has passed. If the server has no such letter, the
screen says "Your letter did not go. It is still here to send." If it cannot be asked, the letter is
in doubt - "No answer came back, so your letter may or may not have gone." - and is asked after
again while it is on screen, after 2 seconds growing to a minute, and at once when it is opened
again; compose's list of friends names it "A letter that may or may not have gone". The same words
go out again under the same reference, so they cannot become a second letter. Changed words wait
until what became of the first is known: no new reference is made while that is unknown, and Send
then says "What you changed has not been sent: …" and sends nothing. If the first had gone after
all, the changed words stay as an unsent letter of their own, with "Back to what you wrote". The
button can spin for up to about 40 seconds for a first send - the send, then the question - and
about a minute for changed words after a send without an answer. A letter read just as it lands is
stamped opened no earlier than it landed: a request that began before the landing used to fail on
it.

**Characters no letter can carry.** A NUL, which Postgres cannot store, and half of an emoji on its
own - cut in two by whatever the text was copied from - are refused before `send_message` reads the
letter: by Postgres as `22P05`, by PostgREST as `PGRST102` (tried on the local stack). The app took
either for a lost answer and asked after the letter, and every try ended in "Your letter did not
go. It is still here to send." with no reason, however often it was sent. (Found in review.)
`validateBody` now keeps such a letter back, reading it by code points so that a whole emoji
passes, and says "Your letter has a character in it that cannot be sent: half of an emoji, or a
hidden one that came with pasted text. Delete it, or type that part again yourself." The server's
two refusals get the same words, as a refusal, and the letter is not asked after
(`REFUSALS.unsendable_character` in `src/lib/rpc-error.ts`, a reason the database never gives).
Only letters were changed: a report's note or a city search with a NUL in it is still answered
"Check your connection".

**Writing back to a former friend.** Write back passes the correspondent's name with the route.
When they are no longer a friend, compose says "… is no longer among your friends, so you cannot
write to them." rather than only that letters go to friends; Write back stays on such a letter, and
compose names them (decided on the operator's behalf). Choosing a friend on compose puts their name
in the route too, so that a name left from before cannot stand for someone else. So do Write on the
friends list and "Write a letter" on a courier's page: a friendship that ended before compose had
asked who is a friend got the general words, not the friend's name. (Found in the browser.) The
name is the route's, though, and a link from anywhere can put any text there - a line break,
characters that turn the sentence round, a paragraph. Compose shows it only if the display-name
rule takes it (`validateDisplayName`, which takes every name the app itself puts there, a username
with its @ too), without the blank space around it; otherwise, and for a name given twice, it says
only that letters go to friends, as for a route without a name. (Found in review.)

**Known gap:** compose's list of friends and the letters lists name a friend by display name alone,
with the username only where there is no name, or on compose no city. Two friends of the same name
in the same city look alike in "Who is it for?" and in the letters, and a friend can take another
friend's name and pass for them there.

### Cities

#### How a town is typed

Review typed the names in the list the ways people write them, and several found nothing although
the town was there: "St Gallen", "St. Ingbert", "Saint Paul" - GeoNames writes some "Sankt …" and
some "Saint …", with some aliases and never all - and the list's own "Halle (Saale)" and
"Biel/Bienne", whose names the generator had passed over for their bracket or their slash. The
folding has three more rules, in the client (`fold()` in `src/features/cities/search.ts`), in the
generator, and in SQL (`private.search_form`, `20261121120000_city_search_spellings.sql`) for the
rows already in the table:

- st, st., sankt and saint at the start of a word are one form, "sankt" - a whole word only: "st" at
  the end of what is typed may still become Stuttgart, and "saint" Saintes;
- brackets, slashes and commas part words as spaces do, and a run of spaces is one;
- a typographic apostrophe is a plain one, as a phone's keyboard may type it.

Each term keeps the form it was written in, ahead of its "sankt" form: someone half-way through
typing "Saint" has typed "Sain", and only the written form still begins with that. So nothing that
found a city before stops finding it: `cities.db.test.mjs` types every term of every row, in full
and every shorter start of it down to two letters - 275,400 things to type - and each still finds
its row. It also holds the generator to the migration: given the table's own names, the generator
writes every row's index as the migration left it. Names with those characters are indexed by
their own name now; aliases with them arrive only with the generator's next run on a GeoNames dump.

`search_cities` ranks a city whose own name begins with the query by the first term of its index,
the name as written; once a whole saint has been typed, the name's "sankt" form counts too. "Sai"
ranks Saint Paul by its own name, "St. Pe" both Petersburgs, and "San" no longer ranks Saint
Petersburg as if its name began so. It runs with its owner's rights to call `private.search_form`
(see "`force row level security`").

#### Towns of the same name

Twenty-eight pairs of cities share their name and their country - Friedberg in Hessen and in
Bavaria, Hamm, Langen, Mülheim and Senden in Germany, Sankt Peter in Austria, and twenty-two more
elsewhere - and the picker listed each pair as the same row twice, while the friends list and the
letters said "Friedberg, DE" for either. GeoNames has the state a town is in, but not in the file
this list is built from, so what tells a town apart is worked out from the table itself:
`cities.qualifier`, set by `private.qualify_cities()` over the whole table
(`20261121120002_city_qualifiers.sql`).

- A town is named by a larger city of its country with a name of its own: the largest within 30 km,
  otherwise the nearest larger one.
- That city is "near" when it is within 50 km; farther, the distance is given instead - "near
  Augsburg", "131 km from San Pedro Sula".
- Should the two towns of a pair read alike, each gives its distance; a town with no larger city in
  its country is named by the nearest city of any size. Neither happens today, and both are tested
  on towns made up for them.

Every migration the generator writes ends by calling `private.qualify_cities()`: such a migration
holds the cities of one dump, and a town that has dropped out of the dump stays in the table, where
among the dump's cities alone its twin would look like the only town of its name. The qualifier
comes wherever a city is read with its country - `search_cities`, the profile's two cities,
`list_friends` (a friend's city, only once they are friends), `list_inbox`, `list_sent` and
`read_message` - and the app writes it after the name: "Friedberg (near Augsburg), DE" wherever
a city is shown with its country, and "Friedberg (near Augsburg)" where it stands without one, on
the letters list, a letter's flight path and the confirmation of a send (`describeCity`,
`cityName`). A town with a name of its own is written as before. In the
friends list and in compose's list of friends the town has a line of its own and the way there the
next. In the letters list a letter's line takes the lines it needs: on one, a long name - "Sankt
Peter (near Klagenfurt am Wörthersee)" - cut off the distance and the time, or the countdown, at
360 and 390 px. On a letter's flight path each town's name wraps under its end of the path, which
keeps its height. And a distance keeps its number and its "km" together on a line that wraps
(`formatDistance`, with a space that does not break). (Found in the browser.)

#### Rows nothing could find

Sixteen rows had an empty search index - the generator had passed over every name with a bracket,
a slash, a comma or a typographic apostrophe, and these had no other name - yet a profile or a
letter could name one. Fourteen are found by their names now: nine districts of Zürich ("Zürich
(Kreis 11)"), three of Winterthur, Mianzhu and Ra's Bayrūt. Two quarters of Köln, Neustadt/Süd
and Neustadt/Nord, a kilometre or two from Köln's own row, are taken out
(`20261121120001_dead_city_rows.sql`): found by their names, they would sit among the Neustadts
of the list under no name that says Köln. A courier who lived in one lives in Köln, at once and
with no move to settle, and a letter that flew from or to one flew from or to Köln. The generator
leaves the two out of every migration it writes (`LEFT_OUT`), and writes no city with nothing to
search by. The table holds 4,308 cities.

**Known gap:** nothing guards a city deleted by hand. The database refuses it while any letter ever
flew from or to it; otherwise its couriers lose their city, and a move away from it that was still
settling counts at once. The one migration that deletes cities moves their couriers and letters
to Köln first; a delete in the dashboard would do nothing of the kind.

#### Moves before the first letter

A first city counts at once and every later change took a day (see "A new city takes a day"), so a
first city chosen by mistake - the other Friedberg, a slip on the list - and put right a minute
later stood for a whole day, for every flight to and from the courier. The day's wait is there so
that nobody can move to shorten a flight, and until a letter has gone to or from a courier there is
no flight to shorten: a move then counts at once
(`20261121120003_moves_before_the_first_letter.sql`). From the first letter on - sent, in the air
or landed - the day holds as before.

Whether a courier has had a letter is kept on the profile, `profiles.has_corresponded`, rather than
looked up among the letters: letters go when either account goes, and that a courier has had one
does not. `send_message` sets it for both couriers, and nothing unsets it. Setting it is a change
of the profile row, so `profiles.updated_at` moves with it - for a friend's first letter to the
courier as well: it is the time of the row's last change, not only of the courier's own (decided on
the operator's behalf). `private.settle_city` reads it from the row it updates, and that row is
where a move and a first letter meet: for a first letter, `send_message` takes both profiles, in the
order of their ids, before it reads where either courier is. A move that meets a first letter
therefore waits for it and then takes a day, or makes it wait, and the letter flies from the new
city - never the letter timed from the old city while the move counts at once. Two first letters
between the same couriers, or to one, wait for each other for milliseconds, once in a courier's
life. `concurrency.pg.test.mjs` holds each pair open against the other.

The city picker asks before it saves, in the words that fit: a first city, and any move before the
first letter, count at once; a move takes a day, naming the city letters still leave from and land
at; a move back counts at once. It words its question from where the bats leave, as `settle_city`
reads it, and saves the answer in the same UPDATE only while that still holds - no letter yet
(`has_corresponded = false`), or the bats still leaving from the city it named (`CityCondition` in
`src/features/profile/use-profile.ts`). Otherwise it saves nothing and asks again, from the profile
as it is now. Whether a settling move's day is over is told by the device's clock, as everywhere the
app speaks of a move (decided on the operator's behalf). The filters the app sends are kept in
`src/features/profile/departing-filter.fixture.json`, and `relocation.db.test.mjs` applies them as
PostgREST would, beside what `settle_city` decides, for twelve states of a profile. A save that
changed no row is told only by a profile read after it: when that read got no answer, or a newer
one took its place, the picker says "That city could not be saved." rather than ask again from what
it read before the save.

What this leaves as it was: a courier who has had letters and clears their city through the API,
and lets the day pass, has no city in effect, and the next one counts at once.

### Tests

What the tests were missing, and what they do now, is under the entries it concerns: the compiled
run and the list of what the React Compiler leaves out ("Routing"), presses that reach the control
and one time limit ("Testing"), focused tests ("Linting"), sign-ups made as Supabase Auth's role
("The database is tested"), the privilege audit ("Least privilege"), and the scheduled jobs
("Delivery: a worker, and every read"). Besides those:

- `concurrency.pg.test.mjs` holds, beside the bat reservation and the worker, repeated sends and
  the question after them, a landing inside a request, every way an account ends against letters,
  sends, reads, blocks, requests and each other, the tidy-up, friend requests and their limit,
  reports, first letters against moves, the city search, and sign-ups as the platform's roles make
  them, making transactions collide on purpose. Where `CI` is set, a missing `DATABASE_URL` fails
  the run: a skipped suite counts as no test at all, and a workflow that lost its database would
  otherwise stay green with not one race run.
- A test that asked whether a courier can read another's letter passed without testing it: the
  letter was never landed, and before it lands nobody but its sender can see it anyway. It lands
  now.
- `src/constants/config.test.ts` reads every Markdown document, at the root and under `docs/`, for
  the ages it gives, and holds each to `MINIMUM_AGE` and `PARENTAL_PERMISSION_UNDER`.
- The profile's credit to GeoNames is asserted beside the city it shows, as the city picker's is:
  it had gone untested.

**Known gaps.** Three shields can be narrowed and every test still passes: the tidy-up's around
idle sessions and around the names in identities, made to pass over `deadlock_detected` alone
(`20261121180000_tidy_up_ages.sql`), and `delete_own_account`'s around the sign-in log, made to
let `insufficient_privilege` through (`20261114120000_suspended_accounts.sql`). On a project that
withholds those tables, the nightly tidy-up, or every courier's deletion of their own account,
would then fail, and CI would not see it. And PGlite itself, not the product, starts failing with
"stack depth limit exceeded" (`54001`) after about 3,000 statements with many errors raised in one
database, where Postgres 16 runs the same steps cleanly: a long new test file wants a database of
its own.

## Deferred to later phases

Recorded here so the reasoning is not lost between phases.

- ~~**Environment configuration and secrets** (Phase 2).~~ Built: `.env.example` names the four
  values a build takes, all public by design, and the service-role key is kept out of the bundle
  by refusing to start with one - see "Refusing to start on a service-role key" above. A
  production bundle is not even built without the Supabase URL and key (`metro.config.js`).
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
