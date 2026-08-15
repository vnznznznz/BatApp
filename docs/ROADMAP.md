# Roadmap

Seventeen phases. Each one ends with `npm run verify` green and a commit. Nothing is built ahead
of its phase.

| #   | Phase                           | Status   |
| --- | ------------------------------- | -------- |
| 1   | Project foundation              | **Done** |
| 2   | Supabase configuration and auth | Next     |
| 3   | Profiles and city selection     | Planned  |
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
| 14  | Testing                         | Planned  |
| 15  | iOS/Android production builds   | Planned  |
| 16  | TestFlight / Play internal test | Planned  |
| 17  | Production release              | Planned  |

## Phase 1 — Project foundation (done)

Delivered:

- Expo SDK 57 + React Native 0.86 + TypeScript 6, strict, with `@/` path aliases wired through
  TypeScript, Jest and Metro
- Expo Router with typed routes; a root layout carrying the dark navigation theme
- The visual system (`src/constants/theme.ts`) and the product invariants
  (`src/constants/config.ts`), the latter covered by tests
- Original generated artwork: app icon, Android adaptive icon (background/foreground/
  monochrome), splash mark, favicon
- Toolchain: ESLint (flat config), Prettier, Jest via `jest-expo`, and a single
  `npm run verify` gate that CI runs unchanged
- A welcome screen that renders the identity

Verified: `tsc --noEmit` clean, `eslint .` clean at zero warnings, Prettier clean, 23 tests
passing, and `expo export` bundles 1554 modules without error.

Not built, by design: no backend, no auth, no database, no messaging, no navigation beyond the
single welcome route.

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
