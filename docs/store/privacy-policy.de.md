<!--
Hinweise für den Betreiber - vor dem Veröffentlichen entfernen, wie alle Kommentare in dieser Datei.

1. Platzhalter ersetzen: {{OPERATOR_NAME}}, {{OPERATOR_ADDRESS}}, {{CONTACT_EMAIL}},
   {{EFFECTIVE_DATE}}, {{PRIVACY_POLICY_URL}}, {{SUPPORT_URL}}. Die ausgefüllte Fassung gehört
   NICHT in dieses öffentliche Repository, sondern nur auf die gehostete Seite.
2. Jeder Kommentar "PRÜFEN" markiert eine Angabe, die vor dem Veröffentlichen gegen den gehosteten
   Supabase-Tarif, die gewählten Dienste oder eine Entscheidung des Betreibers geprüft werden muss.
3. Die englische Fassung (privacy-policy.en.md) bei jeder Änderung mitziehen.
4. Diese Fassung beschreibt den Code einschließlich der Migration
   supabase/migrations/20261104120000_privacy_housekeeping.sql (Commit 67562f9: täglicher
   Aufräum-Auftrag "tidy-up", Sitzungen nach 90 Tagen ohne Benutzung, Anmeldeprotokoll 30 Tage und
   Löschen mit dem Konto, Namen von der
   Registrierung, alte Stadt, private.remove_account mit zwei Jahren Sperre). Ändert sich daran
   etwas, die Abschnitte 3.1, 3.2, 3.8, 3.9, 5, 9 und 11 und "Kurz gesagt" anpassen. Auf dem
   gehosteten Projekt prüfen, dass "tidy-up" in cron.job steht und auth.audit_log_entries wirklich
   löschen darf: Fehlt das Recht, überspringt die Migration diesen Schritt ohne Fehler, und die
   Angaben zum Anmeldeprotokoll stimmen nicht.
5. Abschnitt 5 (iPhone) beschreibt den Schlüsselbund mit WHEN_UNLOCKED_THIS_DEVICE_ONLY
   (KEYCHAIN_OPTIONS in src/lib/secure-storage.ts, Commit 3a343b0). Wird das zurückgenommen, den
   alten Satz wieder einsetzen: "Einträge im Schlüsselbund können in verschlüsselten Backups
   enthalten sein und auf ein neues iPhone mitgenommen werden."
-->

# Datenschutzerklärung für Night Courier

**Stand: {{EFFECTIVE_DATE}}**

Diese Datenschutzerklärung gibt es auch auf Englisch. Verbindlich ist diese deutsche Fassung.

## Kurz gesagt

- Night Courier ist eine private App für Briefe unter Freunden. Ich betreibe sie allein, als
  Privatperson – ohne Firma und ohne damit Geld zu verdienen.
- Es gibt keine Werbung, kein Tracking, keine Analyse-Tools, keine Push-Nachrichten und nichts zu
  kaufen. Ich verkaufe keine Daten.
- Ich speichere nur, was die App zum Funktionieren braucht: deine E-Mail-Adresse, dein Passwort (nur
  so, dass es niemand lesen kann), deinen Benutzernamen und Anzeigenamen, deine Stadt, deine
  Freundschaften, deine Briefe, wen du blockierst und was du meldest. Dazu kommen technische Daten
  wie deine IP-Adresse, die bei der Anmeldung und in Protokollen anfallen.
- Die Datenbank liegt bei Supabase, einem Dienst aus den USA, auf Servern in Zürich in der Schweiz
  (Abschnitte 7 und 8).
- Briefe sind nicht Ende-zu-Ende-verschlüsselt. Technisch könnten ich und Supabase sie lesen. Ich
  lese Briefe nur, wenn sie mir gemeldet werden oder ich anders einen technischen Fehler nicht
  beheben kann.
- Du kannst dein Konto jederzeit in der App löschen. Dann sind auch alle Briefe weg, die du
  geschickt oder bekommen hast, auch bei den Freunden, mit denen du geschrieben hast. Einiges bleibt
  danach noch eine Weile, vor allem Meldungen: bis zu 180 Tage (Abschnitt 11).
- Night Courier ist ab 12 Jahren. Wer unter 16 ist, braucht die Erlaubnis der Eltern oder anderer
  Erziehungsberechtigter.
- Du hast Rechte, zum Beispiel auf Auskunft und Löschung. Schreib mir einfach: {{CONTACT_EMAIL}}.

