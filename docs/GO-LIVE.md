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
| Supabase project in Zurich              | free tier (pauses when idle: "Traps to diarise")  | **not created**                 | everything — see "Setting up the hosted project"                     |
| Custom SMTP (Resend/Postmark/SES)       | free tier                                         | not started                     | any second user; password reset                                      |
| Apple Developer Program                 | 99 USD/year (CHF 99 in Switzerland, **to check**) | not started                     | Phases 15–17: any install beyond Expo Go                             |
| Expo account for EAS builds             | free tier                                         | not started                     | Phases 15–16                                                         |
| Google Play Console                     | 25 USD once                                       | not started                     | Android only; skip if iOS-only                                       |
| GitHub Pages site `vnznznznz.github.io` | free                                              | **Live** since 10 November 2026 | the privacy policy and Support URLs - see "Where the web pages live" |

**Apple enrolment is the longest pole.** Individual identity verification takes days to weeks, and
it gates every build that is not Expo Go — TestFlight included. It is also the only unavoidable
cost on the iOS side; nothing in the app itself costs money.

### C. Compliance artifacts — the web pages are live; the store answers are drafted in `docs/store/`

| Item                              | Required by                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Privacy policy at a public URL    | Apple 5.1.1(i), Art. 19 FADP, GDPR Art. 13 | **Live** since 10 November 2026: `https://vnznznznz.github.io/night-courier/privacy-policy.de.html` (binding), English at `privacy-policy.en.html` beside it. Built from `docs/store/privacy-policy.*.md` with `npm run build:pages`, as `LAUNCH_STATE=before-launch` until the project is in Zurich and the DPA is signed. The pages of 10 November went up without that notice; whether the site carries it by now is the check under "Where the web pages live" |
| Support URL                       | Apple 1.2                                  | **Live** since 10 November 2026: `https://vnznznznz.github.io/night-courier/`, built from `docs/store/support-page.md`. It names the operator and the contact address and points to the privacy policy for the postal address. In the app via `EXPO_PUBLIC_CONTACT_URL`. Fallback: the privacy policy URL, if Apple wants the address on the Support URL itself                                                                                                    |
| Contact postal address            | Apple 1.2, Art. 19 FADP, GDPR Art. 13      | Decided. Published only in the hosted privacy policy, section 1 (the support page points there), whose filled-in copy exists only in the site repository `vnznznznz.github.io`; in App Store Connect where a form asks; never in this repository                                                                                                                                                                                                                   |
| EULA with a zero-tolerance clause | Apple 1.2 enforcement practice             | **Done** in the app: the house rules (`src/app/rules.tsx`), agreed to at sign-up                                                                                                                                                                                                                                                                                                                                                                                   |
| App Privacy "nutrition label"     | App Store Connect                          | **Answers drafted** in `docs/store/app-store.md` (Google's Data safety form: `docs/store/google-play.md`)                                                                                                                                                                                                                                                                                                                                                          |
| Age rating questionnaire          | App Store Connect                          | **Answers drafted** in `docs/store/app-store.md`; mandatory since 31 Jan 2026                                                                                                                                                                                                                                                                                                                                                                                      |
| Trader status declaration         | EU DSA                                     | **Not applicable** on a TestFlight-only path. Any App Store distribution in the EU needs it, wherever the operator lives. A private, non-commercial operator would normally declare non-trader (**to check**); as a trader, Apple would show the postal address, phone number and email on the store page. See `docs/store/app-store.md`, section 7                                                                                                                |

Account deletion is already built and tested, which is the one item on Apple's list that is code
rather than paperwork.

### D. Build and distribution plumbing — not started

- `eas.json` does not exist. Build profiles for development, preview and production.
- EAS project link, plus signing credentials. No APNs key or FCM project: there is no push.
- First TestFlight upload, and Beta App Review on the first build of each version.
- Automation for the **90-day TestFlight expiry**. Worth setting up with the first build rather
  than rediscovering it a quarter later when the app dies on everyone's phone.

### Known gaps already logged

Recorded where the work is, not only here:

- ~~**Password reset cannot be completed in-app.**~~ Solved: the email carries an 8-digit code,
  which is typed into the app together with the new password (`src/app/reset-password.tsx`). It
  reaches people once custom SMTP exists ("Before a second person can sign up").
- ~~**The link in an auth email hands a whole sign-in to the URL scheme.**~~ Solved: there is no
  link. Each of the six emails the auth server sends with a code - the confirmation of a new
  account, the reset, and four the app never asks for (a sign-in code, a change of address, an
  invitation, a reauthentication) - has a template of the app's, with the code to type into the
  app and no link (`supabase/templates`, named in `supabase/config.toml`). The app names its
  sign-in flow itself, `flowType: 'implicit'` in `src/lib/supabase.ts`, and not the code flow
  (PKCE): with no link in any of them, a verifier kept on the phone would protect nothing. The
  templates go to the hosted project with its config ("Setting up the hosted project", step 2),
  before custom SMTP.
- **Whether an address has an account can still be found out.** The app answers an address that
  has one as it answers any other, with three exceptions. While email confirmation is off,
  sign-up says so plainly, by design: a new address is signed in at once anyway. While the
  project has sent all the emails it may in the hour, sign-up answers an address with a confirmed
  account differently from one without ("Before a second person can sign up" says how to keep
  that rare). And sign-up refuses a username that is taken only for an address that has no
  account yet, so anyone who knows a username can try addresses with it. Closing that needs a
  change in the database: sign-up that does not fail on a taken username, or a check of usernames
  that needs no address. The auth server tells by itself, whatever the app shows: within a minute
  of an email it refuses another only to an address with an account, it answers such an address
  measurably slower (seen on the local servers), it answers a sign-up for an address with a
  confirmed account "User already registered" while confirmation by email or by phone is off
  ("Before a second person can sign up", step 4), it answers a taken username with an error, and
  it answers a sign-in to a suspended or removed account with "User is banned", whatever the
  password.
- **A lost answer to a sign-up's code can leave a stranger's names on an account.** If the auth
  server confirms an address with a sign-up's code and its answer never reaches the app, the
  account is not finished: it has no password, and keeps the username and name of the first
  sign-up for the address - a stranger's, if someone typed the address before its owner did. The
  app says so once that code is refused again: ask for a new code first, and if none comes within
  a few minutes, set a password with "I forgot my password"; after a sign-up it adds that whoever
  finds a username or name on the account that they did not choose can delete it in the profile
  and sign up again. That is decided: such an account is not removed for it, and whoever writes
  about a username they never chose can be told the same. The hint also shows for the same wrong
  code typed twice after a try that never left the phone, which the app cannot tell apart; a reset
  taken at once then removes the courier's own account, still unconfirmed, and they sign up again
  (ARCHITECTURE, "A code holds the way in").
- **The web build has seams of its own,** which reach nobody: it is for development, and the apps
  people are given are the iOS and Android builds ("Recommended distribution" below). One tab's
  sign-out still under way can undo another tab's sign-in, a sign-out the server never heard of is
  forgotten at a reload of the page, and the reset's "Your new password is saved" is never drawn -
  only a screen reader hears it (ARCHITECTURE, "Sessions" and "A code holds the way in").
- ~~**The concurrency test cannot run in this harness.**~~ Solved in Phase 7:
  `concurrency.pg.test.mjs` runs the races against a real Postgres, which CI provides as a
  service container.
- **The migrations must be pushed to the hosted project.** With `db push --remote`, after
  linking, as "Setting up the hosted project", step 3, has it: each command there is handed the
  database password. Without one `db push` does not stop but connects through a temporary login
  role, which is not yet tried on a real project. Until then the app signs in and then fails on
  every screen that reads a bat.

### The shortest path to friends using it

1. Create the Supabase project in Zurich, link it, push config and migrations. _(unblocks everything)_
2. Start Apple enrolment. _(long lead time, gates TestFlight)_
3. ~~Phases 3–9 — the product itself, ending with messages that actually arrive.~~ Done, with
   Phase 11. Push the migrations to the hosted project ("Setting up the hosted project", step 3).
4. Custom SMTP, then email confirmation on ("Before a second person can sign up: custom SMTP").
   Password reset and confirmation are built: both work by a code from the email, typed into the
   app, and the codes' settings and the emails' templates go to the project with its config
   (step 1).
5. ~~Phase 10 push.~~ Dropped.
6. ~~Phase 13a, which App Review will check.~~ Done, and so is Phase 12. Phases 13 and 14 remain.
7. ~~Privacy policy and support page on the GitHub Pages site.~~ Live since 10 November 2026, to
   be built with `LAUNCH_STATE=before-launch` for now. Once the project exists in Zurich (step 1)
   and the DPA is signed and dated in `docs/store/gdpr-records.md`, 5.1 - and before anyone but
   the operator has an account - rebuild them with `LAUNCH_STATE=live`, that date as `DPA_SIGNED`,
   and a new `EFFECTIVE_DATE` (see "Where the web pages live"). The rest of group C (the store
   answers in `docs/store/`) goes in when the accounts exist.
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

The SQL in this section is run as it stands here, in this order, on the test database by
`scripts/runbooks.test.mjs` with every `npm run verify` - all but the export of sign-in records,
which needs Supabase's real tables. Whoever changes a statement here changes what that test runs.

**Where:** Supabase dashboard → Table Editor → schema `public` → `reports`. The open ones, oldest
first, in the SQL editor:

```sql
select created_at, reason, reported_username, reported_display_name, letter_body, note,
       id, reported_id, reporter_id
from public.reports
where resolved_at is null
order by created_at;
```

Each row says who was reported (`reported_id`, plus the username and display name as they were),
why, the reporter's note, and for a reported letter its full text (`letter_body`). The reporter is
`reporter_id`; the person reported is not told who that was, unless the law requires it, so do not
tell them — and remember
that a letter has one reader, so acting on a letter can tell its sender who reported it anyway.
`id` is the report's own, for the last step below.

Identify people by `reported_id`, not by the username. When `reported_id` is null the account has
been deleted, and its username is free: it may belong to someone else by now.

The steps below write to one or the other of the two people. Their addresses are on their
accounts, and nowhere in the report:

```sql
select id, email, banned_until from auth.users
where id in ('<reported_id>', '<reporter_id>');
```

Keep the two apart: a warning goes to the address beside `reported_id`, the email after a threat
to the one beside `reporter_id`. An email that reaches the wrong one of them tells the person
reported who reported them. `banned_until` shows whether an account is already suspended or
removed.

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
  privacy policy says exactly this, so do not ban for longer by hand.

  Where there is nothing to remove, it says so and changes nothing: `there is no account <id>`
  for an account that is gone - deleted by its owner while you were deciding, say - and
  `account <id> has already been removed: the ban on its sign-in ends <time>` for one removed
  before. An app still signed in to a removed account says on its roost and its profile that the
  account no longer exists, and on Letters and Friends that it has been suspended, each time with
  Sign out and Contact; signing in to it again is answered as for a suspended one (below).

  To delete an account without a ban instead - at its owner's request, a child's account, an
  address that was not the person's to sign up with - there is
  `select private.delete_account('<id>');`, with the steps around it in
  `docs/store/gdpr-records.md`, 5.4. It frees the email address at once. Use the dashboard's
  button (Authentication → Users → Delete user) for neither: it deletes with one statement that
  reaches the account's rows in a different order from everything else here, so that a letter
  landing at that moment makes one of the two fail, and it writes an entry of its own into the
  sign-in log, with the person's id and email address.

- **A threat** — stop the account at once, but delete nothing yet: removing it takes every letter
  between the two of them with it, and the report keeps only the one reported.

  ```sql
  update auth.users set banned_until = now() + private.ban_period() where id = '<reported_id>';
  ```

  The database refuses their app at once: every request but a read of their own profile, the bare
  rows of their friendships and the list of cities, for as long as its sign-in lasts - an hour at
  most. Saving a name or a city is refused, and so is deleting the account, so nothing goes before
  you have decided. The app says so once on each screen that is refused - "This account has been
  suspended. To ask why, write to the person who runs Night Courier." - with Sign out and Contact
  in place of Try again. When it next renews its sign-in, within the hour while it is open, the
  auth server refuses: the app signs out, and the welcome screen says the same, once. Signing in
  again is answered as a wrong password is, with "That email and password do not match an
  account.", so that nobody who only types the address learns that it has an account, or what
  became of it. Only "I forgot my password" tells, once the code from the email has proved the
  mailbox theirs. So someone who writes that their password has stopped working may be suspended,
  or removed: the first query of `docs/store/gdpr-records.md`, 5.4, finds a sign-in by its
  address, with its `banned_until`.

  Nothing changes for their friends. They can still write to the account - refusing their letters
  would tell them of the suspension - and letters it sent that are still in the air land as usual.

  This is a suspension: the account still exists, with its profile and letters, and the two years
  the privacy policy names count from the removal, which sets the ban afresh.

  Then write to the reporter, at the address on their account, from the contact mailbox. The email
  has to say two things:
  - that the account is suspended and will be removed in a week, and that every letter between the
    two of them goes with it, so they may want copies (screenshots) of their letters first;
  - **how to get at the letters.** Reporting blocks by default, and a block hides every letter from
    that courier, the reported one too: a reporter who opens the app to take screenshots finds
    nothing there. So tell them to unblock first - Your profile → Blocked couriers → Unblock, and
    the letters are back under Letters - and that they can block again afterwards, from one of
    the letters (open it → Block). Unblocking does not make the two friends again, so no new
    letter can reach them. Without this step the week is of no use to them. (Tried on the test
    database: after the default report and the suspension the reporter's inbox is empty and both
    letters are refused; after Unblock both are back.)

  If the police are to have the report, export it now, together with the account's sign-in
  records - the privacy policy says these may go with it:

  ```sql
  select created_at, payload ->> 'action' as action, ip_address
  from auth.audit_log_entries where payload ->> 'actor_id' = '<reported_id>' order by created_at;
  select created_at, refreshed_at, ip, user_agent from auth.sessions where user_id = '<reported_id>';
  ```

  When the week is up, `select private.remove_account('<reported_id>');` as above. Delete your own
  exported copy once the police have theirs.

  If the threat proves unfounded within the week - a joke between friends, the wrong account -
  lift the suspension instead, and tell the reporter, who has been told the account would go:

  ```sql
  update auth.users set banned_until = null where id = '<reported_id>';
  ```

  The account can sign in again at once, and an app still signed in to it is served again at
  once, with everything it had: nothing was deleted. Only do this to an account that still has its
  profile. One that `private.remove_account` has removed has nothing left to come back to, and
  its ban is what the privacy policy promises (the query under "Sperren nach spätestens zwei
  Jahren beenden" in `docs/store/gdpr-records.md`, 5.6, lists the suspended accounts that still
  have a profile).

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
  and which many cloud environments do not let out. Step 3 says what to do then. It also needs
  the database password, which step 1 makes and keeps in a file on the machine it runs on until
  step 3 is done.

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

And one thing about the session that runs them: it gives each command a shell of its own, so
nothing that one command sets - a variable, an `export` - is there for the next. No step below
relies on it. What a later step needs from an earlier one is written down where it arises: the
project's `<ref>` in the output of step 1's check, the database password in a file.

The commands were tried on 17 November 2026 - those that keep the database password in a file,
and step 2's with the emails' codes and templates, on 21 November - with exactly this version:
against a stand-in for Supabase's API, against scratch Postgres databases, and, read-only, against
the local stack. No hosted project existed then. What that could not show is marked **not yet
tried on a real project**; go slowly there, and correct this page when you know more.

1. **Create the project:** name `night-courier`, region **`eu-central-2` (Zurich)**, free plan, in
   the operator's organisation, with a generated database password that is written neither into
   the repository nor into a chat. It goes into a file in the home directory that only this user
   can read:

   ```bash
   npx supabase@3.2.0 orgs list
   [ -s ~/.night-courier-db-password ] ||
     (umask 077 && node -p "require('crypto').randomBytes(24).toString('hex')" > ~/.night-courier-db-password)
   [ -s ~/.night-courier-db-password ] &&
     npx supabase@3.2.0 projects create night-courier --org-id <org> --region eu-central-2 \
       --db-password "$(cat ~/.night-courier-db-password)" --yes
   ```

   A file, because a variable does not last from one command to the next: this step used to
   `export` the password for step 3, and in a session step 3 would never have seen it. The second
   command makes a password only where the file has none. Once the project exists the file is the
   only copy of its password, and a second one made over it would leave step 3 with the wrong one.
   The third does nothing while the file is empty. (The CLI would not go on without a password
   either: given an empty one where nobody can be asked, it stops with
   `non-interactive mode requires the following to be set: --db-password` and creates nothing.)

   Nobody has seen this password and nobody needs to: do not print the file. Nothing uses it but
   `db push` in step 3 - the app never does - and step 3 deletes the file when the migrations are
   in. A database password that is wanted later - by the operator, for the password manager
   (`docs/store/gdpr-records.md`, 5.2), or by a later session with a new migration to push (step
   3, "Later, or on another machine") - is a new one, set in the dashboard (Project Settings →
   Database; **to check** where exactly).

   **Check:** `npx supabase@3.2.0 projects list --output-format json` shows a project named
   `night-courier` with `"region":"eu-central-2"` and, a minute or two after it was created,
   `"status":"ACTIVE_HEALTHY"`. Its `"ref"` is the `<ref>` of every later step. The region cannot be
   changed afterwards: if it is not `eu-central-2`, stop here and say so. And
   `wc -c < ~/.night-courier-db-password` says 49: the password's 48 characters and a line end.

   **The same day,** read what the free plan says about pausing a project nobody uses, and decide
   what to do about it: "Traps to diarise" has what is known, what a pause would do to this app,
   and the three options. This is for the operator to read and decide, not for a session to
   settle.

2. **Link and push the auth settings:**

   ```bash
   npx supabase@3.2.0 link --project-ref <ref>
   npx supabase@3.2.0 config diff
   npx supabase@3.2.0 config push --yes
   ```

   `link` must answer with `"project_ref":"<ref>"`; from then on every command names this project
   as its target. `config diff` changes nothing; read it. Against a new project it lists a handful
   of settings as `update`, or as `local_only` where the project shows no value of its own: the
   site URL and the redirect addresses, the minimum password length, a recent sign-in before a
   password is changed, **email confirmation off** - until custom SMTP exists, Supabase's own
   mailer reaches nobody but the operator, so with confirmation on a friend's sign-up would never
   complete (see "Before a second person can sign up" below) - and the codes the emails carry:
   eight digits (`otp_length`), good for a day (`otp_expiry`, 86400 seconds where the project's
   own is an hour), under the subject "Your Night Courier code" in each of six emails. Those are
   what `config push` then sends, from `supabase/config.toml`, and with them the six emails' texts
   from `supabase/templates`, each with a code and no link ("Known gaps already logged").
   `config diff` does not show the texts: this version of the CLI does not compare them, and left
   a text changed on the stand-in unmentioned. The push does compare them, and the check below
   asks it.

   Settings it lists as `remote_only` are ones the file does not declare; the push leaves them
   alone. Two of them matter here. `max_frequency` is the minute the project waits between two
   emails to one address: leave it, because the app waits as long itself before it offers a new
   code (`RESEND_WAIT_SECONDS` in `src/features/auth/use-resend-wait.ts`), and should one ever
   change, change both. `sms.enable_confirmations` is for "Before a second person can sign up",
   step 4. The auth server can also send notices of its own, of a changed password or address
   among others (`[auth.email.notification]` in this CLI's config); the file turns none of them
   on, and whether a new project sends any is **to check** in the dashboard. Should one ever be
   turned on, give it a template of the app's too, without a link.

   **Check,** three times: these settings decide whether a friend can sign up at all, and nothing
   in step 4 looks at them.

   - `npx supabase@3.2.0 config diff --output-format json` now ends in a line whose `"counts"` has
     `"update":0` and `"local_only":0`. (Not `--exit-code`: that also counts the `remote_only`
     settings, which are meant to stay.)
   - The emails' texts, which `config diff` leaves out: `npx supabase@3.2.0 config push --yes`
     once more. It sends only what still differs from the files, and must now find nothing: its
     last line has `"service":"auth","status":"up_to_date"`, and a `"message"` that begins
     `Nothing was pushed`. A text that had not arrived is named in that line under `"changes"`
     instead - as `["auth","email","template","recovery","content"]`, say - and sent; push once
     more, and that push must then find nothing.
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
   (the list above comes from a stand-in holding Supabase's defaults as far as they are known),
   the settings endpoint on a hosted project (it was read on the local stack), the check of the
   texts by a second push, and whether the project takes everything the push sends - codes that
   last a day above all.

   The check of the texts assumes that the project hands each text back exactly as it was sent.
   If the second push of that check names the same text as the first did, the project keeps that
   text in a form of its own, and every further push would name it as well: stop pushing, compare
   that template in the dashboard (Authentication → Emails, **to check** where exactly) with its
   file in `supabase/templates`, and correct this page.

   This CLI sends `otp_expiry = 86400` without complaint; whether the project has a ceiling of its
   own is not known. If the push is refused for it, change these in one change: `otp_expiry` in
   `supabase/config.toml`; the words "It works for a day" in each template under
   `supabase/templates` (in `confirmation.html` they run over two lines);
   `src/tests/email-codes.test.ts`, which holds the two to each other; and the code's life of a
   day wherever the privacy policy (section 3.10, both languages), the help page
   (`docs/store/support-page.md`, both languages), `docs/store/gdpr-records.md` (V10),
   `README.md`, `docs/ARCHITECTURE.md` and this page give it. Then rebuild the pages with a new
   `EFFECTIVE_DATE` ("Where the web pages live").

3. **Apply the migrations:**

   ```bash
   [ -s ~/.night-courier-db-password ] &&
     SUPABASE_DB_PASSWORD="$(cat ~/.night-courier-db-password)" \
       npx supabase@3.2.0 db push --remote --dry-run --debug
   [ -s ~/.night-courier-db-password ] &&
     SUPABASE_DB_PASSWORD="$(cat ~/.night-courier-db-password)" \
       npx supabase@3.2.0 db push --remote --yes
   ```

   `db push` opens a connection to the project's Postgres and needs the database password for
   it. Each command is handed the one from step 1, for itself alone. A command here that ends at
   once and prints nothing found no file: this is not the machine that created the project, or
   the file has been deleted. Do not take its first two lines off to get past that; see "Later,
   or on another machine" below.

   The dry run changes nothing. It must print `Target: project night-courier (<ref>)`, then
   `Using database password from SUPABASE_DB_PASSWORD (environment)...` - that line is what
   `--debug` is there for - and then every file in `supabase/migrations` under "Would push these
   migrations". The second command applies them in order and records each one in
   `supabase_migrations.schema_migrations`, so that a later push sends only what is new. It never
   runs `supabase/seed.sql`, which is for the local stack only: do not add `--include-seed`, and
   never aim a `db reset` at this project.

   `20261121160000_confirmation_clears_password.sql`, the last file but one as this is written,
   puts a trigger on `auth.users`; the last, `20261121180000_tidy_up_ages.sql`, changes only the
   ages the tidy-up counts. As an address that was emailed a code to confirm it is confirmed, the
   account's password goes, in the same statement: whoever signed up first chose it, and that may
   have been anyone who typed the address. From then on no password signs in until one is set with
   the session the code brought, and the app sets one at once - the password typed at sign-up, the
   one typed at sign-in, or the new one of a reset. While confirmation is off the trigger changes
   nothing: the auth server confirms each new account as it makes it, emails no code, and the
   password stays. What it means for an account confirmed by hand is under "Before a second
   person can sign up".

   **Without a password `db push` does not stop.** It asks Supabase's API for a database role of
   its own, good for a short time, and connects as that - the dry run too, and just the same
   when `SUPABASE_DB_PASSWORD` is set but empty. Under `--debug` the line then reads
   `No database password found; using a temporary login role...`. That is what these two
   commands would have done in a session while step 1 kept the password in a variable. It may
   well work, but it is **not yet tried on a real project**, and against the stand-in the dry run
   asked for the role and then tried to connect eight times, for two and a half minutes, before it
   gave up. It is not a way to arrive on by accident: if the dry run prints that line, stop it and
   find out why the password was not read.

   **Check:** the dry run once more, now answering in JSON:

   ```bash
   [ -s ~/.night-courier-db-password ] &&
     SUPABASE_DB_PASSWORD="$(cat ~/.night-courier-db-password)" \
       npx supabase@3.2.0 db push --remote --dry-run --output-format json
   ```

   It ends in `"upToDate":true` with `"target":{"kind":"linked","project_ref":"<ref>"` in the same
   line. `"kind":"local"` means the check looked at the wrong database.

   **Later, or on another machine** - a later session, with a new migration to push - the file is
   not there, and the password that was in it cannot be had back. There are three ways, and the
   first is the one to prefer:
   - The operator sets a new database password in the dashboard (Project Settings → Database;
     **to check** where exactly) and stores it for the session as the environment variable
     `SUPABASE_DB_PASSWORD` of the cloud environment, the way the access token is stored and never
     in a chat. (Not as a network secret: those are added to HTTPS requests, and this is a
     Postgres connection.) Everyone who uses that environment can read the variable, so the
     operator takes it out again after the push. The CLI reads it itself, so the commands are then

     ```bash
     [ -n "$SUPABASE_DB_PASSWORD" ] && npx supabase@3.2.0 db push --remote --dry-run --debug
     [ -n "$SUPABASE_DB_PASSWORD" ] && npx supabase@3.2.0 db push --remote --yes
     ```

     with the same line to look for in the dry run.

   - The way round through HTTPS, below. It needs neither the password nor the connection.
   - The CLI's temporary role, knowingly: the two commands with nothing in front of them. The dry
     run is where it shows whether that works. **Not yet tried on a real project.**

   Whichever way it goes: a new migration is on the project before any build that relies on it
   reaches anyone.

   **Where no Postgres connection gets out.** `db push` connects to `db.<ref>.supabase.co` (IPv6
   only) or to the project's pooler (IPv4; `link` has saved its address in
   `supabase/.temp/pooler-url`), port 5432. If it fails with
   `IPv6 is not supported on your current network`, run `link` again; if it still cannot connect,
   the network lets only HTTPS out. `db query --remote` does not need the connection: it sends the
   SQL through Supabase's API. Send each file that way, in order, and record it as `db push` would
   have, so that a later `db push` skips it:

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

   **Last,** whichever way the migrations went in, once the check above or the version list has
   shown them all: delete the password file. Nothing after this step needs it, and a database
   password belongs in the operator's password manager or nowhere (`docs/store/gdpr-records.md`,
   5.2) - not on whatever machine ran the session.

   ```bash
   rm -f ~/.night-courier-db-password
   ```

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
   `select private.tidy_up()`). The second is 4,308 and the third is 1.

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
   change the policy. (Running it deletes nothing that the daily job would not.) A reason of
   `deadlock detected` is no missing right: that step met a request at that very moment, was
   undone on its own, and is done by the next run - run the command again.

   A day later, look at whether the jobs really ran:

   ```bash
   npx supabase@3.2.0 db query --remote --read-only "
     select j.jobname, d.status, d.return_message, d.start_time
     from cron.job j
     left join lateral (
       select * from cron.job_run_details d
       where d.jobid = j.jobid order by d.start_time desc nulls last limit 1
     ) d on true
     order by j.jobname"
   ```

   (`nulls last`, because a run that a restart cut off before it began has no `start_time`, and
   would otherwise come first; the tidy-up deletes such a row within about a week.) Each of the
   three must have a `status` of `succeeded` and a `start_time` within its schedule.
   For the tidy-up that says only that it ran: a step it left out is in what it returns, which the
   job shows to nobody, and in the Postgres log, as a warning that begins `the tidy-up left out:`.
   So run `select private.tidy_up()` by hand once more, with the command above: it must return the
   empty list again.

