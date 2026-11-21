import {
  AuthApiError,
  AuthUnknownError,
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  type AuthError,
  type Session,
  type User,
} from '@supabase/supabase-js';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

import { settled, wordsOf } from '@/features/auth/settled';
import {
  confirmedByResetCode,
  forgetUnfinished,
  keepUnfinished,
  readUnfinished,
  sameAddress,
  type Unfinished,
} from '@/features/auth/unfinished';
import {
  EMAIL_NOT_ACCEPTED,
  EMAIL_TOO_LONG,
  normaliseUsername,
  PASSWORD_TOO_LONG,
} from '@/features/auth/validation';
import { noteAccountDeleted } from '@/lib/farewell';
import { REFUSALS, toRpcError } from '@/lib/rpc-error';
import { clearStoredSession, isSessionStored, readStoredSession } from '@/lib/session-store';
import { supabase } from '@/lib/supabase';

export type SignUpDetails = {
  email: string;
  password: string;
  username: string;
  displayName: string;
};

export type AuthContextValue = {
  session: Session | null;
  /** True until the stored session has been restored, or found to be absent. */
  isRestoring: boolean;
  /**
   * True while a code from an email is being checked, or has signed the
   * courier in, and the password they chose is still to be saved: the new one
   * of a password reset, the one typed at sign-up, with the rest of the
   * account as they set it up, or the one signed in with, which confirming
   * the address took away. From the moment the code goes until that is done,
   * or the courier signs out. The root layout holds the way into the app
   * meanwhile: in it they would be signed in with a password they do not know
   * - and after signing up, perhaps someone else does - or with none.
   */
  isSettingPassword: boolean;
  /**
   * What the code that has signed the courier in is for, and is left to do,
   * for as long as it holds the way in; null otherwise. Kept on the device
   * too: an app closed in between opens held again, and the root layout takes
   * the courier to the screen that asked for the code, which asks for what is
   * left.
   */
  unfinished: Unfinished | null;
  /**
   * Resolves with whether the address still has to be confirmed with the code
   * emailed to it before the account can be used.
   */
  signIn: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  /**
   * Resolves with whether the account still needs the code emailed to its
   * address before it can be used. That depends on a project setting rather
   * than on anything the app controls, so it is reported rather than assumed.
   */
  signUp: (details: SignUpDetails) => Promise<{ needsEmailConfirmation: boolean }>;
  /**
   * Confirms an account's address with the code emailed to it, which signs the
   * courier in: from signing in, when the server has found the password right
   * and the address still waiting for its code. Confirming the address takes
   * the account's password away (the database does it, as the code confirms
   * the address), and the way in is held until `finishSignIn` has set it again.
   */
  confirmEmail: (email: string, code: string) => Promise<void>;
  /**
   * Sets the password signed in with again on the account `confirmEmail` has
   * confirmed, and the way into the app opens. Rejects, signed in and held,
   * when it could not be saved - or with `SignedOutUnfinished`, signed out.
   */
  finishSignIn: (password: string) => Promise<void>;
  /**
   * Confirms the address of an account just signed up for with `details`, with
   * the code emailed to it. That signs the courier in, and holds the way in
   * until `finishSignUp` has made the account the one they set up - or it is
   * removed.
   */
  confirmSignUp: (details: SignUpDetails, code: string) => Promise<void>;
  /**
   * Makes the account a sign-up's code has confirmed the one set up with
   * `details`: its password, then its username and name. Resolves 'signed in'
   * once it is, and the way into the app opens; or 'new code' when an earlier
   * sign-up had given it another username, and it has been set up again from
   * `details`, with a new code on its way. Rejects, signed in and held, when
   * that could not be done - or with `SignedOutUnfinished`, signed out.
   */
  finishSignUp: (details: SignUpDetails) => Promise<'signed in' | 'new code'>;
  /**
   * Removes the account the code that holds the way in confirmed, and signs
   * out: nothing can have been done with it since. For starting a sign-up over
   * that could not be finished, and for an account a reset's code confirmed
   * that nobody had confirmed before. Rejects, held, if it could not be done.
   */
  removeUnfinishedAccount: () => Promise<void>;
  /** Emails a new code for confirming the address. The one before stops working. */
  resendConfirmationCode: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Emails a code for setting a new password, if the address has an account. */
  sendPasswordReset: (email: string) => Promise<void>;
  /**
   * Checks the code from a reset email. That signs the courier in, holding the
   * way in, and the reset is finished by `setNewPassword`: 'signed in'. Unless
   * the code is what confirmed the account's address - an account a sign-up
   * left waiting for its code, perhaps someone else's - which is removed, and
   * the courier signed out: 'removed'. Rejects, held, if that could not be done.
   */
  verifyResetCode: (email: string, code: string) => Promise<'signed in' | 'removed'>;
  setNewPassword: (password: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * True once this device has been signed out without the server hearing of it.
 *
 * The server then still honours the session, and a renewal that was under way
 * as it was taken from the keychain can still come through: the client saves
 * what it brings and announces it, and the device would be signed in again
 * with nobody having signed in. A session announced while this is set is
 * therefore not taken, but ended - with the server, now that it answers.
 * Signing in or up, which the person does - with a password, or with a code
 * from an email - clears it, in beforeSigningIn; so must any other way of
 * signing in that is added here.
 */
let signedOutUnheard = false;

/**
 * Sign-outs that are not over yet: the app's own, with what it still does once
 * the device has let go, and the client's, where the provider has it end a
 * session that came back. Each ends by removing whatever session is stored by
 * then, or by telling the server to end every session of the account. See
 * beforeSigningIn.
 */
const signOutsUnderWay = new Set<Promise<void>>();

/** Counts `work` among the sign-outs under way until it is over, however it ends. */
function underWay<T>(work: Promise<T>): Promise<T> {
  const over = work.then(
    () => undefined,
    () => undefined,
  );
  signOutsUnderWay.add(over);
  void over.then(() => signOutsUnderWay.delete(over));
  return work;
}

/**
 * Waits until no sign-out is under way, and then lets the next session be
 * taken. Signing in and signing up start with it, and so does each code from
 * an email, which signs the courier in too; so must any other way of signing
 * in that is added here.
 *
 * A sign-out goes on after the device has let go of it (signOutHere), and it
 * ends by removing whatever session is stored by then. Someone who signed in
 * meanwhile was signed out again within seconds, and when the client had been
 * renewing at the start, the server was told to end every session of theirs.
 * (Found in review.) The wait has an end: no request waits longer than twenty
 * seconds for its answer (guarded-fetch.ts), and the client starts no new
 * attempt at a renewal after half a minute.
 */
async function beforeSigningIn(): Promise<void> {
  while (signOutsUnderWay.size > 0) await Promise.all(signOutsUnderWay);
  signedOutUnheard = false;
}

/**
 * How many sign-outs the client has announced. Whatever else the app keeps for
 * the signed-in account - the letters not sent yet - listens to the client,
 * not to this provider, and lets go of the account when the client announces
 * a sign-out. So a sign-out the app finishes by itself still has to be
 * announced by the client, and only once: this says whether it already was.
 */
let signOutsAnnounced = 0;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  // How many codes are being checked just now that a password is set after,
  // and whether one of them has signed the courier in with the password still
  // to be saved. Either holds the way in. Counted, not one flag: a form can
  // send the same code twice before it has drawn its spinner, and the second
  // check - refused, the first having used the code up - must not let go of
  // the hold the first still needs for the session it brings.
  const [codesOut, setCodesOut] = useState(0);
  const [signedInByCode, setSignedInByCode] = useState(false);
  const isSettingPassword = codesOut > 0 || signedInByCode;
  // What the code is for, from the moment it goes to be checked.
  const [unfinished, setUnfinished] = useState<Unfinished | null>(null);

  useEffect(() => {
    let active = true;
    // Set once the client has said who is signed in. What was read from the
    // keychain before that is older news, and must not overrule it.
    let announced = false;
    // Who the client said it was, then.
    let announcedSession: Session | null = null;

    // Signed in or not is a question about this device, so the keychain
    // answers it. The client's own answer waits for the server: after an hour
    // away it first renews the token, and without a network that was half a
    // minute of splash screen followed by "nobody" - for someone signed in.
    Promise.all([readStoredSession(), readUnfinished()])
      .then(([stored, left]) => {
        if (!active) return;
        const signedIn = announced ? announcedSession : stored;
        // Signed in by a code whose work the app was closed before it had
        // done: held again, from before anything is drawn.
        const resumed = signedIn && left && sameAddress(signedIn.user.email, left.email);
        if (resumed) {
          setUnfinished(withRemoval(left, signedIn.user));
          setSignedInByCode(true);
        } else if (left) {
          // Left by a session that is gone: nothing more to do.
          void forgetUnfinished();
        }
        if (!announced) setSession(stored);
        setIsRestoring(false);
      })
      .catch(() => {
        // Nothing that could be read is nothing stored: the way in is the
        // welcome screen, not a splash screen that never ends.
        if (active) setIsRestoring(false);
      });

    // Covers sign-in, sign-out, token refresh and expiry from one place, so no
    // screen has to remember to update the session itself.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') signOutsAnnounced += 1;
      if (!active) return;
      // Nothing is finished without the session a code brought. Every sign-out
      // is announced, the app's own included (see signOutsAnnounced).
      if (event === 'SIGNED_OUT') {
        setSignedInByCode(false);
        setUnfinished(null);
        void forgetUnfinished();
      }
      // The client also says "no session" when it only could not renew one
      // just now. Whoever is signed in stays so for as long as the session is
      // on this device; the client removes it before it announces a sign-out.
      if (next === null && event !== 'SIGNED_OUT' && isSessionStored()) return;
      if (next && signedOutUnheard) {
        // Nobody signed in. Signing out is finished instead: the server is
        // told, and what the client has just saved goes with it.
        void underWay(supabase.auth.signOut()).catch(() => {});
        return;
      }
      announced = true;
      announcedSession = next;
      setSession(next);
      setIsRestoring(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const signOut = () => signOutHere(() => setSession(null));

    async function signUp({ email, password, username, displayName }: SignUpDetails) {
      await beforeSigningIn();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Read by the handle_new_user() trigger to build the profile row.
          data: {
            username: normaliseUsername(username),
            display_name: displayName.trim(),
          },
        },
      });
      // An address that has an account already is answered as a new one is,
      // and the form says what is true of both: a code is on its way if the
      // address is new, and if it has an account, signing in is the way in.
      // Telling the two apart would let anyone check who has an account here.
      // The auth server tells by itself - "User already registered" - while
      // confirmation by phone is off (GO-LIVE), but at least the app does not.
      // A code that went to the address a moment ago is one on its way too.
      if (isAnswer(error, 'user_already_exists', 'user already registered')) {
        // Unless the server confirms nothing by email. A new address is
        // signed in at once then, and there is no code to wait for: the plain
        // answer tells nobody anything that signing in at once has not.
        if (await signsInAtOnce()) throw new Error(ALREADY_REGISTERED, { cause: error });
        return { needsEmailConfirmation: true };
      }
      if (isCodeJustSent(error)) return { needsEmailConfirmation: true };
      if (error) throw explained(error);

      // With email confirmation enabled, Supabase creates the user but hands
      // back no session. With it disabled, the session arrives immediately and
      // onAuthStateChange signs the user straight in.
      return { needsEmailConfirmation: data.session === null };
    }

    /**
     * Deletes the account signed in to, and signs this device out. `farewell`
     * leaves the welcome screen its word that the account has been deleted:
     * for the deletion the courier asks for, not for an account a code had
     * only just confirmed, which is removed to start again (see
     * removeUnfinishedAccount and finishSignUp).
     */
    async function removeAccount(farewell: boolean) {
      const { error } = await supabase.rpc('delete_own_account');
      if (error) {
        // A refusal is an answer: the account is still there, and the
        // database's reason has words of its own.
        const refusal = toRpcError(error, COULD_NOT_DELETE);
        if (refusal.reason) throw refusal;

        // Anything else says nothing about the account. The request may
        // have been carried out and only its answer lost, and "could not be
        // deleted" would then leave the courier signed in to nothing. The
        // auth server knows whether the account is still there.
        const { data, error: unanswered } = await supabase.auth
          .getUser()
          .catch(() => ({ data: { user: null }, error: null }));
        if (data.user) throw new Error(COULD_NOT_DELETE, { cause: error });
        if (!isAccountGone(unanswered)) {
          throw new Error(
            'Your account may or may not have been deleted - no answer came back. ' +
              'Check again once you are online.',
            { cause: error },
          );
        }
      }
      // The session belongs to a user that no longer exists, and is ended on
      // this device. The server is not asked: it has no session left to end,
      // and answered with an error, user_not_found. (Found in the browser.)
      // After a deletion the courier asked for, the app returns to the
      // welcome screen, which is told why.
      if (farewell) noteAccountDeleted();
      await signOutHere(() => setSession(null), false);
    }

    /** The deletion the courier asks for. */
    const deleteAccount = () => removeAccount(true);

    /**
     * Checks a code from an email after which a password is set, for `left`.
     * The way in is held from before the code goes - the session it brings is
     * announced while the answer is still arriving - and on past the check,
     * once the code has signed the courier in, until the password is saved.
     * What the code is for is kept on the device before it goes, too: the
     * client keeps the session the moment the code is answered. Resolves with
     * the account the code signed in to.
     */
    async function checkCode(type: 'signup' | 'recovery', code: string, left: Unfinished) {
      // First, before anything is kept: a sign-out still under way would
      // remove the session the code brings, and the moment it is announced it
      // forgets what the code is for.
      await beforeSigningIn();
      setCodesOut((count) => count + 1);
      setUnfinished(left);
      // Not kept, the code is checked all the same, as it was before this.
      await keepUnfinished(left).catch(() => {});
      const checked = await settled(
        supabase.auth.verifyOtp({ type, email: left.email, token: code }),
      );
      if (checked.ok && !checked.value.error) setSignedInByCode(true);
      setCodesOut((count) => count - 1);
      if (!checked.ok) throw checked.error;
      if (checked.value.error) throw explained(checked.value.error);
      return checked.value.data.user;
    }

    /** Done: the way into the app opens, and nothing is left on the device to do. */
    async function finished() {
      setSignedInByCode(false);
      setUnfinished(null);
      await forgetUnfinished();
    }

    async function removeUnfinishedAccount() {
      // Signs out once it is gone, which lets go of the way in. No deletion
      // the courier asked for, and nothing for the welcome screen to say.
      await removeAccount(false);
      await forgetUnfinished();
    }

    async function finishSignUp(details: SignUpDetails): Promise<'signed in' | 'new code'> {
      // GoTrue leaves an account that is waiting for its code as the first
      // sign-up for the address made it: a second sign-up sends a new code
      // and changes nothing else. That first sign-up may have been anyone's -
      // someone who typed this address, with a password they would go on
      // knowing once its owner had confirmed the account. The database takes
      // that password away as the code confirms the address (migration
      // 20261121160000), and the password is the one typed now, set at once:
      // the session the code brought is seconds old, and nobody else holds
      // one. Being the password the account has already - on a server
      // without that migration - is no refusal.
      const { error } = await supabase.auth.updateUser({ password: details.password });
      // The session the code brought has been ended elsewhere: by a change of
      // the password, which ends every other session - and nobody but whoever
      // knew a password for the account could have made one. It may well be
      // theirs now. Without the migration the auth server allows that for as
      // long as it takes to set the courier's own password, one request, and
      // the app can do no more than say so, signed out. (Found in review.)
      if (isAuthSessionMissingError(error)) {
        await signOut().catch(() => {});
        throw new SignedOutUnfinished(SIGN_IN_ENDED, { cause: error });
      }
      if (error && !isAnswer(error, 'same_password', 'different from the old password')) {
        throw explained(error);
      }

      // And the account as the courier set it up.
      const { data: held } = await supabase.auth.getSession();
      const id = held.session?.user.id ?? '';
      const { data: account, error: unread } = await supabase
        .from('profiles')
        .select('username, display_name')
        .eq('id', id)
        .maybeSingle();
      if (unread) throw toRpcError(unread, 'Your account could not be loaded just now. Try again.');

      // A username cannot be changed, so an account an earlier sign-up gave
      // another one is set up again from what was typed. Nothing can have
      // been done with it: the code confirmed it only now.
      if (account && account.username !== normaliseUsername(details.username)) {
        await removeAccount(false);
        // The provider's signUp, not the client's: it waits for any sign-out
        // still under way, as every way of signing in must.
        const again = await settled(signUp(details));
        if (!again.ok) {
          throw new SignedOutUnfinished(
            'This address had an account waiting for its code already, set up with another ' +
              'username, and it has been removed to make way for yours. Yours could not be ' +
              `set up just now: ${wordsOf(again.error)} ` +
              'Go back to the form to set it up again.',
            { cause: again.error },
          );
        }
        return again.value.needsEmailConfirmation ? 'new code' : 'signed in';
      }
      // The name can be changed at any time, and is the one typed now. Left
      // as it was if it cannot be: the profile shows it, and can change it.
      if (account && account.display_name !== details.displayName.trim()) {
        await supabase
          .from('profiles')
          .update({ display_name: details.displayName.trim() })
          .eq('id', id);
      }

      // The account is the courier's, and the way into the app opens.
      await finished();
      return 'signed in';
    }

    return {
      session,
      isRestoring,
      isSettingPassword,
      // Once the code has signed the courier in, and only while it holds the
      // way in: a check that was refused leaves it behind.
      unfinished: signedInByCode ? unfinished : null,

      async signIn(email, password) {
        await beforeSigningIn();
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        // Said only once the password has been found right: the address is
        // still waiting for its code, and the form asks for it.
        if (isAnswer(error, 'email_not_confirmed', 'email not confirmed')) {
          return { needsEmailConfirmation: true };
        }
        // A suspended account - or the ban an account the operator removed
        // leaves on its address for two years. The auth server says so before
        // it has looked at the password, so whoever typed the address would
        // learn that it had an account, and what became of it: said as a
        // wrong password is. Someone who proves the address theirs, with the
        // code from "I forgot my password", is told.
        if (isAnswer(error, 'user_banned', 'user is banned')) {
          throw new Error(describeAuthError(NO_MATCH), { cause: error });
        }
        if (error) throw explained(error);
        // Signed in with a password the account has: whatever a code once
        // left to do on this device is not for this session.
        await forgetUnfinished();
        return { needsEmailConfirmation: false };
      },

      signUp,

      async confirmEmail(email, code) {
        await checkCode('signup', code, { flow: 'sign-in', email: email.trim() });
      },

      async finishSignIn(password) {
        // Confirming the address took the account's password away, so that
        // nobody's password from before it was confirmed signs in to it. The
        // courier's own is the one the server has just found right, and is
        // set again. A server that still has it answers that it is the same:
        // done all the same.
        const { error } = await supabase.auth.updateUser({ password });
        if (isAuthSessionMissingError(error)) {
          await signOut().catch(() => {});
          throw new SignedOutUnfinished(SIGN_IN_ENDED_BEFORE_SAVED, { cause: error });
        }
        if (error && !isAnswer(error, 'same_password', 'different from the old password')) {
          throw explained(error);
        }
        await finished();
      },

      async confirmSignUp(details, code) {
        await checkCode('signup', code, {
          flow: 'sign-up',
          email: details.email.trim(),
          username: details.username,
          displayName: details.displayName,
        });
      },

      finishSignUp,

      removeUnfinishedAccount,

      async resendConfirmationCode(email) {
        const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
        if (error) throw explained(error);
      },

      signOut,

      async sendPasswordReset(email) {
        // No address to return to: the email carries a code to type in, and no
        // link that could bring a session back through the app's URL scheme.
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        // For an address without an account the auth server answers alike
        // every time, and sends nothing: it answers before it comes to
        // sending. Three answers come only for an address that has one: a code
        // went to it less than a minute ago, the email to it could not be
        // sent, or the project has sent all the emails it may for the hour -
        // a limit on sending, never met where nothing is sent. All three are
        // taken for sent, or they would tell anyone who asked which addresses
        // have an account; the screen that follows says what to do when no
        // code arrives.
        if (error && !isCodeJustSent(error) && !isSendingFailure(error) && !isEmailLimit(error)) {
          throw explained(error);
        }
      },

      async verifyResetCode(email, code) {
        const user = await checkCode('recovery', code, { flow: 'reset', email: email.trim() });
        if (!user || !confirmedByResetCode(user)) return 'signed in';

        // The code is what confirmed the address: the account was one a
        // sign-up had left waiting for its code - the courier's own from
        // another day, or someone else's, with that sign-up's password,
        // username and name. A new password would make it the courier's with
        // the rest as it was, and a username cannot be changed. It is removed
        // instead: nothing can have been done with it before now. Until it is
        // gone, the way in is held, here and after a relaunch. (Found in
        // review.)
        const left: Unfinished = { flow: 'reset', email: email.trim(), remove: true };
        setUnfinished(left);
        await keepUnfinished(left).catch(() => {});
        await removeUnfinishedAccount();
        return 'removed';
      },

      async setNewPassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        // Signed in by the code all the same: the screen says so, and the
        // courier can try another password, or sign out.
        if (error) throw explained(error);
        // The reset is finished, and the way into the app opens.
        await finished();
      },

      deleteAccount,
    };
  }, [session, isRestoring, isSettingPassword, signedInByCode, unfinished]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

