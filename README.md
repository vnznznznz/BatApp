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

## Status

Phase 1 of 17 — project foundation. The app currently builds, bundles and renders a welcome
screen. There is no backend, no authentication and no messaging yet. See
[`docs/ROADMAP.md`](docs/ROADMAP.md) for what lands when, and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the decisions taken so far.

## Requirements

- Node.js 20.19+ (developed on 22.22)
- npm 10+
- An iOS or Android device with [Expo Go](https://expo.dev/go), or a simulator
- macOS with Xcode is only required for local native iOS builds; cloud builds via EAS do not
  need it

## Getting started

```bash
npm install
npm start
```

Then scan the QR code with Expo Go, or press `i` / `a` for a simulator.

## Scripts

| Command                   | What it does                                           |
| ------------------------- | ------------------------------------------------------ |
| `npm start`               | Start the Expo dev server                              |
| `npm run ios` / `android` | Start and open a simulator                             |
| `npm run typecheck`       | `tsc --noEmit`                                         |
| `npm run lint`            | ESLint over the whole repo, warnings treated as errors |
| `npm run format`          | Rewrite files with Prettier                            |
| `npm test`                | Jest                                                   |
| `npm run verify`          | typecheck + lint + format check + tests (what CI runs) |
| `npm run generate:assets` | Redraw the app artwork from source                     |

Run `npm run verify` before every commit. CI runs exactly the same command.

## Project layout

```
src/
  app/          Expo Router routes. Files here are URLs.
  constants/    Product invariants (config.ts) and the visual system (theme.ts)
  lib/          Pure, framework-free helpers
assets/images/  Generated artwork — do not hand-edit, see scripts/generate-assets.mjs
scripts/        Build tooling
docs/           Architecture decisions and roadmap
```

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
