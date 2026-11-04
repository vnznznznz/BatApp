# Google Play Console: what to type in

Everything Night Courier needs in Google Play Console, ready to copy: creating the app, the store
listing in English and German, App access, Ads, the content rating questionnaire, Target audience
and content (and with it Google's Families Policy), the Data safety form, and a note on the US
children's privacy law (COPPA).

Written on 4 November 2026. Google's help pages could not be opened from the session this was
written in, only search summaries of them, so the names of fields and some of the rules below come
from those summaries and from earlier knowledge of Play Console. Google renames fields and changes
forms often. Anything marked **to check** has to be confirmed on screen, or in Google's current help,
before it is relied on.

**Personal data stays out of this file.** This repository is public. Where a field needs the
operator's details, this file names a placeholder, and the real value is typed straight into Play
Console (or into the hosted privacy policy), never written here:

| Placeholder              | Means                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `{{OPERATOR_NAME}}`      | The operator's name, which is also the developer name on Google Play                                 |
| `{{OPERATOR_ADDRESS}}`   | The operator's postal address: hosted privacy policy (section 1) only; the support page points there |
| `{{CONTACT_EMAIL}}`      | The contact address, also behind the app's Contact button                                            |
| `{{PRIVACY_POLICY_URL}}` | The hosted privacy policy, also behind the app's Privacy policy button                               |
| `{{SUPPORT_URL}}`        | A public https page with the contact route and the deletion steps; no postal address                 |
| `{{EFFECTIVE_DATE}}`     | The date the privacy policy takes effect                                                             |

Values that are not personal data but must not be committed either, such as the demo account's
sign-in, are written as `<like this>`. They live in the operator's password manager and in Play
Console.

Related: Apple's forms (`app-store.md`), the privacy policy drafts (`privacy-policy.de.md`,
`privacy-policy.en.md`) and the records of processing (`gdpr-records.md`) sit next to this file. The
Data safety answers below, Apple's App Privacy answers and the privacy policy must describe the same
data; change them together.

---

## 0. Internal testing in one table

GO-LIVE's plan for Android is the **internal testing** track: up to 100 testers, added by the email
address of their Google account, no public listing. What that path needs, and what only a wider
track would:

| Item                                             | Internal testing                                                                                               | Closed, open or production                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Developer account ($25 once, identity verified)  | Needed                                                                                                         | Needed                                                                                               |
| The app itself (section 1)                       | Needed                                                                                                         | Needed                                                                                               |
| Store listing texts and graphics (section 2)     | **To check**: testers reach a store page from the opt-in link, so fill it in anyway                            | Needed                                                                                               |
| Privacy policy URL (section 3)                   | Needed: Google asks for it before Target audience can be completed                                             | Needed                                                                                               |
| App access, Ads, content rating, Target audience | **To check** whether an internal release is blocked without them. Fill them in truthfully anyway               | Needed                                                                                               |
| Data safety form (section 6)                     | **Exempt**: Google's help says apps active only on internal testing tracks do not need to complete it          | Needed                                                                                               |
| Account deletion web link                        | Asked inside the Data safety form, so not asked while the app is exempt                                        | Needed, even though deletion is in the app                                                           |
| Families Policy (section 5)                      | Applies to the app as declared. Whether anyone at Google checks an internal release against it: **to check**   | Applies, and is reviewed                                                                             |
| Review before testers get a build                | **To check**: Google describes internal tests as possibly not subject to the usual policy and security reviews | Yes                                                                                                  |
| Closed test with at least 12 testers for 14 days | Not needed                                                                                                     | Needed before production access, for personal accounts created after 13 November 2023 (**to check**) |

Internal-testing builds do not expire the way TestFlight builds do (GO-LIVE, "Recommended
distribution").

---

## 1. Creating the app

All apps → Create app.

| Field            | Value                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| App name         | `Night Courier` (13 of 30 characters)                                                                               |
| Default language | English (United Kingdom) – en-GB, the spelling the app's own copy uses                                              |
| App or game      | App                                                                                                                 |
| Free or paid     | Free. Google does not let a free app become paid later, which is fine for an app with nothing to sell               |
| Declarations     | The Developer Program Policies and US export laws. Read both before ticking: section 5 depends on the first of them |

The package name is `com.nightcourier.app` (from `app.json`). The first uploaded bundle fixes it for
good; it can never change or be used again.

A personal developer account is identity-verified with the operator's legal name and address. What
Google Play then shows publicly about a personal account, beyond the developer name, is **to check**
in Play Console's account settings. The hosted privacy policy carries the address anyway (section
1); it is the only one of the operator's pages that does.

---

## 2. Store listing

Grow users → Store presence → Main store listing (**to check** the menu path). Then add German under
Translations, with the German texts below. The app itself is in English only, and the German texts
say so.

### App name (at most 30 characters)

```text
Night Courier
```

### Short description (at most 80 characters)

English (75 characters):

```text
Slow letters between friends, each carried by a bat over the real distance.
```

German (80 characters, exactly the limit):

```text
Langsame Briefe an Freunde, von Fledermäusen über die echte Entfernung getragen.
```

### Full description (at most 4,000 characters)

Adapted from `app-store.md`, section 5, so that the two stores say the same thing. Google's listing
rules discourage text in capitals, so the headings here are in sentence case. Line breaks are
paragraphs.

English:

```text
Night Courier is a slow way to write to your friends. You don't send messages. You send bats.

You keep exactly three bats. Each one carries a single letter, flies the real distance between your city and your friend's, and cannot fly again until it has come home. A letter to someone across town arrives this evening. A letter across a continent takes days. Nothing is ever delivered instantly.

How it works
• Choose your city from a list. Your bats fly from there. There is no GPS: the app never asks for your location.
• Ask someone to be friends by their exact username. Letters only travel between two people who have both said yes.
• Write a letter of up to 2,000 characters and send it with one of your bats. Watch it fly. When it lands, it waits until your friend next opens the app.
• Moving takes a day. After you choose a new city, your bats keep flying from the old one for 24 hours.

What it does not have
• No ads, no purchases, no subscriptions. Three bats come with the account, and there is nothing to buy.
• No read receipts, no typing indicators, no online status.
• No public profiles, no feeds, no search for strangers.
• No push notifications. What has landed is there the next time you look.
• No analytics or tracking in the app.

Safety
• Block anyone, at any time. They are not told, though they will see that you are no longer friends. Their letters are hidden from you until you unblock them.
• Report a letter or a person. Reports go to the person who runs Night Courier. The person you report is not told who reported them, unless the law requires it.
• The house rules have no tolerance for harassment, threats, hate, scams, spam or sexual content nobody asked for, and none at all for sexual content involving or sent to anyone under 18.

Your data
• Delete your account at any time from your profile. Your profile, your friendships and every letter you have sent or received go with it, for your friends as well as for you. Reports stay: each is deleted 180 days after it was made.
• Letters are stored on the server so they can be delivered, and stay there until you or your friend deletes their account. They are not end-to-end encrypted. The privacy policy says who can see what, and everything else that is kept and for how long.

Who it is for
Night Courier is a private, non-commercial project for a small circle of friends. You must be at least 12, and if you are under 16 you need a parent's or guardian's permission.

City data: GeoNames (geonames.org), CC BY 4.0.
```