/**
 * Signs this device out; `forget` lets go of the session the provider holds,
 * and `tellServer` false skips asking the server first - for an account that
 * has just been deleted, whose sessions went with it.
 *
 * Out here, not in the provider, on purpose. A real build compiles the provider
 * with the React Compiler, which takes a module variable for a value that does
 * not change while a function of the component runs: it compiled the snapshot
 * below away, compared the count with itself, and announced every sign-out
 * twice. (Found in the merged tree, in the bundle and in Jest run compiled.)
 * The compiler leaves functions outside components and hooks as they are.
 */
function signOutHere(forget: () => void, tellServer = true): Promise<void> {
  return underWay(signOutOfDevice(forget, tellServer));
}

async function signOutOfDevice(forget: () => void, tellServer: boolean): Promise<void> {
  const announcedBefore = signOutsAnnounced;
  // The server is asked first: only that ends the session on the courier's
  // other devices as well. But not for long. To be told, it may first need the
  // session renewed, and without a network the client tries that for half a
  // minute - and every sign-out shares a renewal already under way, the one at
  // the app's start included. "Sign out" spun for 25 to 40 seconds. (Found in
  // the merged tree and in the browser.)
  const told = tellServer
    ? supabase.auth.signOut().then(
        ({ error }) => !error,
        () => false,
      )
    : Promise.resolve(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const heard = await Promise.race([
    told,
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), SERVER_SIGN_OUT_WAIT_MS);
    }),
  ]);
  clearTimeout(timer);
  if (heard) return;

  // It was not told, or cannot be known to have been. Signing out signs this
  // device out all the same - and the client does not see to that by itself:
  // with a token over an hour old and no network, it gives up before it has
  // removed anything.
  signedOutUnheard = true;
  // What the server has not heard the end of, should it be told after all.
  const left = tellServer ? await readStoredSession().catch(() => null) : null;
  try {
    await clearStoredSession();
  } catch (cause) {
    // Still signed in, then, and to be treated as such - once the client is
    // done with the server: left running, its sign-out could still sign the
    // device out after this one was said to have failed.
    signedOutUnheard = false;
    if (await told) return;
    throw new Error('This device could not be signed out. Try again.', { cause });
  }
  forget();

  // The client may still be at it, renewing and then telling the server. If it
  // gets that far, or finds nothing stored any more, it removes the session
  // itself and announces that; whether it has is known once it is done. A
  // renewal that comes back now, though, it throws away, the session being no
  // longer stored, and then it tells the server nothing (see below).
  await told;

  // The client has then announced no sign-out either, and whatever listens to
  // it would go on holding the account. With nothing stored any more, signing
  // out on this device alone sends nothing, and is announced. Where the client
  // did remove the session - as it does when its token is still fresh - it has
  // announced that already, and once is enough. Nor is it announced over
  // someone who has signed in meanwhile.
  if (signOutsAnnounced === announcedBefore && signedOutUnheard) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }

  // A token the client had to renew before it could tell the server: the
  // server may have heard nothing although the network is back. Not waited for
  // here - the device is signed out - but whoever signs in next waits for it.
  if (left && signedOutUnheard && hasRunOut(left)) {
    void underWay(tellServerAfterAll(left)).catch(() => {});
  }
}

