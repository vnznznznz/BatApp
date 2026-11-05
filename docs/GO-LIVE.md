# Go-live plan

Researched August 2026. Facts about store policy change; re-check anything marked with a date
before acting on it.

The headline: **go-live is not the last phase.** Three things on this page have lead times or
one-way doors, and two of them block earlier phases. They should be started now, in parallel
with Phases 2–14, not when the code is finished.

---

## Readiness checklist

Where this actually stands, as of Phase 13a of 18 (2 November 2026). The four groups below are independent and
have different owners, so they can proceed in parallel — and two of them have lead times that
make starting late expensive.

### A. The application — the product works; what remains is polish and checking

You can sign up, choose a city, ask friends by username, send letters that fly the real distance,
watch bats come home, and read what has landed. Delivery is decided by the database and runs on
pg_cron; every product rule is enforced server-side and tested, including the reservation race
against a real Postgres.

| Phase | What it adds           | Where it stands                                                                      |
| ----- | ---------------------- | ------------------------------------------------------------------------------------ |
| 10    | Push notifications     | **Dropped** by decision, 2 November 2026                                             |
| 12    | Bat flight animation   | **Done**: wing beat, drift, a drawn flight; wings and drift stop under Reduce Motion |
| 13    | Security and RLS audit | Started: the privilege audit tests exist; review remains                             |
| 13a   | Safety and moderation  | **Done**: report, block, house rules - what App Review looks for                     |
| 14    | Testing                | Mostly done in passing; testing on real devices remains                              |

There are no push notifications, by the operator's choice: a letter that lands is seen the next
time its recipient opens the app. Push would not have cost anything itself - Expo's push service,
APNs and FCM are free - but it needs a development build, so dropping it also means the whole app
runs in Expo Go.

### B. Accounts and services — yours, and two have lead times

| Item                                    | Cost                                              | Status          | Blocks                                                               |
| --------------------------------------- | ------------------------------------------------- | --------------- | -------------------------------------------------------------------- |
| Supabase project in Zurich              | free tier                                         | **not created** | everything — see "Setting up the hosted project"                     |
| Custom SMTP (Resend/Postmark/SES)       | free tier                                         | not started     | any second user; password reset                                      |
| Apple Developer Program                 | 99 USD/year (CHF 99 in Switzerland, **to check**) | not started     | Phases 15–17: any install beyond Expo Go                             |
| Expo account for EAS builds             | free tier                                         | not started     | Phases 15–16                                                         |
| Google Play Console                     | 25 USD once                                       | not started     | Android only; skip if iOS-only                                       |
| GitHub Pages site `vnznznznz.github.io` | free                                              | **not created** | the privacy policy and Support URLs - see "Where the web pages live" |

**Apple enrolment is the longest pole.** Individual identity verification takes days to weeks, and
it gates every build that is not Expo Go — TestFlight included. It is also the only unavoidable
cost on the iOS side; nothing in the app itself costs money.

### C. Compliance artifacts — drafted in `docs/store/`; personal details still open, hosting planned

