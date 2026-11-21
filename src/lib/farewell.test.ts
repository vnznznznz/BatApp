import {
  farewellDue,
  forgetFarewell,
  forgetSessionEnded,
  noteAccountDeleted,
  noteAccountSuspended,
  noteSessionEnded,
} from '@/lib/farewell';

beforeEach(() => forgetFarewell());

/**
 * The welcome screen has room for one word. A deletion and a suspension say
 * more than that the session is over, and a sign-out the courier made here
 * takes back only the word that they were signed out.
 */
describe('the word for the welcome screen', () => {
  it('is that the courier was signed out, for a session ended elsewhere', () => {
    noteSessionEnded();

    expect(farewellDue()).toBe('ended');
  });

  it.each([
    ['a deletion', noteAccountDeleted, 'deleted'],
    ['a suspension', noteAccountSuspended, 'suspended'],
  ] as const)('stays that of %s when the session is found over after it', (_, note, word) => {
    note();

    noteSessionEnded();

    expect(farewellDue()).toBe(word);
  });

  it('becomes that of a suspension found after the session was found over', () => {
    noteSessionEnded();

    noteAccountSuspended();

    expect(farewellDue()).toBe('suspended');
  });

  it('is taken back, for a sign-out made here, only when it is that the courier was signed out', () => {
    noteSessionEnded();
    forgetSessionEnded();
    expect(farewellDue()).toBeNull();

    noteAccountDeleted();
    forgetSessionEnded();
    expect(farewellDue()).toBe('deleted');

    noteAccountSuspended();
    forgetSessionEnded();
    expect(farewellDue()).toBe('suspended');
  });
});