/**
 * How long signing out waits for the server to hear of it before this device
 * lets go regardless. Enough for a slow connection to renew the session and
 * tell the server; a sign-out that does not get through in this time is seldom
 * going to. The client goes on meanwhile, and a request it has sent may still
 * get through. A token it had to renew first is another matter: it throws away
 * a renewal that comes back after the device has let go, and tells the server
 * nothing. So the server is told once more when the client is done
 * (tellServerAfterAll), which reaches it if the network is back by then; after
 * that, nothing tells it.
 */
const SERVER_SIGN_OUT_WAIT_MS = 5000;

/**
 * Tells the server of a sign-out once more, for a session whose token had run
 * out when the device let go. The client renews such a token before it can
 * tell the server, and a renewal that comes back once the session is no longer
 * stored it throws away: the server heard nothing, however soon the network
 * was back. (Found in review.)
 *
 * As the client would have: with the token the session had, which is enough
 * where the server's clock does not agree that it has run out, and when the
 * server says no, with a renewed one. Nothing is kept or announced on the way:
 * nobody is signed in with it. When the server cannot be reached, the first
 * request fails - without a network, at once - and nothing more is tried.
 */
async function tellServerAfterAll(left: Session): Promise<void> {
  const { error } = await supabase.auth.admin.signOut(left.access_token, 'global');
  // Heard, or not reachable, and that is that. A session that is over already
  // is refused its renewal as well.
  if (!isAuthApiError(error)) return;
  const renewed = await renewedWithoutKeeping(left.refresh_token);
  if (renewed) await supabase.auth.admin.signOut(renewed.access_token, 'global');
}