German:

```text
Night Courier ist eine langsame Art, deinen Freunden zu schreiben. Du schickst keine Nachrichten. Du schickst Fledermäuse.

Du hast genau drei Fledermäuse. Jede trägt einen einzigen Brief, fliegt die echte Entfernung zwischen deiner Stadt und der Stadt der Person, der du schreibst, und kann erst wieder losfliegen, wenn sie zurück ist. Ein Brief quer durch die Stadt kommt heute Abend an. Ein Brief über einen Kontinent braucht Tage. Nichts kommt sofort an.

So funktioniert es
• Wähle deine Stadt aus einer Liste. Von dort fliegen deine Fledermäuse los. Es gibt kein GPS: Die App fragt nie nach deinem Standort.
• Schick eine Freundschaftsanfrage über den genauen Benutzernamen. Briefe gehen nur zwischen zwei Menschen, die beide Ja gesagt haben.
• Schreib einen Brief mit bis zu 2.000 Zeichen und schick ihn mit einer deiner Fledermäuse los. Sieh ihr beim Fliegen zu. Wenn sie landet, wartet der Brief, bis die andere Person die App das nächste Mal öffnet.
• Umziehen dauert einen Tag. Wenn du eine neue Stadt wählst, fliegen deine Fledermäuse noch 24 Stunden lang von der alten los.

Was es nicht gibt
• Keine Werbung, keine Käufe, keine Abos. Drei Fledermäuse gehören zum Konto, und es gibt nichts zu kaufen.
• Keine Lesebestätigungen, keine Tipp-Anzeige, kein Online-Status.
• Keine öffentlichen Profile, keine Feeds, keine Suche nach Fremden.
• Keine Push-Benachrichtigungen. Was gelandet ist, siehst du beim nächsten Öffnen.
• Keine Analyse- oder Tracking-Dienste in der App.

Sicherheit
• Blockiere jeden, jederzeit. Die Person erfährt es nicht, sieht aber, dass ihr keine Freunde mehr seid. Ihre Briefe sind für dich ausgeblendet, bis du die Blockierung aufhebst.
• Melde einen Brief oder eine Person. Meldungen gehen an die Person, die Night Courier betreibt. Die gemeldete Person erfährt nicht, wer sie gemeldet hat, außer das Gesetz verlangt es.
• Die Hausregeln dulden keine Belästigung, keine Drohungen, keinen Hass, keinen Betrug, keinen Spam und keine sexuellen Inhalte, um die niemand gebeten hat – und erst recht keine sexuellen Inhalte, an denen Minderjährige beteiligt sind oder die an Minderjährige gehen.

Deine Daten
• Du kannst dein Konto jederzeit in deinem Profil löschen. Dein Profil, deine Freundschaften und jeder Brief, den du geschickt oder bekommen hast, werden mit gelöscht, bei deinen Freunden genauso wie bei dir. Meldungen bleiben: Jede wird 180 Tage nach der Meldung gelöscht.
• Briefe werden auf dem Server gespeichert, damit sie zugestellt werden können, und bleiben dort, bis du oder die andere Person das Konto löscht. Sie sind nicht Ende-zu-Ende-verschlüsselt. Die Datenschutzerklärung sagt, wer was sehen kann und was sonst wie lange gespeichert wird.

Für wen
Night Courier ist ein privates, nicht-kommerzielles Projekt für einen kleinen Freundeskreis. Du musst mindestens 12 Jahre alt sein. Wenn du unter 16 bist, brauchst du die Erlaubnis eines Elternteils oder einer erziehungsberechtigten Person. Die App selbst ist auf Englisch.

Städtedaten: GeoNames (geonames.org), CC BY 4.0.
```

Every claim in these texts is something the app does today. Before each new track, check them
against the build again, and especially "no analytics or tracking", "not end-to-end encrypted" and
the 180 days. "Not told who reported them, unless the law requires it" is the house rules' own
wording (`src/app/rules.tsx`), and the same as on the App Store. Do not shorten it to "reports
never reach the person you report": if that person asks for their data (Art. 15 GDPR), they get
what a report says about them, without the reporter (`gdpr-records.md`, 5.3).

### Graphics

Sizes as Play Console has asked for them so far; **to check** on screen.

| Asset             | Requirement                                                                 | Source                                                                                             |
| ----------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| App icon          | 512 × 512 PNG, 32-bit, at most 1 MB                                         | Scale `assets/images/icon.png` (1024 × 1024, drawn by `npm run generate:assets`) down to 512 × 512 |
| Feature graphic   | 1024 × 500, JPEG or 24-bit PNG without transparency                         | Does not exist yet. Draw it from the same artwork (bat, moon, night sky)                           |
| Phone screenshots | At least 2, at most 8; 16:9 or 9:16; each side between 320 and 3,840 pixels | Taken on an Android phone with the demo accounts only: no real person's letters, names or city     |
| Tablet sets       | Not needed                                                                  | The app is phone-only in portrait                                                                  |

### Categorisation and contact details

Store settings (**to check** the menu path):

| Field              | Value                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| App or game        | App                                                                                                        |
| Category           | Communication. Social also exists, but there is no feed, no profile page and nothing public (**to check**) |
| Tags               | Up to five from Google's list, if asked; pick the ones about messaging or letters (**to check** the list)  |
| Email address      | `{{CONTACT_EMAIL}}`. Required, and shown on the store listing (to testers only, while internal)            |
| Phone number       | Leave empty                                                                                                |
| Website            | `{{SUPPORT_URL}}`                                                                                          |
| External marketing | Untick "advertise my app outside of Google Play", or whatever the option is called now (**to check**)      |

---

## 3. App content

Policy and programs → App content (**to check** the menu path). Google wants the privacy policy, App
access and Ads answered before Target audience and content.

### Privacy policy

`{{PRIVACY_POLICY_URL}}`: the hosted page built from `privacy-policy.de.md` (binding) and
`privacy-policy.en.md`, with the placeholders filled in on the hosted copy only. Google's
requirements for the page, as far as they are known here: a public URL that is not geofenced and
not a PDF, labelled as a privacy policy, naming the app or the developer as the store listing does,
with a contact point and how data is kept and deleted (**to check** the current list). The drafts
cover all of that. The app links to the same page from sign-up, the house rules and the profile.

