# Roadmap

Each phase ends with `npm run verify` green and a commit. Nothing is built ahead of its phase.

Three go-live tasks do **not** wait for Phase 15 — Apple enrolment, the Play Console account and
the Supabase project all have lead times or one-way doors, and two of them block earlier phases.
See [`GO-LIVE.md`](GO-LIVE.md).

| #   | Phase                           | Status   |
| --- | ------------------------------- | -------- |
| 1   | Project foundation              | **Done** |
| 2   | Supabase configuration and auth | **Done** |
| 3   | Profiles and city selection     | **Done** |
| 4   | Bat model and inventory         | **Done** |
| 5   | Friend system                   | **Done** |
| 6   | Message creation                | **Done** |
| 7   | Atomic bat reservation          | **Done** |
| 8   | Delivery calculation            | **Done** |
| 9   | Scheduled delivery worker       | **Done** |
| 10  | Push notifications              | Dropped  |
| 11  | Inbox and message detail        | **Done** |
| 12  | Bat flight animation            | **Done** |
| 13  | Security and RLS audit          | Started  |
| 13a | Safety and moderation           | **Done** |
| 14  | Testing                         | Planned  |
| 15  | iOS/Android production builds   | Planned  |
| 16  | TestFlight / Play internal test | Planned  |
| 17  | Production release              | Planned  |

Phase 10 is dropped by the operator's decision of 2 November 2026: Night Courier has no push
notifications. Nothing about delivery depends on them - the database lands every letter on
schedule - so a letter is simply seen the next time its recipient opens the app, where the roost,
the badges and the letters list show what has arrived. It also removes the one thing Expo Go could
not run, so the app can be tried on a phone without a development build.

## Phase 1 — Project foundation (done)

Delivered:

- Expo SDK 57 + React Native 0.86 + TypeScript 6, strict, with `@/` path aliases wired through
  TypeScript, Jest and Metro
- Expo Router with typed routes; a root layout carrying the dark navigation theme
- A design system: the palette, spacing scale, radii and type scale in
  `src/constants/theme.ts`, and five primitives — `Screen`, `Text`, `Button`, `Card`,
  `BatMark` — that every later screen is built from
- The product invariants (`src/constants/config.ts`), covered by tests
- Original generated artwork: app icon, Android adaptive icon (background/foreground/
  monochrome), splash mark, favicon — Bézier vector source, rasterised at build time
- Toolchain: ESLint (flat config), Prettier, Jest via `jest-expo`, React Native Testing
  Library, and a single `npm run verify` gate that CI runs unchanged
- A welcome screen, built on the design system, stating the three promises the app makes

Verified: `tsc --noEmit` clean, `eslint .` clean at zero warnings, Prettier clean, 31 tests
passing across 4 suites, and `expo export` bundles without error.

Not built, by design: no backend, no auth, no database, no messaging, no navigation beyond the
single welcome route.

## Phase 2 — Supabase configuration and authentication (done)

Delivered:

- `supabase/migrations` — the `profiles` table with its constraints, a trigger that creates a
  profile from signup metadata, `updated_at` maintenance, RLS policies, and
  `delete_own_account()`
- A database test harness that replays the real migrations against Postgres compiled to
  WebAssembly, so the schema and its policies are tested as written. 19 cases.
- `src/lib/env.ts` — configuration validation that refuses to start if the service-role key is
  ever pasted where the anon key belongs
- `src/lib/secure-storage.ts` — session storage in the device keychain, chunked because
  SecureStore is unreliable above ~2 KB and a Supabase session is bigger than that
- `src/features/auth` — session context covering sign-in, sign-up, sign-out, password reset and
  account deletion, with Supabase's developer-facing errors translated
- Screens: welcome, sign in, sign up, reset password, and a placeholder home behind a route
  guard, plus a `TextField` primitive

Verified: 70 app tests, 19 database tests, typecheck, lint, format, and an iOS bundle of 1615
modules exporting cleanly.

Not built, by design: no city selection UI (Phase 3), no bats (Phase 4), no friends (Phase 5).
Profiles are readable only by their owner — friend search adds the one narrow exception in
Phase 5.

