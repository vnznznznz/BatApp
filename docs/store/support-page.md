<!--
Notes for the operator - remove before publishing, like every comment in this file.

1. This is the page behind {{SUPPORT_URL}}. App Store Connect uses it as the Support URL, and Google
   Play as the Website and the Delete account URL (google-play.md, "The account deletion page").
   One page does all three, in English and German.
2. Replace the placeholders on the hosted copy only: {{OPERATOR_NAME}}, {{OPERATOR_ADDRESS}},
   {{CONTACT_EMAIL}}, {{PRIVACY_POLICY_URL}}. The filled-in page does NOT go into this public
   repository.
3. "What is kept, and for how long" follows the privacy policy, sections 3.7 to 3.9 and 9, and the
   migration supabase/migrations/20261104120000_privacy_housekeeping.sql. Change them together.
4. Forgotten password: the app sends the reset email, but cannot yet finish the reset (GO-LIVE,
   "Password reset cannot be completed in-app"), and no email leaves the hosted project before a
   custom SMTP provider is set up. Until both are done, this page sends people to the contact
   address. Once they are, replace that paragraph with: "On the sign-in screen, tap I forgot my
   password, enter your email address and follow the link in the email."
-->

# Night Courier – help and contact

Night Courier is a private app for letters between friends, carried by bats. It is run by
{{OPERATOR_NAME}}, {{OPERATOR_ADDRESS}}, on their own, not as a business.

