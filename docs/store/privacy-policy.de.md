<!--
Hinweise für den Betreiber - vor dem Veröffentlichen entfernen, wie alle Kommentare in dieser Datei.

1. Platzhalter ersetzen: {{OPERATOR_NAME}}, {{OPERATOR_ADDRESS}}, {{CONTACT_EMAIL}},
   {{EFFECTIVE_DATE}}, {{PRIVACY_POLICY_URL}}, {{SUPPORT_URL}}. Die ausgefüllte Fassung gehört
   NICHT in dieses öffentliche Repository, sondern nur in das Repository der Webseiten (Hinweis 8).
2. Jeder Kommentar "PRÜFEN" markiert eine Angabe, die vor dem Veröffentlichen gegen den gehosteten
   Supabase-Tarif, die gewählten Dienste oder eine Entscheidung des Betreibers geprüft werden muss.
3. Die englische Fassung (privacy-policy.en.md) bei jeder Änderung mitziehen.
4. Diese Fassung beschreibt den Code einschließlich der Migration
   supabase/migrations/20261104120000_privacy_housekeeping.sql: täglicher Aufräum-Auftrag
   "tidy-up", Sitzungen nach 90 Tagen ohne Benutzung, Anmeldeprotokoll 30 Tage und Löschen mit dem
   Konto, Namen von der Registrierung, alte Stadt, private.remove_account mit einer Sperre von zwei
   Jahren ab dem Entfernen. Ändert sich daran etwas, die Abschnitte 3.1, 3.2, 3.8, 3.9, 5, 6, 9 und
   11 und "Kurz gesagt" anpassen. Auf dem gehosteten Projekt muss "select private.tidy_up();" eine
   leere Liste ergeben (docs/GO-LIVE.md, "Setting up the hosted project", Schritt 4). Sonst nennt
   die Liste
   jeden Schritt, den der Auftrag mangels Recht überspringt, und was diese Erklärung dazu sagt,
   stimmt nicht.
5. Abschnitt 5 (iPhone) beschreibt den Schlüsselbund mit WHEN_UNLOCKED_THIS_DEVICE_ONLY
   (KEYCHAIN_OPTIONS in src/lib/secure-storage.ts, Commit 3a343b0). Wird das zurückgenommen, den
   alten Satz wieder einsetzen: "Einträge im Schlüsselbund können in verschlüsselten Backups
   enthalten sein und auf ein neues iPhone mitgenommen werden."
6. Der Betreiber lebt in der Schweiz und betreibt Night Courier als Privatperson (Entscheidung vom
   5. November 2026). Frühere Fassungen waren geschrieben, als lebte er in Deutschland. Für ihn gilt
   das revidierte DSG (in Kraft seit 1. September 2023); die DSGVO gilt zusätzlich für die Daten von
   Menschen in der EU und im EWR, weil die App ihnen angeboten wird (Art. 3 Abs. 2 lit. a DSGVO).
   Die Rechtsgrundlagen bleiben die der DSGVO (Art. 6); wo das DSG anders ist, sagen es die
   Abschnitte 1, 6, 8, 11 und 13 kurz. Aufsicht für den Betreiber: der EDÖB (Abschnitt 11).
   Hinweise auf das BDSG stehen nur noch als PRÜFEN-Kommentare: Ob das BDSG für einen
   Verantwortlichen in der Schweiz überhaupt gilt (§ 1 Abs. 4 BDSG), ist eine Frage für
   rechtlichen Rat. In der veröffentlichten Erklärung nur "in der Schweiz" schreiben, nie Ort,
   Postleitzahl oder Straße außerhalb von {{OPERATOR_ADDRESS}}.
7. Altersgrenze 13, unter 16 nur mit Erlaubnis der Eltern oder anderer Erziehungsberechtigter:
   MINIMUM_AGE = 13 und PARENTAL_PERMISSION_UNDER = 16 in src/constants/config.ts; der Schalter bei
   der Registrierung heißt "I am 13 or older", die Hausregeln (src/app/rules.tsx) lesen die
   Konstanten. Ändert sich eine der Zahlen, "Kurz gesagt" und die Abschnitte 3.13 und 10 anpassen.
8. Die Webseiten liegen bei GitHub Pages, als Nutzer-Site: ein öffentliches Repository
   vnznznznz.github.io, erreichbar unter https://vnznznznz.github.io/ und online seit dem
   10. November 2026. Night Courier liegt im Ordner night-courier/: index.html (aus
   support-page.md), privacy-policy.de.html (diese Fassung, verbindlich) und
   privacy-policy.en.html. Also
   {{SUPPORT_URL}} = https://vnznznznz.github.io/night-courier/ und {{PRIVACY_POLICY_URL}} =
   https://vnznznznz.github.io/night-courier/privacy-policy.de.html. In diesem Repository bleiben
   die Platzhalter stehen; ausgefüllt werden sie erst beim Bauen der Seiten. Die ausgefüllten
   Seiten mit Name und Anschrift gibt es nur im Repository der Webseiten. Auch das ist öffentlich,
   und git behält jede frühere Fassung: Eine einmal dort eingetragene Anschrift bleibt in der
   Geschichte lesbar. In der App bleiben EXPO_PUBLIC_PRIVACY_POLICY_URL und EXPO_PUBLIC_CONTACT_URL
   Einstellungen der Umgebung und werden nicht eingecheckt. Abschnitt 7 beschreibt GitHub als
   Anbieter der Webseiten.
9. "Kurz gesagt" und die Abschnitte 3.1 bis 3.3, 3.8 bis 3.10, 4, 5, 6, 7, 9 und 11 folgen außerdem
   dem Code vom 21. November 2026: Ein Umzug gilt bis zum ersten Brief eines Kuriers sofort
   (profiles.has_corresponded, Migration 20261121120003_moves_before_the_first_letter.sql);
   höchstens 20 neue Freundschaftsanfragen pro Stunde, gezählt in private.friend_request_counts
   (20261114120001_friend_requests.sql); ein vorläufig gesperrtes Konto ist sofort gestoppt und kann
   sich nicht selbst löschen (20261114120000_suspended_accounts.sql), und seine Anmeldung
   beantwortet die App wie ein falsches Passwort (signIn in src/features/auth/auth-context.tsx);
   jede E-Mail enthält einen Code und keinen Link (supabase/templates; otp_length und otp_expiry in
   supabase/config.toml); das Bestätigen einer Adresse löscht das Passwort, das das Konto hatte
   (20261121160000_confirmation_clears_password.sql); die Notiz, wofür ein Code ist, liegt neben der
   Sitzung (src/features/auth/unfinished.ts); das Abmelden wartet höchstens 5 Sekunden auf den
   Server (SERVER_SIGN_OUT_WAIT_MS in src/features/auth/auth-context.tsx); das Speichern einer Stadt
   schickt die Bedingung, unter der gespeichert wird, in der Adresse der Anfrage mit, die in die
   Server-Protokolle gelangt: die Stadt, von der die Fledermäuse losfliegen, oder dass noch kein
   Brief ging (updateCity in src/features/profile/use-profile.ts). Ändert sich daran etwas, diese
   Abschnitte anpassen.
-->

# Datenschutzerklärung für Night Courier

**Stand: {{EFFECTIVE_DATE}}**

Diese Datenschutzerklärung gibt es auch auf Englisch. Verbindlich ist diese deutsche Fassung.

## Kurz gesagt

- Night Courier ist eine private App für Briefe unter Freunden. Ich betreibe sie allein, als
  Privatperson in der Schweiz – ohne Firma und ohne damit Geld zu verdienen.
- Für mich gilt deshalb das Schweizer Datenschutzgesetz (DSG). Wenn du in der EU oder im EWR
  wohnst, gilt für deine Daten außerdem die DSGVO (Abschnitt 1).
- Es gibt keine Werbung, kein Tracking, keine Analyse-Tools, keine Push-Nachrichten und nichts zu
  kaufen. Ich verkaufe keine Daten.
- Ich speichere nur, was die App zum Funktionieren braucht: deine E-Mail-Adresse, dein Passwort (nur
  so, dass es niemand lesen kann), deinen Benutzernamen und Anzeigenamen, deine Stadt, deine
  Freundschaften, deine Briefe, wen du blockierst und was du meldest. Dazu kommen technische Daten
  wie deine IP-Adresse, die bei der Anmeldung und in Protokollen anfallen.
- Die Datenbank liegt bei Supabase, einem Dienst aus den USA, auf Servern in Zürich in der Schweiz
  (Abschnitte 7 und 8). Diese Erklärung und die Kontaktseite liegen bei GitHub, ebenfalls einem
  Dienst aus den USA.
- Briefe sind nicht Ende-zu-Ende-verschlüsselt. Technisch könnten ich und Supabase sie lesen. Ich
  lese Briefe nur, wenn sie mir gemeldet werden oder ich anders einen technischen Fehler nicht
  beheben kann.
- Du kannst dein Konto jederzeit in der App löschen, außer ich habe es vorläufig gesperrt
  (Abschnitt 3.8). Dann sind auch alle Briefe weg, die du geschickt oder bekommen hast, auch bei den
  Freunden, mit denen du geschrieben hast. Einiges bleibt danach noch eine Weile, vor allem
  Meldungen: bis zu 180 Tage (Abschnitt 11).
- Night Courier ist ab 13 Jahren. Wer unter 16 ist, braucht die Erlaubnis der Eltern oder anderer
  Erziehungsberechtigter.
- Du hast Rechte, zum Beispiel auf Auskunft und Löschung. Schreib mir einfach: {{CONTACT_EMAIL}}.

<!-- PRÜFEN (Entscheidung des Betreibers): Die Zusage "Ich lese Briefe nur, wenn sie mir gemeldet
werden" (hier und in Abschnitt 3.4) ist noch nicht ausdrücklich beschlossen. Bestätigen oder ändern. -->

## 1. Wer ist für deine Daten verantwortlich?

Verantwortlich im Sinne des Schweizer Bundesgesetzes über den Datenschutz (DSG) und der
Datenschutz-Grundverordnung der EU (DSGVO) ist:

- **Name:** {{OPERATOR_NAME}}
- **Anschrift:** {{OPERATOR_ADDRESS}}
- **E-Mail:** {{CONTACT_EMAIL}}
- **Kontakt und Hilfe:** {{SUPPORT_URL}}

Ich betreibe Night Courier als Privatperson, nicht als Unternehmen, und lebe in der Schweiz. Einen
Datenschutzbeauftragten habe ich nicht benannt – mit allen Fragen zum Datenschutz kannst du dich
direkt an mich wenden. Wenn hier „ich“ steht, bin ich gemeint; „du“ bist du, wenn du Night Courier
nutzt.

**Welches Recht gilt.** Weil ich in der Schweiz lebe, gilt für mich das DSG in der revidierten
Fassung, die seit dem 1. September 2023 in Kraft ist. Night Courier wird auch Menschen in der EU und
im EWR angeboten; für ihre Daten gilt deshalb zusätzlich die DSGVO (Art. 3 Abs. 2 lit. a DSGVO). Die
Rechtsgrundlagen, die ich in dieser Erklärung nenne, sind die der DSGVO. Das DSG verlangt nicht für
jede Bearbeitung eine solche Grundlage, sondern dass ich mich an seine Grundsätze halte (Art. 6 DSG)
– zum Beispiel Daten nur für die hier genannten Zwecke und nur so weit wie nötig zu verarbeiten.

