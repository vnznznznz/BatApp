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

| Item                                    | Cost                                              | Status                          | Blocks                                                               |
| --------------------------------------- | ------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| Supabase project in Zurich              | free tier                                         | **not created**                 | everything — see "Setting up the hosted project"                     |
| Custom SMTP (Resend/Postmark/SES)       | free tier                                         | not started                     | any second user; password reset                                      |
| Apple Developer Program                 | 99 USD/year (CHF 99 in Switzerland, **to check**) | not started                     | Phases 15–17: any install beyond Expo Go                             |
| Expo account for EAS builds             | free tier                                         | not started                     | Phases 15–16                                                         |
| Google Play Console                     | 25 USD once                                       | not started                     | Android only; skip if iOS-only                                       |
| GitHub Pages site `vnznznznz.github.io` | free                                              | **Live** since 10 November 2026 | the privacy policy and Support URLs - see "Where the web pages live" |

**Apple enrolment is the longest pole.** Individual identity verification takes days to weeks, and
it gates every build that is not Expo Go — TestFlight included. It is also the only unavoidable
cost on the iOS side; nothing in the app itself costs money.

### C. Compliance artifacts — drafted in `docs/store/`; personal details still open, hosting planned

| Item                              | Required by                                | Notes                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy policy at a public URL    | Apple 5.1.1(i), Art. 19 FADP, GDPR Art. 13 | **Live** since 10 November 2026: `https://vnznznznz.github.io/night-courier/privacy-policy.de.html` (binding), English at `privacy-policy.en.html` beside it. Built from `docs/store/privacy-policy.*.md` with `npm run build:pages` (see "Where the web pages live")                                                                                           |
| Support URL                       | Apple 1.2                                  | **Live** since 10 November 2026: `https://vnznznznz.github.io/night-courier/`, built from `docs/store/support-page.md`. It names the operator and the contact address and points to the privacy policy for the postal address. In the app via `EXPO_PUBLIC_CONTACT_URL`. Fallback: the privacy policy URL, if Apple wants the address on the Support URL itself |
| Contact postal address            | Apple 1.2, Art. 19 FADP, GDPR Art. 13      | Decided. Published only in the hosted privacy policy, section 1 (the support page points there), whose filled-in copy exists only in the site repository `vnznznznz.github.io`; in App Store Connect where a form asks; never in this repository                                                                                                                |
| EULA with a zero-tolerance clause | Apple 1.2 enforcement practice             | **Done** in the app: the house rules (`src/app/rules.tsx`), agreed to at sign-up                                                                                                                                                                                                                                                                                |
| App Privacy "nutrition label"     | App Store Connect                          | **Answers drafted** in `docs/store/app-store.md` (Google's Data safety form: `docs/store/google-play.md`)                                                                                                                                                                                                                                                       |
| Age rating questionnaire          | App Store Connect                          | **Answers drafted** in `docs/store/app-store.md`; mandatory since 31 Jan 2026                                                                                                                                                                                                                                                                                   |
| Trader status declaration         | EU DSA                                     | **Not applicable** on a TestFlight-only path. Any App Store distribution in the EU needs it, wherever the operator lives. A private, non-commercial operator would normally declare non-trader (**to check**); as a trader, Apple would show the postal address, phone number and email on the store page. See `docs/store/app-store.md`, section 7             |

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
- **The migrations must be pushed to the hosted project.**
  `npx supabase@3.2.0 db push --remote --yes` after linking — see "Setting up the hosted project",
  step 3. Until then the app signs in and then fails on every screen that reads a bat.

### The shortest path to friends using it

1. Create the Supabase project in Zurich, link it, push config and migrations. _(unblocks everything)_
2. Start Apple enrolment. _(long lead time, gates TestFlight)_
3. ~~Phases 3–9 — the product itself, ending with messages that actually arrive.~~ Done, with
   Phase 11. Push the migrations to the hosted project (`npx supabase@3.2.0 db push --remote --yes`).
4. Custom SMTP, then email confirmation on, then finish password reset.
5. ~~Phase 10 push.~~ Dropped.
6. ~~Phase 13a, which App Review will check.~~ Done. Phases 12–14 remain.
7. ~~Privacy policy and support page on the GitHub Pages site.~~ Live since 10 November 2026. The
   rest of group C (the store answers in `docs/store/`) goes in when the accounts exist.
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

What a session with access does, so the steps do not depend on anyone remembering them. It needs:

- a Supabase personal access token (dashboard → Account → Access Tokens) stored in the cloud
  environment as `SUPABASE_ACCESS_TOKEN` — never pasted into a chat. Revoke the token afterwards.
- network access to `api.supabase.com`, which every command talks to, and to `<ref>.supabase.co`,
  the project itself, for the check in step 2 and for the app.
- for `db push` in step 3, a connection to the project's Postgres: port 5432, which is not HTTPS
  and which many cloud environments do not let out. Step 3 says what to do then.

Every command below names version 3.2.0 of the Supabase CLI. `npx supabase` alone runs whatever is
newest that day, and versions differ in what the same words do (`scripts/supabase-cli.mjs` has the
short story). Three things about this version that the steps rely on:

- A command changes the hosted project only when it is given `--yes`. Without it the command asks;
  where nobody can answer it stops with `Confirmation required` and changes nothing. The steps
  carry `--yes` where a change is the point of the step, and only there.
- `db push`, `db query` and `migration list` go to the **local** stack unless they are given
  `--remote`, even in a linked directory. Each command prints where it is going before it does
  anything: `Target: project night-courier (<ref>)` is right, `Target: local stack` is not.
- Run by a session, the CLI answers in JSON; the checks below quote the fields to look for.
  `--output-format json` asks for that form whoever runs it.

The commands were tried on 17 November 2026 with exactly this version: against a stand-in for
Supabase's API, against scratch Postgres databases, and, read-only, against the local stack. No
hosted project existed then. What that could not show is marked **not yet tried on a real
project**; go slowly there, and correct this page when you know more.

1. **Create the project:** name `night-courier`, region **`eu-central-2` (Zurich)**, free plan, in
   the operator's organisation, with a generated database password that is written neither into
   the repository nor into a chat:

   ```bash
   npx supabase@3.2.0 orgs list
   export SUPABASE_DB_PASSWORD="$(openssl rand -hex 24)"
   npx supabase@3.2.0 projects create night-courier --org-id <org> --region eu-central-2 \
     --db-password "$SUPABASE_DB_PASSWORD" --yes
   ```

   Keep `SUPABASE_DB_PASSWORD` exported for the rest of the session: step 3 reads it from there.
   Nothing else needs it - the app never does - and the operator can set a new one in the dashboard
   on the day one is wanted (Project Settings → Database; **to check** where exactly).

   **Check:** `npx supabase@3.2.0 projects list --output-format json` shows a project named
   `night-courier` with `"region":"eu-central-2"` and, a minute or two after it was created,
   `"status":"ACTIVE_HEALTHY"`. Its `"ref"` is the `<ref>` of every later step. The region cannot be
   changed afterwards: if it is not `eu-central-2`, stop here and say so.

2. **Link and push the auth settings:**

   ```bash
   npx supabase@3.2.0 link --project-ref <ref>
   npx supabase@3.2.0 config diff
   npx supabase@3.2.0 config push --yes
   ```

   `config diff` changes nothing; read it. Against a new project it lists a handful of settings as
   `update` - the site URL and the redirect addresses, the minimum password length, and **email
   confirmation off**: until custom SMTP exists, Supabase's own mailer reaches nobody but the
   operator, so with confirmation on a friend's sign-up would never complete (see "Before a second
   person can sign up" below). Those are what `config push` then sends, from `supabase/config.toml`.
   Settings it lists as `remote_only` are ones the file does not declare; the push leaves them alone.

   **Check,** twice: these settings decide whether a friend can sign up at all, and nothing in
   step 4 looks at them.

   - `npx supabase@3.2.0 config diff --output-format json` now ends in a line whose `"counts"` has
     `"update":0` and `"local_only":0`. (Not `--exit-code`: that also counts the `remote_only`
     settings, which are meant to stay.)
   - The project itself says so, whatever the CLI believes:

     ```bash
     curl -s "https://<ref>.supabase.co/auth/v1/settings" -H "apikey: <publishable key>"
     ```

     must contain `"mailer_autoconfirm":true` and `"disable_signup":false`. On a project the push
     did not reach, `mailer_autoconfirm` is `false`. The key is in
     `npx supabase@3.2.0 projects api-keys --output-format json`: the entry whose `"type"` is
     `"publishable"` (it starts `sb_publishable_`), or else the legacy one named `anon`. Never use
     `--reveal`, and never the `secret` or `service_role` entries.

   **Not yet tried on a real project:** what a real project's settings look like to `config diff`
   (the list above comes from a stand-in holding Supabase's defaults as far as they are known), and
   the settings endpoint on a hosted project (it was read on the local stack).

3. **Apply the migrations:**

   ```bash
   npx supabase@3.2.0 db push --remote --dry-run
   npx supabase@3.2.0 db push --remote --yes
   ```

   The dry run changes nothing. It must print `Target: project night-courier (<ref>)` and then
   every file in `supabase/migrations` under "Would push these migrations". The second command
   applies them in order and records each one in `supabase_migrations.schema_migrations`, so that a
   later push sends only what is new. It never runs `supabase/seed.sql`, which is for the local
   stack only: do not add `--include-seed`, and never aim a `db reset` at this project.

   **Check:** `npx supabase@3.2.0 db push --remote --dry-run --output-format json` now ends in
   `"upToDate":true` with `"target":{"kind":"linked","project_ref":"<ref>"` in the same line.
   `"kind":"local"` means the check looked at the wrong database.

   **Where no Postgres connection gets out.** `db push` connects to `db.<ref>.supabase.co` (IPv6
   only) or to the project's pooler (IPv4; `link` has saved its address in
   `supabase/.temp/pooler-url`), port 5432, with `SUPABASE_DB_PASSWORD` (without one it makes
   itself a short-lived database role through the API - **not yet tried on a real project**). If
   it fails with `IPv6 is not supported on your current network`, run `link` again; if it still
   cannot connect, the network lets only HTTPS out. `db query --remote` does not need the
   connection: it sends the SQL through Supabase's API. Send each file that way, in order, and
   record it as `db push` would have, so that a later `db push` skips it:

   ```bash
   npx supabase@3.2.0 db query --remote --yes "create schema if not exists supabase_migrations" &&
     npx supabase@3.2.0 db query --remote --yes "create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text)" &&
     for f in supabase/migrations/*.sql; do
       v="$(basename "$f" .sql)"
       npx supabase@3.2.0 db query --remote --yes --file "$f" &&
         npx supabase@3.2.0 db query --remote --yes "insert into supabase_migrations.schema_migrations (version, name) values ('${v%%_*}', '${v#*_}')" ||
         break
     done
   ```

   The loop stops at the first command that fails, and its own exit status does not say whether
   it did. Afterwards
   `npx supabase@3.2.0 db query --remote --read-only "select version from supabase_migrations.schema_migrations order by 1"`
   must list one version for every file in `supabase/migrations`. If some are missing, find out why
   the first missing file failed and carry on from that file. Do not start again from the top: the
   files are not written to run twice.

   **Not yet tried on a real project:** this whole way round. What was tried: the table is the one
   `db push` makes, and after files applied as plain SQL and recorded by this loop, `db push` finds
   nothing left to do. What is not known: whether the API takes the city file (772 KB) in one
   request, and whether a file that fails half-way leaves nothing behind. If the city file is
   refused for its size, send its nine `insert` statements one at a time - blank lines separate
   them, and each can be sent again safely.

4. **Check it,** through the same API (`--read-only` cannot change anything):

   ```bash
   npx supabase@3.2.0 db query --remote --read-only \
     "select jobname, schedule, command, active from cron.job order by jobname"
   npx supabase@3.2.0 db query --remote --read-only "select count(*) from public.cities"
   npx supabase@3.2.0 db query --remote --read-only \
     "select time_multiplier from private.flight_settings"
   ```

   The first must show three rows, all with `"active": true`: `deliver-due-messages` every minute
   (`* * * * *`, `select private.deliver_due_messages()`), `forget-old-reports` hourly
   (`17 * * * *`, `select private.forget_old_reports()`) and `tidy-up` daily (`43 4 * * *`,
   `select private.tidy_up()`). The second is 4,310 and the third is 1.

   Then check that the tidy-up can do everything the privacy policy says it does. Whatever it is
   not allowed to touch, it skips without an error, and it returns what it skipped - so run it once
   by hand. It deletes what is due, so it needs `--yes`:

   ```bash
   npx supabase@3.2.0 db query --remote --yes "select private.tidy_up()"
   ```

   It must return an empty list, which this command prints as `"tidy_up": []` (psql prints the same
   empty list as `{}`). Anything else names the step and the reason, such as
   `sign-in log: permission denied for table audit_log_entries`; until that is fixed, the policy's
   sections on sessions, the sign-in log and banned accounts are wrong: ask Supabase support, or
   change the policy. (Running it deletes nothing that the daily job would not.)

   A day later, look at whether the jobs really ran:

   ```bash
   npx supabase@3.2.0 db query --remote --read-only "
     select j.jobname, d.status, d.return_message, d.start_time
     from cron.job j
     left join lateral (
       select * from cron.job_run_details d
       where d.jobid = j.jobid order by d.start_time desc limit 1
     ) d on true
     order by j.jobname"
   ```

   Each of the three must have a `status` of `succeeded` and a `start_time` within its schedule.

5. **Configure the app:** the project URL and its publishable (anon) key go into `.env` as
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` — never the service-role or secret
   key, which `src/lib/env.ts` refuses to start with. `.env` stays out of git. Add
   `EXPO_PUBLIC_CONTACT_URL=https://vnznznznz.github.io/night-courier/` and
   `EXPO_PUBLIC_PRIVACY_POLICY_URL=https://vnznznznz.github.io/night-courier/privacy-policy.de.html`,
   the pages on the GitHub Pages site (see "Where the web pages live", under "Before first
   submission"). The help page carries the contact address, so the app bundle needs none.
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
`npx supabase@3.2.0 config push --yes` switches confirmation off again, and section 3.10 of the
privacy policy stops being true. The SMTP settings themselves can stay in the dashboard: the file
does not declare them, so a push leaves them alone.

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

  **Where the web pages live.** Decided on 5 November 2026, live since 10 November 2026: GitHub
  Pages, as a user site. The public repository `vnznznznz.github.io` is served at
  `https://vnznznznz.github.io/`, and Night Courier's pages are in its folder `night-courier/`:

  | File                     | From                              | Address                                                          |
  | ------------------------ | --------------------------------- | ---------------------------------------------------------------- |
  | `index.html`             | `docs/store/support-page.md`      | `https://vnznznznz.github.io/night-courier/` (`{{SUPPORT_URL}}`) |
  | `privacy-policy.de.html` | `docs/store/privacy-policy.de.md` | `{{PRIVACY_POLICY_URL}}`, the binding version                    |
  | `privacy-policy.en.html` | `docs/store/privacy-policy.en.md` | alongside, linked from the German page and back                  |

  **To change them**, edit the Markdown here - never the HTML there - and rebuild into a checkout
  of the site repository next to this one:

  ```bash
  OPERATOR_NAME=… OPERATOR_ADDRESS_DE=… OPERATOR_ADDRESS_EN=… CONTACT_EMAIL=… \
  EFFECTIVE_DATE=YYYY-MM-DD SITE_URL=https://vnznznznz.github.io/night-courier/ \
  npm run build:pages -- --out ../vnznznznz.github.io
  ```

  then commit and push there; GitHub publishes within a minute or two. The site repository's
  README has the command with the values filled in. `EFFECTIVE_DATE` is the policy's "Stand": move
  it on whenever the policy's content changes, and tell users of an important change (policy
  section 15). `scripts/build-store-pages.mjs` refuses to build while a value is missing, the
  date is not one that exists (30 February), a placeholder is left over, a link within a page leads
  nowhere, or a page would load anything from another site, and its test builds the pages with
  made-up details on every `npm run verify`.

  The Markdown sources here keep their placeholders; the filled-in pages, with the operator's name
  and postal address, live only in the site repository, never in this one. That repository is
  public too, and git keeps every earlier version of a page, so an address once committed there
  stays readable in its history even after it changes - to take it out for good, delete that
  repository and create it again. GitHub, Inc. (USA) hosts the pages and logs visitors' IP
  addresses for security and operation; the pages themselves set no cookies and load nothing from
  other sites. How long GitHub keeps those logs and whether it is certified under the Data Privacy
  Framework are **to check**; a `github.io` site is served over HTTPS only. In the app,
  `EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_CONTACT_URL` stay settings of `.env` and the EAS
  environment (values in "Setting up the hosted project", step 5).

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