**Incomplete, and not by design:** password reset sends the email but the app cannot yet _finish_
the reset. Tapping the link opens Supabase's redirect, and there is no deep-link handler to catch
it and present a "choose a new password" screen. This is deliberately parked rather than hidden:
the built-in email service cannot reach anyone outside the project team anyway, so the flow is
untestable end to end until custom SMTP exists. Both get finished together, before anyone else
has an account. Tracked here so it is not discovered by a locked-out user.

**Finished in November 2026, without a deep link:** every email the auth server sends carries an
8-digit code to type into the app, and the reset screen takes the code and the new password
together; confirming a new account's address works the same way (see "Codes, not links" in
[`ARCHITECTURE.md`](ARCHITECTURE.md)). What is left is custom SMTP, before anyone else has an
account (GO-LIVE).

## Phase 3 - Profiles and city selection (done)

Delivered:

- A `cities` table of 4,310 real cities from GeoNames, seeded by a generated migration, with
  coordinates the client cannot choose - `profiles.city_id` is a foreign key (4,308 since November
  2026, when two quarters of Köln that no search could find were taken out, and Köln put in their
  place)
- `search_cities`, a server-side search over folded names and aliases, so "wien" finds Vienna and
  "koln" finds Köln
- A profile screen (display name, username, city) and a debounced city picker
- Home now shows the real profile, and prompts for a city while one is missing

Verified: 85 app tests, 38 database tests, typecheck, lint, format, and an iOS bundle of 1619
modules across 12 routes.

Also fixed, found while building this: `secureStorage.getItem` crashed when the keychain resolved
`undefined` rather than `null` for a missing key, which broke Supabase's session restore. Two
regression tests now cover it.

Not built, by design: avatars. Image upload means Storage, bucket policies, resizing and a
moderation question - a phase of its own.

## Phases 4–9 and 11 — the product (done)

Built together, because they are one mechanism: a letter cannot be created without reserving a
bat, cannot be reserved without a delivery time, and is not a product until it can be read. Each
phase's decisions are recorded under its own heading in [`ARCHITECTURE.md`](ARCHITECTURE.md).

Delivered:

- **Bats (4).** Three rows per courier, issued by a trigger in the signup transaction, in slots
  1–3 with a unique (owner, slot) pair - a fourth bat is a row the schema cannot store. Existing
  accounts are backfilled by the migration.
- **Friends (5).** Request by exact username, accept, decline, withdraw, unfriend. One row per pair
  whichever way it was asked; asking someone who already asked you accepts. `list_friends()`
  reveals a name only once someone has asked or accepted, and a city only to friends.
- **Letters, reservation and delivery time (6–8).** `send_message(recipient_id, body)` is the only
  way to create a letter. It checks friendship and both cities, claims a bat with
  `for update skip locked`, measures the haversine distance between the two cities' stored
  coordinates, and sets `deliver_at` from 80 km/h with a 20-minute floor, scaled by an
  operator-only multiplier. A partial unique index makes two letters on one bat impossible.
- **Delivery (9).** `private.deliver_due_messages()` lands every due letter and brings its bat home
  in one statement; pg_cron runs it every minute. Every read function also lands what is due for
  the caller first, so delivery is correct even if the schedule stops.
- **Reading (11).** The `messages` table has no client access at all. The roost, the inbox, the sent
  list, a whole letter and the unread counts come from functions that choose, column by column,
  what each side may see: nothing reaches the recipient before landing, and `opened_at` never
  reaches the sender.
- **Screens.** The roost (three live bat tiles with countdowns that land on screen by themselves),
  friends, compose with the server's flight estimate, letters received and sent, and a letter.
  Sign-out and account deletion moved to the profile screen.
- **Least privilege (part of 13).** Supabase grants every new table and function to the API roles
  by default; a migration narrows that to exactly what the app uses, and the test harness now
  reproduces the platform's defaults so a forgotten grant fails a test.

