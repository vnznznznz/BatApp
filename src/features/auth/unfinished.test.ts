import { Platform } from 'react-native';

import { confirmedByResetCode, watchUnfinishedElsewhere } from '@/features/auth/unfinished';

/**
 * The times are GoTrue v2.197's own, from the confirmation-on server on 21
 * November 2026: what a reset's code answered, and what a renewal of its
 * session answered later.
 */
describe('whether a reset’s code is what confirmed the account', () => {
  it('says yes for an account only a sign-up had made, confirmed by the code as it signed in', () => {
    expect(
      confirmedByResetCode({
        email_confirmed_at: '2026-11-21T11:57:56.799333Z',
        last_sign_in_at: '2026-11-21T11:57:56.801425832Z',
      }),
    ).toBe(true);
  });

  /** A renewal answers with the sign-in's time as the database keeps it, to the microsecond. */
  it('says the same of the session once it has been renewed', () => {
    expect(
      confirmedByResetCode({
        email_confirmed_at: '2026-11-21T11:57:56.799333Z',
        last_sign_in_at: '2026-11-21T11:57:56.801425Z',
      }),
    ).toBe(true);
  });

  /**
   * The reset was asked for at 11:09:17.90, the sign-up's code confirmed the
   * account at 11:09:19.02, and the reset's code was typed minutes later:
   * confirmed after the reset was asked for, and not by its code.
   */
  it('says no for an account another code confirmed after the reset was asked for', () => {
    expect(
      confirmedByResetCode({
        email_confirmed_at: '2026-11-21T11:09:19.020301Z',
        last_sign_in_at: '2026-11-21T11:14:02.615083165Z',
      }),
    ).toBe(false);
  });

  it('says no for an account another code confirmed a few seconds before', () => {
    expect(
      confirmedByResetCode({
        email_confirmed_at: '2026-11-21T11:57:48.005965Z',
        last_sign_in_at: '2026-11-21T11:57:53.539411165Z',
      }),
    ).toBe(false);
  });

  /** As fast as the app went, driven by a script: sign-up, use, sign-out and the reset's code. */
  it('says no for an account another code confirmed two seconds before', () => {
    expect(
      confirmedByResetCode({
        email_confirmed_at: '2026-11-21T12:07:11.426547Z',
        last_sign_in_at: '2026-11-21T12:07:13.491838522Z',
      }),
    ).toBe(false);
  });

  it('says no for an account confirmed long before', () => {
    expect(
      confirmedByResetCode({
        email_confirmed_at: '2026-11-01T10:00:00Z',
        last_sign_in_at: '2026-11-21T11:58:01.665137643Z',
      }),
    ).toBe(false);
  });

  /** Two clocks, the database's and the auth server's, may disagree by a moment. */
  it('says yes when the confirmation is written a moment after the sign-in', () => {
    expect(
      confirmedByResetCode({
        email_confirmed_at: '2026-11-21T11:57:56.803333Z',
        last_sign_in_at: '2026-11-21T11:57:56.801425832Z',
      }),
    ).toBe(true);
  });

  /**
   * The other way round, and far apart: no order one request writes them in.
   * Nothing to remove an account for.
   */
  it('says no when the confirmation is written long after the sign-in', () => {
    expect(
      confirmedByResetCode({
        email_confirmed_at: '2026-11-21T11:20:00.000000Z',
        last_sign_in_at: '2026-11-21T11:09:19.022514Z',
      }),
    ).toBe(false);
  });

  /**
   * JavaScript engines must read three digits after the second; V8 reads
   * nine, and the phone's engine has not been seen to.
   */
  it('reads the times as an engine does that takes only what it must', () => {
    const parse = Date.parse;
    jest
      .spyOn(Date, 'parse')
      .mockImplementation((text) => (/\.\d{4,}/.test(text) ? NaN : parse(text)));

    expect(
      confirmedByResetCode({
        email_confirmed_at: '2026-11-21T11:57:56.799333Z',
        last_sign_in_at: '2026-11-21T11:57:56.801425832Z',
      }),
    ).toBe(true);
  });

  it.each([
    ['no time of confirming', { last_sign_in_at: '2026-11-21T11:57:56.801425832Z' }],
    ['no time of signing in', { email_confirmed_at: '2026-11-21T11:57:56.799333Z' }],
    ['times that are not times', { email_confirmed_at: 'soon', last_sign_in_at: 'soon' }],
  ])('says no when the answer has %s', (_, user) => {
    expect(confirmedByResetCode(user)).toBe(false);
  });
});

/**
 * On the web, the storage is one for every tab of the browser, and the browser
 * tells each of the others of a change to it with a 'storage' event. The test
 * environment is no browser: the page's window is stood in for by an event
 * target, and the events by what the browser would fill in.
 */
describe('watching for what a code left to do, in another tab', () => {
  const page = globalThis as unknown as {
    addEventListener?: EventTarget['addEventListener'];
    removeEventListener?: EventTarget['removeEventListener'];
  };
  const DEFAULT_OS = Platform.OS;
  let target: EventTarget;

  beforeEach(() => {
    target = new EventTarget();
    page.addEventListener = target.addEventListener.bind(target);
    page.removeEventListener = target.removeEventListener.bind(target);
    Platform.OS = 'web';
  });

  afterEach(() => {
    delete page.addEventListener;
    delete page.removeEventListener;
    Platform.OS = DEFAULT_OS;
  });

  /** What the browser dispatches in this tab when another one changes the storage. */
  const changedElsewhere = (key: string | null, newValue: string | null) =>
    target.dispatchEvent(Object.assign(new Event('storage'), { key, newValue }));

  it.each([
    ['removes it', 'night-courier.unfinished', null],
    ['clears the whole storage', null, null],
  ])('says so when another tab %s', (_, key, newValue) => {
    const gone = jest.fn();
    watchUnfinishedElsewhere(gone);

    changedElsewhere(key, newValue);

    expect(gone).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['writes it', 'night-courier.unfinished', '{"flow":"reset","email":"mara@example.test"}'],
    ['removes the session alone', 'night-courier.session', null],
  ])('says nothing when another tab %s', (_, key, newValue) => {
    const gone = jest.fn();
    watchUnfinishedElsewhere(gone);

    changedElsewhere(key, newValue);

    expect(gone).not.toHaveBeenCalled();
  });

  it('stops when asked to', () => {
    const gone = jest.fn();
    const stop = watchUnfinishedElsewhere(gone);

    stop();
    changedElsewhere('night-courier.unfinished', null);

    expect(gone).not.toHaveBeenCalled();
  });

  it('watches nothing on a phone, where there is one app', () => {
    Platform.OS = 'ios';
    const gone = jest.fn();
    watchUnfinishedElsewhere(gone);

    changedElsewhere('night-courier.unfinished', null);

    expect(gone).not.toHaveBeenCalled();
  });
});