### App access

Choose **All or some functionality in my app is restricted**, then add one set of instructions:

| Field                                   | Value                                                            |
| --------------------------------------- | ---------------------------------------------------------------- |
| Instruction name                        | `Demo account`                                                   |
| Username, email address or phone number | `<play reviewer account email>` (see "Preparing the demo" below) |
| Password                                | `<play reviewer account password>`                               |
| Any other information required          | The text below                                                   |

Leave **unticked** the option that lets Android use these credentials for performance and app
compatibility testing (its wording: **to check**). With it, Google's test robots sign in to the
hosted project and send letters and reports from the demo account.

```text
Night Courier is a private, non-commercial slow-messaging app for a small circle of friends. Nothing is for sale: no purchases, no ads, no analytics, no push notifications.

On the welcome screen, tap "I already have one" and sign in with the account above. It is already friends with "Demo Friend", who has sent it two letters. Both have landed and are under Letters, on the first screen.

Letters are never instant. Each one flies the real distance between the two friends' cities, and never takes less than 20 minutes. A letter you send during the review may not land while you watch, which is why the demo letters were sent in advance.

Report and block: Letters → a letter from Demo Friend → Report this letter, or Block. Or Friends → tap Demo Friend → Block / Report. Your profile → Safety holds Blocked couriers (each can be reported from there too), the house rules (our terms, with a zero-tolerance clause, agreed to at sign-up), Contact and the privacy policy.

Account deletion: Your profile → Delete my account. Please try it with a new account (Create an account, on the welcome screen), so that the demo account stays usable. A new account is confirmed through a link sent to its email address; then sign in with it.

Age: Night Courier is for people aged 12 and over; under 16, only with a parent's or guardian's permission.

Known limitation of this test version: a password-reset email can be requested, but setting the new password inside the app is not finished yet.
```

#### Preparing the demo

The same steps as for Apple (`app-store.md`, "Preparing the demo"), with a second reviewer account
so that one store's reviewer deleting theirs cannot break the other's:

1. Through the app's sign-up on the hosted project: display name `Play Review`, username
   `play_review`, an email address the operator controls and has made for this, and a generated
   password of at least 8 characters, kept in the operator's password manager. Confirm the address
   with the link in the email, sign in, and choose a city near Demo Friend's, so that letters land
   within the hour.
2. As `demo_friend` (made for Apple), send a friend request to `play_review`, and accept it as Play
   Review.
3. At least a day before it is needed, send two harmless letters from Demo Friend to Play Review.
   Demo Friend has three bats, and a bat flies again only once it is home, so stagger these letters
   with the ones for App Review.
4. Sign out on every device used for this. The sign-in goes only into Play Console.

Afterwards, resolve any test reports with `resolution = 'play review test'` (GO-LIVE, "Handling a
report"). If the reviewer blocked Demo Friend, unblock in Your profile → Blocked couriers and become
friends again; if they deleted the account, make it again from step 1. A session left unused for 90
days is ended by the daily tidy-up, so a demo account not used for that long simply signs in again.

**Pre-launch reports:** Google's robots may install builds and explore them (Testing → Pre-launch
report). Whether that happens on internal testing is **to check**. If it does, turn pre-launch
reports off in their settings: a robot that taps Create an account would make real accounts on the
hosted project (with email confirmation on, unconfirmed ones). Delete any that appear.

### Ads

**No, my app does not contain ads.** There is no ad SDK, `MONETISATION_ENABLED` is `false` and
tested, and the README's rules forbid advertising.

### Advertising ID

If asked whether the app uses an advertising ID: **No**. No library in the app reads one. **To check**
on the first build, in Play Console's App bundle explorer: that the merged manifest has no
`com.google.android.gms.permission.AD_ID`, and which permissions it does request.

The app itself needs only `INTERNET`. The Android template that `expo prebuild` uses
(`node_modules/expo/template.tgz`, SDK 57) also lists `SYSTEM_ALERT_WINDOW`, `VIBRATE`,
`READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` (the last two only up to Android 12L), and
`expo-file-system`, which `expo` depends on, adds the two storage permissions again. **Done:**
`app.json` now lists those four under `android.blockedPermissions` (commit 191bc50), and
`src/tests/app-config.test.ts` fails if that list changes or `android.permissions` appears. Expo
writes each of them into the app's manifest with `tools:node="remove"`, which takes it out of the
merged manifest too, whichever library asked for it (`npx expo config --type introspect` shows
`INTERNET` and the four removals). So the merged manifest should keep `INTERNET` alone. **To
check** on the first build, in App bundle explorer: that it does, that no other library has added
a permission of its own, and that the build still runs. The app never asks for any permission at
run time.

### The other declarations

| Declaration                    | Answer                                                                      |
| ------------------------------ | --------------------------------------------------------------------------- |
| Content rating                 | Section 4                                                                   |
| Target audience and content    | Section 5                                                                   |
| Data safety                    | Section 6                                                                   |
| News app                       | No                                                                          |
| Government app                 | No                                                                          |
| Financial features             | None                                                                        |
| Health                         | No health features                                                          |
| COVID-19 apps (if still asked) | No                                                                          |
| Permission declarations        | None expected (**to check** against the built manifest; see Advertising ID) |

---

## 4. Content rating

The questionnaire is IARC's, and it rates the app's own content and features. What users write in a
letter is covered by the question about users interacting, and by the house rules, block and report
that come with it.

1. **Email address:** `{{CONTACT_EMAIL}}`. IARC sends the rating certificate there.
2. **Category:** the one for communication apps. The list has held entries such as "Social
   Networking, Forums, Blogs, and UGC Sharing" and "Utility, Productivity, Communication, or Other"
   (**to check** the current names). Night Courier is one-to-one letters between friends, with no
   feed and nothing published, so communication fits better than social networking.
3. **Questions:**

