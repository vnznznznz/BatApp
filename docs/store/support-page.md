<!--
Notes for the operator - remove before publishing, like every comment in this file.

1. This is the page behind {{SUPPORT_URL}}. App Store Connect uses it as the Support URL, and Google
   Play as the Website and the Delete account URL (google-play.md, "The account deletion page").
   One page does all three, in English and German.
2. Where it lives: GitHub Pages, in the operator's user site, the public repository
   vnznznznz.github.io (live since 10 November 2026), as night-courier/index.html. So {{SUPPORT_URL}} is
   https://vnznznznz.github.io/night-courier/, and {{PRIVACY_POLICY_URL}} is
   https://vnznznznz.github.io/night-courier/privacy-policy.de.html, with privacy-policy.en.html
   beside it. Replace the placeholders only in that repository: {{OPERATOR_NAME}},
   {{CONTACT_EMAIL}}, {{PRIVACY_POLICY_URL}}. The filled-in page does NOT go into this public
   repository. The postal address ({{OPERATOR_ADDRESS}}) is deliberately not on this page: it
   appears only in the hosted privacy policy, section 1, and this page points there. The site
   repository is public too, and git keeps every earlier version of a page, so nothing goes onto
   this page that should not stay published.
3. Build it as a plain page: no cookies, and nothing loaded from other sites (no web fonts,
   scripts, analytics or embeds), so that the sentence under "Privacy" stays true. GitHub, Inc.
   (USA) logs visitors' IP addresses for security and operation; how long it keeps them, and
   whether GitHub is certified under the Data Privacy Framework, is TO CHECK, and the privacy
   policy covers both.
4. "Deleting your account" must say the same as the deletion text in google-play.md, "The account
   deletion page" (Google checks this page against it). "What is kept, and for how long" follows
   the privacy policy, sections 3.4, 3.7 to 3.9, 9 and 11, and the migration
   supabase/migrations/20261104120000_privacy_housekeeping.sql. Change them together. The line on
   server logs and backups names no period, because the policy has none yet (its TO CHECK notes
   in sections 3.9 and 9): once the hosted plan's periods are written into the policy, replace
   the line's second sentence with "The privacy policy says how long." ("Wie lange, steht in der
   Datenschutzerklärung."), here and in google-play.md. For the same reason "Privacy" says that
   the policy gives the periods "as far as it is known today" ("soweit es heute feststeht"): take
   those words out, dashes included, in the same change.
5. Codes: the app sets a new password, and confirms an address, with an 8-digit code from an
   email; every email carries a code and no link (supabase/templates; otp_length and otp_expiry in
   supabase/config.toml). No email leaves the hosted project before a custom SMTP provider is set
   up (GO-LIVE, "Before a second person can sign up: custom SMTP"): until then no code reaches
   anyone but the operator, and what helps is writing to the contact address, as "No email?" ends.
   Keep that ending in any case. "Confirming your email address" applies once email confirmation
   is switched on (enable_confirmations in supabase/config.toml); until then the app asks for no
   such code. A code's day is otp_expiry = 86400: if the hosted project allows less, change it in
   every place GO-LIVE ("Setting up the hosted project", step 2) lists, this page in both languages
   among them. Confirming an address by hand does not help someone whose emails do not arrive, so
   this page does not offer it: it takes the password away when a code to confirm the address had
   been emailed (supabase/migrations/20261121160000_confirmation_clears_password.sql), and setting a
   new one needs an email of its own (GO-LIVE, end of "Before a second person can sign up: custom
   SMTP"). The sentences in "No email?" on a try that may have confirmed the address follow the
   code screen's words after a check that got no answer (MAY_BE_CONFIRMED in
   src/features/auth/confirm-email.tsx, NAMES_NOT_CHOSEN in src/features/auth/auth-context.tsx):
   change them together.
6. "Your account has been suspended" follows signIn and verifyResetCode in
   src/features/auth/auth-context.tsx and the words of REFUSALS.account_suspended in
   src/lib/rpc-error.ts, which send a suspended courier to "the person who runs Night Courier" in
   a build with a contact address (without one they say only that the account has been
   suspended); the app's Contact button opens this page (EXPO_PUBLIC_CONTACT_URL, GO-LIVE "Setting
   up the hosted project", step 5). It goes with the privacy policy, section 3.8.
-->

# Night Courier – help and contact

Night Courier is a private app for letters between friends, carried by bats. It is run by
{{OPERATOR_NAME}}, on their own, not as a business. The postal address is in section 1 of the
privacy policy: {{PRIVACY_POLICY_URL}}.