/**
 * The client's renewal of a session, without its keeping or announcing what
 * comes back. Not public in auth-js 2.112: the tests beside this file run the
 * real client, and fail if an update renames it or changes what it returns.
 */
async function renewedWithoutKeeping(refreshToken: string): Promise<Session | null> {
  const client = supabase.auth as unknown as {
    _refreshAccessToken?: (token: string) => Promise<{ data: { session: Session | null } | null }>;
  };
  if (typeof client._refreshAccessToken !== 'function') return null;
  const { data } = await client._refreshAccessToken(refreshToken);
  return data?.session ?? null;
}

/**
 * Whether the client renews this session's token before it uses it: from a
 * minute and a half before it runs out (EXPIRY_MARGIN_MS in auth-js 2.112).
 */
const hasRunOut = (session: Session) =>
  session.expires_at !== undefined && session.expires_at * 1000 - Date.now() < 90_000;

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside an AuthProvider');
  return value;
}

const COULD_NOT_DELETE = 'Your account could not be deleted. Please try again.';

/**
 * Whether the auth server has said that the account asked about does not
 * exist. Only its own words count: a gateway answers 404 as well, for an
 * address it does not know, and that says nothing about anyone's account.
 */
const isAccountGone = (error: AuthError | null) =>
  isAuthApiError(error) &&
  (error.code === 'user_not_found' || /user (not found|.* does not exist)/i.test(error.message));

