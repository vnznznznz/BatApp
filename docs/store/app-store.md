# App Store Connect: what to type in

Everything Night Courier needs in App Store Connect, ready to copy: the app record, the age rating,
the App Privacy label, export compliance, store texts in English and German, TestFlight, and Beta
App Review.

Researched on 4 November 2026 against Apple's App Store Connect help pages. Apple renames fields and
changes forms; anything marked **to check** has to be confirmed on screen before it is relied on.

**Personal data stays out of this file.** This repository is public. Where a field needs the
operator's details, this file names a placeholder, and the real value is typed straight into App
Store Connect (or into the hosted privacy policy), never written here:

| Placeholder              | Means                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{{OPERATOR_NAME}}`      | The operator's name                                                                                                                                                             |
| `{{OPERATOR_ADDRESS}}`   | The operator's postal address. Published only in the hosted privacy policy, section 1; the support page points there for it. In App Store Connect only where a form asks for it |
| `{{CONTACT_EMAIL}}`      | The contact address, also behind the app's Contact button                                                                                                                       |
| `{{PRIVACY_POLICY_URL}}` | The hosted privacy policy, also behind the app's Privacy policy button                                                                                                          |
| `{{SUPPORT_URL}}`        | The support page (`support-page.md`): a public https page with the contact route                                                                                                |
| `{{EFFECTIVE_DATE}}`     | The date the privacy policy takes effect                                                                                                                                        |

Values that are not personal data but must not be committed either, such as the demo account's
sign-in, are written as `<like this>`. They live in the operator's password manager and in App Store
Connect.

Related: the privacy policy drafts (`privacy-policy.de.md`, `privacy-policy.en.md`) and Google
Play's forms (`google-play.md`) sit next to this file. The App Privacy answers below and the privacy
policy must describe the same data; change them together.

---

## 1. The app record

Created once, under Apps → + → New App.

| Field            | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Platforms        | iOS                                                                                        |
| Name             | `Night Courier` (13 of 30 characters). Names are unique on the App Store: **to check** now |
| Primary language | English (U.K.), the spelling the app's own copy uses                                       |
| Bundle ID        | `com.nightcourier.app` (from `app.json`; EAS can register it)                              |
| SKU              | `night-courier` (internal, never shown)                                                    |
| User access      | Full access                                                                                |

Add German as a second localisation for the store texts in section 5. The app itself is in English
only, and the German texts say so.

An Individual enrolment shows the operator's legal name as the developer, in TestFlight and on the
App Store. That cannot be avoided with an Individual enrolment; nothing else in this file makes it
more public.

---

## 2. App Information

### Subtitle (at most 30 characters)

```text
Slow letters, carried by bats
```

```text
Langsame Post per Fledermaus
```

29 and 28 characters.

### Category

- Primary: **Social Networking**: Apple's category for apps that connect people by text, voice,
  photo or video.
- Secondary (optional): **Lifestyle**. Not Games or Entertainment: apps in those categories get an
  extra regional rating in Korea.

### Content rights

"Does your app contain, show, or access third-party content?" → **Yes**. "Do you have all necessary
rights to that content?" → **Yes**.

Why: the city list is GeoNames data (`cities15000`), licensed CC BY 4.0, cut down to larger cities
and given extra search names by `scripts/build-cities.mjs`. The licence allows that with credit, a
link to the licence and a note that it was changed, and the city picker and the profile show all
three: "City names and places adapted from GeoNames (geonames.org), licensed under CC BY 4.0
(creativecommons.org/licenses/by/4.0)." Everything else is original: the artwork is generated from
this repository's own vector source, and the app uses the system fonts.

### Privacy policy, support and other URLs

| Field                     | Value                                                                    |
| ------------------------- | ------------------------------------------------------------------------ |
| Privacy Policy URL        | `{{PRIVACY_POLICY_URL}}`, the same address as the in-app button          |
| User Privacy Choices URL  | Leave empty: there are no choices beyond deleting the account in the app |
| Support URL (per version) | `{{SUPPORT_URL}}`: a web page, not a `mailto:` link                      |
| Marketing URL             | Leave empty                                                              |

Apple's field reference says the Support URL "must lead to actual contact information (legal
address, email address, telephone number), as may be required by local law". Make it an https
page, as the app's own web links must be. `{{SUPPORT_URL}}` is the support page
(`support-page.md`). It names `{{OPERATOR_NAME}}` and `{{CONTACT_EMAIL}}`, and for the postal
address it points to the privacy policy, section 1, so that the address is published on one page
only. Whether Apple accepts a link to the address instead of the address itself is **to check**;
if it does not, use `{{PRIVACY_POLICY_URL}}` as the Support URL, which names all three and still
keeps the address on one page. Whether a telephone number has to be published too is **to check**.
The phone number under Beta App Review Information is for Apple only, which is a different thing.
The Support URL is shown on the App Store listing, so the page must not carry anything the operator
would not want published.

### Licence agreement

Keep Apple's standard licence agreement. Night Courier's own terms are the house rules
(`src/app/rules.tsx`), which every account agrees to at sign-up. They carry a zero-tolerance clause
for objectionable content and abusive behaviour. Guideline 1.2's text does not ask for one; App
Review expects it of apps with user content (enforcement practice, GO-LIVE).

### Age rating

App Information → Age Ratings → Set Up Age Ratings. Apple's questionnaire asks about the app's own
content and features, and App Store Connect works out the rating from the answers. What users may
write in a letter is covered by the Messaging and Chat answer, and by the house rules, block and
report that come with it. The bats and the night sky are decoration.

**In-app controls and capabilities.** Tick only Messaging and Chat.

| Item                                     | Answer | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parental Controls                        | No     | There are no tools for a parent to monitor, limit or restrict anything in the app. Parents give permission outside the app.                                                                                                                                                                                                                                                                                                                                                               |
| Age Assurance                            | No     | Apple means a mechanism that confirms age, such as the Declared Age Range API, age estimation or an ID check. Sign-up only asks the person to confirm "I am 12 or older" (and, under 16, that a parent or guardian has said yes), and stores nothing. No is also the cautious answer: it claims nothing the app does not do.                                                                                                                                                              |
| Unrestricted Web Access                  | No     | No in-app browser. The two links (Contact, Privacy policy) open fixed addresses in the mail app or the system browser.                                                                                                                                                                                                                                                                                                                                                                    |
| User-Generated Content                   | No     | Apple defines it as "broad distribution of content created by users as part of the app's intended experience". A letter goes to one accepted friend and is published nowhere. Guideline 1.2 still applies, and report, block and the house rules exist for it. **To check** with the reviewer's view: answering Yes would not change the rating either, since Apple's tables put both at 4+ globally, and in Brazil messaging already gives A12, above the A6 for user-generated content. |
| Social Media                             | No     | Apple means a social feed that visibly spreads content to many users. There is no feed, no likes, no shares and no discovery. Outside a friendship, a person sees no more than the name and username on a friend request.                                                                                                                                                                                                                                                                 |
| Social Media Disabled for Users Under 13 | No     | There is no social media to disable.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Messaging and Chat                       | Yes    | Letters are direct, one-to-one messages between friends.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Advertising                              | No     | No advertising of any kind (`MONETISATION_ENABLED = false`).                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Content questions.** Choose None (or No) for every one:

| Section                 | Items, all None or No                                                                                                    | Why                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mature Themes           | Profanity or Crude Humor; Horror/Fear Themes; Alcohol, Tobacco, or Drug Use or References                                | The app's own words and pictures contain none of it. A cartoon bat under a moon is not horror.                                                         |
| Medical or Wellness     | Medical or Treatment Information; Health or Wellness Topics                                                              | None.                                                                                                                                                  |
| Sexuality or Nudity     | Mature or Suggestive Themes; Sexual Content or Nudity; Graphic Sexual Content and Nudity                                 | None. The house rules forbid sexual content involving or sent to anyone under 18, and unwanted sexual messages to anyone.                              |
| Violence                | Cartoon or Fantasy Violence; Realistic Violence; Prolonged Graphic or Sadistic Realistic Violence; Guns or Other Weapons | None.                                                                                                                                                  |
| Chance-Based Activities | Gambling; Simulated Gambling; Contests; Loot Boxes                                                                       | Nothing to win, buy or compete for: no rankings, no rewards, no purchases. Three bats come with every account, and the number is enforced server-side. |

**The rating this gives, and the override.** Apple's tables put Messaging and Chat under 4+, so the
global rating should come out as **4+**. For Brazil, Apple's table gives A12 for messaging and
chat. Korea shows a regional rating only for apps in the Games or Entertainment categories, so none
is expected with the categories above. Record what App Store Connect actually shows. Devices on an
OS earlier than version 26 show other values (App Store Connect lists them under "Operating Systems
Earlier than Version 26"); what 13+ becomes there is **to check**.

Then, under Age Categories and Override, choose **Override to Higher Age Rating → 13+**. Apple's
rule: "If your app has a EULA with minimum age requirements that exceed the rating that Apple
calculated, you must override to a rating that adheres to the requirements." The house rules are
the app's terms and set a minimum age of 12. Apple's tiers (OS version 26 and later) are 4+, 9+,
13+, 16+ and 18+, with no 12+; 9+ would promise the app to 9-year-olds, and 13+ is the lowest tier that respects the minimum.

What that means: the App Store shows 13+, one year above the house rules. Where a parent has limited
a child's iPhone in Screen Time to apps rated below 13+, an App Store app rated 13+ cannot be
installed until the parent changes that limit. Whether TestFlight installs follow the same limit is
**to check**. A 12-year-old with permission can still use the app. The rating does not stop a 13-
to 15-year-old who has no permission: for them, the confirmation at sign-up is the only check. If
the operator would rather the two numbers matched exactly, the alternative is raising the house
rules' minimum to 13. That is the operator's decision, and it is not made here.

- Made for Kids: no (the Kids category does not fit an app for 12 and over with messaging).
- Age Suitability URL (optional): leave empty, or `{{PRIVACY_POLICY_URL}}` if the hosted policy
  states the age rule.
- **To check:** whether the rating has to be set before a build can go to Beta App Review, and
  whether TestFlight shows or enforces it. Set it before the first submission anyway. GO-LIVE notes
  that Apple has required the new questionnaire since 31 January 2026.

---

## 3. App Privacy ("nutrition label")

App Store Connect → the app → App Privacy. Enter the Privacy Policy URL (`{{PRIVACY_POLICY_URL}}`)
first, then Get Started.

"Do you or your third-party partners collect data from this app?" → **Yes, we collect data from
this app.**

Apple's rules this follows, quoted from its App Privacy Details page:

- "Collect" means "transmitting data off the device in a way that allows you and/or your third-party
  partners to access it for a period longer than what is necessary to service the transmitted
  request in real time." Data used to answer one request and then discarded is not collected.
- Supabase stores everything on the operator's behalf, so what it holds counts as collected by the
  app. "You are not responsible for disclosing data collected by Apple." That covers TestFlight's
  own crash reports, feedback and tester data.
- For free-text fields Apple says "You're not responsible for disclosing all possible data that
  users may manually enter", and generic free text goes under Other User Content. But a field that
  asks for a specific type, such as a name or an email, must be declared as that type.
- IP addresses: "Declare the relevant data types based on how you use IP address".
- Personal data under privacy laws counts as linked to the user. Everything below is linked to the
  account.

### Every data type, answered

Purposes: everything collected is used for **App Functionality** only, Apple's purpose "to
authenticate the user, enable features, prevent fraud, implement security measures, ensure server
up-time … or perform customer support". Moderation and the ban that stops a removed person signing
up again are security. Nothing is used for Third-Party Advertising, Developer's Advertising or
Marketing, Analytics, Product Personalization or Other Purposes.

Tracking: **No** for every type. Nothing is linked with other companies' data for advertising, and
nothing goes to a data broker. The app has no advertising, analytics or crash-reporting SDK, and it
never shows Apple's tracking prompt (App Tracking Transparency).

| Category         | Data type               | Collected | Linked | Tracking | What it is, from the data inventory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ----------------------- | --------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact Info     | Name                    | **Yes**   | Yes    | No       | The display name ("Your name"), which friends, the people the user has exchanged letters with, and anyone the user asks to be friends, see. A report keeps it as it was. The username is declared under User ID, not here. The copy sent at sign-up is removed from the sign-in record by the daily tidy-up job.                                                                                                                                                                                                                                                                      |
| Contact Info     | Email Address           | **Yes**   | Yes    | No       | Sign-in, password reset, the operator's email about a report (a warning, or to the reporter after a threat), notice of an important change to the privacy policy (its section 15), and keeping a removed account from signing up again (two years from the removal). Never shown to other users.                                                                                                                                                                                                                                                                                      |
| Contact Info     | Phone Number            | No        |        |          | Never asked for.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Contact Info     | Physical Address        | No        |        |          | Never asked for. The city is under Coarse Location.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Contact Info     | Other User Contact Info | No        |        |          | The username reaches people inside the app only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Health & Fitness | Health                  | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Health & Fitness | Fitness                 | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Financial Info   | Payment Info            | No        |        |          | Nothing to buy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Financial Info   | Credit Info             | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Financial Info   | Other Financial Info    | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Location         | Precise Location        | No        |        |          | No GPS. The app never asks for location permission.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Location         | Coarse Location         | **Yes**   | Yes    | No       | The city the user picks from a list. While a move settles (a day), the previous city and the time of the move are also stored; the daily tidy-up deletes them at the latest two days after the move. Each letter keeps its origin and destination city. Used to work out delivery time; friends see the city. A city is not a device location, but Apple's definition is "information that describes the location of a user or device with lower resolution than a latitude and longitude with three or more decimal places", so declaring it is the cautious reading (**to check**). |
| Sensitive Info   | Sensitive Info          | No        |        |          | Never asked for. Letters are free text and may hold anything; they are declared as messages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Contacts         | Contacts                | **Yes**   | Yes    | No       | The friend list, friend requests and blocks: the user's social graph inside the app, which Apple's definition includes. The phone's address book is never read.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| User Content     | Emails or Text Messages | **Yes**   | Yes    | No       | Letters: the text (up to 2,000 characters), sender, recipient, bat, cities, distance, and when it was sent, landed and opened. Stored as plain text on the server, not end-to-end encrypted, and kept until one of the two accounts is deleted. A reported letter is copied into its report.                                                                                                                                                                                                                                                                                          |
| User Content     | Photos or Videos        | No        |        |          | The app has no images. Avatars are not built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| User Content     | Audio Data              | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| User Content     | Gameplay Content        | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| User Content     | Customer Support        | No        |        |          | Contact hands over to the user's own mail app or browser, so nothing passes through the app. The privacy policy covers what reaches the operator's mailbox.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| User Content     | Other User Content      | **Yes**   | Yes    | No       | Reports: the reason, the reporter's note (up to 500 characters), and the names as they were. Kept 180 days, even after either account is deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Browsing History | Browsing History        | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Search History   | Search History          | No        |        |          | City searches and username lookups are answered and not stored. They travel in request bodies, not in the URLs the server logs record.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Identifiers      | User ID                 | **Yes**   | Yes    | No       | The account id (UUID) and the username. Other users see them only through a friendship, a request, a letter or a block.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Identifiers      | Device ID               | No        |        |          | No advertising identifier, no vendor identifier, no push token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Purchases        | Purchase History        | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Usage Data       | Product Interaction     | **Yes**   | Yes    | No       | No analytics, but the server does keep: sign-in times, a session refresh about once an hour while the app is open (so a record of when it was in use; the sign-in log keeps 30 days), when each letter was opened (shown only to its recipient), and when each bat left or came home.                                                                                                                                                                                                                                                                                                 |
| Usage Data       | Advertising Data        | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Usage Data       | Other Usage Data        | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Diagnostics      | Crash Data              | No        |        |          | No crash reporting in the app. TestFlight's crash reports are Apple's to disclose.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Diagnostics      | Performance Data        | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Diagnostics      | Other Diagnostic Data   | **Yes**   | Yes    | No       | The IP address and user agent stored with every sign-in session, and Supabase's request and auth logs (IP, user agent, path with the account id, email on auth events). Kept for security and running the service: a session until sign-out or account deletion, or until the daily tidy-up deletes it after 90 days unused, the logs for as long as Supabase's plan keeps them (**to check**).                                                                                                                                                                                       |
| Surroundings     | Environment Scanning    | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Body             | Hands                   | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Body             | Head                    | No        |        |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Other Data       | Other Data Types        | No        |        |          | The password is stored only as a bcrypt hash. Apple's additional guidance defines collecting as storing data "in a readable form", which a hash is not (**to check**). The age confirmation is never sent anywhere.                                                                                                                                                                                                                                                                                                                                                                   |

The username is declared once, under User ID, and the display name under Name. Google's Data safety
form (`google-play.md`) sorts them the same way; keep the two forms in step.

For each **Yes**, App Store Connect asks three questions, and the answers are the same every time:

1. Purposes: **App Functionality** only.
2. "Is this data linked to the user's identity?" → **Yes**.
3. "Do you or your third-party partners use this data for tracking purposes?" → **No**.

### What the published label should then show

- **Data Used to Track You:** none.
- **Data Linked to You:** Contact Info, Location, Contacts, User Content, Identifiers, Usage Data,
  Diagnostics.
- **Data Not Linked to You:** none.

Coarse Location, Contacts, Product Interaction and Other Diagnostic Data are declared on purpose:
the server really does keep them. Leaving them out would make the label look smaller, but it would
be wrong.

Answer again before shipping any build that changes what is collected: crash reporting, analytics,
push notifications, avatars, a web version, or a new mail provider that keeps more.

---

## 4. Export compliance

**Exempt. Nothing to file.**

- `app.json` sets `ios.config.usesNonExemptEncryption: false`, which Expo writes into the build's
  Info.plist as `ITSAppUsesNonExemptEncryption = NO`. App Store Connect then marks each build as
  compliant and stops asking about it (**to check** on the first upload).
- The reason: the app uses only the encryption built into iOS, which is HTTPS/TLS through the
  system's networking (to `EXPO_PUBLIC_SUPABASE_URL`) and the iOS Keychain for the session (through
  `expo-secure-store`). It has no cryptography of its own, no VPN and no end-to-end encryption.
- If App Store Connect asks anyway, the answers are: the app uses encryption (Yes: HTTPS counts),
  and only the encryption in Apple's operating system, with no proprietary or other standard
  algorithms of its own. Apple's exact wording changes, so match these on screen (**to check**).
  With that answer, App Store Connect asks for no documents.

---

## 5. Store texts (English and German)

Only a public App Store release shows these, so they are not needed for TestFlight. They are
written now so that they match the app as it is. Each block is copy-ready, and line breaks are
paragraphs.

### Promotional text (at most 170 characters, editable any time)

```text
Three bats, one letter each, flying the real distance to your friends. Across town a letter lands this evening; across a continent it takes days. Nothing to buy, no ads.
```

```text
Drei Fledermäuse, je ein Brief, über die echte Entfernung zu deinen Freunden. In der Stadt landet er heute Abend, über einen Kontinent braucht er Tage. Keine Werbung.
```

### Description (at most 4,000 characters)

English:

```text
Night Courier is a slow way to write to your friends. You don't send messages. You send bats.