<!-- PRÜFEN (Entscheidung des Betreibers): Die Zusage "Ich lese Briefe nur, wenn sie mir gemeldet
werden" (hier und in Abschnitt 3.4) ist noch nicht ausdrücklich beschlossen. Bestätigen oder ändern. -->

## 1. Wer ist für deine Daten verantwortlich?

Verantwortlich im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:

- **Name:** {{OPERATOR_NAME}}
- **Anschrift:** {{OPERATOR_ADDRESS}}
- **E-Mail:** {{CONTACT_EMAIL}}
- **Kontakt und Hilfe:** {{SUPPORT_URL}}

Ich betreibe Night Courier als Privatperson, nicht als Unternehmen. Einen Datenschutzbeauftragten
habe ich nicht benannt – mit allen Fragen zum Datenschutz kannst du dich direkt an mich wenden. Wenn
hier „ich“ steht, bin ich gemeint; „du“ bist du, wenn du Night Courier nutzt.

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

- **E-Mail-Adresse.** Damit meldest du dich an, und dorthin geht eine E-Mail, wenn du dein Passwort
  vergessen hast. Ich nutze sie auch, um dir zu schreiben, wenn es nötig ist – zum Beispiel eine
  Verwarnung nach einer Meldung, eine Nachricht, wenn du eine Drohung gemeldet hast (Abschnitt
  3.7), oder einen Hinweis auf eine wichtige Änderung dieser Erklärung (Abschnitt 15). Andere Nutzer
  sehen deine E-Mail-Adresse nie.
- **Passwort.** Gespeichert wird nur ein sogenannter Hashwert (bcrypt). Daraus kann niemand dein
  Passwort zurückrechnen, auch ich nicht. Die App selbst speichert dein Passwort nicht.
- **Kontodaten.** Zu deinem Konto gehören eine zufällige Nutzer-ID und einige Zeitpunkte: wann das
  Konto angelegt wurde, wann du dich zuletzt angemeldet hast, wann deine E-Mail-Adresse als
  bestätigt gilt und wann zuletzt eine E-Mail zum Zurücksetzen des Passworts verschickt wurde – und
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
  deinen Benutzernamen genau kennen. In der App lässt er sich nicht ändern.
- **Anzeigename.** Der Name, den deine Freunde sehen und alle, denen du eine Anfrage schickst. Du
  kannst ihn jederzeit im Profil ändern.
- **Deine Stadt.** Du wählst sie aus einer Liste. Die App fragt nie nach deinem Standort und benutzt
  kein GPS. Aus der Entfernung zwischen zwei Städten berechnet der Server, wie lange eine Fledermaus
  fliegt.
- **Umzüge.** Eine neue Stadt gilt erst nach 24 Stunden als die, von der deine Fledermäuse
  losfliegen – sonst könnte man sich für einen kurzen Flug die Stadt eines Freundes „leihen“. Dafür
  speichere ich bei einem Wechsel deine vorherige Stadt und den Zeitpunkt des Wechsels. Sind die 24
  Stunden vorbei, löscht ein täglicher Auftrag beides, spätestens zwei Tage nach dem Wechsel.

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO.

### 3.3 Freundschaften und Anfragen

Gespeichert wird, wer wem eine Anfrage geschickt hat, ob sie angenommen wurde, wann sie gestellt und
wann sie angenommen wurde. Eine offene Anfrage bleibt bestehen, bis sie angenommen, abgelehnt oder
zurückgezogen wird; sie läuft nicht von selbst ab. Wird eine Anfrage abgelehnt oder zurückgezogen,
eine Freundschaft beendet oder durch eine Blockierung aufgelöst, lösche ich den Eintrag.

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO.

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
Person weiter Briefe bekommen möchtest.

**Was ich mit einer Meldung mache:** Ich lese jede Meldung. Je nachdem, was passiert ist, unternehme
ich nichts, schreibe der Person eine Verwarnung an die E-Mail-Adresse ihres Kontos oder entferne ihr
Konto (Abschnitt 3.8). Geht es um eine Drohung, sperre ich das gemeldete Konto sofort, entferne es
aber erst eine Woche später. Vorher schreibe ich der Person, die gemeldet hat, an die E-Mail-Adresse
ihres Kontos: Mit dem anderen Konto verschwinden alle Briefe zwischen euch, und sie soll vorher
Kopien machen können. Bei Drohungen oder möglichen Straftaten kann ich eine Meldung an die Polizei
weitergeben, zusammen mit den Anmeldedaten des gemeldeten Kontos, soweit sie dann noch gespeichert
sind: seinen Sitzungen und seinen Einträgen im Anmeldeprotokoll, jeweils mit IP-Adresse (Abschnitt
3.9).