/**
 * The one failure of signing up that belongs to a field. The form looks for
 * these words, to show them where the username is typed.
 */
export const USERNAME_MAY_BE_TAKEN = 'That username may already be taken. Try another.';

/**
 * Thrown when finishing what a code was for has left the courier signed out:
 * by `finishSignUp` when the account an earlier sign-up made has been removed
 * to make way for theirs, and theirs could not be set up; by it and by
 * `finishSignIn` when the session the code brought was ended elsewhere. The
 * code screen is the way on, with the reason.
 */
export class SignedOutUnfinished extends Error {}

const SIGN_IN_ENDED =
  'Your sign-in ended before your account was finished: someone who knew a password set ' +
  'for this address before yours may have changed it. Write to the contact address on the ' +
  'help page, and the account can be removed so that you can sign up again.';

const SIGN_IN_ENDED_BEFORE_SAVED =
  'Your sign-in ended before your password was saved again. Your address is confirmed: ' +
  'set a password with "I forgot my password", and sign in with it.';

/**
 * What is left to do as it is to be taken up: for a reset, with whether its
 * code is what confirmed the account, as `user` shows - the app may have been
 * closed before it could say so.
 */
const withRemoval = (left: Unfinished, user: User): Unfinished =>
  left.flow === 'reset'
    ? { ...left, remove: left.remove === true || confirmedByResetCode(user) }
    : left;