<!-- PRÜFEN (rechtlich):
- Vertreter in der EU (Art. 27 DSGVO): Wer ohne Niederlassung in der EU Menschen in der EU etwas
  anbietet, muss grundsätzlich schriftlich einen Vertreter in der EU benennen. Die Ausnahme in Art.
  27 Abs. 2 lit. a DSGVO (nur gelegentliche Verarbeitung, ohne umfangreiche Verarbeitung besonderer
  Kategorien, voraussichtlich ohne Risiko) passt für einen laufenden Briefdienst vermutlich nicht.
  Rechtlichen Rat einholen. Ist ein Vertreter nötig, ihn hier mit Name und Anschrift nennen (eigener
  Platzhalter, nicht in diesem Repository ausfüllen); er ist dann auch Ansprechpartner für die
  Aufsichtsbehörden in der EU (Abschnitte 11 und 13). Bis dahin nennt diese Erklärung keinen.
- Ob der Satz zum DSG (keine Rechtsgrundlage für jede Bearbeitung, Grundsätze nach Art. 6 DSG; eine
  Rechtfertigung nach Art. 31 DSG erst bei einer Persönlichkeitsverletzung, Art. 30 DSG) so stehen
  bleiben kann. -->

<!-- PRÜFEN: Informationspflicht nach Art. 19 DSG - Identität und Kontaktdaten (hier), Zwecke
(Abschnitt 3), Empfänger oder Kategorien von Empfängern (Abschnitt 7) und bei einer Bekanntgabe ins
Ausland die Staaten und die Garantien (Abschnitt 8, Art. 16 und 17 DSG). Bei jeder Änderung prüfen,
dass alle vier noch genannt sind. -->

## 2. Worum es geht

Night Courier ist eine App für langsame Briefe. Jede Person hat drei Fledermäuse. Eine Fledermaus
trägt einen Brief und fliegt die echte Entfernung zwischen deiner Stadt und der Stadt deines
Freundes oder deiner Freundin: Je weiter, desto länger – in derselben Stadt mindestens 20 Minuten,
über einen Kontinent mehrere Tage.

Briefe gibt es nur zwischen Menschen, die sich gegenseitig als Freunde angenommen haben. Es gibt
keine Suche, keine öffentlichen Profile und keine Möglichkeit, Fremden zu schreiben.

Die Regeln für die Nutzung stehen in den Hausregeln in der App („Your profile“ → „House rules“). Die App
selbst ist auf Englisch; deshalb nenne ich Knöpfe hier mit ihrem englischen Namen.

## 3. Welche Daten ich verarbeite, und wozu

### 3.1 Dein Konto

Wenn du dich registrierst, gibst du deine E-Mail-Adresse, ein Passwort, einen Benutzernamen und
einen Anzeigenamen ein.

- **E-Mail-Adresse.** Damit meldest du dich an, und dorthin geht die E-Mail mit einem Code, wenn du
  dein Passwort vergessen hast (Abschnitt 3.10). Ich nutze sie auch, um dir zu schreiben, wenn es
  nötig ist – zum Beispiel eine Verwarnung nach einer Meldung, eine Nachricht, wenn du eine Drohung
  gemeldet hast (Abschnitt 3.7), oder einen Hinweis auf eine wichtige Änderung dieser Erklärung
  (Abschnitt 15). Andere Nutzer sehen deine E-Mail-Adresse nie.
- **Passwort.** Gespeichert wird nur ein sogenannter Hashwert (bcrypt). Daraus kann niemand dein
  Passwort zurückrechnen, auch ich nicht. Die App selbst speichert dein Passwort nicht.
- **Kontodaten.** Zu deinem Konto gehören eine zufällige Nutzer-ID und einige Zeitpunkte: wann das
  Konto angelegt wurde, wann du dich zuletzt angemeldet hast, wann deine E-Mail-Adresse als
  bestätigt gilt und wann zuletzt eine E-Mail mit einem Code an sie verschickt wurde – und
  gegebenenfalls eine Sperre (Abschnitt 3.8).
- **Eine Kopie deiner Namen von der Registrierung.** Den Benutzernamen und den Anzeigenamen, die du
  bei der Registrierung eingibst, legt Supabase zusätzlich in deinem Kontodatensatz ab. Daraus
  entsteht dein Profil; danach wird die Kopie nicht mehr gebraucht. Ein täglicher Auftrag löscht
  sie, spätestens einen Tag nach der Registrierung. Bis dahin steht sie auch in deinem
  Anmelde-Token auf deinem Gerät (Abschnitt 5).

**Wozu:** um dir ein Konto zu geben und die App bereitzustellen. **Rechtsgrundlage:** Art. 6 Abs. 1
lit. b DSGVO – die Daten sind nötig, um dir die App so bereitzustellen, wie es die Hausregeln
beschreiben.

### 3.2 Dein Profil und deine Stadt

- **Benutzername.** Damit finden dich Freunde: Wer dir eine Freundschaftsanfrage schicken will, muss
  deinen Benutzernamen genau kennen. Ändern lässt er sich nicht.
- **Anzeigename.** Der Name, den deine Freunde sehen und alle, denen du eine Anfrage schickst. Du
  kannst ihn jederzeit im Profil ändern.
- **Deine Stadt.** Du wählst sie aus einer Liste. Die App fragt nie nach deinem Standort und benutzt
  kein GPS. Aus der Entfernung zwischen zwei Städten berechnet der Server, wie lange eine Fledermaus
  fliegt.
- **Umzüge.** Solange noch kein Brief an dich oder von dir ging, gilt eine neue Stadt sofort, wie
  schon deine erste: Es gibt noch keinen Flug, den ein Umzug verkürzen könnte. Danach gilt eine neue
  Stadt erst nach 24 Stunden als die, von der deine Fledermäuse losfliegen – sonst könnte man sich
  für einen kurzen Flug die Stadt eines Freundes „leihen“. Dafür vermerke ich in deinem Profil, ob
  schon einmal ein Brief an dich oder von dir ging; der Vermerk bleibt so lange wie dein Konto, auch
  wenn die Briefe selbst nicht mehr da sind. Und wechselst du danach die Stadt, speichere ich deine
  vorherige Stadt und den Zeitpunkt des Wechsels. Sind die 24 Stunden vorbei, löscht ein täglicher
  Auftrag beides, spätestens zwei Tage nach dem Wechsel.
- **Zeitpunkte.** Außerdem speichere ich, wann dein Profil angelegt und wann es zuletzt geändert
  wurde. Als Änderung zählt auch, wenn der Vermerk über deinen ersten Brief gesetzt wird und wenn
  der tägliche Auftrag nach einem Umzug aufräumt.

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO.

### 3.3 Freundschaften und Anfragen

Gespeichert wird, wer wem eine Anfrage geschickt hat, ob sie angenommen wurde, wann sie gestellt und
wann sie angenommen wurde. Eine offene Anfrage bleibt bestehen, bis sie angenommen, abgelehnt oder
zurückgezogen wird; sie läuft nicht von selbst ab. Wird eine Anfrage abgelehnt oder zurückgezogen,
eine Freundschaft beendet oder durch eine Blockierung aufgelöst, lösche ich den Eintrag.

Du kannst höchstens 20 neue Freundschaftsanfragen pro Stunde stellen. Damit das eingehalten wird,
speichere ich zu deinem Konto, wann die Stunde deiner letzten Anfragen begann und wie viele neue
Anfragen du darin gestellt hast – nicht, wen du gefragt hast. Ein täglicher Auftrag löscht das,
sobald der Beginn dieser Stunde mehr als einen Tag zurückliegt, spätestens zwei Tage nach ihrem
Beginn; mit deinem Konto geht es ohnehin.

<!-- PRÜFEN (rechtlich): die Rechtsgrundlage für die stündliche Zahl der Freundschaftsanfragen -
Art. 6 Abs. 1 lit. f DSGVO, wie unten geschrieben (niemand soll andere mit Anfragen überhäufen),
oder Art. 6 Abs. 1 lit. b DSGVO, als Teil dessen, wie der Dienst funktioniert. Die Zahl ist
private.friend_request_counts; der tägliche Auftrag ist tidy_up. -->

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO; für die Zahl der neuen Anfragen Art. 6 Abs. 1
lit. f DSGVO – das berechtigte Interesse, dass niemand andere mit Freundschaftsanfragen überhäuft.

### 3.4 Briefe

Zu jedem Brief speichere ich:

- den Text (1 bis 2.000 Zeichen),
- wer ihn geschickt hat und an wen,
- welche Fledermaus ihn trägt,
- von welcher Stadt in welche Stadt er fliegt – so, wie die Städte beim Absenden waren – und die
  Entfernung,
- wann er abgeschickt wurde, wann er landen soll und wann er gelandet ist,
- wann der Empfänger ihn zum ersten Mal geöffnet hat. Das sieht nur der Empfänger selbst; es gibt
  keine Lesebestätigungen,
- eine technische Kennung, damit ein Brief nicht doppelt verschickt wird.

Briefe liegen als Text in der Datenbank. Auf dem Weg dorthin sind sie verschlüsselt (HTTPS), und
Supabase verschlüsselt die gespeicherten Daten. Eine Ende-zu-Ende-Verschlüsselung gibt es aber
nicht. Das heißt: Technisch können ich und Supabase jeden Brief lesen. Ich lese Briefe nur, wenn sie
mir gemeldet wurden (Abschnitt 3.7) oder wenn ich anders einen technischen Fehler nicht beheben
kann.

In einen Brief kannst du schreiben, was du möchtest – auch sehr Persönliches, etwa über deine
Gesundheit oder deinen Glauben. Ich werte Briefe nicht aus und nutze sie für nichts anderes, als sie
zuzustellen – es sei denn, ein Brief wird gemeldet (Abschnitt 3.7). Überleg trotzdem, was du
schreibst: Wer deinen Brief bekommt, kann ihn behalten, abschreiben oder fotografieren.

Einen einzelnen Brief kann niemand löschen, weder Absender noch Empfänger, und eine Frist, nach der
Briefe von selbst gelöscht werden, gibt es nicht. Ein Brief bleibt gespeichert, bis einer von euch
beiden sein Konto löscht oder ich eines der beiden Konten entferne – dann verschwindet er bei
beiden. Nur wenn ein Brief gemeldet wurde, behält die Meldung eine Kopie davon (Abschnitt 3.7).

<!-- PRÜFEN (rechtlich): Welche Rechtsgrundlage nach Art. 9 DSGVO trägt Briefe mit Gesundheits-,
Glaubens- oder anderen besonderen Daten, die Nutzer selbst hineinschreiben? Diese Erklärung zieht
bewusst keinen Schluss. Ebenso offen: ob Briefe ohne Frist und ohne Löschmöglichkeit für einzelne
Briefe mit der Speicherbegrenzung (Art. 5 Abs. 1 lit. e DSGVO) vereinbar sind, oder ob eine Frist
oder ein Löschknopf nötig ist. -->

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO.

