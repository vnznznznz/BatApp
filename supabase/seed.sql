-- Night Courier - demo data for a local stack.
--
-- LOCAL DEVELOPMENT ONLY. `npx supabase db reset` runs this after the
-- migrations; `npx supabase db push` never does, so none of it reaches a hosted
-- project.
--
-- Two couriers who are already friends, so the app can be tried at once:
--
--   anna@example.test   password: night-courier   lives in Berlin
--   ben@example.test    password: night-courier   lives in Munich
--
-- Sign in as one on a phone or simulator and as the other in a browser
-- (`npm run web`), and write. A letter from Berlin to Munich takes six hours;
-- see the README for the time multiplier that makes it take seconds.

-- GoTrue reads these rows when signing in. The empty strings matter: it fails
-- to scan NULL in the token columns.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  (
    '00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-00000000a11a',
    'authenticated', 'authenticated', 'anna@example.test',
    extensions.crypt('night-courier', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"username": "anna", "display_name": "Anna"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-0000000000be',
    'authenticated', 'authenticated', 'ben@example.test',
    extensions.crypt('night-courier', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"username": "ben", "display_name": "Ben"}',
    now(), now(), '', '', '', ''
  );

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.email in ('anna@example.test', 'ben@example.test');

-- The signup trigger has created both profiles and issued six bats. What a
-- courier would do next through the app - choose a city, become friends - is
-- done here directly.
update public.profiles
set city_id = (select c.id from public.cities c where c.name = 'Berlin' and c.country_code = 'DE')
where id = 'a0000000-0000-4000-8000-00000000a11a';

update public.profiles
set city_id = (select c.id from public.cities c where c.name = 'Munich' and c.country_code = 'DE')
where id = 'b0000000-0000-4000-8000-0000000000be';

insert into public.friendships (requester_id, addressee_id, status, accepted_at)
values ('a0000000-0000-4000-8000-00000000a11a', 'b0000000-0000-4000-8000-0000000000be', 'accepted', now());