/**
 * Said for an address that has an account already, when the auth server
 * confirms nothing by email. The form looks for these words, to show them at
 * the address and offer the way to sign in.
 */
export const ALREADY_REGISTERED =
  'There is already an account with that email address. Sign in instead.';

/**
 * What this file needs of the auth client that auth-js keeps to itself: the
 * address it reaches the auth server at, the headers with the key it asks
 * with, and the app's own fetch, time limit and all. auth-js has no call for
 * the server's settings; the auth context tests go through the real client,
 * and would see this stop working.
 */
type AuthClientInside = { url: string; headers: Record<string, string>; fetch: typeof fetch };

/**
 * Whether the auth server signs a new account in at once, with no code to
 * confirm its address: its `mailer_autoconfirm`, from the settings it shows
 * anyone. Taken for no when that cannot be found out - the form then says
 * what is true either way.
 */
async function signsInAtOnce(): Promise<boolean> {
  const { url, headers, fetch: send } = supabase.auth as unknown as AuthClientInside;
  try {
    const response = await send(`${url}/settings`, { headers });
    if (!response.ok) return false;
    const settings = (await response.json()) as { mailer_autoconfirm?: unknown } | null;
    return settings?.mailer_autoconfirm === true;
  } catch {
    return false;
  }
}

/**
 * Said for a code from an email that was not taken. Mistyped, run out, used
 * already or replaced by a newer one, the auth server answers each alike, so
 * the words fit them all. The forms look for them, to show them at the code.
 */