### 3.5 Deine Fledermäuse

Für jede deiner drei Fledermäuse speichere ich, ob sie zu Hause oder unterwegs ist und wann sie
zuletzt losgeflogen oder heimgekehrt ist. So sorgt der Server dafür, dass jede Person genau drei
Fledermäuse hat. Fliegt eine gerade, siehst du in der App, zu wem und wann sie ankommt.

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO.

### 3.6 Blockieren

Wenn du jemanden blockierst, speichere ich, wer wen wann blockiert hat. Eure Freundschaft (oder eine
offene Anfrage) endet, die Person kann dir nicht mehr schreiben und dich nicht mehr anfragen, und
ihre Briefe sind für dich ausgeblendet, bis du die Blockierung aufhebst. Gelöscht werden die Briefe
dabei nicht.

Die blockierte Person bekommt keine Nachricht darüber. Sie merkt aber, dass ihr nicht mehr
befreundet seid, und die Briefe, die du ihr geschickt hast, bleiben bei ihr. Deine Liste blockierter
Personen („Blocked couriers“) siehst nur du.

Eine Blockierung bleibt, bis du sie aufhebst oder einer von euch sein Konto löscht. Nach dem
Aufheben seid ihr nicht automatisch wieder befreundet.

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO, weil Blockieren eine Funktion der App ist, und Art.
6 Abs. 1 lit. f DSGVO – das berechtigte Interesse, dich vor Nachrichten zu schützen, die du nicht
willst.

### 3.7 Melden

Du kannst einen Brief oder eine Person melden. Eine Meldung enthält:

- wer gemeldet hat und wer gemeldet wurde,
- den Grund (aus einer Liste) und, wenn du willst, eine Notiz von dir (höchstens 500 Zeichen),
- eine Kopie von Benutzername und Anzeigename der gemeldeten Person, so wie sie zu dem Zeitpunkt
  waren,
- bei einem gemeldeten Brief eine Kopie seines Textes und wann er abgeschickt wurde,
- wann gemeldet wurde, und später meine eigene Notiz dazu, was ich unternommen habe.

Eine Meldung über dich enthält also auch Angaben, die nicht von dir stammen, sondern von der Person,
die dich gemeldet hat: den Grund und ihre Notiz.

**Wer eine Meldung sieht:** nur ich; gespeichert ist sie bei Supabase (Abschnitt 7). Auch du kannst
deine Meldung danach nicht mehr ansehen. Die gemeldete Person erfährt nicht, wer sie gemeldet hat –
es sei denn, ein Gesetz verpflichtet mich dazu. Ein Brief hat aber nur einen Empfänger: Wenn ich
wegen eines gemeldeten Briefs etwas unternehme, kann sich der Absender denken, von wem die Meldung
kam.

Beim Melden ist „auch blockieren“ schon eingeschaltet. Du kannst es ausschalten, wenn du von der
Person weiter Briefe bekommen möchtest. Meldest du denselben Brief noch einmal, oder dieselbe Person
noch einmal ohne einen Brief, bevor du die App schließt oder dich abmeldest, steht es so, wie du es
beim letzten Mal gelassen hast.

**Was ich mit einer Meldung mache:** Ich lese jede Meldung. Je nachdem, was passiert ist, unternehme
ich nichts, schreibe der Person eine Verwarnung an die E-Mail-Adresse ihres Kontos oder entferne ihr
Konto (Abschnitt 3.8). Geht es um eine Drohung, sperre ich das gemeldete Konto sofort vorläufig,
entferne es aber erst eine Woche später. Vorher schreibe ich der Person, die gemeldet hat, an die
E-Mail-Adresse ihres Kontos: Mit dem anderen Konto verschwinden alle Briefe zwischen euch, und sie
soll vorher Kopien machen können. Hast du die Person beim Melden blockiert – das passiert, wenn du
es nicht ausschaltest –, sind ihre Briefe für dich ausgeblendet (Abschnitt 3.6). Um Kopien zu
machen, hebst du die Blockierung zuerst auf: „Your profile“ → „Blocked couriers“ → „Unblock“.
Danach kannst du die Person wieder blockieren, über einen ihrer Briefe. Bei Drohungen oder
möglichen Straftaten kann ich eine Meldung an die Polizei weitergeben, zusammen mit den
Anmeldedaten des gemeldeten Kontos, soweit sie dann noch gespeichert sind: seinen Sitzungen und
seinen Einträgen im Anmeldeprotokoll, jeweils mit IP-Adresse (Abschnitt 3.9).

**Wie lange:** Eine Meldung wird 180 Tage, nachdem sie gemacht wurde, automatisch gelöscht – egal,
ob sie erledigt ist oder nicht. Löscht eine der beiden Personen vorher ihr Konto, bleibt die Meldung
trotzdem bis dahin bestehen: ohne die Nutzer-ID der gelöschten Person, aber mit den kopierten Namen,
dem kopierten Brieftext und der Notiz. Sonst könnte jemand eine Drohung samt dem einzigen Beweis
zurücknehmen, indem er sein Konto löscht. Gebe ich eine Meldung an die Polizei weiter, bewahrt die
Polizei ihre Kopie nach ihren eigenen Regeln auf, auch über die 180 Tage hinaus; meine eigene
exportierte Kopie lösche ich nach der Übergabe.

<!-- PRÜFEN (rechtlich): was neben Art. 6 Abs. 1 lit. f DSGVO für die freiwillige Weitergabe an
die Polizei - der Meldung und der Anmeldedaten des gemeldeten Kontos - gilt. Nach dem DSG: ob sie
mit dem erkennbaren Zweck vereinbar ist (Art. 6 Abs. 3 DSG; die Weitergabe ist hier schon als Zweck
genannt) oder ein überwiegendes Interesse sie rechtfertigt (Art. 31 DSG). Hier stand früher § 24
BDSG (Zweckänderung), geschrieben für einen Betreiber in Deutschland; ob das BDSG für einen
Verantwortlichen in der Schweiz überhaupt gilt (§ 1 Abs. 4 BDSG), ist eine Frage für rechtlichen
Rat. Nichts davon ist zitiert. Ebenso: welche Polizei - die in der Schweiz oder die im Land der
bedrohten Person. Der E-Mail-Alarm
für neue Meldungen, den GO-LIVE vorschlägt, ist dort ausdrücklich inhaltsfrei; bleibt er das, gehört
er nicht hierher. -->

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO. Mein berechtigtes Interesse – und das aller, die
Night Courier nutzen – ist, Missbrauch zu verhindern und zu bearbeiten, Menschen und besonders
Kinder und Jugendliche zu schützen und Beweise aufzubewahren, die ein Opfer brauchen könnte. Muss
ich eine Meldung herausgeben, weil ein Gesetz mich dazu verpflichtet, ist die Rechtsgrundlage Art. 6
Abs. 1 lit. c DSGVO.

### 3.8 Entfernte und gesperrte Konten

Wenn jemand schwer oder wiederholt gegen die Hausregeln verstößt, entferne ich das Konto. Profil,
Fledermäuse, Freundschaften, Blockierungen und alle Briefe, die das Konto geschickt oder bekommen
hat, werden dann gelöscht – auf beiden Seiten. Geht es um eine Drohung, sperre ich das Konto sofort
vorläufig; gelöscht wird aber noch nichts. Entfernt wird es eine Woche später, damit die Person, die
die Drohung gemeldet hat, vorher Kopien machen kann (Abschnitt 3.7).

Ein vorläufig gesperrtes Konto funktioniert sofort nicht mehr: Es kann niemandem mehr schreiben,
seinen Namen und seine Stadt nicht mehr ändern, keine Briefe lesen und keine Freunde sehen, und es
lässt sich nicht in der App löschen. Die App sagt, dass das Konto gesperrt ist, und bietet an, sich
abzumelden oder mir zu schreiben; ist es dein Konto und willst du es löschen lassen, schreib mir.
Eine Anmeldung bei ihm wird beantwortet, als wäre das Passwort falsch: So verrät die App niemandem,
der nur die E-Mail-Adresse kennt, was aus dem Konto geworden ist. Dazu braucht es den Code aus
„I forgot my password“, den nur bekommt, wer das Postfach hat; dann sagt die App, dass das Konto
gesperrt ist. Briefe, die es geschickt hat und die noch unterwegs sind, landen wie sonst, und seine
Freunde können ihm weiter Briefe schicken: Würden ihre Briefe abgewiesen, erführen sie von der
Sperre.

Damit sich dieselbe Person nicht gleich mit derselben E-Mail-Adresse neu anmeldet, sperre ich beim
Entfernen die Anmeldung des Kontos; eine Anmeldung mit dieser Adresse wird dann beantwortet wie bei
einem vorläufig gesperrten Konto. Der Kontodatensatz bleibt bei Supabase stehen: die
E-Mail-Adresse, der Hashwert des Passworts und die Zeitpunkte aus Abschnitt 3.1. Er bleibt **zwei
Jahre ab dem Entfernen** gespeichert; danach löscht ein täglicher Auftrag ihn. Die Sitzungen des
Kontos enden früher: Ein täglicher Auftrag löscht jede, sobald sie 90 Tage nicht benutzt wurde, und
ein gesperrtes Konto kann sie nicht mehr benutzen. Seine Einträge im Anmeldeprotokoll werden
gelöscht, sobald sie 30 Tage alt sind (Abschnitt 3.9).

Diese Sperre gibt es nur für Konten, die wegen Regelverstößen entfernt werden. Ein Konto, das aus
einem anderen Grund gelöscht wird – von dir selbst, von mir auf deine Bitte oder von mir in den
Fällen aus den Abschnitten 3.10 und 10 –, hinterlässt keine Sperre: Seine E-Mail-Adresse ist sofort wieder frei.

<!-- PRÜFEN: Dieser Abschnitt folgt private.remove_account und dem Runbook (docs/GO-LIVE.md,
"Handling a report"): remove_account setzt die Sperre auf now() + private.ban_period(), zwei Jahre
ab dem Entfernen; danach löscht "tidy-up" die Anmeldung samt Identitäten. Bei einer Drohung sperrt
das Runbook zuerst vorläufig (dieselbe Anweisung, eine Woche früher) und entfernt eine Woche
später; mit dem Entfernen beginnen die zwei Jahre neu. "Zwei Jahre ab dem Entfernen" stimmt nur,
solange niemand von Hand länger sperrt. Dass der Kontodatensatz mit Passwort-Hash stehen bleibt,
ist gewollt: Ohne ihn ließe sich die Sperre umgehen. Die Sitzungen enden nach 90 Tagen ohne
Benutzung wie alle anderen (tidy_up); dass eine abgelehnte Erneuerung nicht als Benutzung zählt
(updated_at), ist noch zu prüfen (gdpr-records.md V7). Was die Polizei davon bekommen soll,
exportiert das Runbook in der Woche zwischen vorläufiger Sperre und Entfernen. Andere Löschungen
sperren nichts: die durch die Person selbst und die durch den Betreiber auf jemandes Bitte, also
"select private.delete_account('<id>');" (gdpr-records.md 5.4) und nie der Knopf Authentication →
Users → Delete user im Dashboard. Ein vorläufig gesperrtes Konto: Die Datenbank weist es sofort ab
(private.caller() und der Trigger auf profiles, Migration 20261114120000_suspended_accounts.sql),
außer beim Lesen der eigenen Profilzeile, der nackten Zeilen seiner Freundschaften und der
Städteliste, bis sein Zugangs-Token abläuft, also innerhalb einer Stunde; delete_own_account weist
es ab; send_message fragt nicht, ob der Empfänger gesperrt ist (Entscheidung des Betreibers: ein
Abweisen verriete es den Freunden). Die App zeigt REFUSALS.account_suspended (src/lib/rpc-error.ts)
mit Sign out und Contact (src/features/profile/account-closed.tsx) und beantwortet "user_banned"
bei der Anmeldung wie ein falsches Passwort (signIn in src/features/auth/auth-context.tsx); GoTrue
v2.197 schickt einem gesperrten Konto trotzdem einen Code zum Zurücksetzen, und dessen Prüfung
sagt, dass es gesperrt ist. -->