**Wie lange:** Eine Meldung wird 180 Tage, nachdem sie gemacht wurde, automatisch gelöscht – egal,
ob sie erledigt ist oder nicht. Löscht eine der beiden Personen vorher ihr Konto, bleibt die Meldung
trotzdem bis dahin bestehen: ohne die Nutzer-ID der gelöschten Person, aber mit den kopierten Namen,
dem kopierten Brieftext und der Notiz. Sonst könnte jemand eine Drohung samt dem einzigen Beweis
zurücknehmen, indem er sein Konto löscht. Gebe ich eine Meldung an die Polizei weiter, bewahrt die
Polizei ihre Kopie nach ihren eigenen Regeln auf, auch über die 180 Tage hinaus; meine eigene
exportierte Kopie lösche ich nach der Übergabe.

<!-- PRÜFEN (rechtlich): ob für die freiwillige Weitergabe an die Polizei - der Meldung und der
Anmeldedaten des gemeldeten Kontos - neben Art. 6 Abs. 1 lit. f DSGVO § 24 BDSG eine Rolle spielt
(Zweckänderung). Die Weitergabe ist hier schon als Zweck genannt. Nicht zitiert. Der E-Mail-Alarm
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
und entferne es eine Woche später, damit die Person, die sie gemeldet hat, vorher Kopien machen kann
(Abschnitt 3.7).

Damit sich dieselbe Person nicht gleich mit derselben E-Mail-Adresse neu anmeldet, sperre ich dabei
die Anmeldung des Kontos. Dann bleibt der Kontodatensatz bei Supabase stehen: die E-Mail-Adresse,
der Hashwert des Passworts und die Zeitpunkte aus Abschnitt 3.1, dazu die Sitzungen (Abschnitt
3.9). Das alles bleibt **zwei Jahre** gespeichert; danach löscht ein täglicher Auftrag es. Die
Einträge des Kontos im Anmeldeprotokoll werden nach 30 Tagen gelöscht (Abschnitt 3.9).

<!-- PRÜFEN: Dieser Abschnitt folgt private.remove_account und dem Runbook (docs/GO-LIVE.md,
"Handling a report"): Sperre für private.ban_period() = zwei Jahre, danach löscht "tidy-up" die
Anmeldung samt Identitäten; bei einer Drohung erst sperren, eine Woche später entfernen. "Zwei Jahre"
stimmt nur, solange niemand von Hand länger sperrt. Dass der Kontodatensatz mit Passwort-Hash und
Sitzungen stehen bleibt, ist gewollt: Ohne ihn ließe sich die Sperre umgehen, und die Sitzungen sind
bei einer Drohung, was die Polizei bekommen kann (Abschnitt 3.7). -->

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO – das berechtigte Interesse, alle anderen vor
jemandem zu schützen, der wegen Regelverstößen entfernt wurde.

### 3.9 Anmeldung, Sitzungen und Protokolle

Damit du angemeldet bleibst und die App sicher läuft, entstehen bei Supabase technische Daten. Jede
Anfrage der App an den Server enthält deine IP-Adresse und eine technische Kennung deines Geräts
oder Betriebssystems (den sogenannten User-Agent).

- **Sitzungen.** Für jede Anmeldung entsteht eine Sitzung mit IP-Adresse, User-Agent und
  Zeitpunkten. Wenn du dich abmeldest („Sign out“), werden deine Sitzungen gelöscht, und zwar auf
  allen deinen Geräten gleichzeitig. Mit deinem Konto werden sie ebenfalls gelöscht. Eine Sitzung,
  die **90 Tage** nicht benutzt wurde – auf einem Gerät, auf dem du die App so lange nicht geöffnet
  hast –, löscht ein täglicher Auftrag; dort meldest du dich dann neu an. Erreicht die Abmeldung den
  Server nicht, etwa ohne Netz, meldet die App dich auf deinem Gerät trotzdem ab, aber die Sitzungen
  beim Server bleiben bis dahin; melde dich dann einmal an und wieder ab. Wenn du ein Handy
  verlierst, melde dich auf einem anderen Gerät an und ab oder schreib mir.