You keep exactly three bats. Each one carries a single letter, flies the real distance between your city and your friend's, and cannot fly again until it has come home. A letter to someone across town arrives this evening. A letter across a continent takes days. Nothing is ever delivered instantly.

HOW IT WORKS
• Choose your city from a list. Your bats fly from there. There is no GPS: the app never asks for your location.
• Ask someone to be friends by their exact username. Letters only travel between two people who have both said yes.
• Write a letter of up to 2,000 characters and send it with one of your bats. Watch it fly. When it lands, it waits until your friend next opens the app.
• Moving takes a day. After you choose a new city, your bats keep flying from the old one for 24 hours.

WHAT IT DOES NOT HAVE
• No ads, no purchases, no subscriptions. Three bats come with the account, and there is nothing to buy.
• No read receipts, no typing indicators, no online status.
• No public profiles, no feeds, no search for strangers.
• No push notifications. What has landed is there the next time you look.
• No analytics or tracking in the app.

SAFETY
• Block anyone, at any time. They are not told, though they will see that you are no longer friends. Their letters are hidden from you until you unblock them.
• Report a letter or a person. Reports go to the person who runs Night Courier. The person you report is not told who reported them, unless the law requires it.
• The house rules have no tolerance for harassment, threats, hate, scams, spam or sexual content nobody asked for, and none at all for sexual content involving or sent to anyone under 18.