<!-- PRÜFEN (rechtlich): Bittet jemand mit einem vorläufig gesperrten Konto darum, es zu löschen -
ob das vor dem Entfernen eine Woche später geschehen muss, oder ob die Briefe und Anmeldedaten, die
für die meldende Person und die Polizei aufbewahrt werden, bis dahin bleiben dürfen (Art. 17 Abs. 3
lit. e DSGVO, Rechtsansprüche; ebenso nach dem DSG). -->

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO – das berechtigte Interesse, alle anderen vor
jemandem zu schützen, der wegen Regelverstößen entfernt wurde.

### 3.9 Anmeldung, Sitzungen und Protokolle

Damit du angemeldet bleibst und die App sicher läuft, entstehen bei Supabase technische Daten. Jede
Anfrage der App an den Server enthält deine IP-Adresse und eine technische Kennung deines Geräts
oder Betriebssystems (den sogenannten User-Agent).

- **Sitzungen.** Für jede Anmeldung entsteht eine Sitzung mit IP-Adresse, User-Agent und
  Zeitpunkten. Wenn du dich abmeldest („Sign out“), bittet die App den Server, deine Sitzungen zu
  löschen, und zwar für alle deine Geräte, und meldet dich auf diesem Gerät innerhalb weniger
  Sekunden ab, ob der Server bis dahin geantwortet hat oder nicht. Ein anderes Gerät, das noch
  angemeldet ist, funktioniert weiter, bis seine Anmeldung das nächste Mal erneuert werden müsste –
  höchstens eine Stunde –, und muss sich dann neu anmelden. Mit deinem Konto werden die Sitzungen
  ebenfalls gelöscht. Eine Sitzung, die **90 Tage** nicht benutzt wurde – auf einem Gerät, auf dem
  du die App so lange nicht geöffnet hast –, löscht ein täglicher Auftrag; dort meldest du dich dann
  neu an. Erfährt der Server nichts von deiner Abmeldung, etwa ohne Netz, bleiben deine Sitzungen
  dort, bis dieser Auftrag sie löscht; die dieses Geräts nur, bis du dich darauf wieder anmeldest,
  wenn du die App dazwischen nicht geschlossen hast, denn dann sagt die App es dem Server. Willst du
  sie alle früher beenden, melde dich einmal an und wieder ab. Wenn du ein Handy verlierst, melde
  dich auf einem anderen Gerät an und ab – die Anmeldung auf dem verlorenen Handy funktioniert dann
  spätestens nach einer Stunde nicht mehr – oder schreib mir.
- **Anmelde-Token.** Während die App geöffnet ist, wird deine Anmeldung etwa einmal pro Stunde
  erneuert. Dabei entsteht jedes Mal ein neues Token, und das alte wird ungültig. Gespeichert bleiben
  die Token höchstens so lange wie die Sitzung, zu der sie gehören.
- **Anmeldeprotokoll.** Supabase protokolliert Ereignisse wie Registrierung, Anmeldung, Abmeldung,
  jedes Erneuern der Anmeldung, Anforderung eines neuen Passworts und Passwortänderung, jeweils mit
  Nutzer-ID, E-Mail-Adresse, Zeitpunkt und gegebenenfalls IP-Adresse. Daraus lässt sich ablesen,
  wann du die App benutzt hast. Ein täglicher Auftrag löscht jeden Eintrag nach 30 Tagen. Wenn du
  dein Konto löschst oder ich es lösche – auf deine Bitte oder in den Fällen aus den Abschnitten
  3.10 und 10 –, werden deine Einträge sofort mitgelöscht. Nur ein Konto, das ich wegen
  Regelverstößen entferne, behält seine Einträge, bis sie 30 Tage alt sind (Abschnitt 3.8).
- **Server-Protokolle.** Supabase protokolliert Anfragen an den Server: IP-Adresse, Zeitpunkt, die
  aufgerufene Adresse (sie kann deine Nutzer-ID enthalten und, wenn du deine Stadt wechselst, die
  Nummer der Stadt, von der deine Fledermäuse gerade losfliegen, oder die Angabe, dass noch kein
  Brief an dich oder von dir ging), User-Agent und Ergebnis, bei Anmeldungen auch deine
  E-Mail-Adresse, außerdem Fehlermeldungen der Datenbank. Briefe, Notizen und Namen schickt die App
  im Inhalt einer Anfrage, nicht in der Adresse; in diese Protokolle gelangen sie deshalb
  normalerweise nicht. Eine Fehlermeldung der Datenbank kann aber einen einzelnen Wert enthalten,
  zum Beispiel einen schon vergebenen Benutzernamen bei der Registrierung. Diese Protokolle löscht
  Supabase nach kurzer Zeit automatisch.

<!-- PRÜFEN:
- Sitzungen: am 4. November 2026 auf dem lokalen Supabase-Stack geprüft. Jede Anmeldung legt eine
  Zeile in auth.sessions (mit IP-Adresse und User-Agent) und in auth.refresh_tokens an; das Abmelden
  der App (scope "global") löscht beide für alle Geräte. Das gehostete Projekt läuft mit demselben
  GoTrue; nichts mehr zu tun. Die App wartet höchstens 5 Sekunden auf diese Antwort
  (SERVER_SIGN_OUT_WAIT_MS in src/features/auth/auth-context.tsx) und meldet das Gerät dann
  trotzdem ab; eine schon gesendete Anfrage kann den Server noch erreichen, und bei einer Sitzung,
  deren Token abgelaufen war, sagt die App es dem Server noch einmal, wenn der Client fertig ist
  (tellServerAfterAll) - das erreicht ihn nur, wenn das Netz bis dahin zurück ist. Eine Sitzung,
  deren Ende der Server dann noch nicht gehört hat - dieser Versuch, oder bei frischem Token die
  Abmeldung des Clients selbst, blieb ohne Antwort -, sagt die App ihm für sich allein (scope
  "local") bei der nächsten Anmeldung auf dem Gerät, solange sie nicht geschlossen wurde
  (owedToServer): der Satz über die Sitzung dieses Geräts. Dafür hält die App die Sitzung im
  Arbeitsspeicher, längstens bis sie geschlossen wird, nie gespeichert (letGo und owedToServer in
  derselben Datei; Abschnitt 5). "Höchstens eine Stunde": Ein Zugangs-Token, den ein anderes Gerät
  schon hält, gilt an der Datenbank-API weiter, bis er abläuft (jwt_expiry = 3600 in
  supabase/config.toml), weil dort nichts nach der Sitzung sieht; am 17. November 2026 am lokalen
  Stack gezeigt, mit einem signierten Token ganz ohne Sitzung. Supabase Auth selbst lehnt einen
  solchen Token ab, und erneuern lässt er sich nicht.
- Anmelde-Token: GoTrues automatisches Aufräumen (ersetzte Token nach 24 Stunden) ist nur aktiv,
  wenn GOTRUE_DB_CLEANUP_ENABLED gesetzt ist; der Standard ist "false", lokal ist es aus. Ist es auf
  dem gehosteten Projekt an, kann der Satz lauten: "Ersetzte Token löscht Supabase nach 24 Stunden."
