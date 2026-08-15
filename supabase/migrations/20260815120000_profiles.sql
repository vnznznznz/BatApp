-- Night Courier — profiles and account lifecycle.
--
-- A profile row exists for exactly one auth user and is created automatically
-- when that user signs up. Profiles are private: at this phase a user can read
-- and update only their own. Friend search (Phase 5) will add a narrow,
-- deliberate way to look up other users by username; until then there is no
-- path from one user to another user's row.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Mirrored in src/constants/config.ts. The database is the authority; the
  -- client copy exists only to fail fast before a round trip.
  constraint profiles_username_length check (char_length(username) between 3 and 20),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]+$'),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 40)
);

comment on table public.profiles is
  'One row per auth user. Created by handle_new_user(); removed by cascade when the auth user is deleted.';

-- Case-insensitive uniqueness. Without this, "anna" and "Anna" are different
-- usernames, which makes friend search ambiguous and impersonation trivial.
-- The format constraint already forbids uppercase, so this is defence in depth.
create unique index profiles_username_lower_idx on public.profiles (lower(username));

/* -------------------------------------------------------------------------- */
/* updated_at                                                                  */
/* -------------------------------------------------------------------------- */

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
-- An empty search_path is mandatory for SECURITY DEFINER functions and good
-- hygiene everywhere: it stops a caller-controlled search_path from resolving
-- these identifiers to objects they created. Everything below is fully
-- qualified as a result.
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

/* -------------------------------------------------------------------------- */
/* Profile creation on signup                                                  */
/* -------------------------------------------------------------------------- */

-- Runs as the function owner so it can insert a row that RLS would otherwise
-- forbid: at the moment this fires there is no authenticated session yet.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text := lower(trim(new.raw_user_meta_data ->> 'username'));
  requested_display_name text := trim(new.raw_user_meta_data ->> 'display_name');
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    -- Falling back to a generated name keeps signup from failing outright if
    -- metadata is missing; the app always sends both.
    coalesce(nullif(requested_username, ''), 'courier_' || substr(replace(new.id::text, '-', ''), 1, 12)),
    coalesce(nullif(requested_display_name, ''), 'Courier')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* -------------------------------------------------------------------------- */
/* Account deletion                                                            */
/* -------------------------------------------------------------------------- */

-- Apple Guideline 5.1.1(v) requires in-app account deletion, and GDPR Art. 17
-- requires it to be a real erasure rather than a deactivation flag. Deleting
-- the auth user cascades to the profile, and to everything later phases hang
-- off the profile.
--
-- SECURITY DEFINER because a user cannot delete from auth.users directly. The
-- function takes no arguments on purpose: there is no id to tamper with, and
-- it can only ever delete the caller.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

/* -------------------------------------------------------------------------- */
/* Row level security                                                          */
/* -------------------------------------------------------------------------- */

alter table public.profiles enable row level security;

-- Applies the policies to the table owner too. Without this, anything running
-- as the owner silently bypasses every policy below.
alter table public.profiles force row level security;

create policy profiles_select_own on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Deliberately absent:
--   INSERT — profiles are created only by handle_new_user().
--   DELETE — profiles are removed only by cascade from auth.users.
-- A client cannot create or destroy a profile by any route.

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
