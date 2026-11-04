<!--
Notes for the operator - remove before publishing, like every comment in this file.

1. Replace the placeholders: {{OPERATOR_NAME}}, {{OPERATOR_ADDRESS}}, {{CONTACT_EMAIL}},
   {{EFFECTIVE_DATE}}, {{PRIVACY_POLICY_URL}}, {{SUPPORT_URL}}. The filled-in version does NOT go
   into this public repository, only onto the hosted page.
2. Every "TO CHECK" comment marks a statement to check against the hosted Supabase plan, the
   services chosen, or an operator decision before publishing.
3. This is a translation of privacy-policy.de.md, which is binding. Change both together.
4. This version describes the code including the migration
   supabase/migrations/20261104120000_privacy_housekeeping.sql: the daily "tidy-up" job, sessions
   ended after 90 days unused, the sign-in log kept 30 days and deleted with the account, the names
   from sign-up, the old city, private.remove_account with a two-year ban. If that changes, update
   sections 3.1, 3.2, 3.8, 3.9, 5, 9 and 11 and "In short". On the hosted project,
   "select private.tidy_up();" must return {} (docs/GO-LIVE.md, "Setting up the hosted project",
   step 4). Otherwise the list names every step the job skips for want of a privilege, and what
   this policy says about it is wrong.
5. Section 5 (iPhone) describes the keychain with WHEN_UNLOCKED_THIS_DEVICE_ONLY (KEYCHAIN_OPTIONS
   in src/lib/secure-storage.ts, commit 3a343b0). If that is reverted, put the old sentence back:
   "Keychain entries can be included in encrypted backups and moved to a new iPhone."
-->

# Privacy policy for Night Courier

**Effective: {{EFFECTIVE_DATE}}**

This is an English translation. The German version is the binding one; where the two differ, the
German version prevails.

## In short

- Night Courier is a private app for letters between friends. I run it on my own, as a private
  individual – no company, and no money made from it.
- There are no ads, no tracking, no analytics tools, no push notifications and nothing to buy. I do
  not sell data.
- I store only what the app needs to work: your email address, your password (only in a form nobody
  can read), your username and display name, your city, your friendships, your letters, whom you
  block and what you report. On top of that comes technical data, such as your IP address, from
  signing in and in logs.
- The database is kept by Supabase, a US service, on servers in Zurich, Switzerland (sections 7 and
  8).
- Letters are not end-to-end encrypted. Technically, Supabase and I could read them. I read letters
  only when they are reported to me, or when I cannot fix a technical fault any other way.
- You can delete your account in the app at any time. Every letter you sent or received goes with
  it, including from the friends you wrote with. Some things remain for a while afterwards, above
  all reports: for up to 180 days (section 11).
- Night Courier is for people aged 12 and over. Anyone under 16 needs the permission of a parent or
  guardian.
- You have rights, such as access and erasure. Just write to me: {{CONTACT_EMAIL}}.

<!-- TO CHECK (operator decision): the promise "I read letters only when they are reported to me, or
when I cannot fix a technical fault any other way" (here and in section 3.4) has not been decided
explicitly yet. Confirm or change it. -->

## 1. Who is responsible for your data?

The controller under the General Data Protection Regulation (GDPR) is:

- **Name:** {{OPERATOR_NAME}}
- **Address:** {{OPERATOR_ADDRESS}}
- **Email:** {{CONTACT_EMAIL}}
- **Contact and help:** {{SUPPORT_URL}}

I run Night Courier as a private individual, not as a business. I have not appointed a data
protection officer – for any question about your data, come straight to me. Where this policy says
"I", it means me; "you" means you, when you use Night Courier.

## 2. What this is about

Night Courier is an app for slow letters. Everyone has three bats. A bat carries one letter and
flies the real distance between your city and your friend's: the further, the longer – at least 20
minutes within the same city, days across a continent.

Letters only travel between people who have both accepted each other as friends. There is no search,
no public profile and no way to write to a stranger.