[Deutsch weiter unten](#night-courier--hilfe-und-kontakt)

## Contact

Write to {{CONTACT_EMAIL}}, from the email address of your account if it is about your account.
I read every email and answer as soon as I can.

## Something is wrong

- **A letter or a courier breaks the house rules:** open the letter and tap _Report this letter_,
  or open the courier's page from Friends and tap _Report_. A report reaches me directly; the person
  you report is not told who reported them, unless the law requires it – but a letter has only one
  reader, so if I act on one, its sender may guess. Reporting also blocks them, unless you switch
  that off. A block hides their letters from you: to see them again, to keep a copy for example,
  unblock them under _Your profile_ → _Blocked couriers_. You can block them again afterwards.
- **Someone threatens you or anyone else**, or you think a crime is involved: report it in the app,
  and contact the police. In an emergency, call the police on 117 in Switzerland or 110 in Germany,
  or 112 anywhere in Europe, Switzerland included.
- **The app does not work as it should:** write to me, and say what you did and what happened.

## Forgotten password

On the sign-in screen, tap _I forgot my password_ and enter your email address. Type the 8-digit
code from the email into the app, with your new password. The code works for a day, and only the
newest one counts. If the app is closed after the code was taken but before your new password was
saved, it asks for the password again when it opens. No email? See below.

If the app says instead that the address had an account nobody had confirmed, that account has been
removed, with nothing in it: sign up with the address to make it yours.

## Confirming your email address

If the app asks for a code after you sign up or sign in, it is in an email to your address: type it
in. It works for a day, and only the newest code counts. After signing in, the app then saves your
password again, because confirming the address takes it away. If the app shows _One more code_
after a sign-up, an earlier sign-up for your address had another username: that account has made
way for yours, and the new code finishes it.

If the app opens on _Almost there_, your address is confirmed, but your password is not saved yet.
Type it – the one you chose before, or a new one – and tap _Finish_. After a sign-up you can tap
_Start over_ instead: the unfinished account is removed, and you can sign up again. After signing
in, you can tap _Sign out_ instead, and set a password with _I forgot my password_.

## No email?

Look in your spam folder, then ask for the code again: the app lets you a minute after the last
one. A code comes only where it can be used: none for a new password if the address has no
account, and none after a sign-up if you already have an account – sign in instead. If the app has
said that a try before may have confirmed your address, and no new code comes within a few
minutes, your address is confirmed: set a password with _I forgot my password_. If the account then
shows a username or name you did not choose, delete it under _Your profile_ → _Delete my account_,
and sign up again. If no code comes at all, write to {{CONTACT_EMAIL}} from that address, and I
will find out why.

## Your account has been suspended

If the app says that your account has been suspended, write to {{CONTACT_EMAIL}} from the address
of your account to ask why. A suspended account cannot be deleted in the app either: if you want it
deleted, say so in your email. Signing in to a suspended account is answered as if the password
were wrong. So if the app will not take a password you are sure of, tap _I forgot my password_:
once you have typed the code from the email, the app says so if the account has been suspended.

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
  made. If I passed a report to the police, they keep their copy under their own rules.
- **The sign-in log** at Supabase, the app's hosting provider (sign-up and sign-in events, with
  your email address). A daily job deletes every entry once it is 30 days old; when you delete your
  account in the app, or I delete it at your request, yours go at once.
- **Server logs and any backups** at Supabase, until Supabase deletes or overwrites them
  automatically. I cannot name the periods yet: they depend on Supabase's plan, and the privacy
  policy will state them once they are known.
- **Emails** between you and me, as long as I need them for what you asked.
- If I removed an account for breaking the house rules, its sign-in, email address included, stays
  banned for two years from the removal so that it cannot simply sign up again, and is then deleted
  automatically.
- If you test the Android version: your Google account's email address on my tester list in
  Google Play Console, until you tell me you have stopped testing. Asking me to delete your account
  counts. What Google itself keeps follows Google's own terms.

**Deleting only some of your data:** write to {{CONTACT_EMAIL}} and say what you would like
deleted. I will tell you what I can delete while your account stays, and why, if something cannot
go. Single letters cannot be deleted on their own: a letter goes only when your account or the
other person's is deleted.

## Who can use Night Courier

You must be at least 13. If you are under 16, you need the permission of a parent or guardian. If
I learn that an account belongs to someone under 13, I delete it; the email address is not banned.
Parents: if your child is under 16 and uses Night Courier without your permission, write to me.
Once I am sure the request comes from you, I delete the account.

