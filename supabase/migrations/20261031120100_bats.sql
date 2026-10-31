-- Night Courier - bats.
--
-- Every courier keeps exactly three bats. They are rows rather than a counter
-- because each one is a distinct thing in the product - it leaves, flies a real
-- distance, and comes home - and because a row can be locked. Sending claims a
-- specific bat with `for update skip locked` (see send_message); a counter would
-- have to be decremented, and could be decremented twice.
--
-- "Exactly three" is a property of the schema rather than of the code that
-- creates the rows: a bat has a slot, a slot is 1, 2 or 3, and nobody holds two
-- bats in the same slot. A fourth bat is not a bug that could be written. It is
-- a row the database cannot store.

create table public.bats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  slot smallint not null,
  status text not null default 'available',
  -- When the bat last changed state: when it left, or when it came home.
  updated_at timestamptz not null default now(),

  -- The upper bound is BATS_PER_USER in src/constants/config.ts.
  -- src/tests/db/parity.db.test.mjs fails if the two ever disagree.
  constraint bats_slot_range check (slot between 1 and 3),
  -- The two states the product defines. There is no "lost": see the open
  -- question in docs/ROADMAP.md before adding one.
  constraint bats_status_known check (status in ('available', 'flying')),
  constraint bats_one_per_slot unique (owner_id, slot)
);

comment on table public.bats is
  'Three per courier, issued with the profile. Status changes only through send_message and the delivery worker.';

/* -------------------------------------------------------------------------- */
/* Issuing bats                                                                */
/* -------------------------------------------------------------------------- */

-- Fires for every new profile, inside the same transaction as the signup, so an
-- account never exists without its bats. SECURITY DEFINER because no client may
-- insert a bat by any route.
create or replace function private.issue_bats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.bats (owner_id, slot)
  select new.id, slot
  from generate_series(1, 3) as slot;
  return new;
end;
$$;

revoke all on function private.issue_bats() from public, anon, authenticated;

create trigger profiles_issue_bats
  after insert on public.profiles
  for each row execute function private.issue_bats();

-- Couriers who signed up before bats existed receive theirs now. Idempotent, so
-- replaying this migration cannot hand anyone a second set.
insert into public.bats (owner_id, slot)
select p.id, s.slot
from public.profiles p
cross join generate_series(1, 3) as s (slot)
on conflict (owner_id, slot) do nothing;

/* -------------------------------------------------------------------------- */
/* Row level security                                                          */
/* -------------------------------------------------------------------------- */

alter table public.bats enable row level security;
alter table public.bats force row level security;

-- No client reads or writes this table directly, by any route: no policies and
-- no grants. Bats are issued by the trigger above, change state only inside
-- send_message and the delivery worker, and are removed only by cascade with
-- their owner.
--
-- Reads go through get_roost(), which first lands whatever is due for its
-- caller, so what it reports depends only on the time. A direct read would not:
-- a letter that has come due is landed by whichever request touches it first,
-- and if that is the recipient opening the app between two runs of the
-- scheduler, the sender polling this table would see their bat come home at
-- that moment - a trace of when their friend was online, which this product
-- does not show anyone. (Found in review; the app never used the direct read.)
revoke all on table public.bats from anon, authenticated;
