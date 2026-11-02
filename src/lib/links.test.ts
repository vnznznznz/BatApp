import { transformSync } from '@babel/core';
import { Linking } from 'react-native';

import { notify } from '@/lib/confirm';
import { acceptableLink, openLink } from '@/lib/links';

jest.mock('@/lib/confirm', () => ({ notify: jest.fn() }));

// Node built-ins, typed by hand, as in supabase.test.ts: the project's
// tsconfig deliberately leaves out Node's types.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');
const { join } = jest.requireActual<{ join: (...parts: string[]) => string }>('path');

describe('acceptableLink', () => {
  it.each(['https://night-courier.example/privacy', 'mailto:help@night-courier.example'])(
    'takes %s as it is',
    (link) => {
      expect(acceptableLink(link)).toBe(link);
    },
  );

  it('trims the space a copied value often brings with it', () => {
    expect(acceptableLink('  https://example.test/privacy \n')).toBe(
      'https://example.test/privacy',
    );
  });

  /** Anything else would open nowhere useful, or somewhere unsafe. */
  it.each([
    ['nothing', undefined],
    ['an empty value', ''],
    ['blank space', '   '],
    ['plain http', 'http://example.test/privacy'],
    ['a script', 'javascript:alert(1)'],
    ['a mail link without an address', 'mailto:'],
    ['a bare address', 'help@example.test'],
    ['a link with a space in it', 'https://example.test/privacy policy'],
  ])('refuses %s', (_, value) => {
    expect(acceptableLink(value)).toBeNull();
  });
});

describe('openLink', () => {
  // React Native's own Jest setup makes Linking.openURL a mock already, which
  // spyOn hands back as it is, calls and all: clear it as well as restore it.
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('opens the link', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    await openLink('mailto:help@example.test');

    expect(open).toHaveBeenCalledWith('mailto:help@example.test');
    expect(notify).not.toHaveBeenCalled();
  });

  /** A phone without a mail app cannot open a mailto link; the address is still useful. */
  it('says so, with the address, when the device cannot open it', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No app'));

    await openLink('mailto:help@example.test');

    expect(notify).toHaveBeenCalledWith('That could not be opened', 'help@example.test');
  });

  it('does nothing for a link that is not set', async () => {
    const open = jest.spyOn(Linking, 'openURL');

    await openLink(null);

    expect(open).not.toHaveBeenCalled();
  });
});

/**
 * As for the Supabase settings: Expo inlines an EXPO_PUBLIC_ variable only
 * where it is read as `process.env.EXPO_PUBLIC_NAME`, written out in full, so
 * the only faithful check is to bundle the file the way Metro does and look.
 */
describe('the links, as bundled', () => {
  const SOURCE = join(__dirname, 'links.ts');

  it('inlines both addresses, and leaves no read of process.env behind', () => {
    const saved = { ...process.env };
    process.env.EXPO_PUBLIC_CONTACT_URL = 'mailto:help@night-courier.example';
    process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL = 'https://night-courier.example/privacy';
    try {
      const code = transformSync(readFileSync(SOURCE, 'utf8'), {
        filename: SOURCE,
        presets: ['babel-preset-expo'],
        babelrc: false,
        configFile: false,
        caller: { name: 'metro', bundler: 'metro', platform: 'ios', isDev: false, isServer: false },
      } as Parameters<typeof transformSync>[1])?.code;

      expect(code).toContain('"mailto:help@night-courier.example"');
      expect(code).toContain('"https://night-courier.example/privacy"');
      expect(code).not.toMatch(/process\.env/);
    } finally {
      process.env = saved;
    }
  });
});
