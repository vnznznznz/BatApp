-- Night Courier - least privilege for the API roles.
--
-- Supabase's default privileges grant every table, sequence and function created
-- in `public` to the `anon` and `authenticated` roles in full - INSERT, UPDATE,
-- DELETE and TRUNCATE included - and leave row level security as the only thing
-- standing between a client and the data. RLS is the right boundary, but it
-- should not be the only one: a table that ever ships without a policy, or with
-- one written too loosely, is then open to every signed-in user, and to every
-- visitor holding the public anon key.
--
-- This migration makes the grants say exactly what the app uses, so privileges
-- and policies are two independent layers rather than one.
--
-- Found while building Phase 4 against a local Supabase stack. The database
-- tests had been asserting "permission denied" for reads and writes that, on the
-- real platform, were permitted by privilege and stopped only by RLS - the data
-- was safe, but the tests were describing a different mechanism from the one in
-- production. The test harness now reproduces Supabase's defaults, so a
-- migration that forgets to narrow them fails a test instead of shipping.

/* -------------------------------------------------------------------------- */
/* Objects created from here on start closed                                  */
/* -------------------------------------------------------------------------- */

-- Every table, sequence and function a later migration creates grants what it
-- needs explicitly. One that forgets is unreachable rather than wide open.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- PostgreSQL itself grants EXECUTE on every new function to PUBLIC, which every
-- role belongs to, and only a database-wide default could change that. Each
-- function is therefore still revoked from PUBLIC where it is created.

/* -------------------------------------------------------------------------- */
/* The tables that already exist                                               */
/* -------------------------------------------------------------------------- */

revoke all on table public.profiles from anon, authenticated;
-- Column-level, because the profile screen promises the username cannot be
-- changed, and a table-wide UPDATE grant would have let a client change it -
-- and its own id, and its own created_at - with a direct request.
grant select on table public.profiles to authenticated;
grant update (display_name, city_id) on table public.profiles to authenticated;

revoke all on table public.cities from anon, authenticated;
grant select on table public.cities to authenticated;

-- Trigger functions cannot be called through the API, but nothing is gained by
-- leaving them executable. Triggers fire regardless: PostgreSQL checks EXECUTE
-- on a trigger function when the trigger is created, not when it fires.
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* A schema the API cannot reach                                               */
/* -------------------------------------------------------------------------- */

-- Settings, helpers and the delivery worker live here. PostgREST exposes only
-- `public`, and the API roles have no USAGE on this schema, so nothing in it can
-- be called or read by a client however its privileges are set. Functions in
-- `public` that need these run as their owner and reach them from there.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

comment on schema private is
  'Internals the API must never reach: flight settings, helpers, the delivery worker.';