| Item                              | Required by                                | Notes                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy policy at a public URL    | Apple 5.1.1(i), Art. 19 FADP, GDPR Art. 13 | **Drafted**: `docs/store/privacy-policy.de.md` (binding) and `.en.md`. Needs the operator's name and address filled in, outside this repository. Planned at `https://vnznznznz.github.io/night-courier/privacy-policy.de.html`, the English version alongside (see "Where the web pages live")                                                                                          |
| Support URL                       | Apple 1.2                                  | **Drafted**: `docs/store/support-page.md`, to be published as `index.html` of the GitHub Pages folder, `https://vnznznznz.github.io/night-courier/`; it names the operator and the contact address and points to the privacy policy for the postal address. In the app via `EXPO_PUBLIC_CONTACT_URL`. Fallback: the hosted policy, if Apple wants the address on the Support URL itself |
| Contact postal address            | Apple 1.2, Art. 19 FADP, GDPR Art. 13      | Decided. Published only in the hosted privacy policy, section 1 (the support page points there), whose filled-in copy exists only in the site repository `vnznznznz.github.io`; in App Store Connect where a form asks; never in this repository                                                                                                                                        |
| EULA with a zero-tolerance clause | Apple 1.2 enforcement practice             | **Done** in the app: the house rules (`src/app/rules.tsx`), agreed to at sign-up                                                                                                                                                                                                                                                                                                        |
| App Privacy "nutrition label"     | App Store Connect                          | **Answers drafted** in `docs/store/app-store.md` (Google's Data safety form: `docs/store/google-play.md`)                                                                                                                                                                                                                                                                               |
| Age rating questionnaire          | App Store Connect                          | **Answers drafted** in `docs/store/app-store.md`; mandatory since 31 Jan 2026                                                                                                                                                                                                                                                                                                           |
| Trader status declaration         | EU DSA                                     | **Not applicable** on a TestFlight-only path. Any App Store distribution in the EU needs it, wherever the operator lives. A private, non-commercial operator would normally declare non-trader (**to check**); as a trader, Apple would show the postal address, phone number and email on the store page. See `docs/store/app-store.md`, section 7                                     |

Account deletion is already built and tested, which is the one item on Apple's list that is code
rather than paperwork.

### D. Build and distribution plumbing — not started

- `eas.json` does not exist. Build profiles for development, preview and production.
- EAS project link, plus signing credentials. No APNs key or FCM project: there is no push.
- First TestFlight upload, and Beta App Review on the first build of each version.
- Automation for the **90-day TestFlight expiry**. Worth setting up with the first build rather
  than rediscovering it a quarter later when the app dies on everyone's phone.

### Known gaps already logged

Both recorded where the work is, not only here:

- **Password reset cannot be completed in-app.** The email sends; there is no deep-link handler to
  catch the return and present a new-password screen. Parked until custom SMTP exists, because
  until then the mail cannot reach anyone anyway.
- ~~**The concurrency test cannot run in this harness.**~~ Solved in Phase 7:
  `concurrency.pg.test.mjs` runs the races against a real Postgres, which CI provides as a
  service container.
- **The migrations must be pushed to the hosted project.** `npx supabase db push` after linking —
  see the README. Until then the app signs in and then fails on every screen that reads a bat.

### The shortest path to friends using it

1. Create the Supabase project in Zurich, link it, push config and migrations. _(unblocks everything)_
2. Start Apple enrolment. _(long lead time, gates TestFlight)_
3. ~~Phases 3–9 — the product itself, ending with messages that actually arrive.~~ Done, with
   Phase 11. Push the migrations to the hosted project (`npx supabase db push`).
4. Custom SMTP, then email confirmation on, then finish password reset.
5. ~~Phase 10 push.~~ Dropped.
6. ~~Phase 13a, which App Review will check.~~ Done. Phases 12–14 remain.
7. Privacy policy and the rest of group C, published on the GitHub Pages site.
8. `eas.json`, first build, TestFlight, invite the circle.

---

## The two findings that change the plan

### 1. The GDPR household exemption does not cover you

_Written when the operator was assumed to live in Germany. The operator lives in Switzerland, as a
private individual (recorded 5 November 2026), so the Swiss Federal Act on Data Protection (FADP,
in German DSG; the revised Act, in force since 1 September 2023) applies to the operator, and the
GDPR applies to the data of people in the EU and the EEA, because the app is offered to them (Art.
3(2)(a) GDPR). The reasoning below still holds for them. The FADP has its own exclusion for data a
natural person processes exclusively for personal use (Art. 2(2)(a) FADP); whether it could cover a
server that carries other people's letters is **to check**, though the same reasoning makes it
unlikely._

It is tempting to assume that a private app for friends falls under Art. 2(2)(c) DSGVO —
processing "by a natural person in the course of a purely personal or household activity".

It does not. Recital 18, third sentence: _"However, this Regulation applies to controllers or
processors which provide the means for processing personal data for such personal or household
activities."_ Operating the server your friends message through is exactly that. The exemption
is gone the day a second household uses the app, and the CJEU reads it narrowly (_Ryneš_
C-212/13, _Lindqvist_ C-101/01).

Practical consequence: a privacy policy, a real hard-delete, data minimisation and hosting in a
jurisdiction with an adequate level of protection are obligations, not polish. (The project is in
Zurich: in the operator's own country, and for people in the EU covered by the EU's adequacy
decision for Switzerland — see `ARCHITECTURE.md`.) Most of this is already in the build plan; it
now has a reason attached.

**Impressum, separately (written for an operator in Germany):** under German law there would be **no Impressum obligation**. § 5 DDG (successor
to § 5 TMG since 14 May 2024) applies to _geschäftsmäßige_ digital services. A free, invite-only app
with no ads, no donations and no affiliate links is outside it. Profit intent is not the test —
sustained commercial offering is — but a family app is not that. **To check:** this was written for
an operator in Germany. Whether German law reaches an operator in Switzerland at all, and whether a
comparable Swiss rule applies (Art. 3(1)(s) of the Unfair Competition Act, UWG, concerns offering
goods, works or services in e-commerce), is a question for advice. The privacy policy names the
operator and the postal address anyway.

### 2. A chat app is a user-generated-content app, and Apple Guideline 1.2 applies

This is a gap in the current 17-phase plan and it is a submission blocker, not a nice-to-have.
Guideline 1.2 requires apps with user-generated content to include, verbatim:

- a method for **filtering objectionable material**
- a mechanism to **report** offensive content, and timely responses
- the ability to **block** abusive users
- **published contact information**

Enforcement practice adds a EULA with a zero-tolerance clause for objectionable content. The
first external TestFlight build of each version goes through Beta App Review against the App
Review Guidelines, and 1.2 is exactly what reviewers check on a messaging app.

Night Courier's design helps here: it is invite-only, one-to-one, and friendship-gated, so
"block" largely already exists as "remove friend". But report, block-as-a-distinct-action and
a contact route have to be built. **A new phase is needed** — see the roadmap change below.
_(Built: Phase 13a.)_

---

## Handling a report

Reports arrive in the `public.reports` table of the hosted project. Nothing announces them — there
is no push and no email — so **look at least once a day**: Apple expects "timely responses" to
reports, and a reviewer may file one to see what happens. If a day can be missed (holidays,
illness), set up an alert: a Database Webhook on inserts into `public.reports` (Dashboard →
Database → Webhooks) calling an Edge Function that emails you through the SMTP provider below. The
destination address goes in the function's secrets, never in this repository. Keep the email
content-free - "a new report is waiting", nothing more: the webhook hands the function the whole
row, letter text and note included, and an email with those would put them in a mailbox that keeps
them as long as you do, beyond the 180 days the privacy policy promises.

**Where:** Supabase dashboard → Table Editor → schema `public` → `reports`. The open ones, oldest
first, in the SQL editor:

```sql
select created_at, reason, reported_username, reported_display_name, letter_body, note, id
from public.reports
where resolved_at is null
order by created_at;
```

Each row says who was reported (`reported_id`, plus the username and display name as they were),
why, the reporter's note, and for a reported letter its full text (`letter_body`). The reporter is
`reporter_id`; the person reported is not told who that was, unless the law requires it, so do not
tell them — and remember
that a letter has one reader, so acting on a letter can tell its sender who reported it anyway.

Identify people by `reported_id`, not by the username. When `reported_id` is null the account has
been deleted, and its username is free: it may belong to someone else by now.

**What to do**, by how serious it is:

- **Nothing breaks the rules** — mark it resolved.
- **Somewhere in between** — the reporter has usually blocked them already (the report screen does
  that by default). A warning goes by email to the address on their account, from the contact
  mailbox, saying why.
- **Serious, or repeated** — remove the account:

  ```sql
  select private.remove_account('<reported_id>');
  ```

  That deletes their profile, and with it their bats, friendships, blocks and every letter they
  sent or received, on both sides; the reports about them stay, without their id. Their sign-in
  stays behind, banned for two years from the removal (`private.ban_period()`), so that the same
  email cannot simply sign up again, and the daily tidy-up deletes it when the ban runs out. The
  privacy policy says exactly this, so do not ban for longer by hand. (Authentication → Users →
  Delete user also works, but frees the email at once.)

- **A threat** — stop the account at once, but delete nothing yet: removing it takes every letter
  between the two of them with it, and the report keeps only the one reported.

  ```sql
  update auth.users set banned_until = now() + private.ban_period() where id = '<reported_id>';
  ```

  They can no longer sign in, and their app stops working within the hour, when its sign-in would
  be renewed. This is a suspension: the account still exists, with its profile and letters, and the
  two years the privacy policy names count from the removal, which sets the ban afresh. Then write
  to the reporter, at the address on their account, from the contact mailbox, that the account will
  be removed in a week and why they may want copies (screenshots) of their letters first. If the
  police are to have the report, export it now, together with the account's sign-in records - the
  privacy policy says these may go with it:

  ```sql
  select created_at, payload ->> 'action' as action, ip_address
  from auth.audit_log_entries where payload ->> 'actor_id' = '<reported_id>' order by created_at;
  select created_at, refreshed_at, ip, user_agent from auth.sessions where user_id = '<reported_id>';
  ```

  When the week is up, `select private.remove_account('<reported_id>');` as above. Delete your own
  exported copy once the police have theirs.

Then record the outcome, so the report leaves the queue:

```sql
update public.reports
set resolved_at = now(), resolution = 'account removed'   -- or 'no action', 'warned', ...
where id = '<report id>';
```

Reports delete themselves 180 days after they were made (an hourly pg_cron job). If one is needed
for longer — handed to the police, say — export it, hand it over, and delete your own copy; the
privacy policy has to name the police as a possible recipient.

---

## Setting up the hosted project

What a session with access does, so the steps do not depend on anyone remembering them. It needs a
Supabase personal access token (dashboard → Account → Access Tokens) stored in the cloud
environment as `SUPABASE_ACCESS_TOKEN` — never pasted into a chat — and network access to
`api.supabase.com` and `*.supabase.co`. Revoke the token afterwards.

1. **Create the project:** name `night-courier`, region **`eu-central-2` (Zurich)**, free plan,
   in the operator's organisation (`npx supabase orgs list`), with a generated database password
   that goes to the operator, not into the repository:
   `npx supabase projects create night-courier --org-id <org> --region eu-central-2 --db-password <password>`.
2. **Link and push the auth settings:** `npx supabase link --project-ref <ref>`, then
   `npx supabase config push`. This applies `supabase/config.toml`, including **email confirmation
   off** — until custom SMTP exists, Supabase's own mailer reaches nobody but the operator, so with
   confirmation on a friend's sign-up would never complete (see "Before a second person can sign up"
   above).
