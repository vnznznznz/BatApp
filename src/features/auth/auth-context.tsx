import {
  AuthApiError,
  AuthUnknownError,
  isAuthApiError,
  isAuthRetryableFetchError,
  type AuthError,
  type Session,
} from '@supabase/supabase-js';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  EMAIL_NOT_ACCEPTED,
  EMAIL_TOO_LONG,
  normaliseUsername,
  PASSWORD_TOO_LONG,
} from '@/features/auth/validation';
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
   * of a password reset, or the one typed at sign-up, with the rest of the
   * account as they set it up. From the moment the code goes until that is
   * done, or the courier signs out. The root layout holds the way into the
   * app meanwhile: in it they would be signed in with a password they do not
   * know - and after signing up, perhaps someone else does.
   */
  isSettingPassword: boolean;
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
   * and the address still waiting for its code.
   */
  confirmEmail: (email: string, code: string) => Promise<void>;
  /**
   * Confirms the address of an account just signed up for, with the code
   * emailed to it. That signs the courier in, and holds the way in until
   * `finishSignUp` has made the account the one they set up.
   */
  confirmSignUp: (email: string, code: string) => Promise<void>;
  /**
   * Makes the account a sign-up's code has confirmed the one set up with
   * `details`: its password, then its username and name. Resolves 'signed in'
   * once it is, and the way into the app opens; or 'new code' when an earlier
   * sign-up had given it another username, and it has been set up again from
   * `details`, with a new code on its way. Rejects, signed in and held, when
   * that could not be done.
   */
  finishSignUp: (details: SignUpDetails) => Promise<'signed in' | 'new code'>;
  /** Emails a new code for confirming the address. The one before stops working. */
  resendConfirmationCode: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Emails a code for setting a new password, if the address has an account. */
  sendPasswordReset: (email: string) => Promise<void>;
  /**
   * Checks the code from a reset email. That signs the courier in, holding the
   * way in, and the reset is finished by `setNewPassword`.
   */
  verifyResetCode: (email: string, code: string) => Promise<void>;
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
 * Signing in or up, which the person does, clears it, as does each code from
 * an email; so must any other way of signing in that is added here.
 */
let signedOutUnheard = false;

/**
 * How many sign-outs the client has announced. Whatever else the app keeps for
 * the signed-in account - the letters not sent yet - listens to the client,
 * not to this provider, and lets go of the account when the client announces
 * a sign-out. So a sign-out the app finishes by itself still has to be
 * announced by the client, and only once: this says whether it already was.
 */
let signOutsAnnounced = 0;

/**
 * The count as it is at the moment of asking. Read through this, never
 * straight from the variable inside the provider: the React Compiler takes a
 * module-level value for one that does not change, and turned "the count
 * before signing out" into a second read of the count after it - so in a
 * real build a sign-out without a network was announced twice.
 */