YOUR DATA
• Delete your account at any time from your profile. Your profile, your friendships and every letter you have sent or received go with it, for your friends as well as for you. Reports stay: each is deleted 180 days after it was made.
• Letters are stored on the server so they can be delivered, and stay there until you or your friend deletes their account. They are not end-to-end encrypted. The privacy policy says who can see what, and everything else that is kept and for how long.

WHO IT IS FOR
Night Courier is a private, non-commercial project for a small circle of friends. You must be at least 12, and if you are under 16 you need a parent's or guardian's permission.

City data: GeoNames (geonames.org), CC BY 4.0.
```

German:

```text
Night Courier ist eine langsame Art, deinen Freunden zu schreiben. Du schickst keine Nachrichten. Du schickst Fledermäuse.

Du hast genau drei Fledermäuse. Jede trägt einen einzigen Brief, fliegt die echte Entfernung zwischen deiner Stadt und der Stadt der Person, der du schreibst, und kann erst wieder losfliegen, wenn sie zurück ist. Ein Brief quer durch die Stadt kommt heute Abend an. Ein Brief über einen Kontinent braucht Tage. Nichts kommt sofort an.

SO FUNKTIONIERT ES
• Wähle deine Stadt aus einer Liste. Von dort fliegen deine Fledermäuse los. Es gibt kein GPS: Die App fragt nie nach deinem Standort.
• Schick eine Freundschaftsanfrage über den genauen Benutzernamen. Briefe gehen nur zwischen zwei Menschen, die beide Ja gesagt haben.
• Schreib einen Brief mit bis zu 2.000 Zeichen und schick ihn mit einer deiner Fledermäuse los. Sieh ihr beim Fliegen zu. Wenn sie landet, wartet der Brief, bis die andere Person die App das nächste Mal öffnet.
• Umziehen dauert einen Tag. Wenn du eine neue Stadt wählst, fliegen deine Fledermäuse noch 24 Stunden lang von der alten los.

