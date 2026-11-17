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
 * What a display name must not hold, and what gives a name or a letter
 * something to see. These are the database's rules character for character -
 * its two checks on a display name, and what send_message asks of a letter
 * (see the visible names migration) - and the parity test compares the two for
 * every character there is.
 *
 * DISPLAY_NAME_FORBIDDEN_PATTERN finds what makes a name other than plain
 * text: control characters (a line break is one), line and paragraph
 * separators, and the characters that embed, override or isolate the direction
 * of text, with which a name can read as something it is not. The marks and
 * joiners that scripts and emoji need, U+200C to U+200F, are not among them.
 *
 * VISIBLE_CHARACTER_PATTERN finds a character that is drawn as something:
 * anything but white space, control characters and what Unicode says shows
 * nothing - zero-width spaces and joiners, direction marks, fillers, variation
 * selectors, tags. A name needs one, and so does a letter.
 *
 * Both count U+0000 with the control characters. The database cannot store it
 * at all, so it refuses such a value before either rule is asked.
 */
export const DISPLAY_NAME_FORBIDDEN_PATTERN =
  /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;
export const VISIBLE_CHARACTER_PATTERN =
  /[^\u0000-\u0020\u007F-\u00A0\u00AD\u034F\u061C\u115F\u1160\u1680\u17B4\u17B5\u180B-\u180F\u2000-\u200F\u2028-\u202F\u205F-\u206F\u2800\u3000\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0000}-\u{E0FFF}]/u;

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
 * How many new friend requests one courier may make in an hour, as the database
 * counts them: its private.friend_requests_per_hour(), which the parity test
 * checks against this. A request counts whatever becomes of it; asking someone
 * again, or answering someone who asked first, does not.
 */
export const FRIEND_REQUESTS_PER_HOUR = 20;

/**
 * Who may use Night Courier: no one younger than MINIMUM_AGE, and anyone younger
 * than PARENTAL_PERMISSION_UNDER only with a parent's or guardian's permission -
 * the operator's decision. 13 is Apple's lowest age rating above 12 and keeps
 * the app outside Google Play's Families Policy, which is for under-13s; 16 is
 * the highest age any EU country sets for agreeing to an online service on
 * one's own (Art. 8 GDPR). Stated in the house rules and confirmed at sign-up;
 * nobody's age is ever stored.
 */
export const MINIMUM_AGE = 13;
export const PARENTAL_PERMISSION_UNDER = 16;
