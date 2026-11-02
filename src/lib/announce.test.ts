import { AccessibilityInfo, Platform } from 'react-native';

import { announce } from '@/lib/announce';

/**
 * Just enough of a page for the web branch: React Native's test environment has
 * no DOM, and the live region needs only an element it can find again.
 */
function fakePage() {
  const elements = new Map<string, FakeElement>();
  const body = {
    children: [] as FakeElement[],
    appendChild: (el: FakeElement) => body.children.push(el),
  };
  return {
    body,
    getElementById: (id: string) => elements.get(id) ?? null,
    createElement: () => {
      const element: FakeElement = {
        id: '',
        textContent: '',
        style: {},
        attributes: {},
        setAttribute(name: string, value: string) {
          element.attributes[name] = value;
        },
      };
      return new Proxy(element, {
        set(target, key, value) {
          (target as unknown as Record<string | symbol, unknown>)[key] = value;
          if (key === 'id') elements.set(value as string, target);
          return true;
        },
      });
    },
  };
}

type FakeElement = {
  id: string;
  textContent: string;
  style: Record<string, string>;
  attributes: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
};

describe('announce', () => {
  const realOS = Platform.OS;

  afterEach(() => {
    Platform.OS = realOS;
    delete (globalThis as { document?: unknown }).document;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('hands the words to VoiceOver and TalkBack on a phone', () => {
    const spoken = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();

    announce('Request sent.');

    expect(spoken).toHaveBeenCalledWith('Request sent.');
  });

  /**
   * React Native Web's announceForAccessibility does nothing at all, so every
   * outcome the app speaks - a block made, a report sent - was silent there.
   * (Found in review.)
   */
  it('puts the words in a polite live region on the web, made once and reused', () => {
    jest.useFakeTimers();
    Platform.OS = 'web';
    const page = fakePage();
    (globalThis as { document?: unknown }).document = page;

    announce('@ben is blocked.');
    jest.advanceTimersByTime(100);
    announce('@cleo is blocked.');
    jest.advanceTimersByTime(100);

    expect(page.body.children).toHaveLength(1);
    const [region] = page.body.children;
    expect(region?.attributes).toEqual({ role: 'status', 'aria-live': 'polite' });
    expect(region?.textContent).toBe('@cleo is blocked.');
  });

  /** A region speaks only when its text changes: the same words twice must still be heard. */
  it('clears the region before saying the same words again', () => {
    jest.useFakeTimers();
    Platform.OS = 'web';
    const page = fakePage();
    (globalThis as { document?: unknown }).document = page;

    announce('That did not go through. Try again.');
    jest.advanceTimersByTime(100);
    announce('That did not go through. Try again.');

    expect(page.body.children[0]?.textContent).toBe('');
    jest.advanceTimersByTime(100);
    expect(page.body.children[0]?.textContent).toBe('That did not go through. Try again.');
  });
});