WAS ES NICHT GIBT
• Keine Werbung, keine Käufe, keine Abos. Drei Fledermäuse gehören zum Konto, und es gibt nichts zu kaufen.
• Keine Lesebestätigungen, keine Tipp-Anzeige, kein Online-Status.
• Keine öffentlichen Profile, keine Feeds, keine Suche nach Fremden.
• Keine Push-Benachrichtigungen. Was gelandet ist, siehst du beim nächsten Öffnen.
• Keine Analyse- oder Tracking-Dienste in der App.

SICHERHEIT
• Blockiere jeden, jederzeit. Die Person erfährt es nicht, sieht aber, dass ihr keine Freunde mehr seid. Ihre Briefe sind für dich ausgeblendet, bis du die Blockierung aufhebst.
• Melde einen Brief oder eine Person. Meldungen gehen an die Person, die Night Courier betreibt. Die gemeldete Person erfährt nicht, wer sie gemeldet hat, außer das Gesetz verlangt es.
• Die Hausregeln dulden keine Belästigung, keine Drohungen, keinen Hass, keinen Betrug, keinen Spam und keine sexuellen Inhalte, um die niemand gebeten hat – und erst recht keine sexuellen Inhalte, an denen Minderjährige beteiligt sind oder die an Minderjährige gehen.