Verified: the full `npm run verify` gate - 468 app tests and 183 database tests, 12 of them races
run against a real Postgres - and an end-to-end run of the web build in Chromium against a local
Supabase stack (GoTrue, PostgREST, Postgres 17, pg_cron): sign up, choose a city, ask a friend, send
a letter, watch the bat land on screen, sign in as the recipient and read it - with no console
errors at iPhone sizes, repeated until it passed three times running.

Then an adversarial review - independent reviewers for security, correctness, the client and the
product, each finding checked by someone trying to refute it. What it found in this phase's own
code, all fixed and each with a test that fails without the fix:

- A courier could borrow a friend's city for one twenty-minute flight and move straight back. A new
  city now takes a day to count (`RELOCATION_HOURS`) - from a courier's first letter on, since
  November 2026.
- A direct read of the bats table could reveal when a friend opened the app. It is gone.
- Account deletion could deadlock with a landing, a send, or another deletion.
- A send retried after its answer was lost went out twice, on two bats. Sends are now idempotent.
- A page cursor whose letter had been deleted silently ended the list.
- On the client: an offline retry loop at the end of the letters list, stale older pages after
  reading, a Remove button VoiceOver could not reach, request rows that large text made unreadable,
  errors never spoken to screen readers, the keyboard covering "Send by bat" on iOS, muted text
  below WCAG AA contrast, and dialogs that did nothing on the web build.

**Found and fixed while doing this, in code from earlier phases:**

- **The app could not start in any real build.** `src/lib/supabase.ts` passed `process.env` whole to
  the config reader, but Expo inlines `EXPO_PUBLIC_*` values only where they are written out as
  `process.env.EXPO_PUBLIC_NAME`. Jest has a real environment, so every test passed; Expo Go, EAS
  and web builds all threw "Missing EXPO_PUBLIC_SUPABASE_URL" at launch. A test now runs the file
  through Expo's own Babel preset and checks what comes out.
- **Signing in or up left the user on the form.** The comments referred to a root guard that did not
  exist; the only redirect lived on the welcome screen and fires only while that screen is in
  front. `src/app/_layout.tsx` now has the guard.
- **A local Supabase stack could not be used.** The URL check refused plain http outright; it now
  accepts http for loopback and private-network addresses only.

The flight animation (12) and safety and moderation (13a) followed, below; push notifications (10)
were dropped altogether.

## The tests that matter

These are specified now so that later phases are written against them rather than towards them.
They come from the product requirements, and each one belongs to the phase that first makes it
possible.

| Test                                                     | Phase | Where                                                                 |
| -------------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| A new user receives exactly three bats                   | 4     | `bats.db.test.mjs`                                                    |
| A user cannot obtain a fourth bat                        | 4     | `bats.db.test.mjs`                                                    |
| Sending a message consumes exactly one bat               | 7     | `messages.db.test.mjs`                                                |
| A user with zero available bats cannot send              | 7     | `messages.db.test.mjs`                                                |
| Two concurrent sends cannot claim the same bat           | 7     | `concurrency.pg.test.mjs` (real Postgres)                             |
| A delivered message returns its bat to AVAILABLE         | 9     | `messages.db.test.mjs`                                                |
| A user cannot send to a non-friend                       | 5     | `messages.db.test.mjs`                                                |
| A user cannot read another user's message                | 13    | `messages.db.test.mjs`                                                |
| A client cannot manipulate `delivery_at`                 | 8     | `messages.db.test.mjs`                                                |
| The delivery worker is idempotent                        | 9     | `messages.db.test.mjs`                                                |
| A duplicate worker run does not deliver twice            | 9     | `concurrency.pg.test.mjs` (real Postgres)                             |
| A push failure does not corrupt message state            | 10    | not applicable - Phase 10 is dropped, so there is no push             |
| Account deletion removes or anonymises the required data | 2     | `messages.db.test.mjs`, `bats.db.test.mjs`, `friendships.db.test.mjs` |

Every one of them now exists in `src/tests/db` - all but the push test, which has nothing left to
test - and most under the very name in the table. The two about bats are worded differently:
`gives a new user exactly three bats`, and a group of three tests headed `a fourth bat`. The two
concurrency tests run only where `DATABASE_URL` points at a real Postgres - CI provides one, and
fails the run without it; locally they are skipped with a message saying so.