- Anmeldeprotokoll: Die 30 Tage und das Löschen mit dem Konto kommen aus der Migration
  20261104120000_privacy_housekeeping.sql (tidy_up, delete_own_account), am 4. November 2026 gegen
  das echte GoTrue des lokalen Stacks geprüft. Fehlt der Rolle postgres auf dem gehosteten Projekt
  das Recht, überspringen beide den Schritt ohne Fehler; tidy_up nennt ihn dann in seiner Rückgabe.
  Die Prüfung: "select private.tidy_up();" muss eine leere Liste ergeben (docs/GO-LIVE.md, "Setting
  up the hosted project", Schritt 4; lokal ist sie leer).
  delete_own_account erkennt die Einträge an payload->>'actor_id', und ebenso
  private.delete_account, das Löschen durch den Betreiber auf jemandes Bitte. Einträge, die eine
  Person ohne diese ID nennen, gab es am lokalen Stack nur dort, wo der Betreiber über das
  Dashboard oder die Admin-API etwas an dem Konto getan hatte (user_signedup, user_modified,
  user_deleted): Sie nennen die Person in payload->'traits' und gehen mit der Anweisung in
  gdpr-records.md 5.4, Schritt 3, sonst erst nach 30 Tagen. ip_address ist lokal leer, darum
  "gegebenenfalls IP-Adresse".
- Server-Protokolle: Aufbewahrungsdauer des gewählten Supabase-Tarifs nachsehen und eintragen
  (z. B. "nach einem Tag"); "nach kurzer Zeit" nur stehen lassen, wenn es wirklich wenige Tage sind.
  Ebenso, wo diese Protokolle gespeichert werden (Abschnitt 8). Solange hier und in Abschnitt 9
  keine Frist steht, sagen die Hilfeseite und der Löschtext in google-play.md, dass die Fristen
  noch nicht feststehen; sind sie eingetragen, können beide wieder hierher verweisen ("Wie lange,
  steht in der Datenschutzerklärung."; ihre Hinweise sagen, wo). -->

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO, soweit es um deine Anmeldung geht. Im Übrigen Art.
6 Abs. 1 lit. f DSGVO: Mein berechtigtes Interesse ist, die App sicher und stabil zu betreiben,
Angriffe und Missbrauch zu erkennen und Fehler zu finden.

### 3.10 E-Mails von Night Courier

Night Courier schickt dir automatisch nur E-Mails, die dein Konto betreffen: einen Code zum
Festlegen eines neuen Passworts, wenn du ihn anforderst, und – sobald das eingeschaltet ist – einen
Code zum Bestätigen deiner E-Mail-Adresse bei der Registrierung. Den Code tippst du in die App. Er
hat 8 Ziffern, gilt ein einziges Mal und einen Tag lang, und nur der neueste zählt. Einen Link
enthalten die E-Mails nicht. Keine Newsletter, keine Werbung. Schreibe ich dir selbst (Abschnitt
3.1), kommt die E-Mail aus meinem Postfach (Abschnitt 3.11).

Zurzeit wird eine E-Mail-Adresse bei der Registrierung noch nicht bestätigt. Wenn jemand deine
E-Mail-Adresse ohne dein Wissen für ein Konto benutzt hat, schreib mir; dann lösche ich dieses
Konto. Sobald die Bestätigung eingeschaltet ist, löscht ein täglicher Auftrag jede Registrierung,
deren E-Mail-Adresse nicht innerhalb von 7 Tagen bestätigt wurde, samt Profil. Registrierst du
dich vorher selbst mit deiner Adresse, macht der Code, der sie bestätigt, dieses Konto zu deinem:
Mit der Bestätigung wird das zuvor gesetzte Passwort gelöscht, und die App gibt dem Konto das
Passwort und den Anzeigenamen, die du gewählt hast – oder sie löscht es, wenn es einen anderen
Benutzernamen hat, und richtet an seiner Stelle deines ein, mit einem neuen Code. Benutzt du für ein
solches Konto stattdessen „I forgot my password“, löscht sein Code das Konto, und du kannst dich
danach registrieren. Geht die Antwort auf deinen Code unterwegs verloren – die Verbindung bricht
gerade dann ab –, kann deine Adresse bestätigt sein, ohne dass die App dem Konto dein Passwort und
deine Namen gegeben hat. Du legst dann mit „I forgot my password“ ein Passwort fest, und das Konto
behält den Benutzernamen und den Anzeigenamen, die es hatte: Sind es nicht die, die du gewählt
hast, lösch das Konto in deinem Profil und registriere dich neu, wie die App es dir sagt.

<!-- PRÜFEN: Die E-Mail-Bestätigung ist heute aus (supabase/config.toml, enable_confirmations =
false), weil Supabases eigener Mailversand bis zum eigenen SMTP nur den Betreiber erreicht
(docs/GO-LIVE.md, "Before a second person can sign up"). Sobald eigenes SMTP und die
E-Mail-Bestätigung an sind, "Zurzeit wird eine E-Mail-Adresse bei der Registrierung noch nicht
bestätigt." ersetzen durch "Bei der Registrierung schicke ich dir einen Code, mit dem du deine
E-Mail-Adresse bestätigst." und oben "– sobald das eingeschaltet ist –" streichen; in den
späteren Sätzen des Absatzes "Sobald die Bestätigung eingeschaltet ist, löscht" durch "Ein
täglicher Auftrag löscht" ersetzen. Bis dahin die jetzigen Sätze stehen lassen. Die 7 Tage sind
private.unconfirmed_sign_up_lifetime() (tidy_up). Die 8 Ziffern und der Tag des Codes sind
otp_length und otp_expiry = 86400 in supabase/config.toml, und die Vorlagen in supabase/templates
sagen dasselbe. Das gehostete Projekt verschickt sie erst, wenn config push sie dorthin gebracht
hat (docs/GO-LIVE.md, "Setting up the hosted project"); seine eigenen Vorlagen enthalten einen
Link. Nach diesem push prüfen, ob das gehostete Projekt den Tag übernommen hat, und wenn es weniger
erlaubt, es überall ändern, wo docs/GO-LIVE.md ("Setting up the hosted project", Schritt 2) es
aufzählt, auch hier in beiden Sprachen. Sobald die Bestätigung an ist, in Abschnitt 4 auch "Solange
E-Mail-Adressen bei der Registrierung noch nicht bestätigt werden (Abschnitt 3.10), sagt das ein
Registrierungsversuch mit ihr offen; danach" streichen und "können es die Antworten des
Anmeldeservers verraten" stehen lassen (docs/GO-LIVE.md, "Known gaps already logged"). Der
Auth-Server kann auch eigene Hinweise schicken, unter anderem über ein geändertes Passwort oder eine
geänderte Adresse ([auth.email.notification]); supabase/config.toml schaltet keinen davon ein. Ob
das gehostete Projekt welche schickt, ist zu prüfen (docs/GO-LIVE.md, "Setting up the hosted
project", Schritt 2). Ist einer an, ihn hier nennen und ihm, wie GO-LIVE sagt, eine Vorlage der App
ohne Link geben, oder ihn ausschalten. Was ein solches Konto zu deinem macht: finishSignUp und
verifyResetCode in src/features/auth/auth-context.tsx und die Migration
20261121160000_confirmation_clears_password.sql. Nach einer verlorenen Antwort bleibt das Konto,
wie die frühere Registrierung es angelegt hat (Entscheidung des Betreibers): CodeUnanswered und
NAMES_NOT_CHOSEN in auth-context.tsx, MAY_BE_CONFIRMED in src/features/auth/confirm-email.tsx und
confirmedJustBefore in src/features/auth/unfinished.ts. -->

<!-- PRÜFEN (rechtlich): Das Bestätigen einer Adresse übernimmt oder löscht ein Konto, das eine
frühere, unbestätigte Registrierung mit ihr angelegt hatte - vielleicht die einer anderen Person -,
samt Passwort und Namen. Ob das eine eigene Grundlage neben Art. 6 Abs. 1 lit. b DSGVO braucht oder
ob diese Person davon erfahren muss. -->

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO.

### 3.11 Wenn du mir schreibst

Wenn du mir schreibst – über „Contact“ in der App oder an {{CONTACT_EMAIL}}, mit einer Frage, einer
Ergänzung zu einer Meldung oder einer Anfrage zu deinen Daten –, verarbeite ich deine
E-Mail-Adresse, deinen Namen, falls er in der E-Mail steht, und was du schreibst. Mein Postfach
liegt bei Microsoft (Outlook.com). Ich bewahre deine Nachricht so lange auf, wie ich sie für dein
Anliegen brauche, und lösche sie danach.

<!-- PRÜFEN (Entscheidung des Betreibers): eine feste Frist nennen, z. B. "spätestens sechs Monate,
nachdem dein Anliegen erledigt ist"; dieselbe Frist in Abschnitt 9 eintragen. Hinweis: Ein privates
Outlook.com-Postfach läuft unter Microsofts Verbraucherbedingungen; Microsoft ist dort kein
Auftragsverarbeiter, und einen Vertrag nach Art. 28 DSGVO gibt es dafür nicht. Ob das für die
Bearbeitung von Meldungen und Datenschutzanfragen genügt: PRÜFEN; ebenso nach dem DSG
(Auftragsbearbeitung, Art. 9 DSG). -->

<!-- PRÜFEN (rechtlich): "gesetzlich verpflichtet zu antworten" stützt sich bei Menschen in der EU
auf die DSGVO selbst, sonst auf das DSG (Art. 25 DSG). Art. 6 Abs. 1 lit. c DSGVO verlangt eine
Pflicht nach EU-Recht oder dem Recht eines EU-Mitgliedstaats (Art. 6 Abs. 3 DSGVO); siehe den
Kommentar in Abschnitt 6. -->

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO, wenn es um dein Konto geht; Art. 6 Abs. 1 lit. c
DSGVO, wenn du deine Datenschutzrechte ausübst, weil ich dann gesetzlich verpflichtet bin zu
antworten; sonst Art. 6 Abs. 1 lit. f DSGVO – mein berechtigtes Interesse, Fragen zu beantworten und
Meldungen zu bearbeiten.

### 3.12 Testversionen über TestFlight und Google Play

Night Courier gibt es nur als Testversion: auf dem iPhone über Apples App TestFlight und auf Android
über den internen Test von Google Play. Apple und Google verarbeiten dabei Daten nach ihren eigenen
Datenschutzbestimmungen, zum Beispiel zu deinem Apple Account oder deinem Google-Konto.

- **TestFlight:** Apple zeigt mir Angaben dazu, wann die App installiert und geöffnet wurde,
  Absturzberichte mit Gerätemodell und iOS-Version und Feedback, das du über TestFlight schickst –
  Text und Screenshots. Achte bitte darauf, dass auf einem Screenshot kein Brief zu sehen ist, den
  du nicht zeigen möchtest. Welche Angaben zu dir als Tester ich darüber hinaus sehe, hängt davon
  ab, wie du eingeladen wurdest.
- **Google Play:** Für den internen Test trage ich die E-Mail-Adresse deines Google-Kontos in eine
  Testerliste in der Google Play Console ein. Google zeigt mir außerdem Berichte über Abstürze und
  hängende App-Fenster mit Gerätemodell und Android-Version.

Deine Adresse in der Testerliste lösche ich, sobald du mir schreibst, dass du nicht mehr testen
möchtest. Wie lange Apple und Google ihre Daten aufbewahren, regeln ihre eigenen Bestimmungen.

<!-- PRÜFEN: welche Felder App Store Connect bei Testern über einen öffentlichen Link zeigt; welche
Felder TestFlight-Feedback und -Absturzberichte genau enthalten; ob Googles Pre-Launch-Berichte im
internen Test laufen und Konten im gehosteten Projekt anlegen (falls ja: abschalten oder hier
erwähnen); die Aufbewahrungsdauern bei Apple und Google. -->

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO, um dir die App zur Verfügung zu stellen, und Art. 6
Abs. 1 lit. f DSGVO – mein berechtigtes Interesse, Abstürze zu finden und zu beheben.

### 3.13 Was ich nicht erhebe

- **Dein Alter.** Bei der Registrierung bestätigst du nur, dass du mindestens 13 bist und, falls du
  unter 16 bist, die Erlaubnis deiner Eltern oder anderer Erziehungsberechtigter hast. Gespeichert
  wird das nicht.
- **Den Standort deines Geräts, das Adressbuch deines Handys, Fotos, Kamera oder Mikrofon.** Auf
  nichts davon bittet die App um Zugriff. (Die Stadt, die du aus einer Liste wählst, steht in
  Abschnitt 3.2, deine Freunde, Anfragen und Blockierungen in der App in den Abschnitten 3.3 und
  3.6. In den Datenschutzangaben, die Apple und Google in ihren Stores zeigen, erscheinen sie unter
  „Standort“ und „Kontakte“.)
- **Geräte- oder Werbe-IDs, Push-Token, Cookies.** Gibt es in der App nicht.
- **Analyse, Werbung, Tracking, Absturzmeldungen aus der App.** Die App enthält keine solchen
  Programmteile. Sie verbindet sich nur mit dem Night-Courier-Server bei Supabase. Wenn du auf
  „Contact“ oder „Privacy policy“ tippst, öffnet sich deine E-Mail-App oder dein Browser.

<!-- PRÜFEN: die deutschen Namen der Kategorien in den Datenschutzangaben auf den Store-Seiten
nachsehen („Standort“, „Kontakte“). Die Angaben selbst: app-store.md (Location → Coarse Location,
Contacts) und google-play.md (Location → Approximate location, Contacts). -->

## 4. Was andere sehen können

- **Deine E-Mail-Adresse** sieht kein anderer Nutzer, nur du, ich als Betreiber und Supabase als
  mein Auftragsverarbeiter.
- **Wenn du jemandem eine Anfrage schickst**, sieht die Person deinen Benutzernamen und deinen
  Anzeigenamen. Du siehst von ihr nur den Benutzernamen, bis sie annimmt.
- **Deine Freunde** sehen deinen Benutzernamen, deinen Anzeigenamen, deine Stadt mit Land und wie
  lange eine Fledermaus zu dir fliegt.
- **Wer mit dir Briefe geschrieben hat**, sieht bei jedem Brief deinen Benutzernamen, deinen
  aktuellen Anzeigenamen und die Start- und Zielstadt – auch dann noch, wenn ihr nicht mehr
  befreundet seid, solange es den Brief gibt. Änderst du deinen Anzeigenamen, steht auch auf alten
  Briefen der neue.
- **Wer dir einen Brief schickt**, sieht, wann er gelandet ist, aber nie, ob und wann du ihn
  geöffnet hast.
- **Wer dich blockiert hat**, sieht dich nur noch mit deinem Benutzernamen, nicht mit deinem
  Anzeigenamen.
- **Wer deinen Benutzernamen ausprobiert**, kann herausfinden, dass es ihn gibt – indem er eine
  Freundschaftsanfrage an ihn schickt oder versucht, sich mit ihm zu registrieren. Benutzernamen
  lassen sich erraten: Eine Anfrage an einen Namen, den niemand hat, wird abgewiesen, aber nicht
  mitgezählt. Ein Konto kann höchstens 20 neue Anfragen pro Stunde stellen (Abschnitt 3.3), und jede
  Anfrage zeigt dir Benutzernamen und Anzeigenamen der Person, die sie schickt. Mehr erfährt er
  dadurch nicht, bis du annimmst.
- **Wer deine E-Mail-Adresse kennt**, kann herausfinden, ob es zu ihr ein Konto bei Night Courier
  gibt. Solange E-Mail-Adressen bei der Registrierung noch nicht bestätigt werden (Abschnitt 3.10),
  sagt das ein Registrierungsversuch mit ihr offen; danach können es noch die Antworten des
  Anmeldeservers verraten. Mehr über dein Konto erfährt man dadurch nicht.
- **Andere Nutzer** sehen nicht, wen du blockiert oder gemeldet hast (auch wenn die Person es sich
  denken kann, Abschnitte 3.6 und 3.7), ob du gerade online bist oder ob du gerade schreibst.

Deine zufällige Nutzer-ID bekommt außerdem die App aller, die mit dir befreundet sind, dir eine
Anfrage geschickt oder von dir eine bekommen haben, mit dir Briefe geschrieben oder dich blockiert
haben; in der App angezeigt wird sie nicht.

## 5. Was auf deinem Gerät gespeichert wird

- Die App speichert auf deinem Gerät deine Anmeldung (die „Sitzung“). Sie enthält ein
  Zugangs-Token mit deiner Nutzer-ID und deiner E-Mail-Adresse, ein Token zum Erneuern der Anmeldung
  und einige Angaben zu deinem Konto. Bis die Kopie deiner Namen von der Registrierung gelöscht ist
  (Abschnitt 3.1) und deine Anmeldung danach einmal erneuert wurde, stehen auch diese Namen darin.
- **Auf dem iPhone** liegt sie im Schlüsselbund (Keychain) von iOS, lesbar nur, solange das iPhone
  entsperrt ist, und nur auf diesem Gerät: Auf ein neues iPhone wird sie nicht mitgenommen, auch
  nicht mit einem Backup; dort meldest du dich neu an. Es kann sein, dass sie nach dem Löschen der
  App im Schlüsselbund bleibt – melde dich vorher ab, wenn du sichergehen willst.
- **Auf Android** liegt sie verschlüsselt mit dem Android-Keystore. Sie ist von Backups und von der
  Übertragung auf ein neues Gerät ausgenommen.
- Während du einen Code aus einer E-Mail benutzt (Abschnitt 3.10), hält die App neben der Sitzung
  in einer Notiz fest, wofür der Code ist: deine E-Mail-Adresse und, wenn du dich registrierst, den
  Benutzernamen und den Anzeigenamen, die du eingegeben hast – nie dein Passwort. Wird die App
  geschlossen, nachdem der Code dich angemeldet hat, aber bevor das erledigt ist, macht sie beim
  nächsten Öffnen dort weiter. Die Notiz liegt dort, wo auch die Sitzung liegt, und wird gelöscht,
  sobald dein Konto eingerichtet oder dein Passwort gespeichert ist, wenn du dich abmeldest oder mit
  deinem Passwort anmeldest und wenn die App ohne Anmeldung für diese Adresse geöffnet wird.
- Beim Abmelden löscht die App die Sitzung und diese Notiz von deinem Gerät, auch wenn der Server
  gerade nicht erreichbar ist. Nach dem Löschen deines Kontos tut sie das, sobald sie weiß, dass das
  Löschen geklappt hat. Bis du die App schließt, kann sie die Sitzung noch im Arbeitsspeicher
  behalten – gespeichert wird sie nicht –, damit die Abmeldung sicher gilt: War der Server nicht
  erreichbar, sagt sie es ihm bei deiner nächsten Anmeldung.
- Sonst speichert die App nichts auf deinem Gerät. Briefe, Entwürfe, Freundeslisten und Meldungen
  sind nur so lange auf dem Gerät, wie die App geöffnet ist. Ein angefangener Brief ist weg, wenn du
  die App schließt oder dich abmeldest.
- Was dein Gerät selbst tut, liegt außerhalb der App: Die App-Übersicht kann zum Beispiel ein Bild
  eines geöffneten Briefs zeigen, die Tastatur lernt Wörter, die du tippst, und ein Passwort-Manager
  kann anbieten, dein Passwort zu speichern.

<!-- PRÜFEN: ob Schlüsselbund-Einträge das Löschen der App überleben (iOS). Zum iPhone-Satz siehe
Hinweis 5 oben. Die Notiz, wofür ein Code ist, ist der Eintrag night-courier.unfinished
(src/features/auth/unfinished.ts), im selben Speicher wie die Sitzung (authStorage in
src/lib/session-store.ts); sie wird geschrieben, bevor der Code geprüft wird. Ungesendete Briefe
und die Wahl bei „auch blockieren“ liegen nur im Arbeitsspeicher (src/features/messages/drafts.ts,
src/features/safety/safety.ts) und werden bei jedem Abmelden vergessen. Die Sitzung im
Arbeitsspeicher nach dem Abmelden: letGo in src/features/auth/auth-context.tsx, gesetzt, wenn der
Server die Abmeldung nicht binnen fünf Sekunden bestätigte, und nach jeder Kontolöschung, damit
eine Erneuerung dieser Sitzung, die danach noch ankommt, beendet statt übernommen wird; und
owedToServer, eine Sitzung, deren Ende der Server nie gehört hat, ihm mit scope "local" bei der
nächsten Anmeldung gesagt (tellServerOwed). Keine von beiden wird irgendwo geschrieben. -->

## 6. Rechtsgrundlagen im Überblick

Das sind die Rechtsgrundlagen nach der DSGVO. Das DSG verlangt keine solche Grundlage für jede
Bearbeitung (Abschnitt 1).

- **Art. 6 Abs. 1 lit. b DSGVO (Vertrag):** alles, was nötig ist, um dir die App bereitzustellen –
  Konto, Profil, Stadt, Freundschaften, Briefe, Fledermäuse, Blockieren, Anmeldung und die E-Mails
  zu deinem Konto.
- **Art. 6 Abs. 1 lit. f DSGVO (berechtigte Interessen):** Sicherheit (Sitzungen und Protokolle),
  der Umgang mit Missbrauch (Meldungen, Verwarnungen, Entfernen von Konten, die stündliche Grenze
  für Freundschaftsanfragen), das Aufbewahren von Meldungen für 180 Tage, das Sperren entfernter
  Konten für zwei Jahre ab dem Entfernen, die freiwillige Weitergabe einer Meldung an die Polizei,
  Absturzberichte und der Aufruf der Webseiten bei GitHub Pages (Abschnitt 7). Die Interessen
  dahinter: eine sichere App, Schutz der Menschen, die sie nutzen – besonders der Kinder und
  Jugendlichen –, und Beweise für Opfer.
- **Art. 6 Abs. 1 lit. c DSGVO (rechtliche Pflicht):** wenn ein Gesetz mich verpflichtet, Daten
  herauszugeben, etwa an Polizei, Staatsanwaltschaft oder Gericht, und wenn ich deine Anfragen zu
  deinen Datenschutzrechten beantworte.

<!-- PRÜFEN (rechtlich): Art. 6 Abs. 1 lit. c DSGVO trägt nur Pflichten nach EU-Recht oder dem
Recht eines EU-Mitgliedstaats (Art. 6 Abs. 3 DSGVO). Eine Pflicht nach Schweizer Recht, etwa die
Anordnung einer Schweizer Behörde oder eines Schweizer Gerichts, ist das nicht; ob dafür dann Art. 6
Abs. 1 lit. f DSGVO gilt, rechtlich klären und den Punkt gegebenenfalls umformulieren. -->

## 7. Wer deine Daten bekommt

Ich verkaufe keine Daten und gebe sie nicht für Werbung weiter. Empfänger sind nur:

- **Supabase Inc. (USA).** Supabase betreibt für mich die Datenbank, die Anmeldung, den Server und
  die Protokolle, als Auftragsverarbeiter nach Art. 9 DSG und Art. 28 DSGVO auf Grundlage eines
  Vertrags zur Auftragsverarbeitung. Mein Projekt läuft in der Supabase-Region Zürich (Schweiz) auf
  Servern von Amazon Web Services. Supabase setzt weitere Unterauftragsverarbeiter ein und
  veröffentlicht eine Liste davon auf supabase.com. Datenschutzerklärung:
  https://supabase.com/privacy
- **E-Mail-Versand.** Die E-Mails zu deinem Konto (Abschnitt 3.10) verschickt Supabase oder ein
  E-Mail-Versanddienst, der als mein Auftragsverarbeiter handelt. Er erhält deine E-Mail-Adresse und
  den Code in der E-Mail und führt ein Versandprotokoll.
- **Microsoft.** Microsoft betreibt mein E-Mail-Postfach (Outlook.com) und erhält so, was du mir
  schreibst und was ich dir schreibe – nach seinen eigenen Datenschutzbestimmungen:
  https://privacy.microsoft.com/de-de/privacystatement
- **Apple und Google.** Sie verteilen die Testversionen (Abschnitt 3.12) nach ihren eigenen
  Datenschutzbestimmungen: https://www.apple.com/de/legal/privacy/ und
  https://policies.google.com/privacy
- **GitHub, Inc. (USA).** Die Webseiten {{PRIVACY_POLICY_URL}} und {{SUPPORT_URL}} liegen bei
  GitHub Pages. Wenn du sie aufrufst, erhält GitHub wie jeder Webserver deine IP-Adresse und deinen
  User-Agent und speichert deine IP-Adresse in Protokollen, für die Sicherheit und den Betrieb des
  Dienstes (Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO – ohne diese Daten lässt sich eine Webseite
  nicht ausliefern). Die Seiten selbst setzen keine Cookies und laden nichts von anderen Websites.
  Wie lange GitHub seine Protokolle aufbewahrt, regeln seine eigenen Datenschutzbestimmungen:
  https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement
- **Polizei und Behörden** – nur wenn ich eine Meldung mit den Anmeldedaten des gemeldeten Kontos
  weitergebe (Abschnitt 3.7) oder ein Gesetz mich zur Herausgabe verpflichtet.
- **Andere Nutzer** sehen, was in Abschnitt 4 steht.

Keine Daten von dir erhalten: Expo, ein Dienst, mit dem ich die App baue, und GeoNames, von dem die
Liste der Städte stammt – sie liegt in der Datenbank von Night Courier, und GeoNames wird nie
gefragt.

<!-- PRÜFEN:
- Supabase-DPA: erst mit LAUNCH_STATE=live bauen (docs/GO-LIVE.md, "Where the web pages live"),
  wenn der DPA von Supabase (mit den Standardvertragsklauseln) unterzeichnet ist, gdpr-records.md
  5.1; bis dahin stimmt "auf Grundlage eines Vertrags zur Auftragsverarbeitung" oben nicht, und die
  Seite trägt den Hinweis, dass Night Courier noch nicht gestartet ist.
- Supabase: Liste der Unterauftragsverarbeiter aufrufen (vermutlich https://supabase.com/legal/subprocessors)
  und hier verlinken; prüfen, ob dort ein Dienst vor der API (z. B. Cloudflare) oder ein
  Protokolldienst außerhalb der Schweiz steht.
- E-Mail-Versand: den gewählten Anbieter (Resend, Postmark oder Amazon SES) mit Sitz und Link nennen,
  sobald er eingerichtet ist, und seinen Auftragsverarbeitungsvertrag abschließen. Sitzt er in den
  USA oder verarbeitet er dort, ihn auch in Abschnitt 8 mit seiner Absicherung nennen, und die Dauer
  seines Versandprotokolls in Abschnitt 9 eintragen.
- Microsoft: ob für ein privates Outlook.com-Postfach Microsofts Verbraucher-Datenschutzerklärung
  die richtige ist.
- GitHub Pages: wie lange GitHub die IP-Adressen der Besucher aufbewahrt (wenn es eine feste Frist
  nennt, oben eintragen); ob GitHub dabei als eigener Verantwortlicher handelt oder als
  Auftragsverarbeiter (für ein privates Gratiskonto gibt es keinen Auftragsverarbeitungsvertrag);
  den Link auf GitHubs Datenschutzerklärung aufrufen und prüfen (am 5. November 2026 nicht
  erreichbar gewesen, aus der Erinnerung eingesetzt). Beim Bauen der Seiten prüfen, dass sie
  wirklich keine Cookies setzen und nichts von anderen Websites laden: keine Web-Schriften,
  Skripte, Bilder, Analyse oder Einbettungen von fremden Adressen, auch kein Jekyll-Theme, das so
  etwas nachlädt. Ob GitHub nach dem Data Privacy Framework zertifiziert ist: Abschnitt 8. -->

## 8. In welchen Ländern deine Daten verarbeitet werden

- **Schweiz.** Die Datenbank liegt in Zürich (Supabase-Region eu-central-2), also in dem Land, in
  dem ich lebe. Sie dort zu speichern, ist für mich keine Bekanntgabe ins Ausland. Für Menschen in
  der EU und im EWR: Die Schweiz gehört nicht zur EU, aber die EU-Kommission hat festgestellt, dass
  dort ein angemessenes Datenschutzniveau besteht: Entscheidung 2000/518/EG, die nach Art. 45 Abs. 9
  DSGVO weiter gilt. Bei ihrer Überprüfung im Januar 2024 hat die Kommission festgestellt, dass das
  Schutzniveau in der Schweiz weiterhin angemessen ist.
- **USA.** Supabase Inc. ist ein US-Unternehmen. Greifen Mitarbeiter oder Systeme von Supabase aus
  den USA auf Daten zu, zum Beispiel für Wartung oder Support, oder verarbeitet ein
  Unterauftragsverarbeiter von Supabase dort Daten, gehen Daten in die USA. Ebenso bei Microsoft
  (mein Postfach, Abschnitt 3.11) und GitHub (die Webseiten, Abschnitt 7), beides US-Unternehmen.
  Nach dem DSG ist das so abgesichert: Für Unternehmen, die nach dem Swiss-US Data Privacy Framework
  zertifiziert sind, hat der Bundesrat ein angemessenes Datenschutzniveau anerkannt; das gilt seit
  dem 15. September 2024 (Art. 16 Abs. 1 DSG). Bei Supabase gelten sonst die
  Standardvertragsklauseln im Vertrag zur Auftragsverarbeitung (Art. 16 Abs. 2 DSG). Für Menschen in
  der EU und im EWR sichern diese Standardvertragsklauseln der EU-Kommission den Zugriff von
  Supabase aus den USA ab (Art. 46 Abs. 2 lit. c DSGVO); für Microsoft und GitHub gilt, soweit sie
  nach dem EU-US Data Privacy Framework zertifiziert sind, der Angemessenheitsbeschluss der
  EU-Kommission vom 10. Juli 2023 (Durchführungsbeschluss (EU) 2023/1795, Art. 45 DSGVO). Eine Kopie
  der Standardvertragsklauseln kannst du bei mir anfordern.
- **Apple, Google, Microsoft und GitHub** können Daten auch in den USA und anderen Ländern
  verarbeiten. Wie sie das absichern, steht in ihren eigenen Datenschutzbestimmungen.

<!-- PRÜFEN:
- Erst mit LAUNCH_STATE=live bauen, wenn der DPA von Supabase (mit den Standardvertragsklauseln)
  unterzeichnet ist, gdpr-records.md 5.1; bis dahin stimmen der Satz zu den USA und das Angebot
  einer Kopie der Klauseln nicht, und die Seite trägt den Hinweis, dass Night Courier noch nicht
  gestartet ist. Ob der DPA die Anpassungen für die Schweiz enthält, mit denen der EDÖB die
  Standardvertragsklauseln der EU anerkannt hat (Art. 16 Abs. 2 lit. d DSG).
- Für Supabase Inc., Microsoft, GitHub, Inc., Apple und Google auf dataprivacyframework.gov
  nachsehen, ob sie für den Swiss-US Data Privacy Framework (und für die EU den EU-US Data Privacy
  Framework) zertifiziert sind, und das Ergebnis hier eintragen: zertifiziert, oder welche
  vertragliche Garantie stattdessen gilt. Für Microsoft (privates Outlook.com-Postfach) und GitHub
  (Gratiskonto) gibt es keinen Vertrag, den ich selbst abgeschlossen habe; sind sie nicht
  zertifiziert, rechtlich klären, ob eine Ausnahme nach Art. 17 DSG trägt oder ein anderer Dienst
  nötig ist.
- Verarbeitet ein Unterauftragsverarbeiter von Supabase (z. B. für Protokolle oder vor der API)
  Daten in einem anderen Land als der Schweiz und den USA, hier nennen, mit der Absicherung.
- Gebe ich eine Meldung an eine Polizei außerhalb der Schweiz (Abschnitt 3.7), ist das eine
  Bekanntgabe ins Ausland: das Land hier nennen, mit der Grundlage nach Art. 17 DSG (gdpr-records.md,
  Abschnitt 2 und 6.23). -->

## 9. Wie lange ich Daten speichere

| Was                                                     | Wie lange                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Konto, Profil, Stadt, Fledermäuse                       | bis du dein Konto löschst oder ich es entferne                                                                                                          |
| Kopie der Namen von der Registrierung                   | höchstens einen Tag (Abschnitt 3.1)                                                                                                                     |
| Vorherige Stadt und Zeitpunkt eines Umzugs              | höchstens zwei Tage nach dem Wechsel (Abschnitt 3.2)                                                                                                    |
| Ob schon einmal ein Brief an dich oder von dir ging     | so lange wie dein Konto (Abschnitt 3.2)                                                                                                                 |
| Briefe                                                  | bis du oder die andere Person das Konto löscht oder ich eines der beiden Konten entferne; eine Frist gibt es nicht                                      |
| Freundschaften und Anfragen                             | bis sie beendet, abgelehnt oder zurückgezogen werden, oder bis zur Kontolöschung                                                                        |
| Zahl deiner neuen Freundschaftsanfragen in einer Stunde | bis ein täglicher Auftrag sie löscht, spätestens zwei Tage nach Beginn dieser Stunde, oder mit deinem Konto (Abschnitt 3.3)                             |
| Blockierungen                                           | bis du sie aufhebst, oder bis zur Kontolöschung                                                                                                         |
| Meldungen                                               | 180 Tage ab der Meldung, auch wenn ein Konto vorher gelöscht wird                                                                                       |
| An die Polizei weitergegebene Meldungen                 | bei der Polizei nach deren Regeln; meine Exportkopie lösche ich nach der Übergabe                                                                       |
| Kontodatensatz eines gesperrten, entfernten Kontos      | zwei Jahre ab dem Entfernen, dann automatisch gelöscht (Abschnitt 3.8)                                                                                  |
| Sitzungen                                               | bis zum Abmelden, wenn der Server davon erfährt, oder zur Kontolöschung; sonst löscht sie ein täglicher Auftrag, sobald sie 90 Tage nicht benutzt wurde |
| Anmelde-Token                                           | höchstens so lange wie die Sitzung                                                                                                                      |
| Anmeldeprotokoll                                        | 30 Tage; deine Einträge gehen sofort, wenn du dein Konto löschst oder ich es auf deine Bitte lösche (Abschnitt 3.9)                                     |
| Registrierung, deren E-Mail-Adresse nie bestätigt wurde | 7 Tage, sobald die Bestätigung eingeschaltet ist (Abschnitt 3.10)                                                                                       |
| Server-Protokolle bei Supabase                          | kurz, dann automatisch gelöscht (Abschnitt 3.9)                                                                                                         |
| Sicherungskopien der Datenbank                          | gelöschte Daten können darin enthalten sein, bis die Sicherung automatisch überschrieben wird                                                           |
| E-Mails an mich                                         | solange ich sie für dein Anliegen brauche                                                                                                               |
| Testerliste bei Google Play                             | bis du mir schreibst, dass du nicht mehr testen möchtest                                                                                                |

<!-- PRÜFEN: Sicherungskopien - ob und wie lange der gewählte Supabase-Tarif Sicherungen aufbewahrt;
die Dauer in die Tabelle schreiben (oder die Zeile streichen, wenn es keine gibt). -->

## 10. Kinder und Jugendliche – und ihre Eltern

- Night Courier ist ab **13 Jahren**. Wer **unter 16** ist, braucht die Erlaubnis der Eltern oder
  anderer Erziehungsberechtigter. So steht es in den Hausregeln. Die 16 habe ich gewählt, weil das
  die höchste Altersgrenze ist, die ein EU-Land nach Art. 8 DSGVO dafür festlegt, dass man einem
  Online-Dienst selbst zustimmen kann. Das Schweizer Recht kennt keine feste Grenze; dort kommt es
  darauf an, ob jemand urteilsfähig ist.
- Ich prüfe und speichere das Alter nicht. Bei der Registrierung bestätigt man es nur.
- Die App ist so gebaut, dass Fremde niemandem schreiben können: Briefe gibt es nur zwischen
  Menschen, die sich gegenseitig als Freunde angenommen haben. Wer den genauen Benutzernamen kennt,
  kann eine Freundschaftsanfrage schicken; dabei sieht man nur dessen Benutzernamen und Anzeigenamen
  und kann die Person blockieren und melden. Es gibt keine öffentlichen Profile, keine Werbung und
  kein Tracking. Sexuelle Inhalte, an denen Minderjährige beteiligt sind oder die an Minderjährige
  geschickt werden, sind verboten. Wer dagegen verstößt, muss damit rechnen, dass ich sein Konto
  entferne.
- **Was Eltern tun können:** diese Erklärung und die Hausregeln mit ihrem Kind lesen; zusammen mit
  ihrem Kind das Konto löschen („Your profile“ → „Delete my account“); und mir schreiben, wenn sie
  Fragen haben, etwas melden möchten oder ihr Kind ohne ihre Erlaubnis ein Konto angelegt hat. Ist
  ein Kind unter 16 ohne Erlaubnis angemeldet, lösche ich das Konto auf Bitte der Eltern. Vorher
  frage ich gegebenenfalls nach, um sicherzugehen, dass die Bitte wirklich von den Eltern kommt.
  Erfahre ich, dass jemand jünger als 13 ist, lösche ich das Konto – ohne die E-Mail-Adresse zu
  sperren (Abschnitt 3.8 gilt nur für Konten, die wegen Regelverstößen entfernt werden).
- Gut zu wissen: Wird ein Konto gelöscht, sind alle Briefe weg. Wer einen Brief aufbewahren möchte,
  zum Beispiel als Beweis, macht vorher einen Screenshot.

<!-- PRÜFEN: ob die Erlaubnis der Eltern unter 16 rechtlich eine Einwilligung nach Art. 8 DSGVO sein
muss oder ob Art. 6 Abs. 1 lit. b DSGVO trägt (und was die Regeln über Verträge mit Minderjährigen
dazu sagen, in der Schweiz Art. 19 ZGB zu urteilsfähigen Minderjährigen). Diese Erklärung zieht
daraus bewusst keinen Schluss. Die 16 ist kein Alter, das ein bestimmtes Land für diesen Betreiber
festlegt, sondern die höchste Grenze nach Art. 8 DSGVO (unter anderem in Deutschland); das DSG nennt
kein Alter, es kommt auf die Urteilsfähigkeit an (Art. 16 ZGB). Die Zusage, ein Konto auf Bitte der
Eltern zu löschen, ist eine Entscheidung des Betreibers: bestätigen. Niemand unter 13 wird
zugelassen, in den USA wie anderswo (COPPA betrifft Kinder unter 13; ob die Regel samt Löschen
genügt, rechtlich prüfen). Das Konto von jemandem unter 13 wird ohne Sperre gelöscht ("select
private.delete_account('<id>');" oder das Löschen durch die Person selbst), nicht mit
private.remove_account und nicht mit dem Knopf Delete user im Dashboard; die Schritte stehen in
gdpr-records.md 5.4. -->

## 11. Deine Rechte

Du hast nach der DSGVO diese Rechte:

- **Auskunft (Art. 15):** Du kannst erfahren, welche Daten ich über dich habe, und eine Kopie
  bekommen.
- **Berichtigung (Art. 16):** Anzeigenamen und Stadt kannst du selbst im Profil ändern. Der
  Benutzername lässt sich nicht ändern. Für die E-Mail-Adresse schreib mir.
- **Löschung (Art. 17):** Dein Konto löschst du selbst in der App: „Your profile“ → „Delete my
  account“. Das geht sofort und endgültig. Gelöscht werden dein Konto, dein Profil, deine
  Fledermäuse, Freundschaften, Blockierungen und alle Briefe, die du geschickt oder bekommen hast –
  auch bei den anderen, und deine Einträge im Anmeldeprotokoll. Was danach noch bleibt: Meldungen
  (bis 180 Tage, Abschnitt 3.7), Server-Protokolle und Sicherungskopien, bis sie automatisch
  gelöscht werden, E-Mails zwischen dir und mir, und was Apple oder Google zu deiner Testversion
  gespeichert haben (Abschnitt 3.12). Ein vorläufig gesperrtes Konto lässt sich nicht in der App
  löschen; schreib mir dann (Abschnitt 3.8).
- **Einschränkung (Art. 18):** Du kannst verlangen, dass ich Daten vorerst nur noch speichere und
  sonst nicht nutze, zum Beispiel solange geklärt wird, ob sie richtig sind.
- **Datenübertragbarkeit (Art. 20):** Du kannst die Daten, die du mir gegeben hast, in einem
  gängigen, maschinenlesbaren Format bekommen. Eine Export-Funktion in der App gibt es nicht;
  schreib mir.

<!-- PRÜFEN (rechtlich): Benutzernamen lassen sich nicht ändern (Entscheidung des Betreibers vom
21. November 2026; die API-Rollen dürfen in profiles nur display_name und city_id ändern, und der
Betreiber ändert auch keinen). Hier stand früher "Für Benutzername oder E-Mail-Adresse schreib
mir." Ob das gegenüber einer Bitte um Berichtigung eines Benutzernamens hält (Art. 16 DSGVO, Art.
32 Abs. 1 DSG): Einer, den die Person selbst gewählt hat, ist als solcher nicht unrichtig. -->

**Nach dem Schweizer DSG** hast du ähnliche Rechte: Auskunft (Art. 25 DSG – kostenlos und in der
Regel innerhalb von 30 Tagen), Herausgabe oder Übertragung deiner Daten (Art. 28 DSG) und
Berichtigung (Art. 32 Abs. 1 DSG). Außerdem kannst du verlangen, notfalls vor Gericht, dass eine
bestimmte Bearbeitung unterbleibt, dass ich deine Daten nicht an Dritte weitergebe oder dass ich sie
lösche (Art. 32 Abs. 2 DSG).

**Beschwerde.** Für mich zuständig ist der Eidgenössische Datenschutz- und
Öffentlichkeitsbeauftragte (EDÖB), Feldeggweg 1, 3003 Bern, Schweiz, www.edoeb.admin.ch. An ihn
kannst du dich wenden, wenn du meinst, dass ich gegen das DSG verstoße. Wohnst du in der EU oder im
EWR, kannst du dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO),
besonders in dem Land, in dem du wohnst oder arbeitest oder in dem der Verstoß passiert ist. In
Deutschland ist das die Datenschutzbehörde deines Bundeslands. Am liebsten ist mir aber, du
schreibst mir zuerst.

> **Widerspruchsrecht (Art. 21):** Soweit ich Daten auf Grundlage berechtigter Interessen verarbeite
> (Art. 6 Abs. 1 lit. f DSGVO), kannst du dem jederzeit aus Gründen widersprechen, die sich aus
> deiner besonderen Situation ergeben. Dann verarbeite ich diese Daten nicht mehr – es sei denn, ich
> kann zwingende schutzwürdige Gründe nachweisen, die deine Interessen überwiegen, oder die
> Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen. Bei einer
> Meldung über eine Drohung kann das zum Beispiel so sein.

**So geht's:** Schreib an {{CONTACT_EMAIL}}, am besten von der E-Mail-Adresse, mit der du bei Night
Courier angemeldet bist – damit ich sicher bin, dass die Anfrage von dir kommt. Sonst frage ich
nach. Ich antworte innerhalb von 30 Tagen. Das kostet nichts.

## 12. Keine automatisierten Entscheidungen

Es gibt keine automatisierten Entscheidungen und kein Profiling im Sinne von Art. 22 DSGVO. Der
Server rechnet zwar automatisch aus, wie lange eine Fledermaus fliegt, aber das ist keine
Entscheidung über dich. Über Meldungen, Verwarnungen und das Entfernen von Konten entscheide ich
selbst, als Mensch.

## 13. Sicherheit

- Alle Verbindungen zwischen App und Server sind verschlüsselt (HTTPS); eine unverschlüsselte
  Verbindung zum Server baut die App gar nicht erst auf.
- Supabase verschlüsselt die gespeicherten Daten (AES-256).
- Passwörter sind nur als Hashwert gespeichert.
- Die Regeln, wer was sehen darf, setzt die Datenbank selbst durch, nicht nur die App. Jede Person
  kommt nur an ihre eigenen Daten und an das, was Abschnitt 4 beschreibt.
- Die App enthält nur einen öffentlichen Zugangsschlüssel, der ohne Anmeldung keine persönlichen
  Daten öffnet; den Verwaltungsschlüssel enthält sie nie.
- Deine Anmeldung liegt im Schlüsselbund bzw. Keystore deines Geräts (Abschnitt 5).
- Verwaltungszugang zur Datenbank habe nur ich (und Supabase als technischer Dienstleister).
- Eine Ende-zu-Ende-Verschlüsselung der Briefe gibt es nicht (Abschnitt 3.4).

Du kannst mithelfen: Nutze ein Passwort, das du nirgends sonst verwendest, und melde dich auf
Geräten ab, die auch andere benutzen. Sollte trotzdem einmal etwas schiefgehen und Daten in falsche
Hände geraten, melde ich das so rasch wie möglich dem EDÖB, wenn es voraussichtlich zu einem hohen
Risiko für die Betroffenen führt (Art. 24 DSG), und, soweit es um Menschen in der EU und im EWR
geht, der zuständigen Aufsichtsbehörde, so wie es Art. 33 DSGVO verlangt. Wenn nötig, informiere
ich auch dich (Art. 24 Abs. 4 DSG, Art. 34 DSGVO).

<!-- PRÜFEN (rechtlich): welche Aufsichtsbehörde in der EU für eine Meldung nach Art. 33 DSGVO
zuständig ist, wenn der Verantwortliche keine Niederlassung in der EU hat - hängt auch davon ab, ob
ein Vertreter nach Art. 27 DSGVO benannt wird (Kommentar in Abschnitt 1). Die Schwellen sind
verschieden: Art. 24 DSG verlangt die Meldung bei voraussichtlich hohem Risiko, Art. 33 DSGVO
schon, wenn ein Risiko nicht unwahrscheinlich ist. -->

## 14. Musst du Daten angeben?

Gesetzlich bist du nicht verpflichtet, mir Daten zu geben. Ohne E-Mail-Adresse, Passwort,
Benutzernamen und Anzeigenamen kannst du aber kein Konto anlegen, und ohne Stadt können deine
Fledermäuse nicht fliegen. Was du in Briefe schreibst, entscheidest du selbst.

## 15. Änderungen dieser Erklärung

Ich passe diese Erklärung an, wenn sich die App oder die Rechtslage ändert. Die aktuelle Fassung
steht immer unter {{PRIVACY_POLICY_URL}} und ist in der App über „Privacy policy“ erreichbar. Über
wichtige Änderungen sage ich vorher Bescheid, zum Beispiel per E-Mail.

**Stand: {{EFFECTIVE_DATE}}**