DEINE DATEN
• Du kannst dein Konto jederzeit in deinem Profil löschen. Dein Profil, deine Freundschaften und jeder Brief, den du geschickt oder bekommen hast, werden mit gelöscht, bei deinen Freunden genauso wie bei dir. Meldungen bleiben: Jede wird 180 Tage nach der Meldung gelöscht.
• Briefe werden auf dem Server gespeichert, damit sie zugestellt werden können, und bleiben dort, bis du oder die andere Person das Konto löscht. Sie sind nicht Ende-zu-Ende-verschlüsselt. Die Datenschutzerklärung sagt, wer was sehen kann und was sonst wie lange gespeichert wird.

FÜR WEN
Night Courier ist ein privates, nicht-kommerzielles Projekt für einen kleinen Freundeskreis. Du musst mindestens 12 Jahre alt sein. Wenn du unter 16 bist, brauchst du die Erlaubnis eines Elternteils oder einer erziehungsberechtigten Person. Die App selbst ist auf Englisch.

Städtedaten: GeoNames (geonames.org), CC BY 4.0.
```

Every claim in these texts is something the app does today. Before a release, check them against
the build again, and especially "no analytics or tracking", "not end-to-end encrypted" and the
180 days.

### Keywords (at most 100 bytes, separated by commas)

Apple counts bytes, not characters, and each keyword must be longer than two characters. The two
lists below are 89 and 98 bytes, with no characters outside ASCII. The name is indexed already, so
neither "night" nor "courier" appears here.

```text
letters,slow mail,pen pal,penpal,friends,bat,bats,distance,correspondence,write,post,mail
```

```text
Briefe,Brieffreund,Brieffreundin,langsam,Post,Freunde,Fledermaus,Entfernung,schreiben,Briefwechsel
```

### What's New

App Store Connect asks for this only on updates, not on the first version (Apple's field reference:
required for updates). For the first update, adapt this:

```text
Bug fixes and small improvements. Your bats still fly the real distance, and there is still nothing to buy.
```

```text
Fehlerbehebungen und kleine Verbesserungen. Deine Fledermäuse fliegen weiter die echte Entfernung, und es gibt weiter nichts zu kaufen.
```

Replace the first sentence with what actually changed, in a line or two.

---

## 6. TestFlight

### Test Information (app-level, localisable)

| Field                | Value                                                                                |
| -------------------- | ------------------------------------------------------------------------------------ |
| Beta App Description | Below (required for external testing)                                                |
| Feedback Email       | `{{CONTACT_EMAIL}}`: testers see it, and it is the reply-to of the invitation emails |
| Marketing URL        | Leave empty                                                                          |
| Privacy Policy URL   | `{{PRIVACY_POLICY_URL}}`                                                             |

Beta App Description, English:

```text
Night Courier is a slow way to write to friends. You keep three bats. Each carries one letter, flies the real distance between your city and your friend's, and cannot fly again until it has come home. Across town, a letter lands this evening; across a continent, it takes days.

There is nothing to buy, and there are no ads, no analytics, no push notifications, no read receipts and no public profiles. Letters travel only between friends: one asks by username, the other says yes. You can block anyone, report a letter or a person, and delete your account in your profile.

Night Courier is for people aged 12 and over; under 16, only with a parent's or guardian's permission. The app is in English.

This is a test version. Each build stops working 90 days after it was uploaded, so install the newest one when TestFlight offers it. Feedback you send through TestFlight, screenshots included, goes through Apple to the person who runs Night Courier. TestFlight also shows them when you installed each build, your sessions and any crashes. What else they see about you depends on how you were invited.
```

Beta App Description, German:

```text
Night Courier ist eine langsame Art, Freunden zu schreiben. Du hast drei Fledermäuse. Jede trägt einen Brief, fliegt die echte Entfernung zwischen deiner Stadt und der Stadt der anderen Person und kann erst wieder losfliegen, wenn sie zurück ist. Quer durch die Stadt landet ein Brief heute Abend, über einen Kontinent braucht er Tage.

