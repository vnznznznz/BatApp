import { isAuthApiError, type AuthError, type Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

import { normaliseUsername } from '@/features/auth/validation';
import { toRpcError } from '@/lib/rpc-error';
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
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Resolves with whether the account still needs an emailed confirmation
   * before it can be used. That depends on a project setting rather than on
   * anything the app controls, so it is reported rather than assumed.
   */
  signUp: (details: SignUpDetails) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
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
 * Signing in or up, which the person does, clears it; so must any other way
 * of signing in that is added here.
 */
let signedOutUnheard = false;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

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
      if (!active) return;
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
    }

    return {
      session,
      isRestoring,

      async signIn(email, password) {
        signedOutUnheard = false;
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(describeAuthError(error.message));
      },

      async signUp({ email, password, username, displayName }) {
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
        if (error) throw new Error(describeAuthError(error.message));

        // With email confirmation enabled, Supabase creates the user but hands
        // back no session. With it disabled, the session arrives immediately and
        // onAuthStateChange signs the user straight in.
        return { needsEmailConfirmation: data.session === null };
      },

      signOut,

      async sendPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) throw new Error(describeAuthError(error.message));
      },

      async deleteAccount() {
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
      },
    };
  }, [session, isRestoring]);

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
 * Supabase's messages are written for developers. These are the ones a user can
 * actually act on; anything else is passed through rather than swallowed, so an
 * unexpected failure stays diagnosable.
 */
function describeAuthError(message: string): string {
  const normalised = message.toLowerCase();

  if (normalised.includes('invalid login credentials')) {
    return 'That email and password do not match an account.';
  }
  if (normalised.includes('email not confirmed')) {
    return 'Check your email and confirm your address first.';
  }
  if (normalised.includes('user already registered')) {
    return 'There is already an account with that email address.';
  }
  if (normalised.includes('duplicate key') && normalised.includes('username')) {
    return 'That username is taken. Try another.';
  }
  if (normalised.includes('rate limit') || normalised.includes('too many requests')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (normalised.includes('network') || normalised.includes('fetch')) {
    return 'No connection. Check your network and try again.';
  }
  return message;
}