| Topic                                                             | Answer  | Why                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Violence, including cartoon or fantasy violence                   | No      | None in the app's own words or pictures. The bats only fly.                                                                                                                                                                                                                              |
| Fear or horror                                                    | No      | A cartoon bat under a moon is not horror.                                                                                                                                                                                                                                                |
| Sexuality or nudity                                               | No      | None. The house rules forbid sexual content involving or sent to anyone under 18, and unwanted sexual messages to anyone.                                                                                                                                                                |
| Language: profanity, crude humour                                 | No      | The app's own copy has none.                                                                                                                                                                                                                                                             |
| Controlled substances: drugs, alcohol, tobacco                    | No      | None.                                                                                                                                                                                                                                                                                    |
| Gambling, simulated gambling, contests, loot boxes                | No      | Nothing to win, buy or compete for. Three bats come with every account.                                                                                                                                                                                                                  |
| Users can interact or exchange content (text, images, voice)      | **Yes** | Letters: text between two accepted friends. No images, no voice.                                                                                                                                                                                                                         |
| The app shares the user's current physical location with others   | No      | The app never determines a location and asks for no location permission. The user picks a city from a list, and friends see that city. **To check**: if IARC's wording turns out to cover a self-chosen home city, answer Yes; that adds "Shares Location", which would still be honest. |
| Users can buy digital goods                                       | No      | Nothing to buy.                                                                                                                                                                                                                                                                          |
| Unrestricted internet access; web browser or search engine        | No      | No in-app browser. The two links (Contact, Privacy policy) open fixed addresses in the mail app or the system browser.                                                                                                                                                                   |
| Swastikas or other symbols unconstitutional in Germany (if asked) | No      | None.                                                                                                                                                                                                                                                                                    |
| User content is moderated before others see it (if asked)         | No      | Letters are not checked before they land. The filtering is friendship-gating, report and block, and the operator acts on reports.                                                                                                                                                        |
| News or educational content                                       | No      |                                                                                                                                                                                                                                                                                          |

**The rating this should give:** no content descriptors, and the interactive element "Users
Interact". Most systems should then come out at their lowest tiers (for example PEGI 3, ESRB
Everyone). The USK, since the 2021 reform of the German Youth Protection Act, also weighs risks of
use such as contact with others, and may add a notice such as "Chats" or a higher age. All **to
check**: record what the certificate actually says here.

The content rating describes content; it is not the minimum age. The house rules' minimum of 12
stays as it is. Google Play has no equivalent of Apple's "Override to Higher Age Rating" (**to
check**); a rating can only be appealed through the link in IARC's certificate email.

---

## 5. Target audience and content, and the Families Policy

### The answers

- **Target age groups:** tick **9–12, 13–15, 16–17 and 18 and over**. Not 5 and under, not 6–8.
- Why 9–12: the house rules admit 12-year-olds, and Play's age groups have no bracket that starts
  at 12 (Play Console has offered 5 and under, 6–8, 9–12, 13–15, 16–17, 18 and over; **to check**
  on screen). Leaving 9–12 out would declare an audience that the app's own terms contradict, and
  Google treats misrepresenting the target audience as a policy violation.
- Because an age group under 13 is ticked, **the app falls under Google's Families Policy**, as an
  app for a mixed audience of children and older users.
- "Could your store listing unintentionally appeal to children?" is asked only when no group under
  13 is ticked (**to check**). Either way, Google says imagery that looks aimed at children can
  change its view of the audience; a cartoon bat is that kind of imagery.
- Teacher Approved or any other programme for children, if offered: do not opt in.
- Ads: none, so the rules for ads to children (Families Self-Certified Ads SDKs, a neutral age screen
  before ads) do not apply.

### What the Families Policy requires, and where Night Courier stands

Summarised from Google's Families pages; the full policy text takes precedence and is **to check**
before acting on this table.

| Requirement                                                                                                                                                    | Night Courier today                                                                                                                                                                                                                                                          | Needed                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Accurate target audience and Play Console answers                                                                                                              | Yes, with 9–12 ticked                                                                                                                                                                                                                                                        | Nothing                               |
| Content appropriate for children                                                                                                                               | The app's own content, yes. Letters are written by users; the house rules forbid sexual content involving or sent to minors, and report and block exist                                                                                                                      | Nothing                               |
| A privacy policy that discloses what is collected from children                                                                                                | `privacy-policy.de.md`, section 10, and the rest of the policy                                                                                                                                                                                                               | Publish it                            |
| No device identifiers (advertising ID, IMEI, MAC, SSID and similar) collected from children or users of unknown age                                            | None collected                                                                                                                                                                                                                                                               | Check the merged manifest (section 3) |
| Ads only through Families Self-Certified Ads SDKs                                                                                                              | No ads                                                                                                                                                                                                                                                                       | Nothing                               |
| No location permission in apps that target only children                                                                                                       | No location permission at all; the app does not target only children                                                                                                                                                                                                         | Nothing                               |
| Compliance with the laws on children's data, which Google names as including COPPA and the GDPR                                                                | GDPR: this folder. COPPA: section 7                                                                                                                                                                                                                                          | Section 7                             |
| **Social features (1):** an in-app reminder to be safe online and aware of the real-world risk, before child users exchange freeform media or information      | **Missing**                                                                                                                                                                                                                                                                  | **Build**                             |
| **Social features (2):** an adult action before child users exchange personal information                                                                      | **Missing.** The sign-up toggle ("I am 12 or older"; under 16, a parent has said yes) is the user's own statement, not an adult's action. Google describes adult action as a way to establish that the user is not a child, without encouraging children to give a false age | **Build**                             |
| **Social features (3):** a way for adults to manage social features for child users, such as turning them off or limiting them                                 | **Missing.** A parent can only delete the account together with the child, or write to the operator                                                                                                                                                                          | **Build**                             |
| Apps whose main purpose is chatting with strangers, or chatting anonymously, must not target children (anonymous chat apps: from 26 August 2026, **to check**) | Not this app: letters travel only between accepted friends who asked by exact username, and every letter names its sender                                                                                                                                                    | Nothing                               |
| A content rating suitable for children                                                                                                                         | Expected (section 4). The exact rule is **to check**                                                                                                                                                                                                                         | Record the rating                     |

Two things in the policy text decide how much of the three social-feature rows applies, and both
are **to check** in the full text:

- As remembered here, Google tells a **social app** (one whose main focus is sharing free-form
  content or communicating with many people) from an app with **social features** (an added
  function). For a social app it asks for the reminder and the adult action; the adult controls
  are listed for social features. Night Courier's main purpose is letters, so it is probably a
  social app; then the adult controls may not be required, and the adult action still is.
  One-to-one letters between friends are not "many people", but they are free-form content. Treat
  all three as required until the text says otherwise.
- Google's "child" is under 13 in the target age groups. Whether the policy anywhere uses a
  country's own age of consent instead (in Germany 16, the age Art. 8 GDPR is set at) is not known
  here.

### The conflict this creates

The three social-feature rules are about **child users**, meaning under 13. The app does not know
who they are: sign-up asks only for the "12 or older" confirmation, and stores nothing (privacy
policy section 3.13). The reminder can be shown to everyone without knowing anyone's age. The adult
action and the adult controls cannot: they need at least a neutral age question at sign-up that
tells under-13s from older users, a flag stored with the account, and an adult step and adult
settings for flagged accounts. That is new personal data about children, and a product change.