The rules for using the app are in the house rules, in the app ("Your profile" → "House rules").

## 3. What data I process, and why

### 3.1 Your account

When you sign up, you enter your email address, a password, a username and a display name.

- **Email address.** You sign in with it, and that is where an email goes if you forget your
  password. I also use it to write to you when I need to – for example a warning after a report, a
  message when you have reported a threat (section 3.7), or notice of an important change to this
  policy (section 15). Other users never see your email address.
- **Password.** Only a so-called hash (bcrypt) is stored. Nobody can work your password out from it,
  not even me. The app itself never stores your password.
- **Account details.** Your account has a random user ID and some times: when the account was
  created, when you last signed in, when your email address counts as confirmed and when a
  password-reset email was last sent – and, if it comes to that, a ban (section 3.8).
- **A copy of your names from sign-up.** Supabase also keeps the username and display name you enter
  at sign-up in your account record. Your profile is made from it; after that the copy is not
  needed. A daily job deletes it, at the latest one day after sign-up. Until then it is also in the
  sign-in token on your device (section 5).

**Why:** to give you an account and provide the app. **Legal basis:** Art. 6(1)(b) GDPR – the data
is needed to provide the app to you as the house rules describe.

### 3.2 Your profile and your city

- **Username.** How friends find you: anyone who wants to send you a friend request has to know your
  exact username. It cannot be changed in the app.
- **Display name.** The name your friends see, and anyone you send a request to. You can change it
  in your profile at any time.
- **Your city.** You choose it from a list. The app never asks for your location and does not use
  GPS. From the distance between two cities the server works out how long a bat flies.
- **Moving.** A new city only becomes the one your bats fly from after 24 hours – otherwise anyone
  could "borrow" a friend's city for one short flight. To make that work, when you change city I
  store your previous city and when you changed. Once the 24 hours are over, a daily job deletes
  both, at the latest two days after the change.

**Legal basis:** Art. 6(1)(b) GDPR.

### 3.3 Friendships and requests

I store who sent whom a request, whether it was accepted, when it was made and when it was accepted.
An open request stays until it is accepted, declined or withdrawn; it does not expire on its own.
When a request is declined or withdrawn, or a friendship is ended or broken off by a block, I delete
the record.

**Legal basis:** Art. 6(1)(b) GDPR.

### 3.4 Letters

For each letter I store:

- the text (1 to 2,000 characters),
- who sent it, and to whom,
- which bat carries it,
- which city it flies from and to – as the cities were when it was sent – and the distance,
- when it was sent, when it is due to land, and when it landed,
- when the recipient first opened it. Only the recipient sees this; there are no read receipts,
- a technical reference, so that a letter is not sent twice.

Letters are stored as text in the database. They are encrypted on the way there (HTTPS), and
Supabase encrypts the stored data. But there is no end-to-end encryption. That means: technically,
Supabase and I can read every letter. I read letters only when they have been reported to me
(section 3.7), or when I cannot fix a technical fault any other way.

You can write whatever you like in a letter – including very personal things, such as your health or
your beliefs. I do not analyse letters and use them for nothing but delivering them – unless a
letter is reported (section 3.7). Still, think about what you write: whoever gets your letter can
keep it, copy it or take a picture of it.

Nobody can delete a single letter, neither the sender nor the recipient, and there is no period
after which letters are deleted on their own. A letter stays stored until one of you deletes your
account, or I remove one of the two accounts – then it disappears for both of you. Only when a
letter has been reported does the report keep a copy of it (section 3.7).

<!-- TO CHECK (legal): which legal basis under Art. 9 GDPR covers letters with health, religious or
other special-category data that users write into them themselves? This policy deliberately draws
no conclusion. Also open: whether letters with no period and no way to delete a single letter are
compatible with storage limitation (Art. 5(1)(e) GDPR), or whether a period or a delete button is
needed. -->

**Legal basis:** Art. 6(1)(b) GDPR.

### 3.5 Your bats