Es gibt nichts zu kaufen, keine Werbung, keine Analyse, keine Push-Benachrichtigungen, keine Lesebestätigungen und keine öffentlichen Profile. Briefe gehen nur zwischen Freunden: Eine Person fragt über den Benutzernamen, die andere sagt Ja. Du kannst jeden blockieren, einen Brief oder eine Person melden und dein Konto im Profil löschen.

Night Courier ist für Menschen ab 12 Jahren; unter 16 nur mit Erlaubnis eines Elternteils oder einer erziehungsberechtigten Person. Die App ist auf Englisch.

Dies ist eine Testversion. Jeder Build läuft 90 Tage nach dem Hochladen ab. Installiere also den neuesten, wenn TestFlight ihn anbietet. Feedback, das du über TestFlight schickst, auch Screenshots, geht über Apple an die Person, die Night Courier betreibt. TestFlight zeigt ihr außerdem, wann du jeden Build installiert hast, deine Sitzungen und Abstürze. Was sie sonst über dich sieht, hängt davon ab, wie du eingeladen wurdest.
```

### What to Test (per build)

English:

```text
Thank you for testing Night Courier. Things to try:

1. Create an account. Use an email address you will keep: it is how you sign in, and it cannot be changed in the app.
2. Choose your city, then ask a friend to be friends by their exact username.
3. Write a letter and send it. Watch your bat on the first screen. The letter should land at the time shown, even if you close the app in between. There are no push notifications: open the app to see what has landed.
4. Open a letter that has landed, and write back.
5. Move to another city in your profile. For a day, your bats keep flying from the old one.
6. Block and Report are on every letter you receive and on a friend's page. Please try them only on a test friend: a report really goes to the person who runs Night Courier.
7. If you use VoiceOver, larger text or Reduce Motion, tell us how it went. With Reduce Motion on, the bats no longer flap or drift, but the app still shows where each one is on its way.

Not finished yet: resetting a forgotten password. Keep yours somewhere safe.

Send feedback with a screenshot through TestFlight, or with Contact in your profile. Please don't send screenshots that show someone else's letters.
```

German:

```text
Danke, dass du Night Courier testest. Das kannst du ausprobieren:

1. Leg ein Konto an. Nimm eine E-Mail-Adresse, die du behältst: Mit ihr meldest du dich an, und in der App lässt sie sich nicht ändern.
2. Wähl deine Stadt und schick jemandem eine Freundschaftsanfrage über den genauen Benutzernamen.
3. Schreib einen Brief und schick ihn los. Beobachte deine Fledermaus auf dem ersten Bildschirm. Der Brief sollte zur angezeigten Zeit landen, auch wenn du die App zwischendurch schließt. Es gibt keine Push-Benachrichtigungen: Öffne die App, um zu sehen, was gelandet ist.
4. Öffne einen gelandeten Brief und antworte.
5. Zieh in deinem Profil in eine andere Stadt um. Einen Tag lang fliegen deine Fledermäuse noch von der alten los.
6. „Block“ und „Report“ (Blockieren und Melden) findest du bei jedem Brief, den du bekommst, und auf der Seite einer befreundeten Person. Probier beides bitte nur mit einem Test-Kontakt aus: Eine Meldung geht wirklich an die Person, die Night Courier betreibt.
7. Wenn du VoiceOver, größere Schrift oder „Bewegung reduzieren“ nutzt, erzähl uns, wie es lief. Mit „Bewegung reduzieren“ flattern und schweben die Fledermäuse nicht mehr, aber die App zeigt weiter, wo jede gerade unterwegs ist.

Noch nicht fertig: ein vergessenes Passwort zurücksetzen. Bewahr deins gut auf.

Feedback mit Screenshot geht über TestFlight, oder über „Contact“ in deinem Profil. Bitte schick keine Screenshots, auf denen Briefe anderer Leute zu sehen sind.
```

These texts, the review notes and the demo below assume that custom SMTP and email confirmation are
on, which section 7 requires before anyone else signs up: a new account is confirmed through a link
in an email, and the app says so on screen ("Check your email"). Change the password line and the
review notes' "Known limitation" once the in-app password reset exists (GO-LIVE, "Known gaps
already logged").

### Beta App Review Information

Contact information, for Apple's reviewers only (not shown to testers):

| Field        | Value                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| First name   | From `{{OPERATOR_NAME}}`                                                                                 |
| Last name    | From `{{OPERATOR_NAME}}`                                                                                 |
| Phone number | Typed into App Store Connect only, in international format with `+` and the country code. Not kept here. |
| Email        | `{{CONTACT_EMAIL}}`                                                                                      |

Sign-in information:

| Field            | Value                                                       |
| ---------------- | ----------------------------------------------------------- |
| Sign-in required | Yes                                                         |
| User name        | `<reviewer account email>` (see "Preparing the demo" below) |
| Password         | `<reviewer account password>`                               |

Review notes (Apple's limit is 4,000 bytes; this is well under). Adapted from GO-LIVE, "Before first
submission":

```text
Night Courier is a private, non-commercial slow-messaging app for a small circle of friends. Nothing is for sale: no purchases, no ads, no analytics, no push notifications.

DEMO ACCOUNT
The account above is already friends with "Demo Friend", who has sent it two letters. Both have landed and are under Letters, on the first screen.

Letters are never instant. Each one flies the real distance between the two friends' cities, and never takes less than 20 minutes. A letter you send during the review may not land while you watch, which is why the demo letters were sent in advance.

REPORT AND BLOCK
Letters → a letter from Demo Friend → Report this letter, or Block. Or Friends → tap Demo Friend → Block / Report. Your profile → Safety holds Blocked couriers (each can be reported from there too), the house rules (our terms, with a zero-tolerance clause, agreed to at sign-up), Contact and the privacy policy.

