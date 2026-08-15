/**
 * Product invariants for Night Courier.
 *
 * These constants are the single source of truth for the rules that define the
 * product. They are asserted in `config.test.ts` so that a future change that
 * quietly breaks one of them fails the build rather than shipping.
 */

/**
 * Every user owns exactly three bats — no more, ever, and never purchasable.
 * The database enforces this too (see the `bats` table constraints, Phase 4);
 * this constant is what the client and the server-side functions agree on.
 */
export const BATS_PER_USER = 3;

/**
 * Night Courier has no payment system, no purchasable bats, no coins, no
 * credits, no subscriptions, no advertising and no monetisation of any kind.
 *
 * This flag exists to be asserted in tests and read by reviewers. It is not a
 * feature toggle: there is no code path that turns monetisation on.
 */
export const MONETISATION_ENABLED = false as const;

/**
 * Virtual flight speed used to turn distance into delivery time.
 *
 * 80 km/h is a deliberate design choice rather than a biological one: a real
 * bat cruises far slower, but 80 km/h keeps a message between neighbouring
 * cities to a single evening while a cross-continent message still takes days.
 * Tuning happens here and nowhere else.
 */
export const BAT_SPEED_KMH = 80;

/**
 * Scales every computed delivery duration. Production must always be 1.
 *
 * A development build can set this far lower so that a 40-hour delivery can be
 * observed end to end in seconds. The multiplier is applied server-side; the
 * client never decides how long a flight takes.
 */
export const PRODUCTION_TIME_MULTIPLIER = 1;
export const DEBUG_TIME_MULTIPLIER = 0.01;

/**
 * A delivery is never instant, even between two users in the same city.
 * Without a floor, same-city messages would arrive in seconds and the whole
 * premise of the app would collapse.
 */
export const MINIMUM_FLIGHT_MINUTES = 20;

/** Message body limits, enforced client-side and again in the database. */
export const MESSAGE_MAX_LENGTH = 2000;

/** Username rules, enforced client-side and again in the database. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;
