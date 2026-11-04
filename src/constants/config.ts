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

/**
 * How long a new city takes to become where a courier's bats fly from.
 *
 * Without it, a courier could switch to a friend's city, send a twenty-minute
 * letter, and switch back - a flight time of their own choosing, which is
 * exactly what computing delivery on the server exists to prevent. With it, a
 * city counts only once it has been yours for a day, and in that day every
 * letter you send leaves from it. A courier's first city takes effect at once.
 * Enforced in the database (see the flight migration).
 */
export const RELOCATION_HOURS = 24;

/** Message body limits, enforced client-side and again in the database. */
export const MESSAGE_MAX_LENGTH = 2000;

/** Username rules, enforced client-side and again in the database. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

/**
 * What a report can say is wrong, as the database records it. The words shown
 * for each live with the report screen; the database refuses anything else.
 */
export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'violence',
  'other',
] as const;

/** The longest note a report may carry, enforced client-side and in the database. */
export const REPORT_NOTE_MAX_LENGTH = 500;

/** How many reports one courier may make in a day, as the database counts them. */
export const REPORTS_PER_DAY = 20;

/** How long the operator keeps a report, and the copy of what it was about. */
export const REPORT_RETENTION_DAYS = 180;

/**
 * How long an account removed for breaking the rules stays banned, counted from
 * the removal, so that the same email address cannot simply sign up again. The
 * database's private.ban_period(); the parity test checks the two agree.
 */
export const BAN_PERIOD_YEARS = 2;

/**
 * Who may use Night Courier: no one younger than MINIMUM_AGE, and anyone younger
 * than PARENTAL_PERMISSION_UNDER only with a parent's or guardian's permission -
 * the operator's decision, matching the age at which German law lets someone
 * agree to an online service on their own (Art. 8 GDPR). Stated in the house
 * rules and confirmed at sign-up; nobody's age is ever stored.
 */
export const MINIMUM_AGE = 12;
export const PARENTAL_PERMISSION_UNDER = 16;