5. **Configure the app:** the project URL, `https://<ref>.supabase.co`, and its publishable (anon)
   key - the one from the check in step 2 - go into `.env` as `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` — never the service-role or secret key, which `src/lib/env.ts`
   refuses to start with. `.env` stays out of git. Add
   `EXPO_PUBLIC_CONTACT_URL=https://vnznznznz.github.io/night-courier/` and
   `EXPO_PUBLIC_PRIVACY_POLICY_URL=https://vnznznznz.github.io/night-courier/privacy-policy.de.html`,
   the pages on the GitHub Pages site (see "Where the web pages live", under "Before first
   submission"). The help page carries the contact address, so the app bundle needs none.

   **An EAS build needs all four values in its own environment** - the Supabase URL and key as
   much as the two links. `.env` is not in git, so EAS never receives it; the values go into the
   EAS project's environment variables (or `env` in the build profile, once `eas.json` exists). All
   four are public by design; none of them is a secret.

   **Check:** `node scripts/check-build-env.js --for-others` reads the files a build reads and must
   end with "These values are complete for a build that other people will use." The build checks
   again by itself: a production bundle (`npx expo export`, or the bundling step of an EAS build)
   without the Supabase URL and key, or with the placeholders of `.env.example`, stops with "Night
   Courier cannot be bundled with these values" (`metro.config.js`) instead of producing an app
   that fails on its first screen. **Not yet tried on EAS**, where it should show in the build log;
   tried with `npx expo export` for iOS, Android and the web.

6. **Try it:** sign up two accounts, choose cities, become friends, send a letter, watch it land;
   report it and check the row in `public.reports`. That the sign-ups go through shows that the
   triggers the migrations put on `auth.users` work for the auth server, whose role is not the
   one the migrations ran as.

   Then suspend one of the two, with the statement under "A threat" ("Handling a report") and its
   id in place of `<reported_id>` (the first query of `docs/store/gdpr-records.md`, 5.4, finds it
   by the address), and see its app refuse its next load at once - pull down on its roost - with
   "This account has been suspended. To ask why, write to the person who runs Night Courier." Lift
   the suspension with the statement given there, and see the app work again. Only this shows that
   the database sees a suspension on the hosted project. It reads `auth.users` with the rights of
   the role the migrations ran as, which gets past that table's row security on the local stack;
   on a project where it did not, a suspension would go unseen, and nothing would say so.

   Then delete both test accounts, with Delete my account in each.

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

### Traps to diarise

Two of them take years to spring, the third a quiet week.

- **Google inactive-account closure.** Google marks accounts for closure that were created over
  a year ago and never submitted an app for review. Verify your contact email and phone in Play
  Console and sign in at least every 180 days. This is the only way the Android side breaks
  silently years from now.
- **Apple membership lapse.** If the yearly renewal fails, TestFlight builds stop working.
- **Supabase pauses a free project nobody uses.** This plan puts the project on Supabase's free
  plan. As far as is known here, a free project with no activity for about a week is paused,
  after a warning by email, and one left paused for long (90 days was the figure) can no longer
  be restored in place, only downloaded as a backup. **None of that could be checked when this
  was written** (17 November 2026): supabase.com cannot be reached from the session's network,
  and such terms change. So **on the day the project is created, read what the free plan says
  about pausing** - the plan's description in the dashboard, and Supabase's documentation on
  paused projects - and write the answers here: after how long, what counts as activity (the
  app's requests, certainly; whether the delivery job, which runs inside the database every
  minute, counts is not known), how the warning arrives, and for how long a paused project can
  be restored.

  What a pause would mean for this app. Every request fails, so nobody can sign in, read or
  write. It should sign nobody out who is signed in: the app keeps its sign-in through any answer
  to a renewal that is neither a new session nor the auth server's word that the session is over
  (`src/lib/guarded-fetch.ts`). Nothing is lost, but nothing moves: the three scheduled jobs stop
  with the database. A letter that falls due in that time lands only once the project is
  restored - at the next run of the delivery job, or the first time its recipient opens the app.
  And everything the privacy policy says is deleted on time - sign-in records after 30 days,
  unused sessions after 90, reports after 180 - waits for as long as the pause lasts, and is
  caught up at the first run afterwards. A quiet week is not unlikely for slow letters among a
  handful of friends: one holiday is enough.

  The honest options:
  1. **Accept it.** See that Supabase's emails reach a mailbox that is read, restore the project
     from the dashboard when the warning comes, and tell the friends that the app can be away for
     a day. Costs nothing; the app is down until someone notices.
  2. **Keep it awake from outside**, with a small request on a schedule - a GitHub Actions
     workflow, say, that calls the project's API once a day with the publishable key (the URL and
     that key are public by design). Cheap, but a workaround. The database lets nothing be read
     without a sign-in, so such a request is answered with a refusal: whether Supabase counts
     it, and puts up with it, is part of the check above. And GitHub is said to switch off the
     scheduled workflows of a public repository that has seen no activity for 60 days (**to
     check**), which would only move the trap.
  3. **Pay.** A paid plan is not paused (Pro, 25 USD a month - **to check**). It would also change
     what the paperwork assumes about backups, how long logs are kept and how long a session may
     last (`docs/store/gdpr-records.md`, V8, V9 and L1), so the privacy policy would need another
     pass.

  How to see it, whichever it is: `npx supabase@3.2.0 projects list --output-format json` gives
  the project's `"status"`. `ACTIVE_HEALTHY` is right; `INACTIVE` is what this CLI calls a paused
  project, and its `link` then stops with "project is paused" and sends you to the dashboard
  (read in the CLI's own messages; no project existed to try it on). After a restore, run the
  checks of "Setting up the hosted project", step 4, again: the three jobs must still be there
  and active.

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
   (`docs/store/gdpr-records.md`, 5.1) before the web pages are rebuilt with `LAUNCH_STATE=live`,
   since sections 7 and 8 of the privacy policy say it exists; until then the pages carry the
   notice that Night Courier has not started (see "Where the web pages live").

### Before a second person can sign up: custom SMTP

This one blocks earlier than it looks. Supabase's built-in email service **will not deliver to
anyone who is not on the project's team**, and caps the whole project at two messages per hour.
Until a custom SMTP provider is configured:

- a friend's signup fails silently if email confirmation is on — the account is created and the
  code never arrives;
- password reset does not work for anyone but the operator, whatever the confirmation setting is.

From the day a provider is configured, the emails reach everyone who signs up or asks for a
reset. In this order:

1. The codes' settings and the emails' templates are on the project already: they went with its
   config ("Setting up the hosted project", step 2, and its check of the texts).
2. Configure a provider under Authentication → Emails → SMTP Settings (Resend, Postmark and SES
   all have free tiers large enough for this app). That also lifts the cap to 30 messages per
   hour. Raise it well above the sign-ups expected in an hour (Authentication → Rate Limits,
   **to check** where exactly): while the hour's emails are used up, sign-up answers an address
   that has a confirmed account differently from one that has none ("Known gaps already logged").
   The SMTP settings themselves can stay in the dashboard: the file does not declare them, so a
   push leaves them alone.
3. Try it before anyone depends on it, with an account of the operator's own on the hosted
   project: for an address without one the auth server sends nothing, while the app asks for the
   code all the same. If there is none yet - step 6 of "Setting up the hosted project" deleted its
   test accounts - sign one up in the app with the operator's address first; while confirmation
   is off it is signed in at once, so sign out again (Your profile → Sign out). Then, in the app,
   "I forgot my password", for that address. The email must come with the subject
   "Your Night Courier code", eight digits and no link. Type the code into the app with a new
   password: the app opens, and from then on that password signs in.
4. Turn email confirmation on: `enable_confirmations = true` under `[auth.email]` in
   `supabase/config.toml`. In the file, as its own comments say, and not in the dashboard alone:
   otherwise the next `npx supabase@3.2.0 config push --yes` switches confirmation off again, and
   section 3.10 of the privacy policy, once step 6 below has changed it, stops being true. In the
   same change, `enable_confirmations = true` under `[auth.sms]` as well, while sign-up by phone
   stays off (`enabled = false`): `config diff` then lists `auth.sms.enable_confirmations` too if
   the project has it off, and the push sends both (tried against the stand-in). While the
   project has it off, the auth server answers a sign-up for an address that has a confirmed
   account with "User already registered", and so tells whoever asks that the address has one;
   the app passes that on to nobody (seen on the local auth server that has email confirmation
   on, and phone confirmation off). With both on, the auth server should answer such a sign-up as
   it answers one for a new address - **to check**, since no server here has both on.

   Push the change and check it as in "Setting up the hosted project", step 2, with one
   difference: the project's settings (the `curl` in that step's check) must now contain
   `"mailer_autoconfirm":false` and `"phone_autoconfirm":false`; `true` in either means the push
   did not reach the project. Then commit the changed `supabase/config.toml`, so that a config
   push from any checkout keeps confirmation on.