3. **Apply the migrations:** `npx supabase db push`. It needs a direct Postgres connection; where
   the network allows only HTTPS, run each file in `supabase/migrations` in order through the
   Management API instead (`POST /v1/projects/<ref>/database/query`) and record each version in
   `supabase_migrations.schema_migrations`, so that a later `db push` skips them. The seed file is
   for the local stack only — never run it here.
4. **Check it:** `select jobname, schedule from cron.job` shows `deliver-due-messages`,
   `forget-old-reports` and `tidy-up`; `select count(*) from public.cities` is 4,310; and
   `select time_multiplier from private.flight_settings` is 1. Then check that the tidy-up can do
   everything the privacy policy says it does. Whatever it is not allowed to touch, it skips without
   an error, and it returns what it skipped - so run it once by hand:

   ```sql
   select private.tidy_up();
   ```

   It must return `{}`, an empty list. Anything else names the step and the reason, such as
   `sign-in log: permission denied for table audit_log_entries`; until that is fixed, the policy's
   sections on sessions, the sign-in log and banned accounts are wrong: ask Supabase support, or
   change the policy. (Running it deletes nothing that the daily job would not.)

5. **Configure the app:** the project URL and its publishable (anon) key go into `.env` as
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` — never the service-role or secret
   key, which `src/lib/env.ts` refuses to start with. `.env` stays out of git. Add
   `EXPO_PUBLIC_CONTACT_URL` and `EXPO_PUBLIC_PRIVACY_POLICY_URL` once the pages are up on the
   GitHub Pages site (see "Where the web pages live", under "Before first submission").
6. **Try it:** sign up two accounts, choose cities, become friends, send a letter, watch it land;
   report it and check the row in `public.reports`; then delete both test accounts.

---

## Recommended distribution: different mechanism per platform

Do not use the same approach on both stores. The economics and the failure modes differ.

|                    | iOS                                                                | Android                                  |
| ------------------ | ------------------------------------------------------------------ | ---------------------------------------- |
| **Path**           | TestFlight, external tester group, public link                     | Play Console, **internal testing** track |
| **Cost**           | 99 USD / year, forever (CHF 99 in Switzerland, **to check**)       | 25 USD once                              |
| **Testers**        | up to 10,000, invited by link — no Apple developer accounts needed | up to 100, by email address              |
| **Review**         | Beta App Review on the first build of each _version_               | none                                     |
| **Public listing** | none                                                               | none                                     |
| **Recurring cost** | **builds expire after 90 days**                                    | none                                     |

### Why TestFlight rather than an unlisted App Store app

An unlisted app is lower maintenance — a real App Store install with no expiry that keeps
working for years untouched. Two reasons it is not the default here:

1. **Privacy.** Apple's documentation states that if you do not distribute on the App Store in
   the EU, you are not acting as a trader under the DSA, and it names TestFlight-only
   distribution as non-qualifying. An unlisted app _is_ an EU App Store app, so it puts you in
   scope of the trader declaration. That is survivable — a genuine hobby app with no ads and no
   IAP is a legitimate **non-trader**, and declaring non-trader requires no contact details and
   publishes nothing, beyond EU users seeing a consumer-rights disclaimer that is meaningless
   for a free app. But TestFlight avoids the question entirely.
2. **It is a one-way door.** An app converted to unlisted cannot be returned to public
   distribution, and it must pass _full_ App Review, not Beta App Review.

Revisit this choice if the 90-day treadmill becomes intolerable.

### The 90-day expiry is the real ongoing cost

Every TestFlight build expires 90 days after upload. On expiry testers lose the app **and its
local data**. Keeping a family app alive for years means shipping a fresh build every quarter,
forever.

Mitigations, both worth doing on day one:

- Automate the upload (Fastlane or EAS Submit on a scheduled GitHub Action).
- Bump only the **build number**, keeping the version string fixed — a new build of an existing
  version does not re-enter Beta App Review.

### Things that look plausible and are not

- **Apple Developer Enterprise Program** — requires a legal entity with 100+ employees, a D-U-N-S
  number and a public website, and forbids distribution outside your own employees. Categorically
  ineligible.
- **Custom Apps / Apple Business Manager** — requires an organisation on both sides. Your family
  is not an ABM organisation.
- **Ad Hoc distribution** — provisioning profiles expire after one year and the app then refuses
  to launch until you re-sign and manually reinstall on all 50 devices, each of whose UDIDs you
  collected in advance.
- **Handing relatives an APK** — Android developer verification begins enforcement 30 Sept 2026
  in Brazil, Indonesia, Singapore and Thailand, with a global rollout planned from 2027. This path
  has a shelf life.

### Two multi-year traps to diarise

- **Google inactive-account closure.** Google marks accounts for closure that were created over
  a year ago and never submitted an app for review. Verify your contact email and phone in Play
  Console and sign in at least every 180 days. This is the only way the Android side breaks
  silently years from now.
- **Apple membership lapse.** If the yearly renewal fails, TestFlight builds stop working.

---

## Running it on your own iPhone before paying for anything

You do not need a developer account to start. Three options, in the order they are worth trying.

### 1. Expo Go — free, instant, no Mac (do this one)

Run `npm start` and scan the QR code with the camera. The app runs on your iPhone in seconds,
reloads as the code changes, and costs nothing. With push notifications dropped, that is the whole
app: nothing in it needs a development build.

### 2. Free Apple personal team — works, but painful

Xcode lets you sign with a free Apple ID onto your own device. It requires **a Mac**, the
provisioning profile **expires after 7 days**, and push notification entitlements are not
available. Fine for a one-off look at a real build; not something to rely on.

### 3. Joining a friend's paid account — check which kind of enrolment he has first

This is the part of the plan that probably does not work as expected.

**An Individual enrolment cannot add team members.** It can add up to 50 users to _App Store
Connect_, but Apple is explicit that those users are not part of the developer team and get no
access to Certificates, Identifiers & Profiles — which is precisely what is needed to sign a
build. Only an **Organization** enrolment can add real team members with development access, and
an Organization enrolment requires a legal entity and a D-U-N-S number.

So:

- If your friend is enrolled as an **Organization**, he can add you as a Developer or App Manager
  and everything works.
- If he is enrolled as an **Individual** — far more likely for someone paying the fee personally —
  he can give you App Store Connect access to manage TestFlight and metadata, but **he** has to
  create the signing credentials and run the builds. The app is published under his name and he
  carries the responsibility for it.
- Signing in with his Apple ID yourself is account sharing, breaches the developer agreement, and
  risks his account. Not worth it.

Either way, the app would belong to his team, not yours, and moving an app between teams later is
possible but tedious. If Night Courier is going to outlive the experiment, your own enrolment (99
USD a year) is the cleaner foundation.

---

## What to do now, in parallel with the build

### This week — these gate later phases

1. **Enrol in the Apple Developer Program** (99 USD a year; Apple charges CHF 99 in Switzerland,
   **to check**). Individual enrolment identity verification
   can take days to weeks. This gates Phases 15–16 — every build that is not Expo Go. It is the
   longest pole; start it first.
2. **Create the Google Play Console account** (25 USD, once).
3. **Create the Supabase project in `eu-central-2` (Zurich)** — the operator's choice; see
   `ARCHITECTURE.md`. This is the Phase 2 blocker and a **one-way door**: the region is immutable
   after creation. Encryption at rest (AES-256) and
   in transit is on by default. Note that Supabase Inc. is a US corporation, so region choice
   gives data _residency_, not sovereignty — access from the US rests, under the FADP, on the
   Swiss-US Data Privacy Framework if Supabase is certified (**to check**), otherwise on the SCCs in
   their DPA, and for people in the EU on those SCCs. That is appropriate for a hobby project but
   worth knowing. The DPA has to be requested and signed
   (`docs/store/gdpr-records.md`, 5.1) before the privacy policy is published, since its sections 7
   and 8 say it exists.

### Before a second person can sign up: custom SMTP

This one blocks earlier than it looks. Supabase's built-in email service **will not deliver to
anyone who is not on the project's team**, and caps the whole project at two messages per hour.
Until a custom SMTP provider is configured:

- a friend's signup fails silently if email confirmation is on — the account is created and the
  link never arrives;
- password reset does not work for anyone but the operator, whatever the confirmation setting is.

Configure a provider under Authentication → Emails → SMTP Settings (Resend, Postmark and SES all
have free tiers large enough for this app), which also lifts the cap to 30 messages per hour, and
then turn email confirmation on. Set `enable_confirmations = true` under `[auth.email]` in
`supabase/config.toml` in the same change, as its comment says: otherwise the next
`npx supabase config push` switches confirmation off again, and section 3.10 of the privacy policy
stops being true.

### Push notifications: none

Decided on 2 November 2026. Should that ever be revisited, keep the notification content-free —
"A bat has arrived 🦇", body fetched from the backend on open. APNs is US-operated and every payload
transits it, so a content-free push keeps message text out of a US processor.

### Before first submission

- **Privacy policy at a public URL.** Mandatory in App Store Connect metadata _and_ linked
  in-app (Guideline 5.1.1(i)). Must state what is collected, retention and deletion.
- **In-app account deletion** (Guideline 5.1.1(v), in force since 30 June 2022). Deactivation is
  not sufficient. Already in the plan for Phase 2 — build it as a real hard delete, which also
  satisfies GDPR Art. 17.
- ~~**Report, block, and a contact route**~~ — built in Phase 13a. The contact route is a
  **Contact** button in the profile and in the house rules, and a **Privacy policy** button there
  and on the sign-up form. Both read their address from the build's environment —
  `EXPO_PUBLIC_CONTACT_URL` (a `mailto:` or an https page) and `EXPO_PUBLIC_PRIVACY_POLICY_URL` —
  and are hidden while unset. **Set both for every build anyone else will use**, in `.env` and in
  the EAS environment: an App Reviewer looks for exactly these. They end up in the app bundle, so
  use an address made for the purpose, never a home address.
- **Beta App Review needs a way in.** A fresh account has no friends and no letters, so a reviewer
  who signs up finds no Report or Block button anywhere. Before submitting, create a reviewer
  account and a "Demo Friend" on the hosted project, make them friends, and a day before, send two
  harmless letters from Demo Friend to the reviewer. Put the reviewer's sign-in in Beta App Review
  Information, with notes along these lines:

  > Report and block: Letters → a letter from Demo Friend → Report this letter, or Block; or
  > Friends → tap Demo Friend → Block / Report. Profile → Safety holds Blocked couriers (each can be
  > reported from there too), the house rules (our terms, with a zero-tolerance clause, agreed to at
  > sign-up), Contact and the privacy policy. Filtering: letters only travel between two people who
  > have both accepted a friend request made by exact username; there is no search, no public
  > profile and no way to write to a stranger. Blocking is private to the user; Report, which also
  > blocks by default, reaches the operator, who removes offending accounts.

- ~~**Decide the minimum age.**~~ Decided on 5 November 2026: **13** (it was 12, decided the day
  before), and under 16 only with a parent's or guardian's permission (`MINIMUM_AGE` and
  `PARENTAL_PERMISSION_UNDER` in `src/constants/config.ts`). 16 is the highest age any EU country
  sets under Art. 8 GDPR for agreeing to an online service on one's own (Germany among them); Swiss
  law sets no fixed age, and what counts there is the capacity of judgement (_Urteilsfähigkeit_).
  The house rules ("Who can join", `src/app/rules.tsx`) read the constants, and sign-up asks for
  "I am 13 or older"; nobody's age is checked or stored. No one under 13 is admitted, in the US or
  anywhere else, and an account found to belong to someone under 13 is deleted, without a ban.
  What follows from it:
  - **Google Play:** the target audience is 13–15, 16–17 and 18 and over, with no group under 13,
    so Google's Families Policy does not apply (**to check**: unless Google judges the listing to
    appeal to children). Its social-feature rules for child users are therefore not built, nor the
    age question and stored age flag they would have needed: see `docs/store/google-play.md`,
    section 5.
  - **App Store:** the computed rating is still expected to be 4+, and is overridden to 13+, which
    is now exactly the minimum age, so the store and the house rules show the same number: see
    `docs/store/app-store.md`, "Age rating".

  The house rules forbid any sexual content involving or sent to anyone under 18.

- **The privacy policy must cover reports**: that a report goes to the operator with a copy of
  what was reported; that the reported person is not told who reported them (but may guess, a
  letter having one reader); that it is deleted 180 days after it was made, whether or not it was
  passed to the police, who keep their own copy under their own rules and are therefore a possible
  recipient; and that it outlives account deletion, both ways — without the ids of the people
  involved, but with the reported username, display name and letter text, and with the note the
  reporter wrote. Removed accounts are kept banned for two years from the removal and then deleted
  (see "Handling a report"); it must say that too.
- **The privacy policy must name the countries.** The Supabase project is in Zurich
  (`eu-central-2`), in the operator's own country, so storing the data there is not a disclosure
  abroad under the FADP. For people in the EU, Switzerland is outside the EU but covered by the
  Commission's adequacy decision for Switzerland (Decision 2000/518/EC, kept in force by Art. 45(9)
  GDPR; the Commission's January 2024 review found the protection still adequate). Data does go to
  the USA: Supabase Inc. (support and sub-processors), Microsoft for the mailbox, GitHub for the web
  pages, and Apple and Google for testers. Under the FADP that rests on the Swiss-US Data Privacy
  Framework (recognised as adequate by the Federal Council, in effect since 15 September 2024) for
  certified companies, and otherwise on contractual safeguards; whether each company is certified is
  **to check** (`docs/store/gdpr-records.md`, 5.1). Art. 19 FADP asks for the countries and
  safeguards of any disclosure abroad, and GDPR Art. 13 for where data goes — "hosted in the EU"
  would be untrue.

- **A support URL and a reachable contact address.** You cannot stay fully anonymous: Guideline
  1.2 requires published contact information, and Art. 19 FADP and GDPR Art. 13 require the
  controller's identity.

  The contact email is decided. Like the postal address it stays out of this repository: it goes
  into `EXPO_PUBLIC_CONTACT_URL` as a `mailto:` link, in `.env` and in the EAS environment, and into
  the hosted privacy policy.

  The operator has decided to use a personal postal address. **It is deliberately not stored in
  this repository, and must not be.** This repository is public; anything committed here is
  scraped, mirrored, and permanent in git history even after deletion. The address belongs in
  App Store Connect's contact fields where a form asks for it, and in section 1 of the privacy
  policy hosted at its own URL — both entered directly, at Phase 16, and neither of them in this
  repository (the filled-in policy is committed only to the site repository, below). The policy is
  the only public page that carries it: the support page names the operator and points to the
  policy for the postal address.

  The same applies to the privacy policy: host it somewhere you control and link to it, rather
  than committing a document containing a home address to this repo.

  **Where the web pages live.** Decided on 5 November 2026: GitHub Pages, as a user site. The
  operator creates a public repository named `vnznznznz.github.io`, served at
  `https://vnznznznz.github.io/`, and Night Courier's pages go in its folder `night-courier/`:

  | File                     | From                              | Address                                                          |
  | ------------------------ | --------------------------------- | ---------------------------------------------------------------- |
  | `index.html`             | `docs/store/support-page.md`      | `https://vnznznznz.github.io/night-courier/` (`{{SUPPORT_URL}}`) |
  | `privacy-policy.de.html` | `docs/store/privacy-policy.de.md` | `{{PRIVACY_POLICY_URL}}`, the binding version                    |
  | `privacy-policy.en.html` | `docs/store/privacy-policy.en.md` | alongside, linked from the German page and back                  |

  The Markdown sources here keep their placeholders; they are filled in when the pages are built,
  and the filled-in pages, with the operator's name and postal address, live only in the site
  repository, never in this one. That repository is public too, and git keeps every earlier version
  of a page, so an address once committed there stays readable in its history even after it
  changes. GitHub, Inc. (USA) hosts the pages and logs visitors' IP addresses for security and
  operation; the pages themselves set no cookies and load nothing from other sites - keep it so
  when building them (no web fonts, analytics, embeds or a theme that loads them). How long GitHub
  keeps those logs, whether it is certified under the Data Privacy Framework, and that "Enforce
  HTTPS" is on in the site repository's Pages settings are **to check**. In the app,
  `EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_CONTACT_URL` stay settings of `.env` and the EAS
  environment, never committed.