Options, all the operator's decision, none made here:

1. **Keep 12 and build the three pieces** before any track beyond internal testing, and ideally
   before any tester under 13 is invited on Android. Update the privacy policy and
   `gdpr-records.md` for the new age flag.
2. **Raise the minimum age to 13.** Then only 13–15 and older are ticked and the Families Policy no
   longer applies (unless Google judges the listing to appeal to children). It would also match the
   13+ that Apple's age rating has to show anyway (`app-store.md`, "Age rating"). It means changing
   the house rules, sign-up, `src/constants/config.ts` and the privacy policy, and it reverses the
   operator's decision of 4 November 2026 that the minimum age is 12.
3. **Stay on internal testing with 12**, knowing what that does and does not mean (below).

### What it means for an app only on internal testing

- The Families Policy is part of the Developer Program Policies, which apply to every app on Google
  Play, whatever its track. Google's help names an exemption for internal testing from the Data
  safety form, and none from the Families Policy (**to check**). Internal testing does not make the
  policy go away.
- What internal testing changes is the checking. A release reaches testers within minutes and may
  not go through the usual policy review (**to check**), so Google may not notice the missing pieces
  before testers install. That is not compliance: enforcement can still come later, against the app
  or the developer account, and at the latest when the app moves to closed testing.
- Whether Play Console lets an internal release roll out before Target audience and content rating
  are complete is **to check**. Fill them in truthfully anyway; a false declaration is a violation
  of its own.
- Until the pieces exist, the operator can keep the real risk low by inviting no Android tester
  under 13. The declaration still has to include 9–12, because the house rules allow 12-year-olds.
- A 12-year-old in Germany usually has a Google account supervised through Family Link, because
  Google's own minimum age for an unsupervised account there is higher (**to check**: 16); a parent
  then approves app installs. Whether a supervised account can join an internal test at all, and
  whether Google would count that approval as adult action, are both **to check**. Do not rely on
  it.

---

## 6. Data safety

While Night Courier is only on internal testing it is **exempt**: Google's help says apps active
only on internal testing tracks do not need to complete the form, and that apps on closed, open or
production tracks must. The answers are prepared here so that moving to another track does not
start from nothing. If Play Console lets the form be filled in now, do it.

The rules these answers follow, from Google's help as summarised (**to check** the wording):

- **Collected** means sent off the device. Data that is only processed on the device is not
  collected.
- Data **processed ephemerally** (held only in memory, for no longer than it takes to answer the
  request in real time) is still declared, and marked as ephemeral. Whether Google then leaves it
  out of the public section, or shows it with that note, is **to check**.
- **Shared** means transferred to a third party. Not counted as sharing: transfers to service
  providers that process data on the developer's behalf, transfers for legal purposes (Google's
  examples: a legal obligation or a government request), transfers that follow an action the user
  started and expects, and anonymous data.
- What Google Play or Apple collect themselves (Android vitals, tester lists, TestFlight data) is
  theirs to disclose (**to check** for Android vitals).

### The questions before the data types

