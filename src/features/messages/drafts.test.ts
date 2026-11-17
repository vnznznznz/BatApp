import { act, renderHook } from '@testing-library/react-native';

import {
  forgetAllDrafts,
  forgetDraft,
  keepDraft,
  readDraft,
  subscribeToDrafts,
  useDraft,
} from '@/features/messages/drafts';
import { supabase } from '@/lib/supabase';

// The real client, on purpose: what must be heard is its own announcement of a
// sign-out, spelled as it spells it. Signing out with nobody signed in makes no
// request. The spy only watches the store ask to be told.
const listened = jest.spyOn(supabase.auth, 'onAuthStateChange');

type Announcement = Parameters<Parameters<typeof supabase.auth.onAuthStateChange>[0]>[0];

/** The client tells everyone who asked, as it does when a token is renewed or a session ends. */
function clientAnnounces(event: Announcement) {
  // Otherwise "keeps every letter" would pass with nobody there to be told.
  if (listened.mock.calls.length === 0) throw new Error('The store never asked to be told.');
  for (const [listener] of listened.mock.calls) void listener(event, null);
}

const MARA = 'user-mara';
const NORA = 'user-nora';
const ANNA = 'user-anna';
const BEN = 'user-ben';

afterEach(() => {
  forgetAllDrafts();
});

describe('an unsent letter', () => {
  it('is kept as it was written', () => {
    keepDraft(MARA, ANNA, 'Dear Anna,\n\nThe chestnuts are out again.  ');

    expect(readDraft(MARA, ANNA)).toBe('Dear Anna,\n\nThe chestnuts are out again.  ');
  });

  it('follows the words as they change', () => {
    keepDraft(MARA, ANNA, 'Dear Anna');
    keepDraft(MARA, ANNA, 'Dear Anna,');

    expect(readDraft(MARA, ANNA)).toBe('Dear Anna,');
  });

  it('is one for each friend', () => {
    keepDraft(MARA, ANNA, 'Dear Anna,');
    keepDraft(MARA, BEN, 'Dear Ben,');

    expect(readDraft(MARA, ANNA)).toBe('Dear Anna,');
    expect(readDraft(MARA, BEN)).toBe('Dear Ben,');
  });

  it('is nothing for a friend no letter was started to', () => {
    keepDraft(MARA, ANNA, 'Dear Anna,');

    expect(readDraft(MARA, BEN)).toBe('');
  });

  it('is forgotten when asked, and only that one', () => {
    keepDraft(MARA, ANNA, 'Dear Anna,');
    keepDraft(MARA, BEN, 'Dear Ben,');

    forgetDraft(MARA, ANNA);

    expect(readDraft(MARA, ANNA)).toBe('');
    expect(readDraft(MARA, BEN)).toBe('Dear Ben,');
  });

  it('is empty again once every word is taken out', () => {
    keepDraft(MARA, ANNA, 'Dear Anna,');

    keepDraft(MARA, ANNA, '');

    expect(readDraft(MARA, ANNA)).toBe('');
  });

  it('is kept for nobody while nobody is signed in, or nobody is chosen', () => {
    keepDraft(undefined, ANNA, 'Dear Anna,');
    keepDraft(MARA, undefined, 'Dear someone,');

    expect(readDraft(undefined, ANNA)).toBe('');
    expect(readDraft(MARA, undefined)).toBe('');
    expect(readDraft(MARA, ANNA)).toBe('');
  });
});

/**
 * Two people can share a phone. What one of them has written is kept under
 * their own account and is never shown to the other - and none of it outlasts
 * a sign-out.
 */
describe('whose letters they are', () => {
  it('never shows one account’s letter to another', () => {
    keepDraft(MARA, ANNA, 'Dear Anna, this is between us.');

    expect(readDraft(NORA, ANNA)).toBe('');
  });

  it('keeps each account’s letter to the same friend apart', () => {
    keepDraft(MARA, ANNA, 'From Mara.');
    keepDraft(NORA, ANNA, 'From Nora.');

    expect(readDraft(MARA, ANNA)).toBe('From Mara.');
    expect(readDraft(NORA, ANNA)).toBe('From Nora.');

    forgetDraft(NORA, ANNA);

    expect(readDraft(MARA, ANNA)).toBe('From Mara.');
  });

  it('forgets every letter of every account when the client announces a sign-out', async () => {
    keepDraft(MARA, ANNA, 'Dear Anna,');
    keepDraft(MARA, BEN, 'Dear Ben,');
    keepDraft(NORA, ANNA, 'From Nora.');

    // The client's own sign-out, with nobody signed in: local, and no request.
    await supabase.auth.signOut({ scope: 'local' });

    expect(readDraft(MARA, ANNA)).toBe('');
    expect(readDraft(MARA, BEN)).toBe('');
    expect(readDraft(NORA, ANNA)).toBe('');
  });

  it.each(['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'] as const)(
    'keeps every letter when the client announces %s',
    (event) => {
      keepDraft(MARA, ANNA, 'Dear Anna,');

      clientAnnounces(event);

      expect(readDraft(MARA, ANNA)).toBe('Dear Anna,');
    },
  );

  it('asks the client once to be told, however many letters are kept', () => {
    keepDraft(MARA, ANNA, 'Dear Anna,');
    keepDraft(MARA, BEN, 'Dear Ben,');
    keepDraft(NORA, ANNA, 'From Nora.');

    expect(listened).toHaveBeenCalledTimes(1);
  });
});

describe('whoever is showing a letter', () => {
  it('is told when its words change, when it is forgotten, and when everything is', () => {
    const told = jest.fn();
    subscribeToDrafts(told);

    keepDraft(MARA, ANNA, 'Dear Anna,');
    expect(told).toHaveBeenCalledTimes(1);

    forgetDraft(MARA, ANNA);
    expect(told).toHaveBeenCalledTimes(2);

    keepDraft(MARA, ANNA, 'Dear Anna,');
    forgetAllDrafts();
    expect(told).toHaveBeenCalledTimes(4);
  });

  it('is not told once it has stopped listening', () => {
    const told = jest.fn();
    const stop = subscribeToDrafts(told);

    stop();
    keepDraft(MARA, ANNA, 'Dear Anna,');

    expect(told).not.toHaveBeenCalled();
  });

  it('shows the words as they are now, and none after a sign-out', async () => {
    keepDraft(MARA, ANNA, 'Dear Anna');
    const { result } = await renderHook(() => useDraft(MARA, ANNA));
    expect(result.current).toBe('Dear Anna');

    await act(async () => keepDraft(MARA, ANNA, 'Dear Anna,'));
    expect(result.current).toBe('Dear Anna,');

    await act(async () => clientAnnounces('SIGNED_OUT'));
    expect(result.current).toBe('');
  });
});