5. Sign up on a device, with an address whose mail you can read: the code arrives, and typed into
   the app it signs the new account in.
6. Then change section 3.10 of both privacy policies as their TO CHECK and PRÜFEN comments say,
   and rebuild the pages with a new `EFFECTIVE_DATE` ("Where the web pages live"). Until then the
   published policy says that an address is not confirmed at sign-up.

Once confirmation is on, an account confirmed by hand - with
`update auth.users set email_confirmed_at = now() where id = '<id>'`, or any other way, since
the trigger sits on the table - loses its password as well, when a code to confirm it had been
emailed ("Setting up the hosted project", step 3). Its owner then sets one with "I forgot my
password", which needs an email of its own. So it does not help someone whose emails do not
arrive: find out why they do not. (A password set with the admin API stays - in the same call,
`"email_confirm": true` with a `"password"`, or in one before it: the auth server saves it first,
and that clears the time the code was sent. It would be a password you chose for someone and sent
them, and the app has no way to change it but "I forgot my password" - so not that either.) A
sign-up nobody confirms is deleted a week after the last code sent to it, and the address can then
sign up afresh.

An account made by hand without confirming its address - in the dashboard, or through the admin
API without `"email_confirm": true` - cannot sign in, and the tidy-up deletes it a week after it
was made, or after the last code sent to it if one was asked for, confirmation on or off. So make
accounts in the app, as the demo accounts are made, or confirm them as you make them.

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
  and on the sign-up form. Contact also stands wherever a courier may need a person: beside an
  account that has ended or been suspended, on the welcome screen after a suspension, on the
  reset's code stage, and on the code screen when a sign-in ended before the account was finished.
  Both read their address from the build's environment —
  `EXPO_PUBLIC_CONTACT_URL` and `EXPO_PUBLIC_PRIVACY_POLICY_URL` — and are hidden while unset.
  Without a contact address, the words of a suspension, and of that sign-in, name nobody to write
  to either.
  **Set both for every build anyone else will use**, in `.env` and in the EAS environment: an App
  Reviewer looks for exactly these. Night Courier's builds use the help page and the privacy
  policy on GitHub Pages; the two values are in "Setting up the hosted project", step 5. (The
  contact setting would also take a `mailto:` link. It is not used here: whatever is set ends up
  in the app bundle, and the help page can change its address without a new build.)