const signOutsSoFar = () => signOutsAnnounced;

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

  useEffect(() => {
    let active = true;
    // Set once the client has said who is signed in. What was read from the
    // keychain before that is older news, and must not overrule it.
    let announced = false;

    // Signed in or not is a question about this device, so the keychain
    // answers it. The client's own answer waits for the server: after an hour
    // away it first renews the token, and without a network that was half a
    // minute of splash screen followed by "nobody" - for someone signed in.
    readStoredSession()
      .then((stored) => {
        if (!active) return;
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
      if (event === 'SIGNED_OUT') setSignedInByCode(false);
      // The client also says "no session" when it only could not renew one
      // just now. Whoever is signed in stays so for as long as the session is
      // on this device; the client removes it before it announces a sign-out.
      if (next === null && event !== 'SIGNED_OUT' && isSessionStored()) return;
      if (next && signedOutUnheard) {
        // Nobody signed in. Signing out is finished instead: the server is
        // told, and what the client has just saved goes with it.
        void supabase.auth.signOut().catch(() => {});
        return;
      }
      announced = true;
      setSession(next);
      setIsRestoring(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    async function signOut() {
      const announcedBefore = signOutsSoFar();
      // The server is asked first: only that ends the session on the
      // courier's other devices as well.
      const heard = await supabase.auth.signOut().then(
        ({ error }) => !error,
        () => false,
      );
      if (heard) return;

      // It was not told, or cannot be known to have been. Signing out signs
      // this device out all the same - and the client does not see to that
      // by itself: with a token over an hour old and no network, it gives up
      // before it has removed anything.
      signedOutUnheard = true;
      try {
        await clearStoredSession();
      } catch (cause) {
        // Still signed in, then, and to be treated as such.
        signedOutUnheard = false;
        throw new Error('This device could not be signed out. Try again.', { cause });
      }
      setSession(null);

      // The client has then announced no sign-out either, and whatever listens
      // to it would go on holding the account. With nothing stored any more,
      // signing out on this device alone sends nothing, and is announced.
      // Where the client did remove the session - as it does when its token is
      // still fresh - it has announced that already, and once is enough.
      if (signOutsSoFar() === announcedBefore) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    }

    async function signUp({ email, password, username, displayName }: SignUpDetails) {
      signedOutUnheard = false;
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

    async function deleteAccount() {
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
      // The session belongs to a user that no longer exists; ending it on
      // this device is what returns the app to the welcome screen.
      await signOut();
    }

    /**
     * Checks a code from an email after which a password is set. The way in
     * is held from before the code goes - the session it brings is announced
     * while the answer is still arriving - and on past the check, once the
     * code has signed the courier in, until the password is saved.
     */
    async function checkCode(type: 'signup' | 'recovery', email: string, code: string) {
      signedOutUnheard = false;
      setCodesOut((count) => count + 1);
      try {
        const { error } = await supabase.auth.verifyOtp({ type, email: email.trim(), token: code });
        if (error) throw explained(error);
        setSignedInByCode(true);
      } finally {
        setCodesOut((count) => count - 1);
      }
    }

    async function finishSignUp(details: SignUpDetails): Promise<'signed in' | 'new code'> {
      // GoTrue leaves an account that is waiting for its code as the first
      // sign-up for the address made it: a second sign-up sends a new code
      // and changes nothing else. That first sign-up may have been anyone's -
      // someone who typed this address, with a password they would go on
      // knowing once its owner had confirmed the account. So the password is
      // the one typed now, set at once: the session the code brought is
      // seconds old, and nobody else holds one. Being the password the
      // account has already is no refusal.
      const { error } = await supabase.auth.updateUser({ password: details.password });
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
        await deleteAccount();
        try {
          const { needsEmailConfirmation } = await signUp(details);
          return needsEmailConfirmation ? 'new code' : 'signed in';
        } catch (cause) {
          throw new SetUpAgainFailed(
            'This address had an account waiting for its code already, set up with another ' +
              'username, and it has been removed to make way for yours. Yours could not be ' +
              `set up just now: ${cause instanceof Error ? cause.message : String(cause)} ` +
              'Go back to the form to set it up again.',
            { cause },
          );
        }
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
      setSignedInByCode(false);
      return 'signed in';
    }

    return {
      session,
      isRestoring,
      isSettingPassword,

      async signIn(email, password) {
        signedOutUnheard = false;
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
        return { needsEmailConfirmation: false };
      },

      signUp,

      async confirmEmail(email, code) {
        signedOutUnheard = false;
        const { error } = await supabase.auth.verifyOtp({
          type: 'signup',
          email: email.trim(),
          token: code,
        });
        if (error) throw explained(error);
      },

      confirmSignUp: (email, code) => checkCode('signup', email, code),

      finishSignUp,

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

      verifyResetCode: (email, code) => checkCode('recovery', email, code),

      async setNewPassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        // Signed in by the code all the same: the screen says so, and the
        // courier can try another password, or sign out.
        if (error) throw explained(error);
        // The reset is finished, and the way into the app opens.
        setSignedInByCode(false);
      },

      deleteAccount,
    };
  }, [session, isRestoring, isSettingPassword]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

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
 * Thrown by `finishSignUp` when the account an earlier sign-up made has been
 * removed to make way for the courier's, and theirs could not be set up: the
 * one failure of it that leaves them signed out, and the form the way on.
 */
export class SetUpAgainFailed extends Error {}

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
