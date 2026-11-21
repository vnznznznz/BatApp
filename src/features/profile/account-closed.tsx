import { useState } from 'react';

import { Button } from '@/components/button';
import { useAuth } from '@/features/auth/auth-context';
import { notify } from '@/lib/confirm';
import { CONTACT_URL, openLink } from '@/lib/links';
import { messageOf } from '@/lib/rpc-error';

/**
 * What is left to do with an account the server no longer serves - one that is
 * gone: sign out, or write to the person who runs Night Courier. Shown in
 * place of "Try again", which cannot help, beside the words that say why.
 * (Found in the merged tree: the roost and the compose screen offered "Try
 * again" under "All that is left to do is to sign out".)
 */
export function AccountClosedActions() {
  const { signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);

  // Written with `then` rather than try and finally on purpose: the React
  // Compiler leaves out a whole component that has a `finally` in it.
  function leave() {
    setLeaving(true);
    void signOut().then(
      () => setLeaving(false),
      (caught: unknown) => {
        setLeaving(false);
        notify('Could not sign out', messageOf(caught, 'Please try again.'));
      },
    );
  }

  return (
    <>
      <Button label="Sign out" variant="secondary" loading={leaving} onPress={leave} />
      {CONTACT_URL ? (
        <Button label="Contact" variant="ghost" onPress={() => void openLink(CONTACT_URL)} />
      ) : null}
    </>
  );
}
