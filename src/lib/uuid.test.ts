import { randomUuid } from '@/lib/uuid';

/**
 * The reference a letter is sent under: the server answers a reference it has
 * seen with the letter that went, rather than send a copy on a second bat. So
 * a reference that came out the same for two letters would have the second
 * answered as a repeat of the first, and never sent; one that is not a uuid
 * would have every send refused.
 */

/** What Postgres's uuid type accepts, in the shape of version 4: random. */
const VERSION_4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const realCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

/** Puts `crypto` in place of the platform's own, for one test. */
function withCrypto(crypto: object | undefined) {
  Object.defineProperty(globalThis, 'crypto', { value: crypto, configurable: true });
}

afterEach(() => {
  if (realCrypto) Object.defineProperty(globalThis, 'crypto', realCrypto);
});

describe('randomUuid', () => {
  /**
   * Node and the browsers have crypto.randomUUID, so it is all that ever ran
   * in a test - but Hermes, the engine of the phone apps, has none. This is
   * the generator every letter sent from a phone is named by.
   */
  it.each([
    ['without crypto at all', undefined],
    ['with crypto, but no randomUUID', {}],
  ])('makes a version 4 uuid, a different one every time, on a phone %s', (_, crypto) => {
    withCrypto(crypto);

    const made = Array.from({ length: 2000 }, () => randomUuid());

    for (const uuid of made) expect(uuid).toMatch(VERSION_4);
    expect(new Set(made).size).toBe(made.length);
    // And from all sixteen digits: a few thousand references come out
    // different even from a generator that draws on two.
    expect(new Set(made.join('').replaceAll('-', '')).size).toBe(16);
  });

  /** In a browser, randomUUID called on anything but crypto throws. */
  it('takes the platform’s own where there is one, called on crypto', () => {
    const platform = {
      randomUUID(this: unknown) {
        if (this !== platform) throw new TypeError('Illegal invocation');
        return '6f1c2d3e-4b5a-4c7d-8e9f-a0b1c2d3e4f5';
      },
    };
    withCrypto(platform);

    expect(randomUuid()).toBe('6f1c2d3e-4b5a-4c7d-8e9f-a0b1c2d3e4f5');
  });
});