- **Complete the age-rating questionnaire.** Apple's system was overhauled in 2025 and the new
  questionnaire has been mandatory since 31 January 2026; incomplete apps are blocked from new
  submissions and updates.

---

## Roadmap change

Phase 13a is inserted, because App Review will reject a messaging app without it:

> **Phase 13a — Safety and moderation.** Report a message or a user, block a user as an action
> distinct from removing a friend, a route to contact the operator, and a EULA with a
> zero-tolerance clause for objectionable content. Filtering is satisfiable for an invite-only
> one-to-one app by the combination of friendship-gating, reporting and blocking, but it must be
> a deliberate, documented answer rather than an omission.

## Sequence

```
now ─────────────────────────────────────────────► Apple enrolment (slow, gates TestFlight)
now ─────────────────────────────────────────────► Play Console account
now ─────────────────────────────────────────────► Supabase project, eu-central-2  ← gates Phase 2
                Phases 2 ──────────────────► 13
                                             Phase 13a  safety and moderation (done)
                                             Phase 14   testing
                                             Phase 15   EAS production builds
                                             Phase 16   TestFlight + Play internal
                                                        ↳ automate the 90-day rebuild here
                                             Phase 17   invite the circle
```

Phase 17 is not "publish". For this app it is: send the TestFlight link and the Play internal
opt-in link to the people who should have them.