The review of November 2026 found that "A user cannot read another user's message" passed without
testing it: the letter was never landed, and before it lands nobody but its sender can see it
anyway. It is landed now.

## Open questions for later phases

Recorded rather than guessed at:

- **Lost bats.** The brief defines two bat states, `AVAILABLE` and `FLYING`, and no loss
  mechanic. With three non-purchasable bats, permanent loss would be punishing. If a "lost bat"
  is ever wanted, the honest shape is a recovery timer rather than destruction — but it is out
  of scope unless asked for.
- **Nocturnal delivery.** Bats flying only at night is the strongest theming hook available and
  is not in the current requirements. It would change the delivery formula in Phase 8, so it
  needs a decision before then, not after.
- ~~**Message retention.**~~ Decided in Phase 6, and confirmed by the operator on 2 November 2026:
  a letter is kept until either of the two people deletes their account, and then it goes from
  both sides - out of the recipient's inbox as well as the sender's list. A per-letter "delete" for
  one side is not built; if it is wanted, it is a hidden-for-me flag, not a deletion, since the
  other person still holds the letter. The one copy that outlives a deletion is a report's, for
  at most 180 days (Phase 13a).
- ~~**Changing city.**~~ Decided in review, and confirmed by the operator on 2 November 2026: a new
  city takes a day (`RELOCATION_HOURS`) to become where a courier's bats fly from, so nobody can
  borrow a friend's city for one short flight. Since November 2026 that holds from a courier's
  first letter on: before it there is no flight to shorten, and a move counts at once.
- ~~**Push notifications.**~~ Dropped by the operator on 2 November 2026; see Phase 10 above.
- ~~**Contact address for store listings.**~~ Decided: a personal postal address will be used.
  It is deliberately **not** recorded in this repository, which is public — it goes straight into
  App Store Connect and the hosted privacy policy at Phase 16, whose filled-in copy lives only in
  the GitHub Pages site repository. See [`GO-LIVE.md`](GO-LIVE.md).

## Phase 12 — Bat flight animation (done)

Decorative, as planned, and built last. A bat in the air beats its wings and drifts on its roost tile,
over a thin bar showing how far it has come; a letter in the air is drawn on its way, an arc of dots
between the two cities with the bat where the clock puts it; the send confirmation shows the flight that
has just begun. For anyone who has asked their device for less motion, the wings and the drift stop;
where the bat is on its way still updates. When a letter lands
is still the server's answer - the drawing only reads it. Decisions under "Phase 12" in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## Phase 13a — Safety and moderation (done)

Inserted after researching submission requirements: a chat app is a user-generated-content app
under Apple Guideline 1.2, and Beta App Review checks it. The decisions are recorded under
"Phase 13a" in [`ARCHITECTURE.md`](ARCHITECTURE.md). Built:

- **Block**, as an act of its own rather than another word for removing a friend: from a received
  letter, or from a courier's page (tap their name in Friends). A block ends the friendship or any
  request between the two, stops the blocked courier asking again, and hides their letters - those
  already received and any still in the air - until it is lifted. It is one-sided and silent: the
  blocked courier is answered exactly as if the username did not exist, and their display name no
  longer reaches the blocker. Profile → Blocked couriers lists them, each with Report and Unblock.
- **Report** a letter or a courier, with a reason and an optional note, blocking in the same step
  unless that is turned off. A report keeps a copy of what it is about, so it can still be judged
  once the letter or the account is gone, and is deleted after 180 days; at most 20 a day per
  courier. The operator reads reports in the Supabase dashboard - see "Handling a report" in
  [`GO-LIVE.md`](GO-LIVE.md).
- **House rules** with a zero-tolerance clause. Creating an account agrees to them, which the
  sign-up form says beside its button, with a link; they are also in the profile.
- **Filtering**, answered deliberately: letters only travel between two couriers who have both
  agreed to be friends, found by exact username. There is no search, no public profile and no way to
  write to a stranger. That gate, with report and block behind it, is the filter. There is no
  automated scanning of letters: they are private correspondence between friends, and reading them
  by machine would be a larger intrusion than the risk it addresses in an invite-only app.