- **Anmelde-Token.** Während die App geöffnet ist, wird deine Anmeldung etwa einmal pro Stunde
  erneuert. Dabei entsteht jedes Mal ein neues Token, und das alte wird ungültig. Gespeichert bleiben
  die Token höchstens so lange wie die Sitzung, zu der sie gehören.
- **Anmeldeprotokoll.** Supabase protokolliert Ereignisse wie Registrierung, Anmeldung, Abmeldung,
  jedes Erneuern der Anmeldung, Anforderung eines neuen Passworts und Passwortänderung, jeweils mit
  Nutzer-ID, E-Mail-Adresse, Zeitpunkt und gegebenenfalls IP-Adresse. Daraus lässt sich ablesen,
  wann du die App benutzt hast. Ein täglicher Auftrag löscht jeden Eintrag nach 30 Tagen. Wenn du
  dein Konto löschst, werden deine Einträge sofort mitgelöscht.
- **Server-Protokolle.** Supabase protokolliert Anfragen an den Server: IP-Adresse, Zeitpunkt, die
  aufgerufene Adresse (sie kann deine Nutzer-ID enthalten), User-Agent und Ergebnis, bei Anmeldungen
  auch deine E-Mail-Adresse, außerdem Fehlermeldungen der Datenbank. Briefe, Notizen und Namen
  schickt die App im Inhalt einer Anfrage, nicht in der Adresse; in diese Protokolle gelangen sie
  deshalb normalerweise nicht. Eine Fehlermeldung der Datenbank kann aber einen einzelnen Wert
  enthalten, zum Beispiel einen schon vergebenen Benutzernamen bei der Registrierung. Diese
  Protokolle löscht Supabase nach kurzer Zeit automatisch.

<!-- PRÜFEN:
- Sitzungen: am 4. November 2026 auf dem lokalen Supabase-Stack geprüft. Jede Anmeldung legt eine
  Zeile in auth.sessions (mit IP-Adresse und User-Agent) und in auth.refresh_tokens an; das Abmelden
  der App (scope "global") löscht beide für alle Geräte. Das gehostete Projekt läuft mit demselben
  GoTrue; nichts mehr zu tun.
- Anmelde-Token: GoTrues automatisches Aufräumen (ersetzte Token nach 24 Stunden) ist nur aktiv,
  wenn GOTRUE_DB_CLEANUP_ENABLED gesetzt ist; der Standard ist "false", lokal ist es aus. Ist es auf
  dem gehosteten Projekt an, kann der Satz lauten: "Ersetzte Token löscht Supabase nach 24 Stunden."
- Anmeldeprotokoll: Die 30 Tage und das Löschen mit dem Konto kommen aus der Migration
  20261104120000_privacy_housekeeping.sql (tidy_up, delete_own_account), am 4. November 2026 gegen
  das echte GoTrue des lokalen Stacks geprüft. Beide überspringen den Schritt ohne Fehler, wenn die
  Rolle postgres auf dem gehosteten Projekt kein DELETE-Recht auf auth.audit_log_entries hat: Die
  Prüfung dafür steht in docs/GO-LIVE.md, "Setting up the hosted project", Schritt 4 (lokal: vorhanden).
  delete_own_account erkennt die Einträge an payload->>'actor_id'; Einträge ohne actor_id, die
  trotzdem die E-Mail-Adresse enthalten, gehen erst nach 30 Tagen. ip_address ist lokal leer, darum
  "gegebenenfalls IP-Adresse".
- Server-Protokolle: Aufbewahrungsdauer des gewählten Supabase-Tarifs nachsehen und eintragen
  (z. B. "nach einem Tag"); "nach kurzer Zeit" nur stehen lassen, wenn es wirklich wenige Tage sind.
  Ebenso, wo diese Protokolle gespeichert werden (Abschnitt 8). -->

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO, soweit es um deine Anmeldung geht. Im Übrigen Art.
6 Abs. 1 lit. f DSGVO: Mein berechtigtes Interesse ist, die App sicher und stabil zu betreiben,
Angriffe und Missbrauch zu erkennen und Fehler zu finden.

### 3.10 E-Mails von Night Courier

Night Courier schickt dir automatisch nur E-Mails, die dein Konto betreffen: einen Link zum
Zurücksetzen deines Passworts, wenn du ihn anforderst, und – sobald das eingeschaltet ist – einen
Link zum Bestätigen deiner E-Mail-Adresse bei der Registrierung. Die E-Mail enthält einen einmaligen
Link, der über den Server von Supabase zurück in die App führt. Keine Newsletter, keine Werbung.
Schreibe ich dir selbst (Abschnitt 3.1), kommt die E-Mail aus meinem Postfach (Abschnitt 3.11).