export const CODE_DID_NOT_WORK =
  'That code did not work. Check it against the newest email, or ask for a new one.';

/**
 * Whether the auth server answered with `code`, or in the words it gave
 * before it had codes: it says both today, with the app's API version.
 */
const isAnswer = (error: AuthError | null, code: string, words: string) =>
  error !== null && (error.code === code || error.message.toLowerCase().includes(words));

/** The answer for an email asked for within a minute of the last one to the address. */
const CODE_JUST_SENT = /only request this after (\d+) seconds?/;

const isCodeJustSent = (error: AuthError | null) =>
  error !== null && CODE_JUST_SENT.test(error.message.toLowerCase());

const isSendingFailure = (error: AuthError) =>
  error.message.toLowerCase().includes('error sending');

/** The answer once the project has sent all the emails it may for the hour. */
const isEmailLimit = (error: AuthError) => error.message.toLowerCase().includes('email rate limit');

/** The auth server's answer to a password that does not match the address. */
const NO_MATCH = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');

const NO_CONNECTION = 'No connection. Check your network and try again.';
const NOT_ANSWERING = 'The server is not answering as it should. Try again in a little while.';

/**
 * What went wrong, in words the person can act on.
 *
 * The auth server's messages are written for developers. These go by what it
 * says - its real answers, each as it comes, are in the test beside this file.
 * Whatever has no words here is kept in brackets behind a plain sentence, and
 * the callers keep the error itself as the cause, so that a failure nobody
 * foresaw stays diagnosable.
 */