- **A contact route**: Contact and Privacy policy buttons in the profile and the house rules, and
  the Privacy policy button on the sign-up form too. Their addresses come from the build's
  environment so that nothing personal is ever committed. The postal address for the store
  listing is paperwork for group C in GO-LIVE.

Then three independent reviews - the database, the client, and App Review with GDPR - found, among
smaller things: a blocked courier could go on writing to the blocker through their display name;
the daily report limit rolled back the block asked for with it, and did not hold under parallel
requests; two couriers who had blocked each other deadlocked deleting their accounts at once; going
back from a report that blocked showed the hidden letter again; nothing could be reported once
blocked; the app had no contact route or privacy link; and several sentences promised more than
the code does - anonymity, deletion, what a block stops. All fixed, each with a test, and the races
with tests that fail without their locks.

Verified: 767 app tests and 226 database tests, 18 of them races run against a real Postgres; and
the web build in Chromium against a local Supabase stack, end to end - report a letter and block its
sender, go back without seeing it again, a blocked courier's request refused as if unknown and their
renamed display name withheld, report from the blocked list, unblock, the house rules and the
contact links - with no errors but the one refusal the test provokes on purpose.

## The paperwork, and keeping less (done; the operator's part remains)

Written on 4 November 2026 for a minimum age of 12, and brought up to date on 5 November 2026 with
the operator's decisions of that day: a minimum age of 13 (under 16 still with a parent's or
guardian's permission), an operator who lives in Switzerland as a private individual - so the Swiss
FADP applies to the operator, and the GDPR to the data of people in the EU - and the web pages on
GitHub Pages. All in [`docs/store/`](store/):

- **The privacy policy**, in German (binding) and English, from an inventory of every piece of
  personal data the service holds, read from the database rather than from these notes.
- **App Store Connect**: listing texts, the App Privacy answers, the age-rating questionnaire,
  export compliance, the review notes, and what TestFlight needs.
- **Google Play Console**: listing, Data safety, the content rating, the target audience - 13 and
  over since the minimum age went to 13, so Google's Families Policy no longer applies (**to
  check**: unless Google judges the listing to appeal to children) - and internal testing.
- **The records of processing** the operator keeps (Art. 12 FADP, Art. 30 GDPR), with the
  processors, the countries data goes to, and how to answer a request for someone's data.

None of them holds the operator's name, address or email: they use placeholders, filled in only on
the hosted copy, which lives in the GitHub Pages site repository (`vnznznznz.github.io`, folder
`night-courier/`), never in this one. Each says, in comments marked PRÜFEN or TO CHECK, what still
needs a decision or a look at the hosted project.

The inventory found data kept for no reason, or for ever, and that is fixed in the database: sign-in
records (with email and IP address) kept 30 days and deleted with the account, the sign-up form's
names removed from Supabase Auth once the profile exists, a removed account banned for two years
and then deleted, a session unused for 90 days ended, the old city forgotten once a move has
settled - one daily job - and the iOS session kept on the device only. Decisions under "Keeping less, for less long" in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## The whole-project review (done; what it left open is below)

In November 2026 the whole project was reviewed at once - the database, signing in, the screens,
the tests, the setup and the documents - and each finding was verified before it was fixed. The
fixes were made in groups, each reviewed and checked again, and merged; the seams between them were
checked against the local stack and in the browser. The decisions are under "The whole-project
review" in [`ARCHITECTURE.md`](ARCHITECTURE.md). Done:

- **Sessions.** Who is signed in is read from the keychain at launch, so a phone without a network
  no longer shows half a minute of splash and then the welcome screen. The client's fetch keeps a
  session through a failed renewal, gives a request 20 seconds, and renews a token the database
  refused; the keychain keeps a session whole whatever a write does. Signing out waits for the
  server five seconds at most and tells it after all once it can - at the latest at the next
  sign-in, while the app stays open - and every way of signing in waits for a sign-out still under
  way, and says so after five seconds, under the buttons that check a code as well. On the web a
  sign-in in another tab is no longer taken for the session let go, and ended. A session ended
  elsewhere - signed out on another device, unused for 90 days, a password set anew - is told on
  the welcome screen: "You were signed out. Sign in again to go on."
