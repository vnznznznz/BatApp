-- Night Courier - no password from before an address was confirmed.
--
-- Supabase Auth leaves an account that is waiting for the code emailed to its
-- address as the first sign-up for that address made it: a second sign-up
-- sends a new code and changes nothing else. Whoever signed up first - anyone
-- who typed the address - chose the account's password, and that password
-- worked from the moment the owner of the address typed the code. The app
-- sets the owner's own password straight after, but until that request
-- arrived the earlier one signed in, and an access token taken with it stayed
-- good for up to an hour after the change. (Found in review.)
--
-- So the password goes as the address is confirmed, in the same statement:
-- from then on no password signs in to the account until one is set with the
-- session the code brought. The app sets the password typed at sign-up after
-- a sign-up's code, the one typed at sign-in after the code that sign-in
-- asked for, and the new one after a reset's code (src/features/auth).
--
-- An operator who confirms an account by hand clears its password too, when a
-- code to confirm it had been emailed: its owner then sets one with "I forgot
-- my password", which emails a code of its own.

/* -------------------------------------------------------------------------- */
/* The trigger                                                                 */
/* -------------------------------------------------------------------------- */

-- Only for an account a code to confirm its address was emailed to, as every
-- sign-up is while confirmation is on. With it off, the auth server inserts
-- each new account unconfirmed and confirms it with an update in the same
-- request (GoTrue v2.197, counted on the local stack): nothing was emailed,
-- the password is the one just chosen by whoever is signing up, and it has to
-- stay. So does one the operator sets on an account made confirmed.
--
-- Not SECURITY DEFINER, unlike the other triggers on auth.users: it reaches
-- for nothing but the row being written, which is the writer's to change. A
-- trigger fires whether or not its function may be called, so none may.
create or replace function private.clear_password_on_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null
     and new.email_confirmed_at is not null
     and old.confirmation_sent_at is not null then
    -- An empty hash, which the auth server takes for no password at all:
    -- none matches it.
    new.encrypted_password := '';
  end if;
  return new;
end;
$$;

revoke all on function private.clear_password_on_confirmation() from public, anon, authenticated;

-- Before the row is written, so the confirmation and the password's going are
-- one change; and only for statements that set the time of confirming, as the
-- auth server's confirmation does, with the code's token.
create trigger users_confirmation_clears_password
  before update of email_confirmed_at on auth.users
  for each row execute function private.clear_password_on_confirmation();
