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

## Deferred to later phases

Recorded here so the reasoning is not lost between phases.

- **Environment configuration and secrets** (Phase 2). No `.env.example` yet because there is
  nothing to configure. The Supabase anon key is publishable by design; the service-role key
  must never reach the app bundle, and enforcing that is a Phase 2 decision.
- **Delivery time algorithm** (Phase 8). `BAT_SPEED_KMH` and `MINIMUM_FLIGHT_MINUTES` are
  declared now because they are product invariants; the function that consumes them is not
  written until there are cities to measure between.
- **Scheduled delivery** (Phase 9). The worker must be idempotent and must not live in the
  mobile app. The choice between `pg_cron` calling a SQL function directly and `pg_cron`
  invoking an Edge Function is deferred until Phase 9, when the delivery and push paths are
  both concrete.