Zurzeit wird eine E-Mail-Adresse bei der Registrierung noch nicht bestätigt. Wenn jemand deine
E-Mail-Adresse ohne dein Wissen für ein Konto benutzt hat, schreib mir; dann lösche ich dieses
Konto.

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
Bearbeitung von Meldungen und Datenschutzanfragen genügt: PRÜFEN. -->

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

- **Dein Alter.** Bei der Registrierung bestätigst du nur, dass du mindestens 12 bist und, falls du
  unter 16 bist, die Erlaubnis deiner Eltern oder anderer Erziehungsberechtigter hast. Gespeichert
  wird das nicht.
- **Deinen Standort, deine Kontakte, Fotos, Kamera oder Mikrofon.** Die App fragt nicht danach.
- **Geräte- oder Werbe-IDs, Push-Token, Cookies.** Gibt es in der App nicht.
- **Analyse, Werbung, Tracking, Absturzmeldungen aus der App.** Die App enthält keine solchen
  Programmteile. Sie verbindet sich nur mit dem Night-Courier-Server bei Supabase. Wenn du auf
  „Contact“ oder „Privacy policy“ tippst, öffnet sich deine E-Mail-App oder dein Browser.

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
- **Wer deinen Benutzernamen genau kennt**, kann herausfinden, dass es ihn gibt, indem er dir eine
  Anfrage schickt. Mehr erfährt er dadurch nicht, bis du annimmst.
- **Andere Nutzer** sehen nicht, wen du blockiert oder gemeldet hast (auch wenn die Person es sich
  denken kann, Abschnitte 3.6 und 3.7), ob du gerade online bist oder ob du gerade schreibst.

Deine zufällige Nutzer-ID bekommt außerdem die App aller, die mit dir befreundet sind, dir eine
Anfrage geschickt oder von dir eine bekommen haben, mit dir Briefe geschrieben oder dich blockiert
haben; in der App angezeigt wird sie nicht.

## 5. Was auf deinem Gerät gespeichert wird

- Die App speichert auf deinem Gerät nur deine Anmeldung (die „Sitzung“). Sie enthält ein
  Zugangs-Token mit deiner Nutzer-ID und deiner E-Mail-Adresse, ein Token zum Erneuern der Anmeldung
  und einige Angaben zu deinem Konto. Bis die Kopie deiner Namen von der Registrierung gelöscht ist
  (Abschnitt 3.1) und deine Anmeldung danach einmal erneuert wurde, stehen auch diese Namen darin.
- **Auf dem iPhone** liegt sie im Schlüsselbund (Keychain) von iOS, lesbar nur, solange das iPhone
  entsperrt ist, und nur auf diesem Gerät: Auf ein neues iPhone wird sie nicht mitgenommen, auch
  nicht mit einem Backup; dort meldest du dich neu an. Es kann sein, dass sie nach dem Löschen der
  App im Schlüsselbund bleibt – melde dich vorher ab, wenn du sichergehen willst.
- **Auf Android** liegt sie verschlüsselt mit dem Android-Keystore. Sie ist von Backups und von der
  Übertragung auf ein neues Gerät ausgenommen.
- Beim Abmelden und nach dem Löschen deines Kontos löscht die App die Sitzung von deinem Gerät, auch
  wenn der Server gerade nicht erreichbar ist.
- Sonst speichert die App nichts auf deinem Gerät. Briefe, Entwürfe, Freundeslisten und Meldungen
  sind nur so lange auf dem Gerät, wie die App geöffnet ist. Ein angefangener Brief ist weg, wenn du
  die App schließt.
- Was dein Gerät selbst tut, liegt außerhalb der App: Die App-Übersicht kann zum Beispiel ein Bild
  eines geöffneten Briefs zeigen, die Tastatur lernt Wörter, die du tippst, und ein Passwort-Manager
  kann anbieten, dein Passwort zu speichern.

<!-- PRÜFEN: ob Schlüsselbund-Einträge das Löschen der App überleben (iOS). Zum iPhone-Satz siehe
Hinweis 5 oben. -->

## 6. Rechtsgrundlagen im Überblick

- **Art. 6 Abs. 1 lit. b DSGVO (Vertrag):** alles, was nötig ist, um dir die App bereitzustellen –
  Konto, Profil, Stadt, Freundschaften, Briefe, Fledermäuse, Blockieren, Anmeldung und die E-Mails
  zu deinem Konto.