- **Loading.** A load that got no answer is made again by itself, a screen with nothing to show has
  Try again, a long first load says it is still trying, and Try again renews the session first. A
  name saved on the profile shows at once, before the profile is read back.
- **Accounts that end.** The database refuses a suspended account at once. The screens give an
  account that is gone or suspended the way out, Sign out and Contact; deleting an account says
  that it happened; signing in to a suspended account is answered as a wrong password. Words that
  send a courier to a person name one only where the build has a way to them.
- **Sign-up and reset by emailed code**, which finishes what Phase 2 left incomplete. Every email
  carries an 8-digit code and no link, and the code flow (PKCE) is gone. A code holds the way in
  until the password is saved, across a relaunch too; a stranger's earlier sign-up for the address
  makes way for the courier's; and confirming an address takes its password away until the
  courier's own is set (migration `20261121160000`). A code whose check got no answer, refused
  later, says that the address may be confirmed and how to go on; the forms say what Start over and
  Sign out did; and on the web a code's sign-in in one tab holds the way in in the others too. "I
  forgot my password" starts the reset with the address typed to sign in, or the one the code
  went to.
- **Database.** One lock order for everything that ends an account, the nightly tidy-up included,
  and a gate for each courier; twenty new friend requests an hour per account, friends listed
  before requests, and a Withdraw that cannot end a friendship; bounds on what a sign-in carries,
  on a city search, and on what a name or a letter may be; a letter read in the one order; and a
  send that answers its repeat with the letter that went, with `sent_letter` to ask what became of
  one. The tidy-up counts an unconfirmed sign-up's week from the last code sent to it, and forgets
  pg_cron's runs that never ended a week after they began (`20261121180000_tidy_up_ages.sql`).
- **Compose.** A letter not sent yet survives leaving the screen, a send outlives its screen, a
  send without an answer is asked after rather than taken for failed, and changed words wait until
  it is known what became of the first. Write back, Write on the friends list and "Write a letter"
  on a courier's page name a former friend, and a name in the route is shown only if it could be
  someone's. A letter with a NUL or half an emoji in it, which the server refuses before it reads
  the letter, is kept back with words that say what to do; every try of it used to end in "Your
  letter did not go." with no reason.
- **Cities.** Saints' towns and names with brackets and slashes are found as people type them; 28
  pairs of towns of the same name are told apart wherever a city is shown; the sixteen rows nothing
  could find are settled, and the table holds 4,308 cities; a move counts at once until the first
  letter; and the city picker asks before it saves.
- **Forms and layout.** The forms stay reachable above the keyboard on iOS and Android and check
  what the server checks; an empty field is asked for in the words of its form - "Enter your
  password." at sign-in, "Enter their username." on Friends; a link that leads nowhere lands on a
  page of the app's own; rows keep names and routes whole at a narrow phone's width, and so do the
  letters list and a letter's flight path; a distance keeps its "km" on its line.
- **Tests.** The suite runs again compiled by the React Compiler, in CI, and what the compiler
  leaves out is listed; presses go through the real controls; the scheduled jobs run in a test; the
  races fail CI when there is no database; a focused test fails lint; the ages every document
  gives are held to the two constants; and the profile's credit to GeoNames is tested, as the
  city picker's was.
- **The web pages.** The build refuses to write the pages, with the operator's details, anywhere
  inside this repository, and refuses every way a page could fetch something from another site,
  naming what it found.

Verified on 187439c, the merged tree before the dependency updates of 21 November 2026: the
typecheck, lint and format check; 2,095 app tests, run as written and again compiled; 554 database
tests, 73 of them races on a real Postgres; and the 90 tests of the scripts and the runbooks. The
last round of fixes after it - sign-outs the server did not hear of, tabs on the web, the hint
after a lost answer, the forms' notices, the lines of the letters list and the flight path, Write
naming a friend - was checked on its own branch with the same commands, ending at 555 database
tests (c0f80fc); and the merged tree, 236c734, at 2,179 app tests, as written and again compiled,
and the 90 of the scripts. A last audit of every finding against 236c734 left some open; the fixes
for them - a session ended elsewhere told, a letter with a character no letter can carry kept
back, the forms' own words, the reset's address, a saved name, the web pages' build and the
tidy-up's ages - were checked on their own branches the same way, and merged in 93c70c3 at 2,224
app tests, as written and again compiled, 559 database tests, 74 of them races on a real Postgres,
and 111 tests of the scripts and the runbooks. The groups also checked their parts against the
local stack, and the screens in the web build. None of it has been run on a phone.