function describeAuthError(error: AuthError): string {
  const said = error.message.toLowerCase();

  if (said.includes('invalid login credentials')) {
    return 'That email and password do not match an account.';
  }
  if (error.code === 'otp_expired' || said.includes('token has expired or is invalid')) {
    return CODE_DID_NOT_WORK;
  }
  // The profile is made by a trigger as the account is saved, and whatever
  // the trigger refuses, the auth server reports as this, with no reason - a
  // name with nothing to see in it as well as a taken username. The form
  // checks all the trigger checks but one, the name by the database's own
  // rules included: whether the username is free. So that is the likely
  // cause - likely, which is all that can be said.
  if (said.includes('database error saving new user')) return USERNAME_MAY_BE_TAKEN;
  if (said.includes('user is banned')) return REFUSALS.account_suspended;
  // The form refuses such addresses itself, in the same words.
  if (said.includes('unable to validate email address')) return EMAIL_NOT_ACCEPTED;
  if (said.includes('email address is too long')) return EMAIL_TOO_LONG;
  if (said.includes('error sending')) return 'The email could not be sent. Try again later.';

  // Two limits on emails. One is per address, a minute or so apart; the other
  // is the whole project's allowance, counted by the hour, which no minute's
  // wait - and nothing the person does - brings back. Every email carries a
  // code. The local servers wait a second, and count what is left down to 0.
  const wait = CODE_JUST_SENT.exec(said);
  if (wait) {
    const seconds = Number(wait[1]);
    return `A code was sent a moment ago. Ask for a new one in ${seconds > 1 ? `${seconds} seconds` : 'a second'}.`;
  }
  if (said.includes('email rate limit')) {
    return 'Too many emails have been sent for now. Try again in an hour.';
  }
  if (said.includes('rate limit') || error.status === 429) {
    return 'Too many attempts. Wait a minute and try again.';
  }

  if (said.includes('signups not allowed')) return 'New accounts cannot be created at the moment.';
  const shortest = /password should be at least (\d+) characters/.exec(said);
  if (shortest) return `Passwords need at least ${shortest[1]} characters.`;
  // "Characters" in the server's words, but it counts bytes: the form says
  // which, and says it first.
  if (said.includes('password cannot be longer than')) return PASSWORD_TOO_LONG;
  if (said.includes('different from the old password')) {
    return 'The new password has to differ from the old one.';
  }

  // Not the auth server's answer at all. Either the request never arrived -
  // status 0, and a page put in its place by the network counts as that - or
  // what came back was a gateway's error, or something that is not an answer.
  if (isAuthRetryableFetchError(error)) return error.status === 0 ? NO_CONNECTION : NOT_ANSWERING;
  if (error instanceof AuthUnknownError) return NOT_ANSWERING;

  const unexplained = 'That did not work. Try again.';
  return error.message ? `${unexplained} (${error.message})` : unexplained;
}

/** The error to throw for a refusal of the auth server's: the app's words, over the server's own. */
const explained = (error: AuthError) => new Error(describeAuthError(error), { cause: error });
