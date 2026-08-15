import {
  BATS_PER_USER,
  BAT_SPEED_KMH,
  DEBUG_TIME_MULTIPLIER,
  MESSAGE_MAX_LENGTH,
  MINIMUM_FLIGHT_MINUTES,
  MONETISATION_ENABLED,
  PRODUCTION_TIME_MULTIPLIER,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/constants/config';

/**
 * These assertions guard the product rules, not the implementation. They exist
 * so that a change which would turn Night Courier into a different product
 * fails here first.
 */
describe('product invariants', () => {
  it('gives every user exactly three bats', () => {
    expect(BATS_PER_USER).toBe(3);
  });

  it('has no monetisation', () => {
    expect(MONETISATION_ENABLED).toBe(false);
  });

  it('never delivers instantly', () => {
    expect(MINIMUM_FLIGHT_MINUTES).toBeGreaterThan(0);
  });

  it('runs production at real speed', () => {
    expect(PRODUCTION_TIME_MULTIPLIER).toBe(1);
  });

  it('keeps the debug multiplier strictly faster than production', () => {
    expect(DEBUG_TIME_MULTIPLIER).toBeGreaterThan(0);
    expect(DEBUG_TIME_MULTIPLIER).toBeLessThan(PRODUCTION_TIME_MULTIPLIER);
  });

  it('flies at a positive, finite speed', () => {
    expect(BAT_SPEED_KMH).toBeGreaterThan(0);
    expect(Number.isFinite(BAT_SPEED_KMH)).toBe(true);
  });

  it('bounds message length', () => {
    expect(MESSAGE_MAX_LENGTH).toBeGreaterThan(0);
  });
});

describe('username rules', () => {
  it('bounds username length sensibly', () => {
    expect(USERNAME_MIN_LENGTH).toBeGreaterThanOrEqual(3);
    expect(USERNAME_MAX_LENGTH).toBeGreaterThan(USERNAME_MIN_LENGTH);
  });

  it('accepts lowercase, digits and underscores', () => {
    expect(USERNAME_PATTERN.test('night_courier_01')).toBe(true);
  });

  it('rejects uppercase, spaces and punctuation', () => {
    expect(USERNAME_PATTERN.test('NightCourier')).toBe(false);
    expect(USERNAME_PATTERN.test('night courier')).toBe(false);
    expect(USERNAME_PATTERN.test('night.courier')).toBe(false);
  });
});