- **Art. 6 Abs. 1 lit. f DSGVO (berechtigte Interessen):** Sicherheit (Sitzungen und Protokolle),
  der Umgang mit Missbrauch (Meldungen, Verwarnungen, Entfernen von Konten), das Aufbewahren von
  Meldungen für 180 Tage, das Sperren entfernter Konten für zwei Jahre, die freiwillige
  Weitergabe einer Meldung an die Polizei, und Absturzberichte. Die Interessen dahinter: eine
  sichere App, Schutz der Menschen, die sie nutzen – besonders der Kinder und Jugendlichen –, und
  Beweise für Opfer.
- **Art. 6 Abs. 1 lit. c DSGVO (rechtliche Pflicht):** wenn ein Gesetz mich verpflichtet, Daten
  herauszugeben, etwa an Polizei, Staatsanwaltschaft oder Gericht, und wenn ich deine Anfragen zu
  deinen Datenschutzrechten beantworte.

## 7. Wer deine Daten bekommt

Ich verkaufe keine Daten und gebe sie nicht für Werbung weiter. Empfänger sind nur:

- **Supabase Inc. (USA).** Supabase betreibt für mich die Datenbank, die Anmeldung, den Server und
  die Protokolle, als Auftragsverarbeiter nach Art. 28 DSGVO auf Grundlage eines Vertrags zur
  Auftragsverarbeitung. Mein Projekt läuft in der Supabase-Region Zürich (Schweiz) auf Servern von
  Amazon Web Services. Supabase setzt weitere Unterauftragsverarbeiter ein und veröffentlicht eine
  Liste davon auf supabase.com. Datenschutzerklärung: https://supabase.com/privacy
- **E-Mail-Versand.** Die E-Mails zu deinem Konto (Abschnitt 3.10) verschickt Supabase oder ein
  E-Mail-Versanddienst, der als mein Auftragsverarbeiter handelt. Er erhält deine E-Mail-Adresse und
  den Link in der E-Mail und führt ein Versandprotokoll.
- **Microsoft.** Microsoft betreibt mein E-Mail-Postfach (Outlook.com) und erhält so, was du mir
  schreibst und was ich dir schreibe – nach seinen eigenen Datenschutzbestimmungen:
  https://privacy.microsoft.com/de-de/privacystatement
- **Apple und Google.** Sie verteilen die Testversionen (Abschnitt 3.12) nach ihren eigenen
  Datenschutzbestimmungen: https://www.apple.com/de/legal/privacy/ und
  https://policies.google.com/privacy
- **Der Anbieter der Webseiten** {{PRIVACY_POLICY_URL}} und {{SUPPORT_URL}}. Wenn du sie aufrufst,
  erhält er wie jeder Webserver deine IP-Adresse und deinen User-Agent (Rechtsgrundlage: Art. 6
  Abs. 1 lit. f DSGVO – ohne diese Daten lässt sich eine Webseite nicht ausliefern).
- **Polizei und Behörden** – nur wenn ich eine Meldung mit den Anmeldedaten des gemeldeten Kontos
  weitergebe (Abschnitt 3.7) oder ein Gesetz mich zur Herausgabe verpflichtet.
- **Andere Nutzer** sehen, was in Abschnitt 4 steht.

Keine Daten von dir erhalten: Expo, ein Dienst, mit dem ich die App baue, und GeoNames, von dem die
Liste der Städte stammt – sie ist fest in die App eingebaut.

