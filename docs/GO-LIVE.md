# Go-live plan

Researched August 2026. Facts about store policy change; re-check anything marked with a date
before acting on it.

The headline: **go-live is not the last phase.** Three things on this page have lead times or
one-way doors, and two of them block earlier phases. They should be started now, in parallel
with Phases 2–14, not when the code is finished.

---

## The two findings that change the plan

### 1. The GDPR household exemption does not cover you

It is tempting to assume that a private app for friends falls under Art. 2(2)(c) DSGVO —
processing "by a natural person in the course of a purely personal or household activity".

It does not. Recital 18, third sentence: _"However, this Regulation applies to controllers or
processors which provide the means for processing personal data for such personal or household
activities."_ Operating the server your friends message through is exactly that. The exemption
is gone the day a second household uses the app, and the CJEU reads it narrowly (_Ryneš_
C-212/13, _Lindqvist_ C-101/01).

Practical consequence: a privacy policy, a real hard-delete, data minimisation and EU hosting
are obligations, not polish. Most of this is already in the build plan; it now has a reason
attached.

**Good news, separately:** there is **no Impressum obligation**. § 5 DDG (successor to § 5 TMG
since 14 May 2024) applies to _geschäftsmäßige_ digital services. A free, invite-only app with
no ads, no donations and no affiliate links is outside it. Profit intent is not the test —
sustained commercial offering is — but a family app is not that.

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

---

## Recommended distribution: different mechanism per platform

Do not use the same approach on both stores. The economics and the failure modes differ.

|                    | iOS                                                                | Android                                  |
| ------------------ | ------------------------------------------------------------------ | ---------------------------------------- |
| **Path**           | TestFlight, external tester group, public link                     | Play Console, **internal testing** track |
| **Cost**           | €99 / year, forever                                                | $25 once                                 |
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
  in Brazil, Indonesia, Singapore and Thailand, with global rollout including Germany planned
  from 2027. This path has a shelf life.

### Two multi-year traps to diarise

- **Google inactive-account closure.** Google marks accounts for closure that were created over
  a year ago and never submitted an app for review. Verify your contact email and phone in Play
  Console and sign in at least every 180 days. This is the only way the Android side breaks
  silently years from now.
- **Apple membership lapse.** If the €99 renewal fails, TestFlight builds stop working.

---

## Running it on your own iPhone before paying for anything

You do not need a developer account to start. Three options, in the order they are worth trying.

### 1. Expo Go — free, instant, no Mac (do this one)

Run `npm start` and scan the QR code with the camera. The app runs on your iPhone in seconds,
reloads as the code changes, and costs nothing. This covers Phases 1–9, 11 and 12.

The one gap is **push notifications (Phase 10)**, which need a development build rather than
Expo Go, and a development build needs a paid account for signing. Expo removed Android push
from Expo Go in SDK 53 and iOS support has been in flux since — re-check the current state when
Phase 10 arrives rather than assuming either way.

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
- If he is enrolled as an **Individual** — far more likely for someone paying €99 personally — he
  can give you App Store Connect access to manage TestFlight and metadata, but **he** has to
  create the signing credentials and run the builds. The app is published under his name and he
  carries the responsibility for it.
- Signing in with his Apple ID yourself is account sharing, breaches the developer agreement, and
  risks his account. Not worth it.

Either way, the app would belong to his team, not yours, and moving an app between teams later is
possible but tedious. If Night Courier is going to outlive the experiment, your own €99 enrolment
is the cleaner foundation.

---

## What to do now, in parallel with the build

### This week — these gate later phases

1. **Enrol in the Apple Developer Program** (€99/yr). Individual enrolment identity verification
   can take days to weeks. This gates Phase 10 — push notifications need an APNs key — as well
   as Phases 15–16. It is the longest pole; start it first.
2. **Create the Google Play Console account** ($25 one-time).
3. **Create the Supabase project in `eu-central-1` (Frankfurt).** This is the Phase 2 blocker and
   a **one-way door**: the region is immutable after creation. Encryption at rest (AES-256) and
   in transit is on by default. Note that Supabase Inc. is a US corporation, so region choice
   gives data _residency_, not sovereignty — transfers rest on SCCs in their DPA, which is
   appropriate for a hobby project but worth knowing.

### Before a second person can sign up: custom SMTP

This one blocks earlier than it looks. Supabase's built-in email service **will not deliver to
anyone who is not on the project's team**, and caps the whole project at two messages per hour.
Until a custom SMTP provider is configured:

- a friend's signup fails silently if email confirmation is on — the account is created and the
  link never arrives;
- password reset does not work for anyone but the operator, whatever the confirmation setting is.

Configure a provider under Authentication → Emails → SMTP Settings (Resend, Postmark and SES all
have free tiers large enough for this app), which also lifts the cap to 30 messages per hour, and
then turn email confirmation on. Both are dashboard settings, not code.

### Before Phase 10 (push)

Keep the notification content-free, as already specified — "A bat has arrived 🦇", body fetched
from the EU backend on open. APNs is US-operated and every payload transits it, so a content-free
push keeps message text out of a US processor, shrinks the App Privacy declaration, and leaves
the door open to end-to-end encryption later.

### Before first submission

- **Privacy policy at a public URL.** Mandatory in App Store Connect metadata _and_ linked
  in-app (Guideline 5.1.1(i)). Must state what is collected, retention and deletion.
- **In-app account deletion** (Guideline 5.1.1(v), in force since 30 June 2022). Deactivation is
  not sufficient. Already in the plan for Phase 2 — build it as a real hard delete, which also
  satisfies GDPR Art. 17.
- **Report, block, and a contact route** — the new Phase 13a below.
- **A support URL and a reachable contact address.** You cannot stay fully anonymous: Guideline
  1.2 requires published contact information and GDPR Art. 13 requires the controller's identity.

  The operator has decided to use a personal postal address. **It is deliberately not stored in
  this repository, and must not be.** This repository is public; anything committed here is
  scraped, mirrored, and permanent in git history even after deletion. The address belongs in
  App Store Connect's contact fields and in the privacy policy hosted at its own URL — both
  entered directly, at Phase 16, and neither of them in version control.

  The same applies to the privacy policy: host it somewhere you control and link to it, rather
  than committing a document containing a home address to a public repo.

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
now ─────────────────────────────────────────────► Apple enrolment (slow, gates Phase 10)
now ─────────────────────────────────────────────► Play Console account
now ─────────────────────────────────────────────► Supabase project, eu-central-1  ← gates Phase 2
                Phases 2 ──────────────────► 13
                                             Phase 13a  safety and moderation
                                             Phase 14   testing
                                             Phase 15   EAS production builds
                                             Phase 16   TestFlight + Play internal
                                                        ↳ automate the 90-day rebuild here
                                             Phase 17   invite the circle
```

Phase 17 is not "publish". For this app it is: send the TestFlight link and the Play internal
opt-in link to the people who should have them.
