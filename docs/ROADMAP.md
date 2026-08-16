# Roadmap

Each phase ends with `npm run verify` green and a commit. Nothing is built ahead of its phase.

Three go-live tasks do **not** wait for Phase 15 — Apple enrolment, the Play Console account and
the Supabase project all have lead times or one-way doors, and two of them block earlier phases.
See [`GO-LIVE.md`](GO-LIVE.md).

| #   | Phase                           | Status   |
| --- | ------------------------------- | -------- |
| 1   | Project foundation              | **Done** |
| 2   | Supabase configuration and auth | **Done** |
| 3   | Profiles and city selection     | Next     |
| 4   | Bat model and inventory         | Planned  |
| 5   | Friend system                   | Planned  |
| 6   | Message creation                | Planned  |
| 7   | Atomic bat reservation          | Planned  |
| 8   | Delivery calculation            | Planned  |
| 9   | Scheduled delivery worker       | Planned  |
| 10  | Push notifications              | Planned  |
| 11  | Inbox and message detail        | Planned  |
| 12  | Bat flight animation            | Planned  |
| 13  | Security and RLS audit          | Planned  |
| 13a | Safety and moderation           | Planned  |
| 14  | Testing                         | Planned  |
| 15  | iOS/Android production builds   | Planned  |
| 16  | TestFlight / Play internal test | Planned  |
| 17  | Production release              | Planned  |

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

## The tests that matter

These are specified now so that later phases are written against them rather than towards them.
They come from the product requirements, and each one belongs to the phase that first makes it
possible.

| Test                                                     | Phase |
| -------------------------------------------------------- | ----- |
| A new user receives exactly three bats                   | 4     |
| A user cannot obtain a fourth bat                        | 4     |
| Sending a message consumes exactly one bat               | 7     |
| A user with zero available bats cannot send              | 7     |
| Two concurrent sends cannot claim the same bat           | 7     |
| A delivered message returns its bat to AVAILABLE         | 9     |
| A user cannot send to a non-friend                       | 5     |
| A user cannot read another user's message                | 13    |
| A client cannot manipulate `delivery_at`                 | 8     |
| The delivery worker is idempotent                        | 9     |
| A duplicate worker run does not deliver twice            | 9     |
| A push failure does not corrupt message state            | 10    |
| Account deletion removes or anonymises the required data | 2     |

## Open questions for later phases

Recorded rather than guessed at:

- **Lost bats.** The brief defines two bat states, `AVAILABLE` and `FLYING`, and no loss
  mechanic. With three non-purchasable bats, permanent loss would be punishing. If a "lost bat"
  is ever wanted, the honest shape is a recovery timer rather than destruction — but it is out
  of scope unless asked for.
- **Nocturnal delivery.** Bats flying only at night is the strongest theming hook available and
  is not in the current requirements. It would change the delivery formula in Phase 8, so it
  needs a decision before then, not after.
- **Message retention.** Nothing currently says how long a delivered message is kept. This
  affects the Phase 2 account-deletion test and the database schema.
- ~~**Contact address for store listings.**~~ Decided: a personal postal address will be used.
  It is deliberately **not** recorded in this repository, which is public — it goes straight into
  App Store Connect and the hosted privacy policy at Phase 16. See [`GO-LIVE.md`](GO-LIVE.md).

## Phase 13a — Safety and moderation

Inserted after researching submission requirements: a chat app is a user-generated-content app
under Apple Guideline 1.2, and Beta App Review checks it. Report a message or user, block a user
as an action distinct from removing a friend, a contact route, and a EULA with a zero-tolerance
clause. Invite-only one-to-one messaging makes the "filtering" limb easy to satisfy, but it has
to be a deliberate documented answer rather than an omission.