<!-- PRÜFEN:
- Supabase: Liste der Unterauftragsverarbeiter aufrufen (vermutlich https://supabase.com/legal/subprocessors)
  und hier verlinken; prüfen, ob dort ein Dienst vor der API (z. B. Cloudflare) oder ein
  Protokolldienst außerhalb der Schweiz steht.
- E-Mail-Versand: den gewählten Anbieter (Resend, Postmark oder Amazon SES) mit Sitz und Link nennen,
  sobald er eingerichtet ist, und seinen Auftragsverarbeitungsvertrag abschließen. Sitzt er in den
  USA oder verarbeitet er dort, ihn auch in Abschnitt 8 mit seiner Absicherung nennen, und die Dauer
  seines Versandprotokolls in Abschnitt 9 eintragen.
- Microsoft: ob für ein privates Outlook.com-Postfach Microsofts Verbraucher-Datenschutzerklärung
  die richtige ist.
- Webseiten: den Anbieter der gehosteten Seite nennen und prüfen, was er protokolliert, wie lange,
  und ob er Cookies setzt. -->

## 8. Daten außerhalb der EU

- **Schweiz.** Die Datenbank liegt in Zürich. Die Schweiz gehört nicht zur EU, aber die
  EU-Kommission hat festgestellt, dass dort ein angemessenes Datenschutzniveau besteht: Entscheidung
  2000/518/EG, die nach Art. 45 Abs. 9 DSGVO weiter gilt. Bei ihrer Überprüfung im Januar 2024 hat
  die Kommission festgestellt, dass das Schutzniveau in der Schweiz weiterhin angemessen ist.
- **USA.** Supabase Inc. ist ein US-Unternehmen. Greifen Mitarbeiter oder Systeme von Supabase aus
  den USA auf Daten zu, zum Beispiel für Wartung oder Support, ist das durch die
  Standardvertragsklauseln der EU-Kommission im Vertrag zur Auftragsverarbeitung abgesichert (Art.
  46 Abs. 2 lit. c DSGVO). Eine Kopie der Standardvertragsklauseln kannst du bei mir anfordern.
- **Apple, Google und Microsoft** können Daten auch in den USA und anderen Ländern verarbeiten. Wie
  sie das absichern, steht in ihren eigenen Datenschutzbestimmungen.

<!-- PRÜFEN: Verarbeitet ein Unterauftragsverarbeiter von Supabase (z. B. für Protokolle oder vor der
API) Daten in einem anderen Drittland als den USA, hier nennen, mit der Absicherung. -->

## 9. Wie lange ich Daten speichere

| Was                                                | Wie lange                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Konto, Profil, Stadt, Fledermäuse                  | bis du dein Konto löschst oder ich es entferne                                                |
| Kopie der Namen von der Registrierung              | höchstens einen Tag (Abschnitt 3.1)                                                           |
| Vorherige Stadt und Zeitpunkt eines Umzugs         | höchstens zwei Tage nach dem Wechsel (Abschnitt 3.2)                                          |
| Briefe                                             | bis du oder die andere Person das Konto löscht; eine Frist gibt es nicht                      |
| Freundschaften und Anfragen                        | bis sie beendet, abgelehnt oder zurückgezogen werden, oder bis zur Kontolöschung              |
| Blockierungen                                      | bis du sie aufhebst, oder bis zur Kontolöschung                                               |
| Meldungen                                          | 180 Tage ab der Meldung, auch wenn ein Konto vorher gelöscht wird                             |
| An die Polizei weitergegebene Meldungen            | bei der Polizei nach deren Regeln; meine Exportkopie lösche ich nach der Übergabe             |
| Kontodatensatz eines gesperrten, entfernten Kontos | zwei Jahre, dann automatisch gelöscht (Abschnitt 3.8)                                         |
| Sitzungen                                          | bis zum Abmelden oder zur Kontolöschung, höchstens 90 Tage nach der letzten Benutzung         |
| Anmelde-Token                                      | höchstens so lange wie die Sitzung                                                            |
| Anmeldeprotokoll                                   | 30 Tage; deine Einträge werden mit deinem Konto gelöscht                                      |
| Server-Protokolle bei Supabase                     | kurz, dann automatisch gelöscht (Abschnitt 3.9)                                               |
| Sicherungskopien der Datenbank                     | gelöschte Daten können darin enthalten sein, bis die Sicherung automatisch überschrieben wird |
| E-Mails an mich                                    | solange ich sie für dein Anliegen brauche                                                     |
| Testerliste bei Google Play                        | bis du mir schreibst, dass du nicht mehr testen möchtest                                      |

<!-- PRÜFEN: Sicherungskopien - ob und wie lange der gewählte Supabase-Tarif Sicherungen aufbewahrt;
die Dauer in die Tabelle schreiben (oder die Zeile streichen, wenn es keine gibt). -->

## 10. Kinder und Jugendliche – und ihre Eltern

- Night Courier ist ab **12 Jahren**. Wer **unter 16** ist, braucht die Erlaubnis der Eltern oder
  anderer Erziehungsberechtigter. So steht es in den Hausregeln.
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
  Erfahre ich, dass jemand jünger als 12 ist, entferne ich das Konto.
- Gut zu wissen: Wird ein Konto gelöscht, sind alle Briefe weg. Wer einen Brief aufbewahren möchte,
  zum Beispiel als Beweis, macht vorher einen Screenshot.

<!-- PRÜFEN: ob die Erlaubnis der Eltern unter 16 rechtlich eine Einwilligung nach Art. 8 DSGVO sein
muss oder ob Art. 6 Abs. 1 lit. b DSGVO trägt (und was die Regeln über Verträge mit Minderjährigen
dazu sagen). Diese Erklärung zieht daraus bewusst keinen Schluss. Die Zusagen, ein Konto auf Bitte der
Eltern zu löschen und das Konto von jemandem unter 12 zu entfernen, sind Entscheidungen des
Betreibers: bestätigen. -->

## 11. Deine Rechte

Du hast nach der DSGVO diese Rechte:

- **Auskunft (Art. 15):** Du kannst erfahren, welche Daten ich über dich habe, und eine Kopie
  bekommen.
- **Berichtigung (Art. 16):** Anzeigenamen und Stadt kannst du selbst im Profil ändern. Für
  Benutzername oder E-Mail-Adresse schreib mir.
- **Löschung (Art. 17):** Dein Konto löschst du selbst in der App: „Your profile“ → „Delete my
  account“. Das geht sofort und endgültig. Gelöscht werden dein Konto, dein Profil, deine
  Fledermäuse, Freundschaften, Blockierungen und alle Briefe, die du geschickt oder bekommen hast –
  auch bei den anderen, und deine Einträge im Anmeldeprotokoll. Was danach noch bleibt: Meldungen
  (bis 180 Tage, Abschnitt 3.7), Server-Protokolle und Sicherungskopien, bis sie automatisch
  gelöscht werden, E-Mails zwischen dir und mir, und was Apple oder Google zu deiner Testversion
  gespeichert haben (Abschnitt 3.12).
- **Einschränkung (Art. 18):** Du kannst verlangen, dass ich Daten vorerst nur noch speichere und
  sonst nicht nutze, zum Beispiel solange geklärt wird, ob sie richtig sind.
- **Datenübertragbarkeit (Art. 20):** Du kannst die Daten, die du mir gegeben hast, in einem
  gängigen, maschinenlesbaren Format bekommen. Eine Export-Funktion in der App gibt es nicht;
  schreib mir.
- **Beschwerde (Art. 77):** Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren,
  besonders in dem EU-Land, in dem du wohnst oder arbeitest oder in dem der Verstoß passiert ist. In
  Deutschland ist das die Datenschutzbehörde deines Bundeslands. Für mich zuständig ist die
  Datenschutzbehörde des Bundeslands, in dem ich wohne (Anschrift in Abschnitt 1). Am liebsten ist
  mir aber, du schreibst mir zuerst.

> **Widerspruchsrecht (Art. 21):** Soweit ich Daten auf Grundlage berechtigter Interessen verarbeite
> (Art. 6 Abs. 1 lit. f DSGVO), kannst du dem jederzeit aus Gründen widersprechen, die sich aus
> deiner besonderen Situation ergeben. Dann verarbeite ich diese Daten nicht mehr – es sei denn, ich
> kann zwingende schutzwürdige Gründe nachweisen, die deine Interessen überwiegen, oder die
> Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen. Bei einer
> Meldung über eine Drohung kann das zum Beispiel so sein.

**So geht's:** Schreib an {{CONTACT_EMAIL}}, am besten von der E-Mail-Adresse, mit der du bei Night
Courier angemeldet bist – damit ich sicher bin, dass die Anfrage von dir kommt. Sonst frage ich
nach. Ich antworte innerhalb eines Monats. Das kostet nichts.

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
Hände geraten, informiere ich die Aufsichtsbehörde und, wenn nötig, dich, so wie es Art. 33 und 34
DSGVO verlangen.

## 14. Musst du Daten angeben?

Gesetzlich bist du nicht verpflichtet, mir Daten zu geben. Ohne E-Mail-Adresse, Passwort,
Benutzernamen und Anzeigenamen kannst du aber kein Konto anlegen, und ohne Stadt können deine
Fledermäuse nicht fliegen. Was du in Briefe schreibst, entscheidest du selbst.

## 15. Änderungen dieser Erklärung

Ich passe diese Erklärung an, wenn sich die App oder die Rechtslage ändert. Die aktuelle Fassung
steht immer unter {{PRIVACY_POLICY_URL}} und ist in der App über „Privacy policy“ erreichbar. Über
wichtige Änderungen sage ich vorher Bescheid, zum Beispiel per E-Mail.

**Stand: {{EFFECTIVE_DATE}}**
