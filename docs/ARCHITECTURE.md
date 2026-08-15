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

### Testing: Jest 29 via `jest-expo`

`jest-expo@57` is built against Jest 29 internals (`babel-jest@^29`, `@jest/globals@^29`).
Installing Jest 30 alongside it would break the preset, so Jest is pinned to `~29.7.0`.

`@testing-library/react-native` is deliberately **not** installed yet. Phase 1 has no component
worth asserting on; it arrives in the phase that first renders a component under test.

`tsconfig.json` sets `"types": ["jest"]` explicitly — automatic `@types` discovery did not pick
it up under TypeScript 6.

### Linting: ESLint flat config, run directly rather than through `expo lint`

`expo lint` reported success on a codebase where `eslint .` reported ten errors: it was not
covering `scripts/`. `npm run lint` therefore calls `eslint . --max-warnings=0` so nothing is
silently skipped. `eslint-config-prettier` is applied last to switch off the stylistic rules
Prettier owns.

### Artwork generated from source

`scripts/generate-assets.mjs` defines the bat and the moon as vector data and rasterises them
with a scanline polygon filler (non-zero winding, analytic horizontal coverage, 5× vertical
supersampling) and a minimal PNG encoder built on `node:zlib`.

**Why not commit PNGs from a design tool:** no design tool is available in this environment, and
generated artwork can be re-rendered at any size, recoloured from the palette, and reviewed as a
diff. **Trade-off:** the silhouette is polygonal rather than curved. Accepted — if the app ever
gets a designer, the generator is deleted and real assets are committed in its place.

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