| Question                                                                                  | Answer                                                                | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does your app collect or share any of the required user data types?                       | **Yes**                                                               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Is all of the user data collected by your app encrypted in transit?                       | **Yes**                                                               | The app talks only to the Supabase project, over HTTPS. `src/lib/env.ts` refuses any URL that is not https, except local and private-network addresses, which a build for testers never has. The two links open in other apps.                                                                                                                                                                                                                                        |
| Which methods of account creation does your app support?                                  | Username and password (**to check** the option's name)                | Sign-up and sign-in are email address and password. No third-party sign-in, no anonymous accounts.                                                                                                                                                                                                                                                                                                                                                                    |
| Delete account URL                                                                        | `{{SUPPORT_URL}}`, with the text in "The account deletion page" below | Google wants a web link even when deletion is in the app, so that someone who has uninstalled it can still ask.                                                                                                                                                                                                                                                                                                                                                       |
| Can users ask for some or all of their data to be deleted without deleting their account? | **Yes**, if the support page says so (the text below does)            | By writing to `{{CONTACT_EMAIL}}`. The GDPR gives the right anyway (Art. 17, with its exceptions), and the deletion page below says how. What can go without the account, by the operator in SQL: for example sign-in log entries or sessions. Single letters are not deleted on request (privacy policy 3.4), and the deletion page says so; the email address, username and display name cannot go while the account exists. Answer No if the page does not say it. |
| Independent security review (optional)                                                    | No                                                                    | None has been done.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Every data type, answered

**Required or optional:** a type is optional only where someone can use everything Night Courier is
for without it. Shared is **No** for every type, as answered for internal testing; see "Why nothing
is shared" below, which has to be settled before any other track.

| Category                 | Data type                                                              | Collected | Ephemeral | Required or optional | Purposes                                                                                 | What it is, from the data inventory                                                                                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------- | --------- | --------- | -------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location                 | Approximate location                                                   | **Yes**   | No        | Required             | App functionality                                                                        | The city chosen from a list; during a move, the previous city and the time of the move; each letter's origin and destination city. Google's definition (an area of at least 3 km², "such as the city a user is in") fits a chosen city.                                                           |
| Location                 | Precise location                                                       | No        |           |                      |                                                                                          | No GPS, no location permission.                                                                                                                                                                                                                                                                   |
| Personal info            | Name                                                                   | **Yes**   | No        | Required             | App functionality; Account management; Fraud prevention, security, and compliance        | The display name, which friends, correspondents and anyone the user sends a request to see. The copy typed at sign-up is removed from the auth record within a day. A report keeps it as it was. The username is declared under User IDs only, as in Apple's label (`app-store.md`).              |
| Personal info            | Email address                                                          | **Yes**   | No        | Required             | Account management; Developer communications; Fraud prevention, security, and compliance | Sign-in, password reset, the operator's email about a report (a warning, or to the reporter after a threat), notice of an important change to the privacy policy (its section 15), and keeping a removed account from signing up again (two years from the removal). Never shown to other users.  |
| Personal info            | User IDs                                                               | **Yes**   | No        | Required             | App functionality; Account management; Fraud prevention, security, and compliance        | The account id (UUID) and the username. Other users see the username only through a friendship, a request, a letter or a block; the id reaches their app too, which does not show it (privacy policy 4). Blocks and reports hold ids; a report keeps the username as it was.                      |
| Personal info            | Address; Phone number                                                  | No        |           |                      |                                                                                          | Never asked for.                                                                                                                                                                                                                                                                                  |
| Personal info            | Race and ethnicity; Political or religious beliefs; Sexual orientation | No        |           |                      |                                                                                          | Never asked for. Letters are free text and may hold anything; they are declared as messages (**to check** that this is how Google wants free text handled).                                                                                                                                       |
| Personal info            | Other info                                                             | No        |           |                      |                                                                                          | Age is never stored: the sign-up toggle stays on the device. The password is stored only as a bcrypt hash, for sign-in (**to check** whether Google expects credentials declared anywhere).                                                                                                       |
| Financial info           | All types                                                              | No        |           |                      |                                                                                          | Nothing to buy.                                                                                                                                                                                                                                                                                   |
| Health and fitness       | All types                                                              | No        |           |                      |                                                                                          |                                                                                                                                                                                                                                                                                                   |
| Messages                 | Emails; SMS or MMS                                                     | No        |           |                      |                                                                                          | The app reads and sends no email or SMS. Account emails come from Supabase or the mail provider.                                                                                                                                                                                                  |
| Messages                 | Other in-app messages                                                  | **Yes**   | No        | Required             | App functionality; Fraud prevention, security, and compliance                            | Letters: the text (up to 2,000 characters), sender, recipient, bat, cities, distance, and when it was sent, landed and opened (the last shown only to its recipient). Plain text on the server, not end-to-end encrypted. A reported letter is copied into its report.                            |
| Photos and videos        | All types                                                              | No        |           |                      |                                                                                          | The app has no images. Avatars are not built.                                                                                                                                                                                                                                                     |
| Audio files              | All types                                                              | No        |           |                      |                                                                                          |                                                                                                                                                                                                                                                                                                   |
| Files and docs           | Files and docs                                                         | No        |           |                      |                                                                                          |                                                                                                                                                                                                                                                                                                   |
| Calendar                 | Calendar events                                                        | No        |           |                      |                                                                                          |                                                                                                                                                                                                                                                                                                   |
| Contacts                 | Contacts                                                               | **Yes**   | No        | Required             | App functionality; Fraud prevention, security, and compliance                            | The friend list, friend requests and blocks: the social graph inside the app, which Google's definition includes. The phone's address book is never read.                                                                                                                                         |
| App activity             | App interactions                                                       | **Yes**   | No        | Required             | App functionality; Account management; Fraud prevention, security, and compliance        | No analytics, but the server keeps: sign-in times and sessions (a session unused for 90 days is deleted); a session refresh about once an hour while the app is open, so a record of when it was in use; when each letter was opened; when each bat left or came home; the sign-in log (30 days). |
| App activity             | In-app search history                                                  | **Yes**   | **Yes**   | Required             | App functionality                                                                        | What is typed into the city search, and the username in a friend request. Answered and not stored; both travel in request bodies, not in the URLs the server logs record. A friend request that succeeds is stored, as Contacts.                                                                  |
| App activity             | Installed apps                                                         | No        |           |                      |                                                                                          |                                                                                                                                                                                                                                                                                                   |
| App activity             | Other user-generated content                                           | **Yes**   | No        | Optional             | Fraud prevention, security, and compliance                                               | Reports: the reason, the reporter's note (up to 500 characters), and the names as they were. Kept 180 days, even after either account is deleted.                                                                                                                                                 |
| App activity             | Other actions                                                          | No        |           |                      |                                                                                          | Blocks and reports are declared above.                                                                                                                                                                                                                                                            |
| Web browsing             | Web browsing history                                                   | No        |           |                      |                                                                                          |                                                                                                                                                                                                                                                                                                   |
| App info and performance | Crash logs                                                             | No        |           |                      |                                                                                          | No crash reporting in the app. Android vitals are Google's.                                                                                                                                                                                                                                       |
| App info and performance | Diagnostics                                                            | **Yes**   | No        | Required             | App functionality; Fraud prevention, security, and compliance                            | The IP address and user agent stored with every sign-in session, and Supabase's request, auth and database logs: IP, user agent, the path (with the account id on profile requests), the email on auth events, error messages.                                                                    |
| App info and performance | Other app performance data                                             | No        |           |                      |                                                                                          |                                                                                                                                                                                                                                                                                                   |
| Device or other IDs      | Device or other IDs                                                    | No        |           |                      |                                                                                          | No advertising ID, no Android ID, no push token, no installation id. **To check** whether Google counts the IP address as an identifier here; it is declared under Diagnostics.                                                                                                                   |

The purposes never include Analytics, Advertising or marketing, or Personalisation. Developer
communications appears only for the email address: the operator writes to users from their own
mailbox when a report or a change to the privacy policy calls for it, never with news or
marketing.

### Why nothing is shared

- **Supabase** (database, sign-in, server, logs) and, once chosen, the **email provider** process
  data on the operator's behalf: service providers.
- **Other users** see letters, names and a city because the user befriended them and wrote to them:
  an action the user started and expects.
- **The police** may receive an exported report, and after a threat the reported account's
  sign-in records with it: its sessions (IP address, user agent, times) and its sign-in log
  entries (GO-LIVE, "Handling a report"; privacy policy 3.7). Google's legal-purposes exception
  names a legal obligation or a government request; a referral the operator makes of their own
  accord, about a threat say, is less clearly covered: **to check**. For internal testing the
  answer stays **No**: the app is exempt from the form there. **Before any closed, open or
  production track** this has to be decided: either confirm that the exception covers a voluntary
  referral, or use the fallback and declare **Shared**, for Fraud prevention, security, and
  compliance, for the data types the police may receive: Other in-app messages, Other
  user-generated content, Name, User IDs, App interactions and Diagnostics. The fallback matches
  privacy policy section 7, which names the police as a recipient, and would be honest either way.
  **Decision:** not taken yet; write it here, and in section 9, when it is.
- **Microsoft** hosts the operator's mailbox, through which the operator's emails to users (a
  warning, a notice) go. Google's form is about what the app collects and passes on; whether mail
  the operator writes from a consumer mailbox counts as sharing with Microsoft is **to check**. The
  privacy policy names Microsoft (section 7) either way. Mail a user writes through Contact is sent
  by their own mail app, not by Night Courier.
- No advertising, analytics or data broker receives anything.

### What the public section should then show

- **Data shared:** no data shared with third parties, as answered for internal testing. Before any
  other track, the police question above may change this to the six types of the fallback.
- **Data collected:** Location (approximate location); Personal info (name, email address, user
  IDs); Messages (other in-app messages); Contacts; App activity (app interactions, other
  user-generated content); App info and performance (diagnostics). In-app search history too,
  unless Google leaves ephemeral data out (**to check**).
- **Security practices:** data is encrypted in transit; you can request that data be deleted.

Answer again before shipping any build that changes what is collected: crash reporting, analytics,
push notifications, avatars, a web version, an age flag for the Families Policy (section 5), or a
mail provider that keeps more.

### The account deletion page

The Delete account URL points here. Google's requirements for the page, as far as they are known
here: it names the app and the developer as the store listing does, shows the steps prominently,
and says what is deleted, what is kept and for how long (**to check** the current list). The page
at `{{SUPPORT_URL}}` is drafted in `support-page.md`, whose "Deleting your account" section must say
the same as the text below, with the placeholders filled in on the hosted copy only; keep both in
step with the privacy policy's section 9.

English:

```text
Deleting your Night Courier account

Night Courier is a private app run by {{OPERATOR_NAME}}.

In the app
1. Open Night Courier and sign in.
2. Tap Your profile.
3. Tap Delete my account, then Delete.
Your account is deleted at once, and for good.

Without the app
Write to {{CONTACT_EMAIL}} from the email address of your account, and ask for your account to be deleted. If you write from another address, I will ask you to confirm from that one. I delete the account within a month at the latest and tell you when it is done.

What is deleted
Your account and sign-in, your profile (username, display name and city), your bats, your friendships and friend requests, your blocks, and every letter you have sent or received, for the people you wrote with as well as for you.

What is kept, and for how long
• Reports. A report about you keeps your names as they were and any letter of yours it is about; a report you made keeps what you wrote in it. Each report is deleted 180 days after it was made. If I passed a report to the police, they keep their copy under their own rules.
• The sign-in log at the hosting provider (sign-up and sign-in events, with your email address). A daily job deletes every entry once it is 30 days old; when you delete your account in the app, yours go at once.
• Server logs and any backups at the hosting provider, until they are deleted or overwritten automatically. The privacy policy says how long.
• Emails between you and me, as long as I need them for what you asked.
• If I removed an account for breaking the house rules, its sign-in, email address included, stays banned for two years from the removal so that it cannot simply sign up again, and is then deleted automatically.
• If you test the Android version: your Google account's email address on my tester list in Google Play Console, until you tell me you have stopped testing. Asking me to delete your account counts. What Google itself keeps follows Google's own terms.

Deleting only some of your data
Write to {{CONTACT_EMAIL}} and say what you would like deleted. I will tell you what I can delete while your account stays, and why, if something cannot go. Single letters cannot be deleted on their own: a letter goes only when your account or the other person's is deleted.

Privacy policy: {{PRIVACY_POLICY_URL}}
```

German:

```text
Dein Night-Courier-Konto löschen

Night Courier ist eine private App von {{OPERATOR_NAME}}.

In der App
1. Öffne Night Courier und melde dich an.
2. Tippe auf „Your profile“.
3. Tippe auf „Delete my account“ und dann auf „Delete“.
Dein Konto ist dann sofort und endgültig gelöscht.

Ohne die App
Schreib an {{CONTACT_EMAIL}}, von der E-Mail-Adresse deines Kontos, und bitte darum, dein Konto zu löschen. Schreibst du von einer anderen Adresse, bitte ich dich, es von der Adresse deines Kontos zu bestätigen. Ich lösche das Konto spätestens innerhalb eines Monats und sage dir Bescheid, wenn es erledigt ist.

Was gelöscht wird
Dein Konto und deine Anmeldung, dein Profil (Benutzername, Anzeigename und Stadt), deine Fledermäuse, deine Freundschaften und Anfragen, deine Blockierungen und jeder Brief, den du geschickt oder bekommen hast – bei den Menschen, mit denen du geschrieben hast, genauso wie bei dir.

Was bleibt, und wie lange
• Meldungen. Eine Meldung über dich behält deine Namen, so wie sie damals waren, und einen Brief von dir, um den es geht; eine Meldung von dir behält, was du hineingeschrieben hast. Jede Meldung wird 180 Tage, nachdem sie gemacht wurde, gelöscht. Habe ich eine Meldung an die Polizei gegeben, bewahrt die Polizei ihre Kopie nach ihren eigenen Regeln auf.
• Das Anmeldeprotokoll beim Hosting-Anbieter (Registrierung und Anmeldungen, mit deiner E-Mail-Adresse). Ein täglicher Auftrag löscht jeden Eintrag, sobald er 30 Tage alt ist; löschst du dein Konto in der App, sind deine sofort weg.
• Server-Protokolle und etwaige Sicherungskopien beim Hosting-Anbieter, bis sie automatisch gelöscht oder überschrieben werden. Wie lange, steht in der Datenschutzerklärung.
• E-Mails zwischen dir und mir, solange ich sie für dein Anliegen brauche.
• Habe ich ein Konto wegen Verstößen gegen die Hausregeln entfernt, bleibt seine Anmeldung samt E-Mail-Adresse zwei Jahre ab dem Entfernen gesperrt, damit es sich nicht einfach neu anmeldet, und wird dann automatisch gelöscht.
• Wenn du die Android-Version testest: die E-Mail-Adresse deines Google-Kontos auf meiner Testerliste in der Google Play Console, bis du mir schreibst, dass du nicht mehr testest. Die Bitte, dein Konto zu löschen, zählt dazu. Was Google selbst speichert, regeln Googles eigene Bestimmungen.

Nur einen Teil deiner Daten löschen
Schreib an {{CONTACT_EMAIL}}, was gelöscht werden soll. Ich sage dir, was ich löschen kann, während dein Konto bleibt, und warum, wenn etwas nicht gehen sollte. Einen einzelnen Brief kann ich nicht für sich löschen: Ein Brief verschwindet erst, wenn dein Konto oder das der anderen Person gelöscht wird.

Datenschutzerklärung: {{PRIVACY_POLICY_URL}}
```

The "kept" list follows the code as of the housekeeping migration
(`20261104120000_privacy_housekeeping.sql`, up to commit acd4efe): sign-in records 30 days and
deleted with the account, removed accounts banned for `private.ban_period()`, two years from the
removal, and then deleted by the tidy-up. Sessions are not on the list because they go with the
account, both in the app and when the operator deletes it in the dashboard; a removed account's
sessions are deleted by the tidy-up once unused for 90 days, like any others (privacy policy 3.8). The single-letter
sentence follows privacy policy 3.4: there is no per-letter deletion, by the user or on request.
When any of that changes, change this list, `support-page.md`, the privacy policy (sections 3.4,
3.7, 3.8, 3.9, 9 and 11) and `gdpr-records.md` together.

---

## 7. US COPPA, for an app not offered in the US

A short note, not legal advice.

- **What it is.** The Children's Online Privacy Protection Act, and the FTC's COPPA Rule, a US law.
  It applies to operators of websites and online services directed to children under 13, and to
  operators who know they collect personal information from a child under 13. Before collecting it
  they need, among other things, verifiable consent from a parent. An email address, a username and
  letters would all count as personal information (**to check** the exact definitions).
- **Why it probably does not reach Night Courier.** The FTC applies COPPA to operators outside the
  US whose service is directed to children in the US or who knowingly collect from children in the
  US (**to check**). Night Courier is neither: it is not listed in any store, it is invite-only, and
  it is not offered in the US. COPPA's definition of an operator also refers to commercial purposes;
  whether a non-commercial private individual is one at all is **to check**.
- **Why it still matters.**
  - Google's Families Policy names COPPA among the laws an app that targets children must comply
    with (section 5). Whether Google applies that to an app not available in the US is **to check**.
  - On internal testing the operator invites every tester by email, so knows who they are. Whether
    Play's country availability applies to internal tests at all is **to check**.
  - TestFlight's public link works for anyone who has it, and can be passed on. Whether App Store
    Connect can limit TestFlight to some countries is **to check**. A 12-year-old in the US who gets
    the link would be a user under 13 in the US.
- **What to do.** Invite no one under 13 who lives in the US, and do not post the TestFlight link
  where that could happen. If the operator learns that an account belongs to a child under 13 in the
  US, delete it: COPPA would require a parent's verifiable consent, which the app has no way to
  collect. Delete it without a ban, as for anyone found to be under 12 (Authentication → Users →
  Delete user, not `private.remove_account`): the two-year ban is only for accounts removed for
  breaking the rules (privacy policy 3.8). Build nothing for COPPA unless the app is ever offered
  in the US.

---

## 8. Checklist before the first internal test

- [ ] Play Console developer account (personal) created and identity-verified. Verify its contact
      email and phone, and sign in at least every 180 days (GO-LIVE, "Two multi-year traps").
- [ ] Hosted Supabase project set up and checked (GO-LIVE, "Setting up the hosted project").
- [ ] Custom SMTP and email confirmation on before the second person signs up (GO-LIVE, "Before a
      second person can sign up"). Then change section 3.10 of both privacy policies as their TO
      CHECK and PRÜFEN comments say.
- [ ] Supabase DPA, with the standard contractual clauses, signed before the privacy policy is
      published (`gdpr-records.md` 5.1): until then, its sections 7 and 8 are untrue.
- [ ] Privacy policy published at `{{PRIVACY_POLICY_URL}}`, with the placeholders filled in on the
      hosted copy only, and the hosting location named as Switzerland. It is the only page with the
      postal address.
- [ ] Support page live at `{{SUPPORT_URL}}` (`support-page.md`), with the account deletion text
      (section 6), and without the postal address: it points to the privacy policy for that.
- [ ] App created (section 1), store listing in English and German, icon, feature graphic and
      screenshots (section 2).
- [ ] App content answered: privacy policy, App access, Ads, Advertising ID, the other declarations
      (section 3), content rating (section 4), Target audience (section 5).
- [ ] The Families Policy decision taken (section 5): build the three social-feature pieces, raise
      the minimum age, or stay internal with no Android tester under 13. Write down which, here.
- [ ] Data safety filled in if Play Console allows it (section 6). Required before any other track,
      and so is the decision on sharing with the police ("Why nothing is shared").
- [ ] Pre-launch reports off if they run on internal testing, and the credentials option in App
      access unticked (section 3).
- [ ] First Android App Bundle built with EAS. `eas.json` does not exist yet (GO-LIVE, D). The EAS
      environment has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` for the hosted
      project, `EXPO_PUBLIC_CONTACT_URL` and `EXPO_PUBLIC_PRIVACY_POLICY_URL`.
- [x] `android.blockedPermissions` in `app.json` for `SYSTEM_ALERT_WINDOW`, `VIBRATE`,
      `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` (section 3, Advertising ID). Done in
      commit 191bc50, guarded by `src/tests/app-config.test.ts`.
- [ ] On the first build, the merged manifest checked in App bundle explorer: `INTERNET` only, no
      `AD_ID`.
- [ ] Internal testing: a tester list (at most 100 Google account email addresses), kept only in
      Play Console, and the opt-in link sent to those people. Take testers off the list when they
      stop (privacy policy, section 3.12).
- [ ] The Play demo account ready (section 3), in case Google reviews.

---

## 9. Still to check

Collected from above, so none is lost:

1. Which of the store listing, App access, Ads, content rating and Target audience an internal
   release needs before it can roll out, and whether internal releases are reviewed at all.
2. That apps only on internal testing are still exempt from the Data safety form.
3. The closed-testing rule for production access of new personal accounts (12 testers, 14 days).
4. What Google Play shows publicly about a personal developer account.
5. Menu paths and field names throughout: store listing, store settings, App content, the App
   access credentials option, external marketing, pre-launch reports.
6. Graphic sizes, the category (Communication or Social) and tags.
7. Google's current privacy policy requirements, and the account deletion page requirements.
8. Whether pre-launch reports run on internal testing, and turning them off.
9. The built app's permissions: that the merged manifest keeps only `INTERNET` now that `app.json`
   blocks the template's other four (commit 191bc50), that no library adds one of its own, and that
   there is no `AD_ID` permission; that blocking them breaks nothing.
10. The IARC category names, the exact questions, and whether a self-chosen city counts as "shares
    location". The ratings the certificate gives, especially the USK's. That a rating cannot be
    overridden upwards.
11. Play's age groups as shown on screen, and whether "appeals to children" is asked.
12. The full text of the Families Policy, especially the three social-feature rules, whether
    Night Courier is a "social app" or an app with "social features" (and so whether the adult
    controls apply), what counts as adult action, whether "child" ever means a country's own age
    of consent rather than under 13, the date for anonymous chat apps, and the content-rating rule
    for apps that target children.
13. Whether any part of the Families Policy is relaxed for internal testing (none is known).
14. Google's minimum age for an unsupervised account in Germany, and whether Family Link-supervised
    accounts can join internal tests.
15. The Data safety definitions: ephemeral processing and whether it shows in the public section,
    the sharing exceptions, how free text, passwords and IP addresses are treated, Android vitals,
    whether a voluntary referral to the police (with the account's sign-in records) counts as
    sharing, and whether the operator's mail through a Microsoft consumer mailbox does. The police
    question has to be decided before any track beyond internal testing (section 6, "Why nothing
    is shared"): either the exception is confirmed, or the six types are declared Shared for Fraud
    prevention, security, and compliance. Decision: not taken yet.
16. The option name for "username and password" account creation.
17. COPPA: the definitions, its reach to foreign operators, the commercial-purposes question,
    whether Google applies its COPPA requirement outside the US, country limits for Play internal
    tests and for TestFlight.