FILTERING
Letters only travel between two people who are friends: one sent a friend request by exact username, and the other accepted it. There is no search, no public profile and no feed. The only thing a stranger who knows an exact username can send is a friend request, which shows their name and username; no letter reaches anyone until they accept. Blocking is private to the user. Report, which also blocks by default, reaches the operator, who checks for new reports every day, reads every one and acts on what breaks the house rules, up to removing the account.

ACCOUNT DELETION
Your profile → Delete my account, then confirm. It deletes the account at once, together with every letter it sent or received. To try it, please create a new account (Create an account, on the welcome screen), so that the demo account stays usable for the next review. A new account is confirmed through a link sent to its email address; then sign in with it.

AGE
Night Courier is for people aged 12 and over; under 16, only with a parent's or guardian's permission. Sign-up asks for this, and the house rules say it. Because there is no 12+ tier, the age rating is overridden to 13+.

KNOWN LIMITATION OF THIS BETA
A password-reset email can be requested, but setting the new password inside the app is not finished yet.
```

Two lines in these notes have to stay true for as long as the app is out, not only during a
review:

- "Checks for new reports every day" is a promise to Apple, and the house rules make the same one
  to users ("reads every one"). Look at `public.reports` daily (GO-LIVE, "Handling a report"), and
  set up the content-free alert described there before any day that might be missed.
- "Known limitation": rewrite it, or drop it, as soon as password reset works.

### Preparing the demo (before each Beta App Review)

On the hosted project, with a build that points at it:

1. Create the reviewer account through the app's sign-up: display name `App Review`, username
   `app_review`, an email address the operator controls and has made for this, and a generated
   password of at least 8 characters, kept in the operator's password manager. Confirm the address
   with the link in the email, sign in, and choose a city.
2. Create the second account the same way: display name `Demo Friend`, username `demo_friend`, a
   city near the reviewer's, so that letters land within the hour.
3. As Demo Friend, send a friend request to `app_review`, and accept it as App Review.
4. At least a day before submitting, send two harmless letters from Demo Friend to App Review. Sign
   in as App Review and check that both are under Letters, without opening them, so the reviewer
   sees them as new.
5. Sign out on every device used for this. The sign-in goes only into App Store Connect.

After each review, look at `public.reports` (GO-LIVE, "Handling a report"). Resolve the reviewer's
test reports with `resolution = 'app review test'`. If the reviewer blocked Demo Friend, unblock in
Your profile → Blocked couriers and become friends again. If the reviewer deleted the account, make
it again from step 1, because Apple wants a demo account that does not expire.

### Groups and the public link

1. Create an internal group first: Apple requires one before an external group can exist.
2. Create the external group (for example "Friends"), add the build, fill in What to Test, and
   submit it for review. Apple reviews the first build of each version in full; later builds of the
   same version may not need review. At most one build per version can be in review at a time.
3. Once approved, turn on the public link: **Open to Anyone**, and set a tester limit if wanted
   (1 to 10,000). Anyone who has the link can join, and can pass it on.
4. Testers need the TestFlight app and an Apple Account (Managed Apple Accounts in reserved domains
   cannot test). What App Store Connect shows about a tester who joined through the public link,
   and in particular whether their name or email address appears, is **to check** on screen.
   Privacy policy 3.12 and `gdpr-records.md` (V12) wait for the same answer. Until then, the beta
   description says only that it depends on how someone was invited, as the privacy policy does.

---

## 7. Checklists

### Before external TestFlight testing

- [ ] Apple Developer Program membership (Individual) active, and its agreement accepted in App
      Store Connect. A free app needs no Paid Apps agreement and no banking or tax forms (**to
      check** on the Agreements page).
- [ ] Hosted Supabase project set up and checked (GO-LIVE, "Setting up the hosted project"), step 4
      included: `cron.job` lists `deliver-due-messages`, `forget-old-reports` and `tidy-up`, and
      `select private.tidy_up();` returns `{}`. Anything else names a step the job skips for want of
      a privilege; until that is fixed, what section 3 and the privacy policy say about the sign-in
      log (30 days), sessions (90 days unused), the names from sign-up and removed accounts is
      wrong.
- [ ] Custom SMTP set up and email confirmation on before the second person signs up, and so before
      the first submission, because the reviewer may create an account (GO-LIVE, "Before a second
      person can sign up"). Then try a sign-up on a device: the confirmation link arrives, and once
      it has been opened, the account can sign in. What the app shows when the link opens it is
      **to check**: the app does not sign in from a link (`detectSessionInUrl` is off in
      `src/lib/supabase.ts`). Then change section 3.10 of both privacy policies as their TO CHECK
      and PRÜFEN comments say.
- [ ] Privacy policy published at `{{PRIVACY_POLICY_URL}}`, with `{{OPERATOR_NAME}}`,
      `{{OPERATOR_ADDRESS}}`, `{{CONTACT_EMAIL}}` and `{{EFFECTIVE_DATE}}` filled in on the hosted
      copy only. It is the only public page with the postal address. It names where the data is: the
      database in Zurich, Switzerland, with Supabase (a US company) as processor. Check Supabase's
      sub-processor list before writing "hosted in Switzerland" without that qualification.
- [ ] Supabase DPA signed, with the standard contractual clauses (`gdpr-records.md`, 5.1), before
      the privacy policy is published: its sections 7 and 8 say the agreement exists.
- [ ] Support page (`support-page.md`) live at `{{SUPPORT_URL}}`, with its placeholders filled in on
      the hosted copy only. It points to the privacy policy for the postal address and does not
      repeat it (section 2). If Apple wants the address on the Support URL itself, use
      `{{PRIVACY_POLICY_URL}}` there instead.
- [ ] The EAS environment for the build has `EXPO_PUBLIC_SUPABASE_URL` and
      `EXPO_PUBLIC_SUPABASE_ANON_KEY` for the hosted project, `EXPO_PUBLIC_CONTACT_URL`
      (`mailto:{{CONTACT_EMAIL}}` or `{{SUPPORT_URL}}`) and `EXPO_PUBLIC_PRIVACY_POLICY_URL`
      (`{{PRIVACY_POLICY_URL}}`). On a device, Contact shows in the profile and the house rules,
      and Privacy policy shows there and on the sign-up form.
- [ ] App record created (section 1). App Information filled in (section 2), including the age
      rating and the 13+ override.
- [ ] App Privacy answered and published (section 3). Whether TestFlight needs it is **to check**;
      do it anyway, because the App Store would.
- [ ] Build uploaded with EAS Submit. Export compliance shows no question (section 4).
- [ ] The upload email from App Store Connect has no warnings. Two things to check: a missing
      privacy-manifest reason (ITMS-91053; if it comes, add `ios.privacyManifests` to `app.json`),
      and that the built Info.plist has no `NSFaceIDUsageDescription`. `app.json` already passes
      `faceIDPermission: false` to `expo-secure-store`, and Expo's config plugins delete the key
      for `false`; confirm it once on a real build.
- [ ] Test Information, Beta App Review Information and the demo (section 6) are ready, and the two
      demo letters have landed.
- [ ] The operator looks at `public.reports` every day from the first submission on, as the review
      notes promise, not only while a review runs.
- [ ] Not needed: Sign in with Apple (Guideline 4.8 applies only to apps with third-party sign-in;
      Night Courier has its own email sign-in only), and the EU trader declaration (not applicable
      on a TestFlight-only path, GO-LIVE). Account deletion (5.1.1(v)) and report and block (1.2)
      are built.
- [ ] A calendar reminder for the 90-day build expiry (GO-LIVE).

### Only for a full App Store release

GO-LIVE recommends staying on TestFlight: a public listing makes the app findable by anyone, and an
unlisted app can never go back to public distribution (GO-LIVE, "Why TestFlight rather than an
unlisted App Store app"). If that changes:

- [ ] Screenshots, iPhone only (`supportsTablet` is false, so no iPad set). 1 to 10 per size, PNG
      or JPEG, no transparency. The current page lists, in portrait pixels:
  - iPhone with Dynamic Island, large display (6.9"): 1320 × 2868, 1290 × 2796 or 1260 × 2736.
  - iPhone with Face ID, large display (6.5"): 1284 × 2778 or 1242 × 2688. Required only if the
    6.9" set is missing.
  - The page also says "at least one screenshot for iPhone with Dynamic Island (medium display)"
    (1206 × 2622 or 1179 × 2556). **To check** which sets App Store Connect actually insists on
    at upload.
  - Use the demo accounts. No real person's letters, names or city.
- [ ] App previews: optional.
- [ ] Description, promotional text, keywords, subtitle and Support URL for both languages
      (sections 2 and 5). The Support URL page needs the contact details described in section 2.
- [ ] Copyright: `2026 {{OPERATOR_NAME}}`, which is public on the listing.
- [ ] Price: free. Availability: the countries the operator chooses.
- [ ] App Review Information: the same contact, demo account and notes as for Beta App Review,
      written for a full App Review.
- [ ] Full App Review against all guidelines, not Beta App Review.
- [ ] EU Digital Services Act trader status: declare as a non-trader for distribution in the EU (see
      GO-LIVE, "Why TestFlight rather than an unlisted App Store app"). **To check** at the time.
- [ ] Accessibility Nutrition Labels: Apple added these in 2025. Whether they are required yet is
      **to check**.
- [ ] What's New, from the first update on.

---

## 8. Still to check

Collected from above, so none is lost:

1. That the name "Night Courier" is free on the App Store.
2. The age rating App Store Connect computes (expected: 4+ globally, A12 for Brazil, no Korean
   regional rating outside Games and Entertainment), and that the override to 13+ is accepted.
   What 13+ shows as on devices with an OS earlier than version 26. Whether a reviewer would rather
   see User-Generated Content answered Yes.
3. Whether the age rating and App Privacy have to be done before Beta App Review, and whether
   TestFlight shows or enforces the rating, Screen Time limits included.
4. Declaring Coarse Location for a city chosen from a list, which is the cautious reading of
   Apple's definition.
5. That `ITSAppUsesNonExemptEncryption = NO` reaches the build and App Store Connect stops asking,
   and the wording of the encryption questions if it asks anyway.
6. Upload warnings about the privacy manifest, and that the built Info.plist really has no Face ID
   usage string.
7. That a free app needs no Paid Apps agreement or banking and tax forms.
8. Whether the Support URL page must also publish a telephone number, and whether a link from it
   to the postal address in the privacy policy is enough (section 2).
9. Which screenshot sizes App Store Connect insists on, and whether Accessibility Nutrition Labels
   are required, if a full release ever happens.
10. The trader declaration at the time of any App Store release.
11. That a password stored only as a bcrypt hash needs no entry under Other Data Types.
12. That `select private.tidy_up();` returns `{}` on the hosted project (GO-LIVE, "Setting up the
    hosted project", step 4), which the 30 days and the 90 days in section 3 rest on, and how long
    Supabase's plan keeps its logs.
13. What App Store Connect shows about a tester who joined through the public link (section 6,
    "Groups and the public link"). Privacy policy 3.12 waits for the same answer.
14. What the app shows when a confirmation link opens it, once email confirmation is on (section
    7).