For each of your three bats I store whether it is at home or out, and when it last left or came
home. That is how the server makes sure everyone has exactly three bats. While one is flying, the
app shows you whom it is flying to and when it arrives.

**Legal basis:** Art. 6(1)(b) GDPR.

### 3.6 Blocking

When you block someone, I store who blocked whom, and when. Your friendship (or an open request)
ends, they can no longer write to you or ask to be friends, and their letters are hidden from you
until you unblock them. The letters are not deleted.

The blocked person is not told. They will notice that you are no longer friends, though, and the
letters you sent them stay with them. Only you see your list of blocked people ("Blocked couriers").

A block stays until you lift it or one of you deletes your account. Unblocking does not make you
friends again.

**Legal basis:** Art. 6(1)(b) GDPR, because blocking is a feature of the app, and Art. 6(1)(f) GDPR
– the legitimate interest in protecting you from messages you do not want.

### 3.7 Reporting

You can report a letter or a person. A report contains:

- who reported, and who was reported,
- the reason (from a list) and, if you like, a note from you (at most 500 characters),
- a copy of the reported person's username and display name as they were at the time,
- for a reported letter, a copy of its text and when it was sent,
- when the report was made, and later my own note on what I did about it.

A report about you therefore also holds details that do not come from you, but from the person who
reported you: the reason and their note.

**Who sees a report:** only me; it is stored at Supabase (section 7). Not even you can look at your
report afterwards. The person reported is not told who reported them – unless the law requires me
to. But a letter has only one recipient: if I act on a reported letter, its sender may guess who
reported it.

When you report, "also block" is already switched on. You can switch it off if you still want to get
letters from that person.

**What I do with a report:** I read every report. Depending on what happened, I do nothing, send the
person a warning to the email address of their account, or remove their account (section 3.8). If
it is about a threat, I ban the reported account at once, but remove it only a week later. Before
that, I write to the person who reported it, at the email address of their account: every letter
between the two of you goes with the other account, and they should be able to keep copies first.
With threats or possible crimes, I may pass a report on to the police, together with the reported
account's sign-in data as far as it is still stored by then: its sessions and its entries in the
sign-in log, each with an IP address (section 3.9).

**How long:** a report is deleted automatically 180 days after it was made – whether it has been
dealt with or not. If either person deletes their account before then, the report still stays until
then: without the deleted person's user ID, but with the copied names, the copied letter text and
the note. Otherwise someone could take back a threat, along with the only proof of it, by deleting
their account. If I pass a report on to the police, the police keep their copy under their own
rules, beyond the 180 days too; I delete my own exported copy after handing it over.

<!-- TO CHECK (legal): whether § 24 BDSG (change of purpose) plays a part, alongside Art. 6(1)(f)
GDPR, in passing a report - and the reported account's sign-in data - to the police voluntarily.
The policy already names it as a purpose. Not cited. The email alert for new reports that GO-LIVE
suggests is content-free by its instructions; as long as it stays so, it does not belong here. -->

**Legal basis:** Art. 6(1)(f) GDPR. My legitimate interest – and that of everyone who uses Night
Courier – is preventing and dealing with abuse, protecting people, especially children and young
people, and keeping evidence a victim might need. Where I have to hand a report over because the law
requires me to, the legal basis is Art. 6(1)(c) GDPR.

### 3.8 Removed and banned accounts

If someone breaks the house rules seriously or repeatedly, I remove their account. Their profile,
bats, friendships, blocks and every letter the account sent or received are then deleted – on both
sides. If it is about a threat, I ban the account at once and remove it a week later, so that the
person who reported it can keep copies first (section 3.7).

So that the same person cannot simply sign up again with the same email address, I ban the
account's sign-in when I do this. The account record then stays at Supabase: the email address, the
password hash and the times from section 3.1. It is kept for **two years**; then a daily job
deletes it. The account's sessions end after 90 days already, because a banned account can no
longer use them, and its entries in the sign-in log are deleted after 30 days (section 3.9).