## Privacy

The privacy policy says what Night Courier stores, why, and – as far as it is known today – for
how long: {{PRIVACY_POLICY_URL}}. There are no ads, no tracking and nothing to buy. This page is
published with GitHub Pages: GitHub, Inc. (USA) receives your IP address when you open it and logs
it for security and operation. The page itself sets no cookies and loads nothing from other sites.

---

# Night Courier – Hilfe und Kontakt

Night Courier ist eine private App für Briefe unter Freunden, die von Fledermäusen getragen werden.
Ich betreibe sie allein und nicht als Unternehmen: {{OPERATOR_NAME}}. Meine Postanschrift steht in
Abschnitt 1 der Datenschutzerklärung: {{PRIVACY_POLICY_URL}}.

## Kontakt

Schreib an {{CONTACT_EMAIL}}, und wenn es um dein Konto geht, von der E-Mail-Adresse deines Kontos.
Ich lese jede E-Mail und antworte, sobald ich kann.

## Etwas stimmt nicht

- **Ein Brief oder ein Kurier verstößt gegen die Hausregeln:** Öffne den Brief und tippe auf „Report
  this letter“, oder öffne die Seite des Kuriers über „Friends“ und tippe auf „Report“. Eine Meldung
  kommt direkt bei mir an; die gemeldete Person erfährt nicht, wer sie gemeldet hat, es sei denn,
  ein Gesetz verpflichtet mich dazu – ein Brief hat aber nur einen Empfänger, und wenn ich etwas
  unternehme, kann sich der Absender das denken. Beim Melden wird die Person auch blockiert, außer
  du schaltest das aus. Eine Blockierung blendet ihre Briefe für dich aus: Willst du sie wieder
  sehen, etwa um eine Kopie zu machen, hebst du die Blockierung unter „Your profile“ → „Blocked
  couriers“ auf. Danach kannst du die Person wieder blockieren.
- **Jemand bedroht dich oder andere**, oder du glaubst, dass es um eine Straftat geht: Melde es in
  der App und wende dich an die Polizei. Im Notfall: Polizei 117 in der Schweiz, 110 in
  Deutschland, oder 112 überall in Europa, auch in der Schweiz.
- **Die App funktioniert nicht richtig:** Schreib mir, was du gemacht hast und was passiert ist.

## Passwort vergessen

Tippe auf dem Anmeldebildschirm auf „I forgot my password“ und gib deine E-Mail-Adresse ein. Den
8-stelligen Code aus der E-Mail tippst du mit deinem neuen Passwort in die App. Der Code gilt einen
Tag, und nur der neueste zählt. Wird die App geschlossen, nachdem der Code angenommen wurde, aber
bevor dein neues Passwort gespeichert ist, fragt sie beim nächsten Öffnen noch einmal nach dem
Passwort. Keine E-Mail? Siehe unten.

Sagt die App stattdessen, dass es zu der Adresse ein Konto gab, das niemand bestätigt hatte, ist
dieses Konto entfernt, ohne Inhalt: Registriere dich mit der Adresse, dann gehört sie dir.

## Deine E-Mail-Adresse bestätigen

Fragt die App nach der Registrierung oder beim Anmelden nach einem Code, steht er in einer E-Mail an
deine Adresse: Tippe ihn ein. Er gilt einen Tag, und nur der neueste Code zählt. Beim Anmelden
speichert die App danach dein Passwort noch einmal, weil das Bestätigen der Adresse es wegnimmt.
Zeigt die App nach einer Registrierung „One more code“, hatte eine frühere Registrierung mit deiner
Adresse einen anderen Benutzernamen: Dieses Konto hat deinem Platz gemacht, und der neue Code
schließt deines ab.

Öffnet die App mit „Almost there“, ist deine Adresse bestätigt, aber dein Passwort noch nicht
gespeichert. Gib es ein – das, das du gewählt hattest, oder ein neues – und tippe auf „Finish“. Nach
einer Registrierung kannst du stattdessen auf „Start over“ tippen: Das unfertige Konto wird
entfernt, und du kannst dich neu registrieren. Nach dem Anmelden kannst du dich stattdessen mit
„Sign out“ abmelden und mit „I forgot my password“ ein Passwort festlegen.

## Keine E-Mail?

