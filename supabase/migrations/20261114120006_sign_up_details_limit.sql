-- Night Courier - a bound on what a sign-in can carry.
--
-- A sign-up sends a username and a display name along with its email address,
-- and Supabase Auth stores whatever else is sent with them: any JSON, up to
-- its own limit of a megabyte a request, and it keeps it twice - on the
-- sign-in, and in the sign-in's email identity. A signed-in account can then
-- add to its own sign-in, a megabyte at a time and without end, on the token
-- it already holds.
--
-- Review did both against the real stack, with nothing but the key that is in
-- every copy of the app: a megabyte kept per sign-up, where an ordinary one
-- keeps a fifth of a kilobyte, and one account grown to two megabytes in five
-- requests. Whatever a sign-in carries travels in every access token as well:
-- with six kilobytes of it, the local stack's gateway refused every request
-- the account made.
--
-- Nothing bounded it. The profile trigger reads two keys and ignores the
-- rest; the nightly tidy-up removes those two keys and nothing else; Supabase
-- Auth's own limit is per request. So the database bounds it, on the sign-in
-- itself: a sign-up that carries more is refused whole, identity and all, and
-- so is a change that would make an account carry more.

/* -------------------------------------------------------------------------- */
/* How much                                                                    */
/* -------------------------------------------------------------------------- */

-- In bytes, of the details written out as text. The most the app can send -
-- a username of 20 characters, a display name of 40 that take four bytes
-- each, the longest email address, and the four keys Supabase Auth adds of
-- its own - comes to under a kilobyte. SIGN_UP_DETAILS_MAX_BYTES in
-- src/constants/config.ts; the parity test checks the two agree.
create or replace function private.sign_up_details_max_bytes()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 4096
$$;

revoke all on function private.sign_up_details_max_bytes() from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* The bound                                                                   */
/* -------------------------------------------------------------------------- */

-- Refuses a sign-in whose details are over the bound - when it is made, and
-- when a change would make them larger than they were.
--
-- Only growing is refused. An account may already carry more, from before
-- there was a bound. Refusing every change to it would lock it: no later
-- write of its details could succeed, the nightly tidy-up's among them, and
-- that is not an error the tidy-up passes over - one such account would stop
-- every night's run. Left as large as it is, or made smaller, it is let
-- through.
--
-- SECURITY DEFINER, and it has to be. A trigger function runs with the rights
-- of whoever writes the row, and auth.users is written by Supabase Auth's own
-- role, which cannot use the private schema: as an ordinary function this
-- would fail at its first line with "permission denied for schema private",
-- for every sign-up there is - on the platform only, while tests that sign
-- people up as a superuser went on passing. (The test harness now signs up as
-- that role.)
create or replace function private.limit_sign_up_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bytes integer := pg_catalog.octet_length(new.raw_user_meta_data::text);
  bytes_before integer := 0;
begin
  if tg_op = 'UPDATE' then
    bytes_before := coalesce(pg_catalog.octet_length(old.raw_user_meta_data::text), 0);
  end if;

  -- No hint: a hint is how these functions tell the app why they refused
  -- (see src/lib/rpc-error.ts), and this never reaches the app. Supabase Auth
  -- answers a failed sign-up with words of its own; this message is for
  -- whoever reads the server's log.
  if bytes > private.sign_up_details_max_bytes() and bytes > bytes_before then
    raise exception 'the details kept with a sign-in can be at most % bytes: these are %',
      private.sign_up_details_max_bytes(), bytes
      using errcode = '22001';
  end if;

  return new;
end;
$$;

-- Triggers fire whether or not their function may be called (see the least
-- privilege migration); nothing is gained by leaving it callable.
revoke all on function private.limit_sign_up_details() from public, anon, authenticated;

-- Before the row is written, so that nothing of a refused sign-up is ever
-- stored; and only for statements that set the details, so that a sign-in or
-- a token renewal, which write other columns, do not pass through here.
create trigger users_limit_sign_up_details
  before insert or update of raw_user_meta_data on auth.users
  for each row execute function private.limit_sign_up_details();