<!-- TO CHECK: this section follows private.remove_account and the runbook (docs/GO-LIVE.md,
"Handling a report"): a ban for private.ban_period() = two years, after which "tidy-up" deletes the
sign-in and its identities; for a threat, ban first and remove a week later. "Two years" holds only
as long as nobody bans for longer by hand. Keeping the account record with its password hash is
deliberate: without it the ban could be got round. The sessions end after 90 days unused, like any
others (tidy_up); what the police are to have of them, the runbook exports in the week between the
ban and the removal. -->

**Legal basis:** Art. 6(1)(f) GDPR – the legitimate interest in protecting everyone else from
someone who was removed for breaking the rules.

### 3.9 Sign-in, sessions and logs

Keeping you signed in and the app safe creates technical data at Supabase. Every request the app
makes to the server carries your IP address and a technical label for your device or operating
system (the so-called user agent).

- **Sessions.** Each sign-in creates a session with your IP address, user agent and times. When you
  sign out ("Sign out"), your sessions are deleted, on all your devices at once. They are also
  deleted with your account. A session that has not been used for **90 days** – on a device where
  you have not opened the app for that long – is deleted by a daily job; there you sign in again. If
  signing out does not reach the server, without a network for example, the app still signs you out
  on your device, but the sessions on the server stay until then; sign in and out once more. If you
  lose a phone, sign in and out on another device, or write to me.
- **Sign-in tokens.** While the app is open, your sign-in is renewed about once an hour. Each
  renewal creates a new token, and the old one stops working. Tokens are kept at most as long as the
  session they belong to.
- **Sign-in log.** Supabase logs events such as sign-up, sign-in, sign-out, every renewal of your
  sign-in, requesting a new password and changing it, each with your user ID, email address, time
  and, where recorded, IP address. It shows when you used the app. A daily job deletes every entry
  after 30 days. When you delete your account, your entries are deleted with it at once.
- **Server logs.** Supabase logs requests to the server: IP address, time, the address requested
  (which can contain your user ID), user agent and result, for sign-ins also your email address, and
  database error messages. The app sends letters, notes and names in the body of a request, not in
  its address, so they do not normally end up in these logs. A database error message can contain a
  single value, though, such as a username that is already taken at sign-up. Supabase deletes these
  logs automatically after a short time.

<!-- TO CHECK:
- Sessions: checked on the local Supabase stack on 4 November 2026. Each sign-in adds a row to
  auth.sessions (with IP address and user agent) and to auth.refresh_tokens; the app's sign-out
  (scope "global") deletes both, for every device. The hosted project runs the same GoTrue; nothing
  left to do.
- Sign-in tokens: GoTrue's automatic cleanup (replaced tokens after 24 hours) only runs when
  GOTRUE_DB_CLEANUP_ENABLED is set; the default is "false", and locally it is off. If it is on for
  the hosted project, the sentence can read: "Supabase deletes replaced tokens after 24 hours."