Schau im Spam-Ordner nach und fordere den Code noch einmal an; das geht eine Minute nach dem
letzten. Ein Code kommt nur, wo er etwas nützt: keiner für ein neues Passwort, wenn es zu der
Adresse kein Konto gibt, und keiner nach einer Registrierung, wenn du schon ein Konto hast – melde
dich dann an. Hat die App gesagt, dass ein Versuch davor deine Adresse vielleicht schon bestätigt
hat, und kommt binnen einiger Minuten kein neuer Code, ist deine Adresse bestätigt: Leg mit
„I forgot my password“ ein Passwort fest. Zeigt das Konto danach einen Benutzernamen oder Namen,
den du nicht gewählt hast, lösch es unter „Your profile“ → „Delete my account“ und registriere dich
neu. Kommt gar kein Code, schreib an {{CONTACT_EMAIL}}, von dieser Adresse; ich finde dann heraus,
woran es liegt.

## Dein Konto ist gesperrt

Sagt die App, dass dein Konto gesperrt ist, schreib an {{CONTACT_EMAIL}}, von der Adresse deines
Kontos, und frag, warum. Ein gesperrtes Konto lässt sich auch nicht in der App löschen: Willst du es
löschen lassen, schreib das dazu. Eine Anmeldung bei einem gesperrten Konto wird beantwortet, als
wäre das Passwort falsch. Nimmt die App ein Passwort nicht an, bei dem du dir sicher bist, tippe
also auf „I forgot my password“: Hast du den Code aus der E-Mail eingegeben, sagt die App es, wenn
das Konto gesperrt ist.

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
  wird 180 Tage, nachdem sie gemacht wurde, gelöscht. Habe ich eine Meldung an die Polizei gegeben,
  bewahrt die Polizei ihre Kopie nach ihren eigenen Regeln auf.
- **Das Anmeldeprotokoll** bei Supabase, dem Hosting-Anbieter der App (Registrierung und
  Anmeldungen, mit deiner E-Mail-Adresse). Ein täglicher Auftrag löscht jeden Eintrag, sobald er
  30 Tage alt ist; löschst du dein Konto in der App oder lösche ich es auf deine Bitte, sind deine
  sofort weg.
- **Server-Protokolle und etwaige Sicherungskopien** bei Supabase, bis Supabase sie automatisch
  löscht oder überschreibt. Die Fristen kann ich noch nicht nennen: Sie hängen von Supabases Tarif
  ab und stehen in der Datenschutzerklärung, sobald sie feststehen.
- **E-Mails** zwischen dir und mir, solange ich sie für dein Anliegen brauche.
- Habe ich ein Konto wegen Verstößen gegen die Hausregeln entfernt, bleibt seine Anmeldung samt
  E-Mail-Adresse zwei Jahre ab dem Entfernen gesperrt, damit es sich nicht einfach neu anmeldet, und
  wird dann automatisch gelöscht.
- Wenn du die Android-Version testest: die E-Mail-Adresse deines Google-Kontos auf meiner
  Testerliste in der Google Play Console, bis du mir schreibst, dass du nicht mehr testest. Die
  Bitte, dein Konto zu löschen, zählt dazu. Was Google selbst speichert, regeln Googles eigene
  Bestimmungen.

**Nur einen Teil deiner Daten löschen:** Schreib an {{CONTACT_EMAIL}}, was gelöscht werden soll.
Ich sage dir, was ich löschen kann, während dein Konto bleibt, und warum, wenn etwas nicht gehen
sollte. Einen einzelnen Brief kann ich nicht für sich löschen: Ein Brief verschwindet erst, wenn
dein Konto oder das der anderen Person gelöscht wird.

## Wer Night Courier nutzen kann

Du musst mindestens 13 Jahre alt sein. Wer unter 16 ist, braucht die Erlaubnis der Eltern oder
anderer Erziehungsberechtigter. Erfahre ich, dass ein Konto jemandem unter 13 gehört, lösche ich
es; die E-Mail-Adresse wird dabei nicht gesperrt. Eltern: Nutzt euer Kind unter 16 Night Courier
ohne eure Erlaubnis, schreibt mir. Sobald ich sicher bin, dass die Bitte von euch kommt, lösche ich
das Konto.

## Datenschutz

Was Night Courier speichert, wozu und – soweit es heute feststeht – wie lange, steht in der
Datenschutzerklärung: {{PRIVACY_POLICY_URL}}. Es gibt keine Werbung, kein Tracking und nichts zu
kaufen. Diese Seite liegt bei GitHub Pages: GitHub, Inc. (USA) erhält beim Aufruf deine IP-Adresse
und protokolliert sie für Sicherheit und Betrieb. Die Seite selbst setzt keine Cookies und lädt
nichts von anderen Websites.