[Deutsch weiter unten](#night-courier--hilfe-und-kontakt)

## Contact

Write to {{CONTACT_EMAIL}}, from the email address of your account if it is about your account.
I read every email and answer as soon as I can.

## Something is wrong

- **A letter or a courier breaks the house rules:** open the letter and tap _Report this letter_,
  or open the courier's page from Friends and tap _Report_. A report reaches me directly; the person
  you report is not told who reported them. Reporting also blocks them, unless you switch that off.
- **Someone threatens you or anyone else**, or you think a crime is involved: report it in the app,
  and contact the police. In an emergency, call 112 (in Germany and across the EU).
- **The app does not work as it should:** write to me, and say what you did and what happened.

## Forgotten password

Write to {{CONTACT_EMAIL}} from the email address of your account, and I will help you set a new
one.

## Deleting your account

**In the app:** sign in, tap _Your profile_, then _Delete my account_, then _Delete_. Your account
is deleted at once, and for good.

**Without the app:** write to {{CONTACT_EMAIL}} from the email address of your account and ask for
your account to be deleted. If you write from another address, I will ask you to confirm from that
one. I delete the account within a month at the latest and tell you when it is done.

**What is deleted:** your account and sign-in, your profile (username, display name and city), your
bats, your friendships and friend requests, your blocks, and every letter you have sent or received
– for the people you wrote with as well as for you.

**What is kept, and for how long:**

- **Reports.** A report about you keeps your names as they were and any letter of yours it is
  about; a report you made keeps what you wrote in it. Each report is deleted 180 days after it was
  made.
- **The sign-in log** at the hosting provider (sign-up and sign-in events, with your email
  address). Every entry is deleted after 30 days at the latest; when you delete your account in the
  app, yours go at once.
- **Server logs and any backups** at the hosting provider, until they are deleted or overwritten
  automatically. The privacy policy says how long.
- **Emails** between you and me, as long as I need them for what you asked.
- If I removed an account for breaking the house rules, its sign-in, email address included, stays
  banned for two years so that it cannot simply sign up again, and is then deleted automatically.

**Deleting only some of your data:** write to {{CONTACT_EMAIL}} and say what you would like
deleted.

## Who can use Night Courier

You must be at least 12. If you are under 16, you need the permission of a parent or guardian.
Parents: if your child is using Night Courier without your permission, write to me and I will
delete the account.

## Privacy

The privacy policy says what Night Courier stores, why, and for how long: {{PRIVACY_POLICY_URL}}.
There are no ads, no tracking and nothing to buy.

---

# Night Courier – Hilfe und Kontakt

Night Courier ist eine private App für Briefe unter Freunden, die von Fledermäusen getragen werden.
Ich betreibe sie allein und nicht als Unternehmen: {{OPERATOR_NAME}}, {{OPERATOR_ADDRESS}}.

## Kontakt

Schreib an {{CONTACT_EMAIL}}, und wenn es um dein Konto geht, von der E-Mail-Adresse deines Kontos.
Ich lese jede E-Mail und antworte, so bald ich kann.

## Etwas stimmt nicht

- **Ein Brief oder ein Kurier verstößt gegen die Hausregeln:** Öffne den Brief und tippe auf „Report
  this letter“, oder öffne die Seite des Kuriers über „Friends“ und tippe auf „Report“. Eine Meldung
  kommt direkt bei mir an; die gemeldete Person erfährt nicht, wer sie gemeldet hat. Beim Melden
  wird die Person auch blockiert, außer du schaltest das aus.
- **Jemand bedroht dich oder andere**, oder du glaubst, dass es um eine Straftat geht: Melde es in
  der App und wende dich an die Polizei. Im Notfall: 110 (Polizei) oder 112.
- **Die App funktioniert nicht richtig:** Schreib mir, was du gemacht hast und was passiert ist.

## Passwort vergessen

Schreib an {{CONTACT_EMAIL}}, von der E-Mail-Adresse deines Kontos, dann helfe ich dir, ein neues
festzulegen.

## Dein Konto löschen

**In der App:** Melde dich an, tippe auf „Your profile“, dann auf „Delete my account“ und dann auf
„Delete“. Dein Konto ist dann sofort und endgültig gelöscht.

**Ohne die App:** Schreib an {{CONTACT_EMAIL}}, von der E-Mail-Adresse deines Kontos, und bitte
darum, dein Konto zu löschen. Schreibst du von einer anderen Adresse, bitte ich dich, es von der
Adresse deines Kontos zu bestätigen. Ich lösche das Konto spätestens innerhalb eines Monats und
sage dir Bescheid, wenn es erledigt ist.

**Was gelöscht wird:** dein Konto und deine Anmeldung, dein Profil (Benutzername, Anzeigename und
Stadt), deine Fledermäuse, deine Freundschaften und Anfragen, deine Blockierungen und jeder Brief,
den du geschickt oder bekommen hast – bei den Menschen, mit denen du geschrieben hast, genauso wie
bei dir.

**Was bleibt, und wie lange:**

- **Meldungen.** Eine Meldung über dich behält deine Namen, so wie sie damals waren, und einen Brief
  von dir, um den es geht; eine Meldung von dir behält, was du hineingeschrieben hast. Jede Meldung
  wird 180 Tage, nachdem sie gemacht wurde, gelöscht.
- **Das Anmeldeprotokoll** beim Hosting-Anbieter (Registrierung und Anmeldungen, mit deiner
  E-Mail-Adresse). Jeder Eintrag wird spätestens nach 30 Tagen gelöscht; löschst du dein Konto in
  der App, sind deine sofort weg.
- **Server-Protokolle und etwaige Sicherungskopien** beim Hosting-Anbieter, bis sie automatisch
  gelöscht oder überschrieben werden. Wie lange, steht in der Datenschutzerklärung.
- **E-Mails** zwischen dir und mir, solange ich sie für dein Anliegen brauche.
- Habe ich ein Konto wegen Verstößen gegen die Hausregeln entfernt, bleibt seine Anmeldung samt
  E-Mail-Adresse zwei Jahre gesperrt, damit es sich nicht einfach neu anmeldet, und wird dann
  automatisch gelöscht.

**Nur einen Teil deiner Daten löschen:** Schreib an {{CONTACT_EMAIL}}, was gelöscht werden soll.

## Wer Night Courier nutzen kann

Du musst mindestens 12 Jahre alt sein. Wer unter 16 ist, braucht die Erlaubnis der Eltern oder
anderer Erziehungsberechtigter. Eltern: Nutzt euer Kind Night Courier ohne eure Erlaubnis, schreibt
mir, und ich lösche das Konto.

## Datenschutz

Was Night Courier speichert, wozu und wie lange, steht in der Datenschutzerklärung:
{{PRIVACY_POLICY_URL}}. Es gibt keine Werbung, kein Tracking und nichts zu kaufen.