- **Beta App Review needs a way in.** A fresh account has no friends and no letters, so a reviewer
  who signs up finds no Report or Block button anywhere. Before submitting, create a reviewer
  account and a "Demo Friend" on the hosted project, make them friends, and a day before, send two
  harmless letters from Demo Friend to the reviewer. Sign both up in the app, each with an address
  whose mail you can read: once confirmation is on, each needs its code, and an account confirmed
  by hand loses its password ("Before a second person can sign up"). Put the reviewer's sign-in in
  Beta App Review Information, with notes along these lines:

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

  The contact email is decided. Like the postal address it stays out of this repository: it is
  on the help page and in the hosted privacy policy, both built with it from the environment
  (`CONTACT_EMAIL`, in "Where the web pages live" below). The app itself does not carry it: its
  Contact button opens the help page, whose address is what goes into `EXPO_PUBLIC_CONTACT_URL`
  ("Setting up the hosted project", step 5).

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
  EFFECTIVE_DATE=YYYY-MM-DD LAUNCH_STATE=before-launch \
  SITE_URL=https://vnznznznz.github.io/night-courier/ \
  npm run build:pages -- --out ../vnznznznz.github.io
  ```

  then commit and push there; GitHub publishes within a minute or two. The site repository's
  README has the command with the values filled in. It was written before `LAUNCH_STATE` existed,
  and as it stands there the build refuses it ("set LAUNCH_STATE"): with the first rebuild, add
  `LAUNCH_STATE=before-launch` to the command there, and a line saying that a live build also
  needs `DPA_SIGNED` (below).

  **Check that it arrived,** a few minutes after the push. The pages are what people read, not
  the repository:

  ```bash
  for page in index.html privacy-policy.de.html privacy-policy.en.html; do
    curl -fsS "https://vnznznznz.github.io/night-courier/$page" -o "/tmp/night-courier-$page" &&
      grep -c 'class="notice"' "/tmp/night-courier-$page"
  done
  grep -o 'Stand: [^<]*' /tmp/night-courier-privacy-policy.de.html | head -1
  ```

  Built as `before-launch` this prints 2, 1 and 1 - the help page carries the notice once in each
  language - and then the date that was given as `EFFECTIVE_DATE`. Built as `live` it prints 0
  three times. A page that could not be fetched gives an error and no number: that is not a 0.
  The pages that went up on 10 November 2026 print 0, 0, 0 and "Stand: 10. November 2026";
  whether the site has moved on from them is this check, and the item for it is in
  `docs/store/gdpr-records.md`, 5.2. (Tried on 17 November 2026 against a local stand-in serving
  a rebuilt copy of the site. GitHub Pages itself cannot be reached from the session's network,
  so against the real site it is **not yet tried**.)

  `EFFECTIVE_DATE` is the policy's "Stand", the day this version of it is from: move it
  on to the day of the rebuild whenever the policy's content changes, and tell users of an
  important change (policy section 15). The build refuses a date that is still to come, so a
  change announced in advance goes up on the day it takes effect, not before with that day's
  date. The next rebuild is such a change: the policy and the help page have both changed since
  the pages of 10 November 2026 went up, and
  `git log --since=2026-11-10 -- docs/store/privacy-policy.*.md docs/store/support-page.md` lists
  each change.

  **`LAUNCH_STATE` says whether Night Courier has started,** and nothing is built without it. The
  policy speaks in the present tense - a database in Zurich, a processing agreement with Supabase,
  standard contractual clauses a reader can ask for a copy of - and the pages have been public
  since 10 November 2026, before any of that existed. So:
  - `LAUNCH_STATE=before-launch` puts a short notice on every page: directly under the navigation
    of each policy, and at the top of each half of the help page, in the page's language. It says
    that Night Courier has not started yet, that the page describes how the app will handle data
    from its start, and that until then there are no accounts and the app processes no personal
    data. Every rebuild uses this, whatever its reason, until the conditions below are met. (The
    pages that went up on 10 November had no such notice; the first rebuild adds it.)
  - `LAUNCH_STATE=live` builds the pages without the notice. Use it, together with a new
    `EFFECTIVE_DATE`, only once both of these are true: the hosted project exists in
    `eu-central-2` (Zurich), the region the policy names ("Setting up the hosted project", step 1
    and its check); and the processing agreement with Supabase, the DPA with the standard
    contractual clauses, is signed and its date is written into `docs/store/gdpr-records.md`,
    section 5.1, first item ("hier das Datum eintragen"). The policy's PRÜFEN notes (TO CHECK in
    the English version) list what else it says that has to be checked against the real project
    by then. And do it before anyone but the operator gets an account: from that day "there are no
    accounts" is the sentence that is not true.

    A live build asks for that date: add `DPA_SIGNED=YYYY-MM-DD` to the command, copied from
    `gdpr-records.md`, 5.1. Without it the build stops, and so it does when the date is later
    than `EFFECTIVE_DATE` or still to come. The pages do not show it; the build's last line does
    ("live: no notice (processing agreement signed …)"). It is there so that "live" cannot be
    typed by someone who has no date to give - the pages have once gone up before the agreement
    existed. If the blank in 5.1 is still empty, the answer is `LAUNCH_STATE=before-launch`,
    never a date made up for the purpose.

  `scripts/build-store-pages.mjs` refuses to build while a value is missing, a date is not one
  that exists (30 February) or is still to come, a live build has no date for the agreement, a
  placeholder is left over, a link within a page leads nowhere, or a page would load anything
  from another site, and its test builds the pages with made-up details on every
  `npm run verify`. Before anything else it refuses an `--out` inside this repository, by any
  path - `.`, a whole path, a folder not made yet, a link - and writes nothing: this repository is
  public, and the pages carry the operator's name and address. A folder beside it, such as the
  site's checkout, is outside it. "Anything from another site" is any element that runs or embeds
  something (`<script>`, `<img>`, `<iframe>`, `<object>`, `<embed>` and the like), any attribute
  that fetches what it names (`src`, `srcset`, `data`, `poster`, `background`, `ping` and the
  like), an `href` or `xlink:href` on anything but a link, an event handler, a `javascript:` link,
  a refresh in a `<meta>`, and `@import`, `url(` or `image-set(` in a style; the refusal names what
  it found. Plain links - to the pages themselves, to other sites, to anchors, to `mailto:` - still
  build.

  It also refuses to build from a checkout whose migrations lack a function that a promise on
  the pages rests on, and names it: that an account deleted on request loses its sign-in records
  at once, for one, is `private.delete_account`. Documents and migrations are written on
  different branches; the pages are built from a tree that has both, or not at all. Build them
  from the tree whose migrations are on the hosted project - before the launch, the one whose
  migrations will be.

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