Still open:

- **Seen on no phone.** The keyboard's room on Android and iOS, the code field's autofill and
  number pad, the swipe and the back button held on the code screens, an app closed with a code
  half done, VoiceOver and TalkBack on the code screens, the forms' notices and the hint after a
  lost answer, Hermes reading the auth server's times and a session's id, the words for a session
  ended elsewhere, and the twin towns' lines in a phone's own fonts were tried in Jest and, where
  they could be, against the local stack and in the web build - not on a device.
- **The hosted project.** Everything above goes with its first `db push` and `config push`, and
  whether it takes a code life of a day (`otp_expiry = 86400`) shows at that push. Custom SMTP, and
  email confirmation on, before anyone else signs up (GO-LIVE).
- **Who can tell whether an address has an account.** A taken username at sign-up, the project's
  emails for the hour used up, and the auth server's own answers still tell (ARCHITECTURE, "Who can
  tell whether an address has an account"). Closing the first needs a database change; the rest is
  the operator's to weigh.
- **"Almost there" can only try the same password again while the app stays open.** If the auth
  server refuses the password typed at sign-up or at sign-in - under a stricter rule, say - the way
  on is Start over, or Sign out and "I forgot my password", or closing the app and opening it
  again, which then asks for a password: the one chosen before, or a new one.
- **A lost answer to a sign-up's code.** If the server confirmed the account and the answer never
  came, nothing holds the way in: the account has no password, and keeps the username and name of
  the first sign-up for the address - perhaps a stranger's. Once that code is refused again, the
  code screen says so: a new code first, and if none comes, a password set with "I forgot my
  password". That the account then keeps a stranger's names is decided, not open: the words, in
  the hint and on the reset's last stage, say to delete it in the profile and sign up again. Open
  is that the hint also shows for the same wrong code typed twice after a try that never left the
  phone - auth-js cannot tell the two apart - where a reset taken at once removes the courier's own
  account; the new code the words ask for first does come.
- **The reset's last stage on the web.** "Your new password is saved" - after such a code, with the
  sentence about names - is replaced by the roost before the browser draws it, and only a screen
  reader hears it. Keeping it on screen, with a button to go on, would change what the reset does
  today; saying the sentence on the roost is the other way. The operator's call; on a phone it has
  not been seen either way.
- **Two seams on the web**, which is for development and given to no one. One tab's sign-out still
  under way - a logout that never answers, or a stale token offline, for up to about half a minute -
  can undo another tab's sign-in. And a sign-out the server never heard of is forgotten at every
  reload of the page, as on a phone only when the app is closed, and then lasts on the server until
  the courier signs in and out again, or the tidy-up's 90 days. The first would take the app's own
  logout in place of auth-js's; the second, the owed session kept in storage.
- **A letter could still go twice** if the first send is still on its way to the database both
  times the app asks after it, and changed words go in between. The window is normally
  milliseconds.
- **Friend requests from many accounts**, each making its own, are still possible, and usernames
  can be guessed while the guesses miss. A cap per person asked, a wait after a decline, or a
  CAPTCHA are the operator's choices.
- **An account deleted on another phone** keeps its token on this one for up to an hour. The app
  shows it as gone, but a friend request, a block or a report sent from it fails with a database
  error rather than as an account that has ended.
- **A read of the profile on a connection that never answers** takes about a minute and a half to
  fail: the profile is the only table the app reads directly, and postgrest-js repeats such a read
  three times by itself, each attempt with its own 20 seconds. `db: { retry: false }` in
  `createClient` would make it fail as the rest do.
