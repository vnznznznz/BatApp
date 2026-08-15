import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

import { normaliseUsername } from '@/features/auth/validation';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsRestoring(false);
    });

    // Covers sign-in, sign-out, token refresh and expiry from one place, so no
    // screen has to remember to update the session itself.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setIsRestoring(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isRestoring,

      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(describeAuthError(error.message));
      },

      async signUp({ email, password, username, displayName }) {
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

      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw new Error(describeAuthError(error.message));
      },

      async sendPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) throw new Error(describeAuthError(error.message));
      },

      async deleteAccount() {
        const { error } = await supabase.rpc('delete_own_account');
        if (error) throw new Error('Your account could not be deleted. Please try again.');
        // The session belongs to a user that no longer exists; clearing it
        // locally is what returns the app to the welcome screen.
        await supabase.auth.signOut();
      },
    }),
    [session, isRestoring],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside an AuthProvider');
  return value;
}

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