- Sign-in log: the 30 days and the deletion with the account come from the migration
  20261104120000_privacy_housekeeping.sql (tidy_up, delete_own_account), checked against the local
  stack's real GoTrue on 4 November 2026. If the postgres role lacks the privilege on the hosted
  project, both skip the step without an error; tidy_up then names it in what it returns. The
  check: "select private.tidy_up();" must return {} (docs/GO-LIVE.md, "Setting up the hosted
  project", step 4; locally: {}). delete_own_account finds the entries
  by payload->>'actor_id'; entries without an actor_id that still hold the email address go only
  after 30 days. ip_address is empty locally, hence "where recorded".
- Server logs: look up the retention of the chosen Supabase plan and write it in (e.g. "after one
  day"); keep "after a short time" only if it really is a few days. Also where these logs are stored
  (section 8). -->

**Legal basis:** Art. 6(1)(b) GDPR as far as your sign-in is concerned. Otherwise Art. 6(1)(f) GDPR:
my legitimate interest is running the app safely and reliably, spotting attacks and abuse, and
finding faults.

### 3.10 Emails from Night Courier

The only emails Night Courier sends you automatically are about your account: a link to reset your
password when you ask for one, and – once it is switched on – a link to confirm your email address
at sign-up. The email contains a one-time link that goes through Supabase's server back into the
app. No newsletters, no ads. When I write to you myself (section 3.1), the email comes from my
mailbox (section 3.11).

At the moment, an email address is not yet confirmed at sign-up. If someone has used your email
address for an account without your knowledge, write to me, and I will delete that account.

**Legal basis:** Art. 6(1)(b) GDPR.

### 3.11 When you write to me

When you write to me – through "Contact" in the app or to {{CONTACT_EMAIL}}, with a question,
something to add to a report, or a request about your data – I process your email address, your name
if it is in the email, and what you write. My mailbox is with Microsoft (Outlook.com). I keep your
message as long as I need it for your request, and delete it afterwards.

<!-- TO CHECK (operator decision): state a fixed period, e.g. "at the latest six months after your
request has been dealt with", and put the same period into section 9. Note: a personal Outlook.com
mailbox runs under Microsoft's consumer terms; Microsoft is not a processor there, and there is no
Art. 28 GDPR agreement for it. Whether that is enough for handling reports and data protection
requests: TO CHECK. -->

**Legal basis:** Art. 6(1)(b) GDPR when it is about your account; Art. 6(1)(c) GDPR when you
exercise your data protection rights, because I am then legally required to answer; otherwise Art.
6(1)(f) GDPR – my legitimate interest in answering questions and dealing with reports.

### 3.12 Test versions through TestFlight and Google Play

Night Courier is only available as a test version: on the iPhone through Apple's TestFlight app, and
on Android through Google Play's internal testing. Apple and Google process data for this under
their own privacy policies – about your Apple Account or Google account, for example.

- **TestFlight:** Apple shows me when the app was installed and opened, crash reports with the
  device model and iOS version, and feedback you send through TestFlight – text and screenshots.
  Please make sure a screenshot shows no letter you do not want to share. What else I see about you
  as a tester depends on how you were invited.
- **Google Play:** for internal testing, I add the email address of your Google account to a list of
  testers in the Google Play Console. Google also shows me reports of crashes and frozen app
  screens, with the device model and Android version.

I delete your address from the list of testers as soon as you write to tell me you no longer want
to test. How long Apple and Google keep their data is set by their own policies.

<!-- TO CHECK: what App Store Connect shows about public-link testers; which fields TestFlight feedback
and crash reports contain; whether Google's pre-launch reports run on internal testing and create
accounts on the hosted project (if so: switch them off, or mention them here); Apple's and Google's
retention periods. -->

**Legal basis:** Art. 6(1)(b) GDPR, to make the app available to you, and Art. 6(1)(f) GDPR – my
legitimate interest in finding and fixing crashes.

### 3.13 What I do not collect

- **Your age.** At sign-up you only confirm that you are at least 12 and, if you are under 16, that
  a parent or guardian has said yes. This is not stored.
- **Your location, your contacts, photos, camera or microphone.** The app does not ask for them.
- **Device or advertising IDs, push tokens, cookies.** The app has none.
- **Analytics, advertising, tracking, crash reporting from inside the app.** The app contains no
  such components. It connects only to the Night Courier server at Supabase. When you tap "Contact"
  or "Privacy policy", your mail app or your browser opens.

## 4. What others can see

- **Your email address** – no other user; only you, me as the operator, and Supabase as my
  processor.
- **When you send someone a request**, they see your username and your display name. You see only
  their username until they accept.
- **Your friends** see your username, your display name, your city with its country, and how long a
  bat takes to reach you.
- **Anyone you have exchanged letters with** sees, on each letter, your username, your current
  display name, and the cities it flew from and to – even after you are no longer friends, for as
  long as the letter exists. If you change your display name, old letters show the new one too.
- **Anyone who sends you a letter** sees when it landed, but never whether or when you opened it.
- **Anyone who has blocked you** sees you by your username only, not your display name.
- **Anyone who knows your exact username** can find out that it exists, by sending you a request.
  They learn nothing more from that until you accept.
- **Other users** do not see whom you have blocked or reported (although that person may guess,
  sections 3.6 and 3.7), whether you are online, or whether you are writing.

Your random user ID also reaches the app of everyone who is your friend, has sent you a request or
received one from you, has exchanged letters with you, or has blocked you; the app does not show it.

## 5. What is stored on your device

- On your device the app stores only your sign-in (the "session"). It contains an access token with
  your user ID and your email address, a token for renewing the sign-in, and some details of your
  account. Until the copy of your names from sign-up has been deleted (section 3.1) and your sign-in
  has been renewed once after that, those names are in it too.
- **On an iPhone** it is in the iOS keychain, readable only while the iPhone is unlocked, and only on
  this device: it does not move to a new iPhone, not even with a backup; you sign in again there. It
  may stay in the keychain after the app is deleted – sign out first if you want to be sure.
- **On Android** it is encrypted with the Android Keystore. It is excluded from backups and from
  transfer to a new device.
- When you sign out, and after you delete your account, the app deletes the session from your
  device, even if the server cannot be reached at that moment.
- Apart from that, the app stores nothing on your device. Letters, drafts, friend lists and reports
  are on the device only while the app is open. A letter you have started is gone when you close the
  app.
- What your device does by itself is outside the app: the app switcher can show a picture of an open
  letter, for example, the keyboard learns words you type, and a password manager may offer to save
  your password.

<!-- TO CHECK: whether keychain entries survive deleting the app (iOS). For the iPhone sentence, see
note 5 at the top. -->

## 6. Legal bases at a glance

- **Art. 6(1)(b) GDPR (contract):** everything needed to provide the app to you – account, profile,
  city, friendships, letters, bats, blocking, sign-in and the emails about your account.
- **Art. 6(1)(f) GDPR (legitimate interests):** security (sessions and logs), dealing with abuse
  (reports, warnings, removing accounts), keeping reports for 180 days, keeping removed accounts
  banned for two years, passing a report to the police voluntarily, and crash reports. The
  interests behind them: a safe app, protecting the people who use it – children and young people
  above all – and evidence for victims.
- **Art. 6(1)(c) GDPR (legal obligation):** where the law requires me to hand data over, for example
  to the police, a public prosecutor or a court, and when I answer your requests about your data
  protection rights.

## 7. Who receives your data

I do not sell data and do not pass it on for advertising. The only recipients are:

- **Supabase Inc. (USA).** Supabase runs the database, sign-in, server and logs for me, as a
  processor under Art. 28 GDPR, on the basis of a data processing agreement. My project runs in
  Supabase's Zurich region (Switzerland), on servers of Amazon Web Services. Supabase uses further
  sub-processors and publishes a list of them on supabase.com. Privacy policy:
  https://supabase.com/privacy
- **Email delivery.** The emails about your account (section 3.10) are sent by Supabase or by an
  email delivery service acting as my processor. It receives your email address and the link in the
  email, and keeps a log of what it sent.
- **Microsoft.** Microsoft runs my mailbox (Outlook.com), and so receives what you write to me and
  what I write to you – under its own privacy statement:
  https://privacy.microsoft.com/en-us/privacystatement
- **Apple and Google.** They distribute the test versions (section 3.12), under their own privacy
  policies: https://www.apple.com/legal/privacy/ and https://policies.google.com/privacy
- **The host of the web pages** {{PRIVACY_POLICY_URL}} and {{SUPPORT_URL}}. When you open them, it
  receives your IP address and user agent, as any web server does (legal basis: Art. 6(1)(f) GDPR –
  a web page cannot be delivered without them).
- **The police and other authorities** – only if I pass on a report, with the reported account's
  sign-in data (section 3.7), or the law requires me to hand data over.
- **Other users** see what section 4 describes.

Receiving no data about you: Expo, a service I use to build the app, and GeoNames, where the list of
cities comes from – the list is in Night Courier's database, and GeoNames is never asked.

<!-- TO CHECK:
- Supabase: open the list of sub-processors (probably https://supabase.com/legal/subprocessors) and
  link it here; check whether it lists a service in front of the API (such as Cloudflare) or a
  logging service outside Switzerland.
- Email delivery: name the chosen provider (Resend, Postmark or Amazon SES), with where it is based
  and a link, once it is set up, and sign its data processing agreement. If it is based or processes
  in the USA, name it in section 8 too, with its safeguard, and put how long it keeps its sending log
  into section 9.
- Microsoft: whether Microsoft's consumer privacy statement is the right one for a personal
  Outlook.com mailbox.
- Web pages: name the host of the hosted page, and check what it logs, for how long, and whether it
  sets cookies. -->

## 8. Data outside the EU

- **Switzerland.** The database is in Zurich. Switzerland is not in the EU, but the European
  Commission has found that it offers an adequate level of data protection: Decision 2000/518/EC,
  which remains in force under Art. 45(9) GDPR. In its review of January 2024, the Commission found
  that Switzerland's level of protection is still adequate.
- **USA.** Supabase Inc. is a US company. Where Supabase staff or systems access data from the USA,
  for maintenance or support for example, this is covered by the European Commission's standard
  contractual clauses in the data processing agreement (Art. 46(2)(c) GDPR). You can ask me for a
  copy of the standard contractual clauses.
- **Apple, Google and Microsoft** may also process data in the USA and other countries. How they
  safeguard it is set out in their own privacy policies.

<!-- TO CHECK: if a Supabase sub-processor (for logs, say, or in front of the API) processes data in a
third country other than the USA, name it here, with its safeguard. -->

## 9. How long I keep data

| What                                        | How long                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Account, profile, city, bats                | until you delete your account, or I remove it                                       |
| Copy of the names from sign-up              | at most one day (section 3.1)                                                       |
| Previous city and time of a move            | at most two days after the change (section 3.2)                                     |
| Letters                                     | until you or the other person deletes their account; there is no period             |
| Friendships and requests                    | until ended, declined or withdrawn, or until an account is deleted                  |
| Blocks                                      | until you lift them, or until an account is deleted                                 |
| Reports                                     | 180 days from the report, even if an account is deleted before then                 |
| Reports passed to the police                | with the police, under their rules; I delete my exported copy after handing it over |
| Account record of a banned, removed account | two years, then deleted automatically (section 3.8)                                 |
| Sessions                                    | until you sign out or the account is deleted; at most 90 days after last use        |
| Sign-in tokens                              | at most as long as the session                                                      |
| Sign-in log                                 | 30 days; your entries are deleted with your account                                 |
| Server logs at Supabase                     | a short time, then deleted automatically (section 3.9)                              |
| Database backups                            | deleted data may remain in them until the backup is overwritten automatically       |
| Emails to me                                | as long as I need them for your request                                             |
| List of testers on Google Play              | until you write to tell me you no longer want to test                               |

<!-- TO CHECK: backups - whether, and for how long, the chosen Supabase plan keeps backups; write the
period into the table (or delete the row if there are none). -->

## 10. Children and young people – and their parents

- Night Courier is for people aged **12 and over**. Anyone **under 16** needs the permission of a
  parent or guardian. The house rules say so.
- I do not check or store anyone's age. At sign-up, it is only confirmed.
- The app is built so that strangers cannot write to anyone: letters only travel between people who
  have both accepted each other as friends. Someone who knows the exact username can send a friend
  request; it shows only their username and display name, and they can be blocked and reported.
  There are no public profiles, no ads and no tracking. Sexual content involving anyone under 18, or
  sent to anyone under 18, is forbidden. Anyone who breaks that rule should expect me to remove
  their account.
- **What parents can do:** read this policy and the house rules with their child; delete the account
  together with their child ("Your profile" → "Delete my account"); and write to me if they have
  questions, want to report something, or their child has created an account without their
  permission. If a child under 16 has an account without permission, I delete it when the parents
  ask. Before that, I may ask questions to make sure the request really comes from the parents. If I
  learn that someone is younger than 12, I remove their account.
- Good to know: when an account is deleted, all its letters are gone. Anyone who wants to keep a
  letter – as evidence, for example – should take a screenshot first.

<!-- TO CHECK: whether a parent's permission under 16 must legally be consent under Art. 8 GDPR, or
whether Art. 6(1)(b) GDPR is enough (and what the rules on contracts with minors say). This policy
deliberately draws no conclusion. Deleting an account when the parents ask, and removing the account
of anyone under 12, are operator decisions: confirm them. -->

## 11. Your rights

Under the GDPR you have these rights:

- **Access (Art. 15):** you can find out what data I hold about you, and get a copy.
- **Rectification (Art. 16):** you can change your display name and city yourself, in your profile.
  For your username or email address, write to me.
- **Erasure (Art. 17):** you delete your account yourself, in the app: "Your profile" → "Delete my
  account". It happens at once and cannot be undone. Your account, profile, bats, friendships,
  blocks, every letter you sent or received – from the other people's side too – and your entries
  in the sign-in log. What remains afterwards: reports (up to 180 days, section 3.7), server logs
  and backups until they are deleted automatically, emails between you and me, and what Apple or
  Google hold about your test version (section 3.12).
- **Restriction (Art. 18):** you can ask me to only store some data for now and not use it otherwise
  – while it is being settled whether it is correct, for example.
- **Data portability (Art. 20):** you can get the data you gave me in a common, machine-readable
  format. There is no export button in the app; write to me.
- **Complaint (Art. 77):** you can complain to a data protection supervisory authority, in
  particular in the EU country where you live or work, or where the infringement took place. In
  Germany, that is the data protection authority of your federal state. The authority responsible
  for me is the one of the federal state I live in (address in section 1). I would rather you wrote
  to me first, though.

> **Right to object (Art. 21):** where I process data on the basis of legitimate interests (Art.
> 6(1)(f) GDPR), you can object at any time, on grounds relating to your particular situation. I
> then stop processing that data – unless I can show compelling legitimate grounds that override
> your interests, or the processing is for the establishment, exercise or defence of legal claims.
> That may be the case with a report about a threat, for example.

**How:** write to {{CONTACT_EMAIL}}, ideally from the email address you use for Night Courier – so I
can be sure the request comes from you. Otherwise I will ask. I answer within one month. It costs
nothing.

## 12. No automated decisions

There are no automated decisions and no profiling within the meaning of Art. 22 GDPR. The server
does work out automatically how long a bat flies, but that is not a decision about you. Reports,
warnings and removing accounts are decided by me, a human.

## 13. Security

- Every connection between the app and the server is encrypted (HTTPS); the app does not even open
  an unencrypted connection to the server.
- Supabase encrypts the stored data (AES-256).
- Passwords are stored only as a hash.
- The rules on who may see what are enforced by the database itself, not just by the app. Everyone
  can reach only their own data and what section 4 describes.
- The app contains only a public key, which opens no personal data without signing in; it never
  contains the administrative key.
- Your sign-in is kept in your device's keychain or keystore (section 5).
- Only I have administrative access to the database (and Supabase, as the technical provider).
- Letters are not end-to-end encrypted (section 3.4).

You can help: use a password you use nowhere else, and sign out on devices other people use too.
Should something still go wrong and data fall into the wrong hands, I will inform the supervisory
authority and, where necessary, you, as Art. 33 and 34 GDPR require.

## 14. Do you have to provide data?

No law requires you to give me any data. But without an email address, password, username and
display name you cannot create an account, and without a city your bats cannot fly. What you write
in letters is up to you.

## 15. Changes to this policy

I update this policy when the app or the law changes. The current version is always at
{{PRIVACY_POLICY_URL}}, and in the app under "Privacy policy". I will tell you about important
changes in advance, by email for example.

**Effective: {{EFFECTIVE_DATE}}**
