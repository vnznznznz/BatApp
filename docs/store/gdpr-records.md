# Verzeichnis von Verarbeitungstätigkeiten – Night Courier

Das Verzeichnis nach Art. 30 Abs. 1 DSGVO, das der Betreiber als Verantwortlicher für sich selbst
führt. Dazu die technischen und organisatorischen Maßnahmen (TOM), die der Code tatsächlich umsetzt
(Art. 32), die bekannten Lücken, und eine Checkliste dessen, was der Betreiber selbst erledigen
muss.

**Stand:** 4. November 2026, erste Fassung. **Grundlage:** der Datenbestand, wie ihn der Code
ergibt – die Migrationen unter `supabase/migrations`, die App unter `src/`, `supabase/config.toml` –
geprüft am lokalen Stack (Postgres 17, GoTrue v2.197.0). Die Kontolöschung wurde dort in einer
Transaktion getestet, die anschließend zurückgerollt wurde. Eingeschlossen ist die Migration
`20261104120000_privacy_housekeeping.sql` (täglicher Auftrag `tidy-up`, der jeden Schritt an einer
Tabelle von Supabase für sich absichert und die übersprungenen zurückgibt; `private.remove_account`;
Ende unbenutzter Sitzungen nach 90 Tagen), die Schlüsselbund-Einstellung aus
`src/lib/secure-storage.ts`, die gesperrten Android-Berechtigungen in `app.json` und das Runbook in
`docs/GO-LIVE.md` (Commits 67562f9, 3a343b0, 611813b, 665924d, acd4efe und 191bc50).

**Persönliche Daten stehen nicht in dieser Datei.** Dieses Repository ist öffentlich. Wo das
Verzeichnis Angaben zum Betreiber braucht, steht ein Platzhalter: `{{OPERATOR_NAME}}`,
`{{OPERATOR_ADDRESS}}`, `{{CONTACT_EMAIL}}`, `{{EFFECTIVE_DATE}}`, `{{PRIVACY_POLICY_URL}}`,
`{{SUPPORT_URL}}`. Das ausgefüllte Exemplar gehört nicht hierher, sondern in die eigenen Unterlagen
des Betreibers. Art. 30 Abs. 3 DSGVO verlangt die Schriftform, wobei elektronisch genügt; nach Art.
30 Abs. 4 ist das Verzeichnis der Aufsichtsbehörde auf Anfrage vorzulegen.

**„zu prüfen“** markiert jede Angabe, die nicht sicher ist: weil sie vom gehosteten Supabase-Tarif,
von einem noch nicht gewählten Dienst oder von einer Entscheidung des Betreibers abhängt, oder weil
die Rechtslage hier nicht abschließend geklärt ist. Abschnitt 6 sammelt alle.

Zusammen ändern: dieses Verzeichnis, die Datenschutzerklärung (`privacy-policy.de.md`, verbindlich,
und `privacy-policy.en.md`) und die Store-Formulare (`app-store.md`, Abschnitt 3; `google-play.md`,
Abschnitt 6). Alle vier müssen dieselben Daten beschreiben.

### Muss es dieses Verzeichnis geben?

Art. 30 Abs. 5 DSGVO nimmt Unternehmen und Einrichtungen mit weniger als 250 Beschäftigten aus –
aber nicht, wenn die Verarbeitung ein Risiko für die Rechte und Freiheiten der Betroffenen birgt,
**nicht nur gelegentlich** erfolgt oder besondere Kategorien nach Art. 9 Abs. 1 bzw. Daten nach
Art. 10 einschließt. Night Courier verarbeitet laufend, also nicht nur gelegentlich; nach dem
Wortlaut greift die Ausnahme deshalb nicht. Ob eine Privatperson überhaupt „Einrichtung“ im Sinne
von Abs. 5 ist: zu prüfen. Unabhängig davon ist das Verzeichnis der einfachste Weg, die
Rechenschaftspflicht (Art. 5 Abs. 2) zu erfüllen, und die Grundlage für jede Auskunft und jede
Meldung einer Datenpanne.

---

## 1. Verantwortlicher (Art. 30 Abs. 1 lit. a)

| Angabe                              | Eintrag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Verantwortlicher                    | `{{OPERATOR_NAME}}`, Privatperson. Keine Firma, keine Einnahmen                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Anschrift                           | `{{OPERATOR_ADDRESS}}`. Öffentlich nur in der gehosteten Datenschutzerklärung, Abschnitt 1; die Kontaktseite nennt den Betreiber und verweist für die Anschrift dorthin                                                                                                                                                                                                                                                                                                                          |
| E-Mail                              | `{{CONTACT_EMAIL}}` (auch hinter „Contact“ in der App)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Kontaktseite                        | `{{SUPPORT_URL}}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Datenschutzerklärung                | `{{PRIVACY_POLICY_URL}}`, Stand `{{EFFECTIVE_DATE}}`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Gemeinsam Verantwortliche (Art. 26) | Keine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Vertreter in der Union (Art. 27)    | Entfällt: der Verantwortliche wohnt in Deutschland                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Datenschutzbeauftragter             | Keiner benannt. Nach Art. 37 Abs. 1 DSGVO nicht erforderlich (keine umfangreiche Verarbeitung als Kerntätigkeit), und § 38 Abs. 1 Satz 1 BDSG verlangt einen erst, wenn in der Regel mindestens 20 Personen ständig mit der automatisierten Verarbeitung beschäftigt sind. **Aber:** Nach § 38 Abs. 1 Satz 2 BDSG ist unabhängig davon einer zu benennen, wenn eine Verarbeitung einer Datenschutz-Folgenabschätzung nach Art. 35 unterliegt. Hängt also am Ergebnis von 5.2 (Folgenabschätzung) |
| Zuständige Aufsichtsbehörde         | Die Datenschutzaufsicht des Bundeslands, in dem der Betreiber wohnt. Name, Anschrift und den Meldeweg für Datenpannen (meist ein Online-Formular) im privaten Exemplar eintragen                                                                                                                                                                                                                                                                                                                 |

---

## 2. Empfänger und Drittländer im Überblick (Art. 30 Abs. 1 lit. d und e)

| Empfänger                                                             | Rolle                                                    | Was er bekommt                                                                                               | Wo                                                         | Grundlage für das Drittland                                                                                                                                                 | Stand                                            |
| --------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Supabase Inc. (USA)                                                   | Auftragsverarbeiter (Art. 28)                            | Alles in der Datenbank, Anmeldung (GoTrue), API-Gateway, Protokolle, Sicherungen, heute auch den Mailversand | Projekt in `eu-central-2` (Zürich) auf Amazon Web Services | Schweiz: Angemessenheitsbeschluss (Entscheidung 2000/518/EG, fortgeltend nach Art. 45 Abs. 9). Zugriff aus den USA: Standardvertragsklauseln im DPA (Art. 46 Abs. 2 lit. c) | DPA **noch nicht abgeschlossen** (Abschnitt 5.1) |
| Unterauftragsverarbeiter von Supabase                                 | Unterauftragsverarbeiter                                 | Je nach Dienst                                                                                               | Zu prüfen                                                  | Zu prüfen: ob vor der API ein Dienst wie Cloudflare liegt und wo die Protokolle gespeichert werden                                                                          | Liste auf supabase.com lesen (Abschnitt 5.1)     |
| E-Mail-Versanddienst (Resend, Postmark oder Amazon SES)               | Auftragsverarbeiter                                      | Empfängeradresse, Einmal-Link, Versandprotokoll                                                              | Zu prüfen                                                  | Zu prüfen                                                                                                                                                                   | **Noch nicht gewählt**                           |
| Microsoft (Outlook.com-Postfach `{{CONTACT_EMAIL}}`)                  | Zu prüfen: Verbraucherdienst, vermutlich kein AV-Vertrag | Was Nutzer, Eltern und andere dem Betreiber schreiben, und was er ihnen schreibt                             | Zu prüfen (auch USA)                                       | Zu prüfen (etwa das EU-US Data Privacy Framework, Durchführungsbeschluss (EU) 2023/1795, falls Microsoft dafür zertifiziert ist)                                            | In Gebrauch                                      |
| Apple (App Store Connect, TestFlight, Beta App Review)                | Zu prüfen: eigener Verantwortlicher                      | Apple-Konten der Tester, Installations-, Sitzungs- und Absturzdaten, Feedback, die Anmeldung des Demo-Kontos | Zu prüfen (auch USA)                                       | Nach Apples eigenen Bestimmungen                                                                                                                                            | Ab der ersten TestFlight-Version                 |
| Google (Play Console, interner Test)                                  | Zu prüfen: eigener Verantwortlicher                      | Testerliste mit E-Mail-Adressen der Google-Konten, Android-vitals                                            | Zu prüfen (auch USA)                                       | Nach Googles eigenen Bestimmungen                                                                                                                                           | Ab dem ersten internen Test                      |
| Anbieter der Webseiten `{{PRIVACY_POLICY_URL}}` und `{{SUPPORT_URL}}` | Zu prüfen: Auftragsverarbeiter                           | IP-Adresse und User-Agent der Besucher in seinen Protokollen                                                 | Zu prüfen                                                  | Zu prüfen                                                                                                                                                                   | **Noch nicht gewählt**                           |
| Polizei, Staatsanwaltschaft, Gerichte                                 | Empfänger im Einzelfall                                  | Eine exportierte Meldung; nach einer Drohung dazu Sitzungen und Anmeldeprotokoll des gemeldeten Kontos (V6)  | Deutschland                                                | –                                                                                                                                                                           | Nur bei Bedarf                                   |
| Andere Nutzer                                                         | Empfänger im Rahmen der App-Funktionen (Art. 4 Nr. 9)    | Was V2 bis V5 beschreiben: Namen, Stadt, Briefe                                                              | –                                                          | –                                                                                                                                                                           | –                                                |

Keine Nutzerdaten erhalten: **Expo** (EAS Build bekommt zur Build-Zeit nur den Quellcode und die
`EXPO_PUBLIC_*`-Werte; zur Laufzeit gibt es keinen Kontakt, kein expo-updates, kein Push; ob Expo
Go in der Entwicklung etwas erhält: zu prüfen), **GeoNames** (die Städteliste wurde einmal in eine
Migration übernommen und liegt in der Datenbank; zur Laufzeit wird GeoNames nie gefragt) und
**GitHub** (das öffentliche Repository und die CI enthalten nur erfundene Testdaten).

---

## 3. Die Verarbeitungstätigkeiten (Art. 30 Abs. 1 lit. b bis g)

Für alle Einträge gilt, sofern nicht anders angegeben:

- **Betroffene Nutzer** sind registrierte Personen ab 12 Jahren, darunter Minderjährige: nach den
  Hausregeln von 12 bis 15 mit der Erlaubnis der Eltern oder anderer Erziehungsberechtigter, ab 16
  ohne sie. Das Alter wird weder geprüft noch gespeichert; es können also auch Jüngere darunter
  sein, deren Konto der Betreiber löscht, ohne Sperre, sobald er davon erfährt
  (Datenschutzerklärung 10; 5.4).
- **Speicherort** ist das Supabase-Projekt in Zürich. **Drittland:** Schweiz (Angemessenheit) und
  möglicher Zugriff von Supabase aus den USA (Standardvertragsklauseln), wie in Abschnitt 2.
- **Rechtsgrundlagen** sind nicht Teil von Art. 30, stehen hier aber, damit Verzeichnis und
  Datenschutzerklärung (Abschnitt 6 dort) nicht auseinanderlaufen. Ob bei Nutzern unter 16 Art. 6
  Abs. 1 lit. b DSGVO trägt oder eine Einwilligung nach Art. 8 nötig ist, und was das Recht der
  Verträge mit Minderjährigen dazu sagt: zu prüfen. Weder dieses Verzeichnis noch die
  Datenschutzerklärung ziehen daraus einen Schluss.
- **TOM:** Abschnitt 4.

### V1 Nutzerkonto, Anmeldung und Sitzungen

- **Zweck:** ein Konto anlegen, anmelden, angemeldet bleiben, das Passwort zurücksetzen, das Konto
  löschen.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO. Dass die App die Sitzung auf dem Gerät speichert,
  ist für den gewünschten Dienst unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG; zu prüfen).
- **Betroffene:** Nutzer. Außerdem Personen, deren E-Mail-Adresse jemand anderes ohne ihr Wissen
  registriert hat: Die E-Mail-Bestätigung ist zurzeit aus (`supabase/config.toml`).
- **Daten:**
  - E-Mail-Adresse: `auth.users.email`; Kopien in `auth.identities.identity_data` und dessen
    berechneter Spalte `email`, in `auth.one_time_tokens.relates_to`, solange ein Zurücksetzen
    offen ist, und im `email`-Claim jedes Zugangs-Tokens.
  - Passwort nur als bcrypt-Hash (`auth.users.encrypted_password`). Das Passwort selbst gibt es nur
    im Formular und in der TLS-Anfrage an GoTrue.
  - Eine Kopie von Benutzername und Anzeigename bei der Registrierung
    (`auth.users.raw_user_meta_data`, eine weitere in `auth.identities.identity_data`). Aus ihr
    entsteht das Profil (`handle_new_user()`); danach entfernt der tägliche Auftrag
    `private.tidy_up()` beide Namen aus beiden Stellen, spätestens einen Tag nach der Registrierung.
    Bis dahin stehen sie auch im `user_metadata` der Zugangs-Tokens.
  - Kontodatensatz: Nutzer-ID (UUID), `created_at`, `updated_at`, `last_sign_in_at`,
    `email_confirmed_at` (bei abgeschalteter Bestätigung automatisch gesetzt), Token für
    Bestätigung, Zurücksetzen und E-Mail-Wechsel mit ihren `*_sent_at`, `banned_until`,
    `raw_app_meta_data` (Anbieter `email`).
  - Anmeldeidentität (`auth.identities`): `identity_data` mit `sub`, `email`, `email_verified`,
    Anbieter, Zeitpunkte.
  - Sitzungen (`auth.sessions`), eine je Anmeldung: IP-Adresse, User-Agent, `created_at`,
    `updated_at`, `refreshed_at`, `not_after`, `aal`.
  - Refresh-Token (`auth.refresh_tokens`): Bei jeder Erneuerung entsteht eine neue Zeile. Der
    Zugangs-Token gilt 3600 Sekunden, die Rotation ist an, und die App erneuert nur im Vordergrund –
    die Zeilen ergeben also ein Protokoll, wann die App benutzt wurde.
  - Zurücksetzen des Passworts: `recovery_token` und `recovery_sent_at`; `auth.one_time_tokens`
    (`token_hash`, `token_type`, `relates_to` = E-Mail-Adresse, `created_at`). `auth.flow_state`
    (PKCE) wird vermutlich nicht genutzt, weil die App den impliziten Ablauf von supabase-js
    verwendet.
  - Auf dem Gerät: die Sitzung (Zugangs-Token mit Nutzer-ID und E-Mail-Adresse, bis zur ersten
    Erneuerung nach dem Aufräumen auch die Namen von der Registrierung; Refresh-Token; Nutzerobjekt)
    im iOS-Schlüsselbund bzw. verschlüsselt mit dem Android-Keystore, über `expo-secure-store`, in
    Stücken von höchstens 1600 Zeichen.
  - **Nicht** erhoben: das Alter. Der Schalter „I am 12 or older“ bleibt im Formular und wird nie
    gesendet.
- **Empfänger:** Supabase. Keine Funktion gibt einem anderen Nutzer die E-Mail-Adresse heraus.
- **Löschfristen:**
  - Kontolöschung in der App (`delete_own_account()`): Die Zeile in `auth.users` wird gelöscht;
    Identitäten, Sitzungen, Refresh-Token und Einmal-Token folgen per Kaskade (lokal geprüft:
    `users` 1→0, `identities` 1→0, `sessions` 3→0, `refresh_tokens` 3→0). Die Einträge des Kontos
    im Anmeldeprotokoll löscht die Funktion gleich mit (V8).
  - Abmelden beendet die Sitzungen der Person auf allen Geräten (supabase-js `signOut()`,
    Voreinstellung `global`). Am lokalen Stack geprüft: GoTrue löscht dabei die Zeilen; auf dem
    gehosteten Projekt bestätigen (zu prüfen). Erreicht die Abmeldung den Server nicht, bleiben sie,
    bis die 90 Tage unten greifen.
  - **Unbenutzte Sitzungen:** Der tägliche Auftrag `tidy_up` löscht eine Sitzung, deren
    `updated_at` älter als 90 Tage ist (`private.idle_session_lifetime()`), mit ihren
    Refresh-Token. GoTrue setzt `updated_at` bei jeder Erneuerung, also etwa stündlich, solange die
    App offen ist; 90 Tage ohne Öffnen beenden die Sitzung, die App verlangt dann eine neue
    Anmeldung (lokal gegen GoTrue geprüft, Commit 665924d). Eine Sitzung, die benutzt wird, hat
    weiterhin **keine Höchstdauer** (`config.toml` hat keinen Abschnitt `[auth.sessions]`; das wäre
    eine Einstellung bezahlter Tarife; Lücke L1).
  - Refresh-Token bleiben höchstens so lange wie ihre Sitzung. GoTrues eigenes Aufräumen ersetzter
    Token nach 24 Stunden läuft nur, wenn `GOTRUE_DB_CLEANUP_ENABLED` gesetzt ist; der Standard ist
    aus (im GoTrue-Programm v2.197.0 nachgesehen: `cleanup_enabled`, `default:"false"`), lokal ist
    es aus, gehostet: zu prüfen. Ist es aus, wächst die Kette einer benutzten Sitzung um etwa eine
    Zeile je Stunde Nutzung, solange die Sitzung lebt (Lücke L8).
  - Einmal-Token: bis sie benutzt oder ersetzt sind, spätestens mit dem Konto. Ob abgelaufene Token
    bereinigt werden: zu prüfen.
  - Auf dem Gerät: beim Abmelden und nach der Kontolöschung entfernt, auch wenn der Server nicht
    erreichbar ist. Auf iOS liegen die Einträge mit `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
    (`KEYCHAIN_OPTIONS`): nicht in Backups für ein anderes Gerät, kein Umzug auf ein neues iPhone.
    Ob sie das Löschen der App überleben: zu prüfen. Auf Android sind sie von Auto Backup und
    Geräteübertragung ausgenommen.
  - Gesperrte Konten: V7.
- **Quelle:** `supabase/config.toml`; `src/features/auth/auth-context.tsx`; `src/lib/supabase.ts`;
  `src/lib/secure-storage.ts`; `src/app/sign-up.tsx`;
  `supabase/migrations/20261104120000_privacy_housekeeping.sql` (`delete_own_account`, `tidy_up`).

### V2 Profil und Stadt

- **Zweck:** einen Kurier für seine Freunde erkennbar machen; Freunde über den genauen Benutzernamen
  finden; die Flugzeit auf dem Server berechnen; verhindern, dass sich jemand für einen kurzen Flug
  die Stadt eines Freundes „leiht“ (eine neue Stadt gilt erst nach 24 Stunden).
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO.
- **Betroffene:** Nutzer.
- **Daten:** `public.profiles`: `id` (UUID), `username`, `display_name`, `city_id`,
  `settled_city_id`, `city_changed_at`, `created_at`, `updated_at`. Die Spalte `avatar_url` gibt
  es, sie wird aber nie beschrieben: Es gibt dafür weder ein Recht noch eine Oberfläche.
- **Wer was sieht:**
  - Benutzername: jeder, mit dem eine Freundschaftszeile besteht (offen in beide Richtungen oder
    angenommen), Korrespondenten, und wer die Person blockiert hat (`list_blocked`). Dass ein
    Benutzername existiert, kann jeder Angemeldete über die genaue Suche in `request_friend`
    bestätigen.
  - Anzeigename: angenommene Freunde, Personen, denen die Person eine Anfrage geschickt hat, und
    Korrespondenten. Briefe zeigen immer den aktuellen Namen, auch ehemaligen Freunden auf alten
    Briefen. Wer die Person blockiert hat, sieht nur noch den Benutzernamen.
  - Stadt mit Land, Entfernung und Flugzeit: angenommene Freunde (`list_friends`).
  - Nutzer-ID: Freunde, Anfragende, Angefragte, Korrespondenten, Blockierende. Angezeigt wird sie
    nirgends.
- **Empfänger:** Supabase; andere Nutzer wie oben.
- **Löschfristen:** mit dem Konto (Kaskade, lokal geprüft). Der Benutzername ist danach sofort
  wieder frei. Nach einem Stadtwechsel leert der tägliche Auftrag `settled_city_id` (die vorherige
  Stadt) und `city_changed_at`, sobald die 24 Stunden vorbei sind, also spätestens zwei Tage nach
  dem Wechsel. Kopien in Meldungen: V6.
- **Quelle:** `20260815120000_profiles.sql`, `20261031120000_least_privilege.sql`,
  `20261031120200_flight.sql`, `20261031120300_friendships.sql`, `20261102120000_safety.sql`,
  `20261104120000_privacy_housekeeping.sql`.

### V3 Freundschaften und Anfragen

- **Zweck:** Briefe gibt es nur zwischen Freunden.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO.
- **Betroffene:** Nutzer.
- **Daten:** `public.friendships`: `requester_id`, `addressee_id`, `status`, `created_at` (wann
  angefragt), `accepted_at`.
- **Wer was sieht:** beide Beteiligten (`list_friends`, oder die eigenen Zeilen direkt).
- **Empfänger:** Supabase; die andere Person.
- **Löschfristen:** Die Zeile wird gelöscht, wenn eine Anfrage abgelehnt oder zurückgezogen, eine
  Freundschaft beendet oder durch eine Blockierung aufgelöst wird, oder mit einem der beiden Konten.
  Eine offene Anfrage läuft nie ab (Lücke L4).
- **Quelle:** `20261031120300_friendships.sql`, `20261102120000_safety.sql`.

### V4 Briefe und Fledermäuse (Zustellung)

- **Zweck:** Briefe zustellen; die Regel „genau drei Fledermäuse“ durchsetzen; die Zustellzeit auf
  dem Server festlegen.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO.
- **Betroffene:** Absender und Empfänger; Dritte, über die in einem Brief geschrieben wird.
- **Daten:**
  - `public.messages`: `body` (1 bis 2000 Zeichen Freitext), `sender_id`, `recipient_id`, `bat_id`,
    `origin_city_id`, `destination_city_id` (so, wie die Städte beim Absenden waren),
    `distance_km`, `sent_at`, `deliver_at`, `delivered_at`, `opened_at`, `client_ref`.
  - `public.bats`: `owner_id`, `slot`, `status`, `updated_at` (wann eine Fledermaus losflog oder
    heimkam).
  - Der Freitext kann alles enthalten, auch besondere Kategorien nach Art. 9 Abs. 1 (Gesundheit,
    Glaube, …). Der Betreiber fragt nicht danach und wertet Briefe nicht aus. Ob und auf welche
    Ausnahme nach Art. 9 Abs. 2 sich die Speicherung und Zustellung solcher Inhalte stützen muss: zu
    prüfen.
- **Wer was sieht:**
  - Absender: immer Text, Empfänger, Städte, Zeiten und ob der Brief gelandet ist; nie
    `opened_at`.
  - Empfänger: erst nach der Landung (Text, Absender, Startstadt, Zeiten, das eigene `opened_at`),
    und nicht, solange er den Absender blockiert hat.
  - Fledermäuse: nur ihr Besitzer, über `get_roost`, das zu einer fliegenden Fledermaus auch den
    Empfänger und die Zeiten zeigt.
  - Betreiber und Supabase können jeden Brief im Dashboard im Klartext lesen. Es gibt keine
    Ende-zu-Ende-Verschlüsselung (Lücke L6). Die Zusage, nur gemeldete Briefe zu lesen, ist noch
    nicht beschlossen (Datenschutzerklärung, PRÜFEN-Hinweis).
- **Empfänger:** Supabase; der jeweilige Korrespondent.
- **Löschfristen:**
  - Ein Brief bleibt, solange beide Konten bestehen. Niemand kann einen einzelnen Brief löschen, und
    es gibt keine Frist (Lücke L2).
  - Löscht einer der beiden sein Konto oder entfernt der Betreiber eines, ist der Brief bei beiden
    weg (Kaskade; lokal geprüft 2→0). Ein noch fliegender Brief gibt dabei seine Fledermaus frei.
  - Die Kopie eines gemeldeten Briefs in der Meldung: V6.
  - Fledermäuse: mit dem Konto. `release_bat` schreibt `now()` in `updated_at` und hält damit den
    Zeitpunkt fest, zu dem die andere Person ihr Konto gelöscht hat; kein Client kann das lesen.
- **Verarbeitung im Hintergrund:** Der pg_cron-Job `deliver-due-messages` läuft jede Minute und
  stellt fällige Briefe zu.
- **Quelle:** `20261031120100_bats.sql`, `20261031120400_messages.sql`,
  `20261031120500_delivery_schedule.sql`, `20261031120600_reading.sql`,
  `20261102120000_safety.sql`.

### V5 Blockieren

- **Zweck:** Schutz vor Nachrichten, die jemand nicht will (auch Apples Guideline 1.2).
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO (Funktion der App) und lit. f (Schutz vor
  unerwünschten Nachrichten).
- **Betroffene:** Blockierende und Blockierte.
- **Daten:** `public.blocks`: `blocker_id`, `blocked_id`, `created_at`.
- **Wer was sieht:** nur die blockierende Person, über `list_blocked` (Nutzer-ID, Benutzername,
  Zeitpunkt). Die blockierte Person wird nie benachrichtigt.
- **Empfänger:** Supabase.
- **Löschfristen:** bis die Blockierung aufgehoben oder eines der beiden Konten gelöscht wird
  (Kaskade).
- **Quelle:** `20261102120000_safety.sql`.

### V6 Meldungen und Moderation

- **Zweck:** Missbrauch bearbeiten: Meldungen lesen, Verwarnungen per E-Mail schicken, Konten
  entfernen (V7), Beweise aufbewahren, die ein Opfer brauchen könnte, und in schweren Fällen eine
  Meldung an die Polizei geben. Auch Apples Guideline 1.2.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO – berechtigtes Interesse, Missbrauch zu
  verhindern und zu bearbeiten, die Nutzer und besonders die Minderjährigen unter ihnen zu schützen
  und Beweise zu sichern. Art. 6 Abs. 1 lit. c, wenn ein Gesetz zur Herausgabe verpflichtet. Für die
  freiwillige Weitergabe an die Polizei, die die Daten zu einem anderen Zweck verwendet als dem, zu
  dem sie erhoben wurden: ob neben lit. f die Vereinbarkeitsprüfung nach Art. 6 Abs. 4 oder § 24
  Abs. 1 Nr. 1 BDSG heranzuziehen ist, zu prüfen (die Datenschutzerklärung nennt die Weitergabe
  schon als Zweck, 3.7). Dass eine Meldung die Löschung eines Kontos bis zu 180 Tage überdauert,
  stützt sich auf Art. 17 Abs. 3 lit. e (Geltendmachung, Ausübung oder Verteidigung von
  Rechtsansprüchen) und das berechtigte Interesse (`docs/ARCHITECTURE.md`, „A report keeps a
  copy“); zu prüfen.
- **Betroffene:** die meldende und die gemeldete Person; Dritte, die im gemeldeten Brief vorkommen.
- **Daten:**
  - `public.reports`: `reporter_id`, `reported_id`, `message_id`, `reason` (aus einer festen Liste),
    `note` (Freitext der meldenden Person, höchstens 500 Zeichen), `reported_username` und
    `reported_display_name` (so, wie sie zum Zeitpunkt der Meldung waren), bei einem Brief
    `letter_body` und `letter_sent_at`, `created_at`, `resolved_at`, `resolution` (Freitext des
    Betreibers).
  - Eine Meldung kann den Vorwurf einer Straftat enthalten, etwa einer Drohung. Ob das Daten über
    Straftaten nach Art. 10 DSGVO sind: zu prüfen.
  - Verwarnungen: E-Mails an die Adresse des Kontos, aus dem Postfach des Betreibers (V11).
  - Bei einer Drohung (GO-LIVE, „Handling a report“, „A threat“): eine E-Mail an die meldende
    Person, dass das andere Konto in einer Woche entfernt wird; und, soll die Polizei die Meldung
    bekommen, ein Export der Sitzungen (`created_at`, `refreshed_at`, IP-Adresse, User-Agent) und
    der Einträge im Anmeldeprotokoll (Zeit, Ereignis, IP-Adresse) des gemeldeten Kontos.
- **Wer was sieht:** nur der Betreiber, im Supabase-Dashboard. Keine API-Rolle kann die Tabelle
  lesen, auch die meldende Person nicht. Die gemeldete Person erfährt nicht, wer gemeldet hat; weil
  ein Brief nur einen Empfänger hat, kann sie es aber ahnen.
- **Empfänger:** Supabase; im Einzelfall die Polizei (exportierte Meldung, nach einer Drohung mit
  den Anmeldedaten des gemeldeten Kontos).
- **Grenzen im Code:** höchstens 20 Meldungen je meldender Person und Tag; je meldender Person
  höchstens eine offene Meldung zu einem Brief und eine offene Meldung zu einer Person
  (`reports_letter_once`, `reports_courier_once`).
- **Löschfristen:**
  - 180 Tage nach `created_at`, erledigt oder nicht: Der pg_cron-Job `forget-old-reports` läuft
    stündlich (`17 * * * *`) und ruft `private.forget_old_reports()` auf.
  - Löscht eine der beiden Personen vorher ihr Konto, werden `reporter_id` bzw. `reported_id` auf
    `null` gesetzt; Brieftext, Namen und Notiz bleiben bis zum Ablauf der 180 Tage.
  - Eine an die Polizei gegebene Kopie liegt außerhalb des Systems und bleibt dort nach den Regeln
    der Polizei. Der Betreiber löscht seine eigene Exportkopie, auch die der Anmeldedaten, nach der
    Übergabe (GO-LIVE, „Handling a report“).
  - Auch Meldungen, die mit „no action“ erledigt wurden, bleiben die vollen 180 Tage.
- **Hinweise:** `resolution` ist freier Text ohne Regeln: sachlich halten, nichts über die meldende
  Person hineinschreiben. Eine Benachrichtigung über neue Meldungen (GO-LIVE schlägt einen Webhook
  mit E-Mail vor) bleibt ohne Inhalt – „eine neue Meldung wartet“, sonst nichts –, wie GO-LIVE es
  verlangt; sonst landeten Brieftext und Notiz im Postfach, außerhalb der 180-Tage-Löschung.
- **Quelle:** `20261102120000_safety.sql`; `docs/GO-LIVE.md`, „Handling a report“;
  `src/app/(app)/profile.tsx` (Hinweis im Löschdialog).

### V7 Sperre entfernter Konten

- **Zweck:** verhindern, dass sich eine Person, deren Konto wegen Verstößen gegen die Hausregeln
  entfernt wurde, mit derselben E-Mail-Adresse gleich neu anmeldet.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO – berechtigtes Interesse, alle anderen vor dieser
  Person zu schützen.
- **Betroffene:** Nutzer, deren Konto wegen Verstößen gegen die Hausregeln entfernt wurde. Ein
  Konto, das aus einem anderen Grund gelöscht wird – von der Person selbst, auf Bitte der Eltern,
  wegen einer fremden E-Mail-Adresse oder weil jemand jünger als 12 ist –, hinterlässt keine Sperre
  (5.4; Datenschutzerklärung 3.8).
- **Wie:** Der Betreiber entfernt ein Konto mit `select private.remove_account('<reported_id>')`
  (GO-LIVE, „Handling a report“). Die Funktion sperrt die Anmeldung für genau
  `private.ban_period()` – zwei Jahre ab dem Entfernen – und löscht das Profil, mit ihm
  Fledermäuse, Freundschaften, Blockierungen und alle Briefe auf beiden Seiten. Über die API ist sie
  nicht aufrufbar. Bei einer Drohung sperrt er zuerst nur vorläufig
  (`banned_until = now() + private.ban_period()`): Das Konto besteht dann noch, mit Profil und
  Briefen. Er schreibt der meldenden Person, exportiert gegebenenfalls die Anmeldedaten für die
  Polizei (V6) und entfernt das Konto eine Woche später mit `remove_account`, das die Sperre neu
  setzt; die zwei Jahre laufen also ab dem Entfernen (5.6).
- **Daten während der Sperre:** Der Datensatz in `auth.users` bleibt stehen – E-Mail-Adresse,
  Passwort-Hash, die Zeitpunkte aus V1, `banned_until` –, dazu die Identität (ohne die Namen, die
  `tidy_up` entfernt). Die Sitzungen mit IP-Adresse und User-Agent bleiben, bis sie 90 Tage nicht
  benutzt wurden; ein gesperrtes Konto kann sie nicht mehr erneuern (lokal geprüft), sie gehen also
  spätestens rund 91 Tage nach der Sperre (V1; Lücke L7; dass eine abgelehnte Erneuerung
  `updated_at` nicht setzt: zu prüfen). Die Einträge im Anmeldeprotokoll lässt `remove_account`
  bewusst stehen, weil sie nach einer Drohung das sind, was man der Polizei geben kann; sie gehen
  nach 30 Tagen (V8).
- **Löschfrist:** **zwei Jahre ab dem Entfernen**, die Entscheidung des Betreibers
  (Datenschutzerklärung 3.8). Ist die Sperre abgelaufen, löscht der tägliche Auftrag `tidy_up` den
  Anmeldedatensatz, und mit ihm per Kaskade Identität und Sitzungen. Das gilt nur, solange niemand
  von Hand länger sperrt.

### V8 Anmeldeprotokoll und Server-Protokolle

- **Zweck:** Betrieb, Sicherheit, Erkennen von Angriffen und Missbrauch, Fehlersuche.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO, soweit es um die Anmeldung geht; sonst lit. f.
- **Betroffene:** Nutzer; jeder, der eine Anfrage an den Server schickt.
- **Daten:**
  - Anmeldeprotokoll (`auth.audit_log_entries`): je Ereignis (`user_signedup`, `login`, `logout`,
    Token-Ereignisse, Anforderung eines neuen Passworts, Passwortänderung) `actor_id` (UUID),
    `actor_username` (= E-Mail-Adresse), `traits`, `ip_address`, `created_at`. Lokal ist
    `ip_address` in jeder Zeile leer; ob das gehostete Projekt sie füllt: zu prüfen.
  - Supabase-Protokolle (Logs Explorer): Gateway – IP-Adresse, Methode, Pfad (bei Profilabfragen mit
    der eigenen Nutzer-ID, `/rest/v1/profiles?...&id=eq.<uuid>`), User-Agent, Referer, Status, Zeit.
    Auth – E-Mail-Adresse, Nutzer-ID, IP-Adresse, Pfad, Grant-Typ. Postgres und PostgREST –
    Fehlermeldungen und Anweisungen ohne Parameter.
  - Brieftexte, Notizen und Benutzernamen gehen in POST-Bodies, nie in URLs. Postgres protokolliert
    keine Parameter (`log_parameter_max_length_on_error = 0`). Eine DETAIL-Zeile zu einer
    Unique-Verletzung, etwa einem vergebenen Benutzernamen bei der Registrierung, enthielte aber den
    Wert (Standardverhalten von Postgres; lokal nicht beobachtet).
- **Empfänger:** Supabase.
- **Löschfristen:**
  - Anmeldeprotokoll: **30 Tage** (`private.sign_in_record_retention()`). Der tägliche Auftrag
    `tidy_up` (pg_cron-Job `tidy-up`, `43 4 * * *`) löscht ältere Einträge. `delete_own_account()`
    löscht die Einträge des Kontos sofort mit, erkannt an `payload->>'actor_id'`; Einträge ohne
    `actor_id`, die trotzdem die E-Mail-Adresse enthalten, gehen erst nach den 30 Tagen. Die Tabelle
    selbst hat keine Nutzer-ID-Spalte und keinen Fremdschlüssel, und GoTrue räumt sie nicht auf.
  - **Vorbehalt:** Hat die Rolle `postgres` auf dem gehosteten Projekt kein `DELETE`-Recht auf
    `auth.audit_log_entries` (lokal hat sie es), überspringen beide Funktionen diesen Schritt ohne
    Fehler: `tidy_up` nennt ihn dann in seinem Ergebnis (`sign-in log: …`, 4.5),
    `delete_own_account()` meldet nichts. Auf dem gehosteten Projekt deshalb gleich nach dem
    ersten `db push` `select private.tidy_up();` ausführen; es muss `{}` ergeben (5.2). Frühestens
    31 Tage nach dem Start, wenn es überhaupt ältere Einträge geben kann, zusätzlich prüfen, dass
    `select count(*) from auth.audit_log_entries where created_at < now() - interval '31 days'`
    nichts findet, der Auftrag also auch täglich läuft (Lücke L8).
  - Server-Protokolle: nach dem Supabase-Tarif; im kostenlosen Tarif nach öffentlichen Angaben
    vermutlich ein Tag (zu prüfen). Wo sie gespeichert werden: zu prüfen. Die Kontolöschung erreicht
    sie nicht.
- **Quelle:** lokale Prüfung (`\d auth.audit_log_entries`, Docker-Protokolle von `supabase_kong` und
  `supabase_auth`); `20261104120000_privacy_housekeeping.sql`; `src/features/profile/use-profile.ts`;
  `src/features/messages/messages.ts`.

### V9 Datensicherungen

- **Zweck:** Wiederherstellung nach einem Ausfall (Verfügbarkeit, Art. 32 Abs. 1 lit. b und c).
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO.
- **Betroffene und Daten:** alle in V1 bis V8, soweit in der Datenbank.
- **Empfänger:** Supabase.
- **Löschfristen:** nach dem Tarif. Ob der kostenlose Tarif überhaupt Sicherungen hält, und wie
  lange ein bezahlter: zu prüfen. Gelöschte Zeilen, auch gelöschte Konten, bleiben in einer
  Sicherung, bis sie überschrieben wird.
- **Hinweis:** Wird je eine Sicherung zurückgespielt, sind seitdem gelöschte Konten und Briefe
  wieder da und müssen erneut gelöscht werden. Wie der Betreiber erkennt, welche das sind: zu
  prüfen.

### V10 E-Mails zum Konto

- **Zweck:** den Link zum Zurücksetzen des Passworts schicken; sobald eingeschaltet, die
  E-Mail-Adresse bei der Registrierung bestätigen. E-Mails zum Adresswechsel und zur erneuten
  Anmeldung gibt es nur bei direkter Nutzung der API; die App hat dafür keine Oberfläche.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO.
- **Betroffene:** Nutzer; bei falsch eingegebener oder fremder Adresse deren Inhaber.
- **Daten:** Empfängeradresse; ein Einmal-Link zu `https://<ref>.supabase.co/auth/v1/verify`, der
  nach `nightcourier://` weiterleitet.
- **Empfänger:** heute der eingebaute Mailversand von Supabase, der nur an Adressen des
  Projektteams zustellt (zwei E-Mails pro Stunde); später ein eigener SMTP-Anbieter (Resend,
  Postmark oder Amazon SES, noch nicht gewählt) als Auftragsverarbeiter; der Postfachanbieter des
  Empfängers.
- **Löschfristen:** Versandprotokolle nach dem jeweiligen Anbieter (zu prüfen); das Postfach des
  Empfängers liegt außerhalb. Die Kontolöschung erreicht beides nicht.
- **Quelle:** `supabase/config.toml`; `docs/GO-LIVE.md`, „Before a second person can sign up“;
  `src/features/auth/auth-context.tsx`.

### V11 Kontakt, Support und Anfragen von Betroffenen

- **Zweck:** Fragen beantworten, Ergänzungen zu Meldungen entgegennehmen, Anfragen nach Art. 15 bis
  21 DSGVO bearbeiten, Anfragen von Eltern, Verwarnungen nach einer Meldung, die Nachricht an die
  meldende Person nach einer Drohung (V6), Hinweise auf wichtige Änderungen der
  Datenschutzerklärung (dort Abschnitt 15).
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO, wenn es um das Konto geht; lit. c bei Anfragen zu
  Betroffenenrechten; sonst lit. f.
- **Betroffene:** Nutzer, Eltern und andere Erziehungsberechtigte, sonstige Absender.
- **Daten:** E-Mail-Adresse, Name, falls angegeben, Inhalt der Nachricht, gegebenenfalls Angaben zur
  Identität.
- **Speicherort:** das Postfach `{{CONTACT_EMAIL}}` bei Microsoft (Outlook.com), und der
  Postfachanbieter des Absenders.
- **Empfänger:** Microsoft.
- **Drittland:** zu prüfen (Microsoft verarbeitet auch in den USA).
- **Löschfristen:** **noch nicht festgelegt.** Vorschlag: sechs Monate, nachdem das Anliegen erledigt
  ist. Ein kurzer Nachweis über erledigte Betroffenenanfragen (Datum von Eingang und Antwort, ohne
  die herausgegebenen Daten) kann länger bleiben; wie lange: zu prüfen. Entscheidung des Betreibers,
  dann in die Datenschutzerklärung (3.11) übernehmen.

### V12 Verteilung der Testversionen und App-Prüfung

- **Zweck:** die App an eingeladene Tester verteilen (iPhone: TestFlight, externe Gruppe mit
  öffentlichem Link; Android: interner Test bei Google Play), Abstürze finden, Apples Beta App
  Review (und gegebenenfalls Googles Prüfung) ermöglichen.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO; für Absturzberichte lit. f.
- **Betroffene:** Tester; Prüfer von Apple und Google, die das Demo-Konto benutzen.
- **Daten:**
  - Apple: was der Betreiber in App Store Connect über Tester mit öffentlichem Link sieht (zu
    prüfen); Installations- und Sitzungsdaten; Absturzberichte und Feedback (Text und Screenshots,
    auf denen Briefe zu sehen sein können) mit Gerätemodell und iOS-Version (genaue Felder: zu
    prüfen); die Anmeldung des Demo-Kontos für Beta App Review.
  - Google: die Testerliste mit den E-Mail-Adressen der Google-Konten, die der Betreiber in der Play
    Console führt; Android-vitals (Abstürze und hängende App-Fenster mit Gerätemodell und
    Android-Version). Ob Pre-Launch-Berichte im internen Test laufen und dabei Konten im gehosteten
    Projekt anlegen: zu prüfen, und dann abschalten (`google-play.md`, Abschnitt 3).
  - Die Demo-Konten sind erfunden und laufen über Adressen des Betreibers.
- **Speicherort:** App Store Connect (Apple), Play Console (Google).
- **Empfänger:** Apple, Google (Rolle: zu prüfen).
- **Drittland:** nach den Bestimmungen von Apple und Google.
- **Löschfristen:** Eine Adresse kommt von der Testerliste, wenn die Person nicht mehr testet
  (Datenschutzerklärung 3.12). TestFlight-Versionen laufen nach 90 Tagen ab. Feedback-Screenshots
  mit Briefen nach der Auswertung löschen, soweit App Store Connect das erlaubt (zu prüfen). Fristen
  bei Apple und Google: zu prüfen.

### V13 Webseiten für Datenschutzerklärung und Kontakt

- **Zweck:** die Datenschutzerklärung, die Kontaktseite und die Anleitung zum Löschen des Kontos
  öffentlich bereitstellen (verlangt von Apple, Google und Art. 13 DSGVO).
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO (sicherer Betrieb der Seite) bzw. lit. c (Pflicht
  zur Information).
- **Betroffene:** Besucher der Seiten.
- **Daten:** IP-Adresse, User-Agent, Zeitpunkt, aufgerufene Seite, in den Protokollen des Hosters.
- **Empfänger:** der Hoster, **noch nicht gewählt.** Ob er Auftragsverarbeiter ist und einen Vertrag
  braucht, was er protokolliert und wie lange, und ob er Cookies setzt: zu prüfen. Am besten eine
  Seite ohne Cookies, ohne eingebundene Schriften oder Skripte von Dritten.

---

## 4. Technische und organisatorische Maßnahmen (Art. 30 Abs. 1 lit. g, Art. 32)

Nur, was der Code und die Konfiguration tatsächlich umsetzen, mit der Stelle, an der es steht. Was
fehlt, steht in 4.8.

### 4.1 Verschlüsselung

- **Auf dem Transportweg:** Die App spricht nur mit dem Supabase-Projekt, über HTTPS.
  `src/lib/env.ts` verweigert den Start mit einer Adresse, die nicht `https` ist; unverschlüsseltes
  `http` lässt es nur für lokale und private Netzadressen zu, die eine Version für Tester nie hat.
- **Gespeicherte Daten:** Supabase verschlüsselt die Datenträger (AES-256) und den Transport
  standardmäßig (GO-LIVE, „What to do now“); in Supabases Sicherheitsunterlagen oder im DPA
  bestätigen: zu prüfen.
- **Passwörter:** nur als bcrypt-Hash (GoTrue); Mindestlänge 8 Zeichen (`config.toml`,
  `src/features/auth/validation.ts`).
- **Auf dem Gerät:** Die Sitzung liegt im iOS-Schlüsselbund bzw. verschlüsselt mit dem
  Android-Keystore (`expo-secure-store`, `src/lib/secure-storage.ts`), nie in AsyncStorage. Auf
  iOS mit `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: nur auf diesem Gerät und nur entsperrt lesbar, nicht in
  Backups für ein anderes iPhone (ein Test prüft, dass jeder Aufruf diese Option mitgibt). Auf
  Android ist sie von Auto Backup und der Geräteübertragung ausgenommen (Config-Plugin von
  `expo-secure-store`). Das Plugin läuft mit `faceIDPermission: false`, weil die App keine
  Biometrie nutzt (`app.json`).
- **Bewusst nicht:** Ende-zu-Ende-Verschlüsselung der Briefe. Das ist offen gelegt
  (Datenschutzerklärung 3.4, Store-Texte).

### 4.2 Zugriffskontrolle in der Datenbank

- **Row Level Security mit `force`** auf allen sieben Tabellen in `public`: `profiles`, `cities`,
  `bats`, `friendships`, `messages`, `blocks`, `reports`. `force` gilt auch für den Eigentümer der
  Tabelle.
- **`messages`, `bats`, `blocks` und `reports`** haben keine Rechte und keine Policies für die
  API-Rollen. Gelesen und geschrieben wird nur über `SECURITY DEFINER`-Funktionen, die genau das
  zurückgeben, was eine Seite sehen darf: Der Empfänger sieht vor der Landung nichts, nicht einmal,
  dass eine Fledermaus kommt; der Absender sieht nie `opened_at`; `reports` kann keine API-Rolle
  lesen.
- **`profiles`:** lesen nur die eigene Zeile; ändern nur die Spalten `display_name` und `city_id`.
  Der Benutzername ist damit unveränderlich.
- **`friendships`:** lesen nur die eigenen Zeilen.
- **Geringste Rechte:** `20261031120000_least_privilege.sql` entzieht die Standardrechte, die
  Supabase sonst jeder neuen Tabelle und Funktion gibt, und gewährt nur, was die App braucht. Das
  Schema `private` ist für die API-Rollen nicht erreichbar. `privileges.db.test.mjs` listet jedes
  Recht jeder API-Rolle auf jeder Tabelle und Funktion; eine neue Tabelle oder Funktion lässt den
  Test fehlschlagen, bis jemand über ihre Rechte entschieden hat.
- **`search_path = ''`** in jeder Funktion, mit voll qualifizierten Namen; bei `SECURITY DEFINER`
  verhindert das, dass ein Aufrufer Objekte unterschiebt.
- **`delete_own_account()` nimmt keine Argumente:** Es gibt keine ID, die man fälschen könnte; die
  Funktion löscht immer nur den Aufrufer.
- **Regeln auf dem Server:** Zustellzeit, drei Fledermäuse, Briefe nur unter Freunden, eine neue
  Stadt erst nach 24 Stunden, Längen- und Meldegrenzen – alles in Postgres, nicht in der App.

### 4.3 Anmeldung, Schlüssel und Verwaltungszugang

- Die App enthält nur den öffentlichen Schlüssel (anon bzw. publishable), der ohne Anmeldung keine
  persönlichen Daten öffnet. `src/lib/env.ts` verweigert den Start mit einem Service-Role- oder
  Secret-Schlüssel (Präfix `sb_secret_`, oder `role: service_role` in einem alten JWT).
- Zugangs-Token gelten 3600 Sekunden; Rotation der Refresh-Token mit 10 Sekunden
  Wiederverwendungsfenster (`config.toml`).
- Anonyme Anmeldung und manuelles Verknüpfen von Identitäten sind aus. Ein Wechsel der E-Mail-Adresse
  muss auf der alten und der neuen Adresse bestätigt werden (`double_confirm_changes`);
  `secure_password_change` ist an.
- Verwaltungszugang (Supabase-Dashboard, SQL) hat nur der Betreiber. Der persönliche Access Token
  für die Einrichtung wird danach widerrufen (GO-LIVE, „Setting up the hosted project“).
  Zwei-Faktor-Anmeldung für alle Verwaltungskonten: noch offen (Abschnitt 5.2).

### 4.4 Datensparsamkeit und datenschutzfreundliche Voreinstellungen (Art. 25)

- Keine Werbung, keine Analyse, kein Tracking, keine Push-Nachrichten, keine Absturz-SDKs; keine
  Geräte- oder Werbe-IDs, keine Push-Token. Kein SDK außer supabase-js nimmt Verbindung auf;
  Realtime wird nicht benutzt.
- Das Alter wird nicht gespeichert. Kein GPS: Die Stadt kommt aus einer Liste, die Suche läuft auf
  dem Server, und die App erfährt nie Koordinaten.
- Keine Lesebestätigungen, keine Tipp-Anzeige, kein Online-Status. `opened_at` sieht nur der
  Empfänger.
- Keine Suche nach Fremden und keine öffentlichen Profile: Anfragen nur über den genauen
  Benutzernamen. Wer blockiert hat, sieht den Anzeigenamen der blockierten Person nicht mehr.
- Auf dem Gerät nur die Sitzung. Briefe, Entwürfe, Freundeslisten und Notizen zu Meldungen sind nur
  im Speicher und mit dem Schließen der App weg.
- Inhalte in POST-Bodies statt in URLs, keine Parameter in den Postgres-Protokollen (V8).
- Auf Android fordert die App nur die Berechtigung `INTERNET` an: `app.json` sperrt
  `SYSTEM_ALERT_WINDOW`, `VIBRATE`, `READ_EXTERNAL_STORAGE` und `WRITE_EXTERNAL_STORAGE`, die Expos
  Vorlage und `expo-file-system` sonst ins Manifest brächten, obwohl die App sie nicht nutzt; das
  erzeugte Manifest behält nur `INTERNET` (Commit 191bc50). `src/tests/app-config.test.ts` schlägt
  fehl, wenn sich diese Zeilen ändern, ebenso bei Face ID (4.1).
- Kontakt- und Datenschutz-Links kommen aus der Build-Konfiguration (`src/lib/links.ts`); Angaben
  zum Betreiber stehen weder im Code noch im Repository.

### 4.5 Löschung und Fristen, technisch umgesetzt

- **Kontolöschung in der App** (`delete_own_account()`, Apple 5.1.1(v), Art. 17): löscht den
  Anmeldedatensatz; per Kaskade folgen Profil, Fledermäuse, Freundschaften, Blockierungen und alle
  Briefe auf beiden Seiten, danach die Einträge des Kontos im Anmeldeprotokoll. Die Funktion sperrt
  vorher alle betroffenen Zeilen in fester Reihenfolge (`private.lock_courier_rows`), damit
  gleichzeitige Löschungen aufeinander warten, statt sich gegenseitig festzufahren (Deadlock); ein
  Trigger gibt einem Freund die Fledermaus zurück, deren Brief noch flog.
- **Entfernen durch den Betreiber** (`private.remove_account`): löscht dasselbe und sperrt die
  Anmeldung für genau `private.ban_period()` (zwei Jahre ab dem Entfernen).
- **Täglicher Auftrag** `private.tidy_up()` (pg_cron-Job `tidy-up`, `43 4 * * *`, UTC): löscht
  Einträge im Anmeldeprotokoll nach 30 Tagen; entfernt die Namen von der Registrierung aus
  `auth.users` und `auth.identities`; löscht Sitzungen, die 90 Tage nicht benutzt wurden, mit ihren
  Refresh-Token; löscht den Anmeldedatensatz eines entfernten Kontos, sobald die Sperre abgelaufen
  ist; löscht eine Registrierung, deren E-Mail-Adresse nicht innerhalb von 7 Tagen bestätigt wurde, samt Profil (`private.unconfirmed_sign_up_lifetime()`; findet nichts, solange die Bestätigung aus ist); leert die vorherige Stadt nach einem abgeschlossenen Umzug; behält das Laufprotokoll von
  pg_cron (`cron.job_run_details`) eine Woche.
- **Was bei fehlenden Rechten passiert:** Jeder Schritt an einer Tabelle von Supabase
  (`auth.audit_log_entries`, `auth.users`, `auth.identities`, `auth.sessions`,
  `cron.job_run_details`) steht für sich: Fehlt das Recht oder die Tabelle, wird er übersprungen,
  die anderen laufen weiter, und `tidy_up` gibt die übersprungenen Schritte mit Grund zurück, etwa
  `sign-in log: permission denied for table audit_log_entries`. Ein leeres Ergebnis, `{}`, heißt:
  Jeder Schritt lief. Jeder andere Fehler bricht den ganzen Lauf ab. Ein übersprungener Schritt ist
  kein Fehler; der Lauf steht in `cron.job_run_details` deshalb trotzdem auf `succeeded`, und was
  fehlt, zeigt nur der Aufruf von Hand (5.2, 5.7). Geprüft in den Datenbanktests
  (`housekeeping.db.test.mjs`) mit einer Rolle, die `auth.users` nicht anfassen darf: Die übrigen
  Schritte laufen, die beiden an `auth.users` (Namen entfernen, abgelaufene Sperren löschen) stehen
  im Ergebnis. Am lokalen Stack ergibt der Aufruf als `postgres` `{}` (Commit acd4efe).
  `delete_own_account()` überspringt das Löschen im Anmeldeprotokoll ebenso, aber ohne es zu
  melden (V8).
- **Meldungen:** Löschung nach 180 Tagen durch den stündlichen pg_cron-Job `forget-old-reports`;
  bei Kontolöschung `on delete set null`.
- **GoTrue:** löscht Sitzungen selbst nur nach `not_after`, das ohne Höchstdauer nie gesetzt ist;
  unbenutzte Sitzungen löscht deshalb `tidy_up` (V1). Ersetzte Refresh-Token löscht GoTrue nur, wenn
  sein Aufräumen eingeschaltet ist (V1, Lücke L8).
- **Gerät:** Die Sitzung wird beim Abmelden und nach der Kontolöschung entfernt, auch wenn der
  Server nicht antwortet.

### 4.6 Integrität und Belastbarkeit

- Die Datenbank erzwingt die Regeln mit Constraints (`slot between 1 and 3`,
  `unique (owner_id, slot)`), Sperren (`private.lock_pair` für Anfragen und Blockierungen; eine
  Sperre für das Zählen von Meldungen) und wiederholbarem Senden (`client_ref`).
- Tests: Jest; Datenbanktests, die die echten Migrationen in PGlite abspielen; Nebenläufigkeitstests
  gegen ein echtes Postgres in der CI. `npm run verify` läuft in der CI bei jedem Push; vor jedem
  Commit soll es laut README laufen, ein Hook erzwingt das nicht.
- Verfügbarkeit und Sicherungen: durch Supabase, nach Tarif (V9; zu prüfen).

### 4.7 Organisatorisch

- Nur der Betreiber verwaltet den Dienst. Meldungen sieht er mindestens einmal am Tag durch (GO-LIVE,
  „Handling a report“, mit dem Ablauf je nach Schwere).
- Angaben zum Betreiber, Zugangsdaten und Demo-Anmeldungen stehen nie im öffentlichen Repository;
  Demo-Konten sind erfunden.
- Exporte für die Polizei werden nach der Übergabe gelöscht.

### 4.8 Bekannte Lücken

Was der Code heute noch nicht leistet, mit dem jeweils naheliegenden Weg. Jede Behebung ändert
dieses Verzeichnis, die Datenschutzerklärung und die Store-Formulare mit.

| Nr. | Lücke                                                                                                                                                                                                                                                                                                                                                                                                                          | Möglicher Weg                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Eine benutzte Sitzung läuft nie ab; eine unbenutzte bleibt mit IP-Adresse und User-Agent bis zu 91 Tage (ein verlorenes Handy also bis dahin)                                                                                                                                                                                                                                                                                  | Höchstdauer unter `[auth.sessions]` in `config.toml`, sobald der Tarif das erlaubt (eine Einstellung bezahlter Tarife; zu prüfen). Bis dahin: abmelden, oder den Betreiber bitten, die Sitzungen zu löschen                                                                                                                                             |
| L2  | Briefe bleiben unbegrenzt, und niemand kann einen einzelnen löschen                                                                                                                                                                                                                                                                                                                                                            | Ob eine Frist oder eine Löschfunktion nötig ist (Speicherbegrenzung, Art. 5 Abs. 1 lit. e): zu prüfen. Bis dahin steht es offen in der Datenschutzerklärung                                                                                                                                                                                             |
| L3  | E-Mail-Bestätigung aus: fremde Adressen können registriert werden; ein Tippfehler sperrt dauerhaft aus; kein Adresswechsel in der App                                                                                                                                                                                                                                                                                          | Eigenes SMTP, dann Bestätigung an (GO-LIVE), bevor eine zweite Person sich anmeldet                                                                                                                                                                                                                                                                     |
| L4  | Offene Freundschaftsanfragen laufen nie ab                                                                                                                                                                                                                                                                                                                                                                                     | Frist erwägen                                                                                                                                                                                                                                                                                                                                           |
| L5  | Keine Selbstauskunft und kein Export in der App                                                                                                                                                                                                                                                                                                                                                                                | Abfrage in Abschnitt 5.3                                                                                                                                                                                                                                                                                                                                |
| L6  | Betreiber und Supabase können jeden Brief im Klartext lesen                                                                                                                                                                                                                                                                                                                                                                    | Die Zusage beschließen, nur gemeldete Briefe zu lesen; offen gelegt ist es schon                                                                                                                                                                                                                                                                        |
| L7  | Während einer Sperre bleiben neben der E-Mail-Adresse auch Passwort-Hash und Zeitpunkte zwei Jahre ab dem Entfernen stehen, die Sitzungen mit IP-Adresse und User-Agent bis zu rund 91 Tage                                                                                                                                                                                                                                    | Beim Entfernen auch die Sitzungen löschen (5.6), bei einer Drohung erst nach dem Export für die Polizei (GO-LIVE, „A threat“); einen anderen Grund, sie stehen zu lassen, gibt es dann nicht mehr. Dann die Datenschutzerklärung (3.8) mit ändern. Entscheidung des Betreibers                                                                          |
| L8  | Ob das gehostete Projekt `tidy_up` jeden Schritt erlaubt, ist offen. Fehlt ein Recht, wird nur dieser Schritt übersprungen und im Ergebnis genannt (4.5); der tägliche Lauf meldet trotzdem `succeeded`, und die Datenschutzerklärung stimmt an dieser Stelle nicht. Ob GoTrue ersetzte Refresh-Token aufräumt, ist ebenfalls offen; wenn nicht, wächst die Kette einer benutzten Sitzung um etwa eine Zeile je Stunde Nutzung | `select private.tidy_up();` nach dem ersten `db push` und monatlich von Hand; es muss `{}` ergeben (5.2, 5.7). Für die Token: `GOTRUE_DB_CLEANUP_ENABLED` auf dem gehosteten Projekt erfragen, sonst `tidy_up` ersetzte Token nach einem Tag löschen lassen (Code-Änderung; vorher prüfen, dass GoTrues Erkennung wiederverwendeter Token das verträgt) |
| L9  | Ordnung, keine Nutzerdaten im engeren Sinn: im Supabase Studio gespeicherte SQL-Schnipsel können Nutzer-IDs aus dem Runbook enthalten                                                                                                                                                                                                                                                                                          | Schnipsel ohne IDs speichern, gelegentlich aufräumen                                                                                                                                                                                                                                                                                                    |
| L10 | Nur eine Web-Version (nicht geplant) läge die Sitzung im Klartext in localStorage                                                                                                                                                                                                                                                                                                                                              | Vor einer Web-Version lösen                                                                                                                                                                                                                                                                                                                             |

Am 4. November 2026 behoben (Migration `20261104120000_privacy_housekeeping.sql`,
`src/lib/secure-storage.ts`, `app.json`, GO-LIVE): Das Anmeldeprotokoll überdauerte die
Kontolöschung und wurde nie gelöscht; Sperren liefen 100 Jahre und wurden nie gelöscht; die Namen
von der Registrierung blieben für immer im Kontodatensatz und in jedem Token; Sitzungen liefen nie
ab, auch unbenutzte nicht; die vorherige Stadt blieb bis zum nächsten Umzug; das Laufprotokoll von
pg_cron wuchs ohne Ende; die iOS-Sitzung lag mit `WHEN_UNLOCKED` auch in Backups für andere Geräte;
`expo-secure-store` deklarierte Face ID; GO-LIVE schlug eine Benachrichtigung über Meldungen vor,
ohne zu sagen, dass sie inhaltsleer sein muss, und sein Ablauf bei einer Drohung passte nicht mehr
zu `remove_account` (jetzt: mit `private.ban_period()` sperren, eine Woche später entfernen). Später
am selben Tag (Commits acd4efe und 191bc50): Die beiden Schritte von `tidy_up` an `auth.users` waren
nicht abgesichert, sodass ein einziges fehlendes Recht dort den ganzen Lauf zurückgerollt hätte;
jetzt steht jeder Schritt für sich, und `tidy_up` gibt die übersprungenen zurück. Außerdem trugen
Expos Vorlage und `expo-file-system` vier Android-Berechtigungen ins Manifest ein, die die App nicht
nutzt (4.4).

---

## 5. Checkliste: was der Betreiber selbst tun muss

### 5.1 Verträge zur Auftragsverarbeitung (Art. 28)

- [ ] **Supabase:** den Data Processing Addendum (DPA) anfordern und unterzeichnen. Nach Supabases
      eigener Seite: im Dashboard der Organisation unter „Legal Documents“ → „Request DPA“;
      Supabase schickt dann ein Dokument über PandaDoc zum Unterzeichnen (Weg zu prüfen, er hat sich
      schon geändert). Er enthält die Standardvertragsklauseln (Durchführungsbeschluss (EU)
      2021/914; welche Module: zu prüfen). Die unterzeichnete Fassung privat ablegen und hier das
      Datum eintragen: \_\_\_\_\_\_\_\_. Vorher die Datenschutzerklärung nicht veröffentlichen:
      Ihre Abschnitte 7 und 8 sagen, dass es den DPA mit den Standardvertragsklauseln gibt
      (PRÜFEN-Hinweise dort).
- [ ] Supabases Liste der Unterauftragsverarbeiter lesen; prüfen, ob vor der API ein Dienst wie
      Cloudflare liegt und wo Protokolle gespeichert werden; Abschnitt 2 und die
      Datenschutzerklärung (7, 8) ergänzen. Ob man sich für Änderungen der Liste benachrichtigen
      lassen kann: zu prüfen.
- [ ] Ob für den Zugriff aus den USA neben den Standardvertragsklauseln eine
      Transfer-Folgenabschätzung nötig ist, oder ob Supabase unter dem EU-US Data Privacy Framework
      zertifiziert ist: zu prüfen.
- [ ] **E-Mail-Versanddienst**, sobald gewählt (Resend, Postmark oder Amazon SES): dessen DPA
      abschließen, Sitz und Unterauftragsverarbeiter prüfen, dann Abschnitt 2, V10 und die
      Datenschutzerklärung (7) ergänzen.
- [ ] **Hoster der Webseiten**, sobald gewählt: Vertrag zur Auftragsverarbeitung, falls er einer
      ist; keine Cookies und keine Inhalte von Dritten.
- [ ] **Microsoft:** Für ein Outlook.com-Verbraucherpostfach gibt es nach hiesiger Kenntnis keinen
      Vertrag zur Auftragsverarbeitung (zu prüfen). Entweder festhalten, warum das vertretbar ist,
      oder für Night Courier ein Postfach bei einem Anbieter nutzen, der einen solchen Vertrag
      anbietet.
- [ ] **Apple und Google:** Es gelten ihre Entwicklervereinbarungen. Ob sie für die Testerdaten
      eigene Verantwortliche sind: zu prüfen.

### 5.2 Vor dem Start

- [ ] Die Datenschutzerklärung mit ausgefüllten Platzhaltern unter `{{PRIVACY_POLICY_URL}}`
      veröffentlichen; ihre PRÜFEN-Hinweise vorher abarbeiten.
- [ ] Ein ausgefülltes Exemplar dieses Verzeichnisses privat ablegen, mit Datum.
- [ ] Zwei-Faktor-Anmeldung für Supabase, Apple, Google und das Microsoft-Konto des Postfachs;
      Datenbankpasswort und Demo-Zugänge nur im Passwortmanager; Access Tokens nach der Einrichtung
      widerrufen.
- [ ] Eigenes SMTP und E-Mail-Bestätigung an, bevor eine zweite Person sich anmeldet (L3; GO-LIVE,
      „Before a second person can sign up“). Danach den Satz in Datenschutzerklärung 3.10 durch
      den aus ihrem PRÜFEN-Hinweis ersetzen.
- [ ] Nach dem ersten `db push` auf das gehostete Projekt (GO-LIVE, „Setting up the hosted
      project“, Schritt 4): `select jobname, schedule from cron.job` zeigt `deliver-due-messages`,
      `forget-old-reports` und `tidy-up`, und `select private.tidy_up();` ergibt `{}` (4.5, V8,
      L8). Der Aufruf löscht nichts, was der tägliche Auftrag nicht auch löschen würde. Nennt das
      Ergebnis einen Schritt, stimmt die Datenschutzerklärung (3.1, 3.8, 3.9, 9) an dieser Stelle
      nicht: Supabase-Support fragen oder die Erklärung anpassen, bis es gelöst ist. Frühestens 31
      Tage nach dem Start zusätzlich die Abfrage aus V8.
- [ ] Eine Frist für das Postfach festlegen (V11).
- [ ] Entscheiden, ob die Zusage „Ich lese Briefe nur, wenn sie mir gemeldet werden“ gilt (L6).
- [ ] Im gewählten Supabase-Tarif nachsehen: wie lange Protokolle aufbewahrt werden und wo, ob und
      wie lange es Sicherungen gibt. In V8, V9 und die Datenschutzerklärung (3.9, 9) eintragen.
- [ ] Prüfen, ob eine Datenschutz-Folgenabschätzung (Art. 35) nötig ist: Minderjährige als
      schutzbedürftige Betroffene, dazu Freitext, der sensible Daten enthalten kann. Nach den
      Leitlinien der europäischen Datenschutzbehörden (WP 248) sprechen zwei erfüllte Kriterien in
      der Regel für eine Folgenabschätzung; dazu die Liste der deutschen Aufsichtsbehörden nach
      Art. 35 Abs. 4 ansehen. Das Ergebnis der Prüfung festhalten (zu prüfen). Ist eine
      Folgenabschätzung nötig, ist nach § 38 Abs. 1 Satz 2 BDSG auch ein Datenschutzbeauftragter zu
      benennen (Abschnitt 1).
- [ ] Die Rechtsgrundlage für Nutzer unter 16 prüfen (Art. 6 Abs. 1 lit. b oder Einwilligung nach
      Art. 8; Verträge mit Minderjährigen).
- [ ] Bei Google Play die Folgen der Altersgrenze 12 für die Families Policy entscheiden
      (`google-play.md`, Abschnitt 5). Ein dafür gespeichertes Altersmerkmal wäre eine neue
      Datenkategorie in V1.

### 5.3 Eine Auskunftsanfrage beantworten (Art. 15, auch Art. 20)

1. **Eingang notieren.** Die Frist ist ein Monat ab Eingang (Art. 12 Abs. 3). Sie lässt sich um zwei
   weitere Monate verlängern, wenn das wegen der Komplexität oder der Zahl der Anträge nötig ist;
   das muss der Person innerhalb des ersten Monats mit Gründen mitgeteilt werden. Die Auskunft ist
   kostenlos (Art. 12 Abs. 5).
2. **Identität klären.** Kommt die Anfrage von der E-Mail-Adresse des Kontos, genügt das in der
   Regel. Sonst um Bestätigung von dieser Adresse bitten (Art. 12 Abs. 6); eine Ausweiskopie nur,
   wenn es wirklich nicht anders geht. Fragen Eltern für ihr Kind, so nachfragen, dass klar ist,
   dass sie es sind (Datenschutzerklärung 10).
3. **Daten aus der Datenbank holen:** die Abfrage unten im SQL-Editor des Supabase-Dashboards
   ausführen. Sie liest nur. Das Ergebnis als JSON-Datei speichern: Das ist zugleich das „gängige,
   maschinenlesbare Format“ für Art. 20.
4. **Was außerhalb der Datenbank liegt**, dazu nehmen: E-Mails mit der Person im Postfach; ob sie
   auf einer Testerliste steht (Play Console, TestFlight); ob es einen Export für die Polizei gibt,
   der sie betrifft; Server-Protokolle, falls noch vorhanden.
5. **Die Rechte anderer schützen** (Art. 15 Abs. 4). Bei Meldungen über die Person nichts über die
   meldende Person herausgeben; die Abfrage lässt `reporter_id` und die Notiz der meldenden Person
   deshalb weg. Ob und wie weit die Notiz nach Abwägung doch herauszugeben ist (§ 29 Abs. 1 Satz 2
   BDSG): zu prüfen. Ebenso lässt sie weg, wer die Person blockiert hat: Die blockierte Person
   erfährt das in der App nie (V5), und die Auskunft soll es nicht nachholen (Abwägung nach Art. 15
   Abs. 4: zu prüfen). Briefe, die die Person bekommen hat, enthalten auch Daten des Absenders,
   sind ihr aber ohnehin bekannt.
6. **Antworten:** die Kopie, dazu die Angaben nach Art. 15 Abs. 1 und 2 – Zwecke, Kategorien,
   Empfänger, Speicherdauer, die Rechte auf Berichtigung, Löschung, Einschränkung und Widerspruch,
   das Beschwerderecht, die Herkunft (von der Person selbst; bei Meldungen von anderen Nutzern),
   keine automatisierten Entscheidungen, und die Drittländer mit ihren Garantien. Dafür genügt
   meist ein Verweis auf die passenden Abschnitte der Datenschutzerklärung.
7. **Aufräumen und festhalten:** die Exportdatei nach dem Versand löschen; Datum von Eingang und
   Antwort notieren, ohne die Daten selbst aufzubewahren.

Die Abfrage, am 4. November 2026 am lokalen Stack geprüft (in einer schreibgeschützten Transaktion,
für ein Konto mit Briefen, Sitzungen und Anmeldeprotokoll, eines ohne und eine unbekannte Adresse).
Nur die E-Mail-Adresse in der dritten Zeile ersetzen. Das Anmeldeprotokoll findet sie über die
Nutzer-ID und über die E-Mail-Adresse, damit auch Einträge ohne `actor_id` dabei sind:

```sql
-- Auskunft nach Art. 15 DSGVO: alles, was die Datenbank zu einem Konto hält. Liest nur.
with me as (
  select id, id::text as id_text, email from auth.users where email = '<E-Mail-Adresse des Kontos>'
)
select jsonb_pretty(jsonb_build_object(
  'konto', (
    select jsonb_build_object(
      'id', u.id, 'email', u.email, 'angelegt', u.created_at, 'geaendert', u.updated_at,
      'letzte_anmeldung', u.last_sign_in_at, 'email_bestaetigt', u.email_confirmed_at,
      'passwort_reset_angefordert', u.recovery_sent_at, 'gesperrt_bis', u.banned_until,
      'anmelde_metadaten', u.raw_user_meta_data)
    from auth.users u join me on me.id = u.id),
  'anmeldeidentitaeten', (
    select jsonb_agg(jsonb_build_object(
      'anbieter', i.provider, 'daten', i.identity_data,
      'angelegt', i.created_at, 'letzte_anmeldung', i.last_sign_in_at))
    from auth.identities i join me on me.id = i.user_id),
  'sitzungen', (
    select jsonb_agg(jsonb_build_object(
      'angelegt', s.created_at, 'zuletzt_benutzt', s.updated_at, 'ip', s.ip,
      'user_agent', s.user_agent)
      order by s.created_at)
    from auth.sessions s join me on me.id = s.user_id),
  'token_erneuerungen', (
    select jsonb_agg(r.created_at order by r.created_at)
    from auth.refresh_tokens r join me on me.id_text = r.user_id),
  'anmeldeprotokoll', (
    select jsonb_agg(jsonb_build_object(
      'zeit', a.created_at, 'ereignis', a.payload ->> 'action', 'ip', a.ip_address)
      order by a.created_at)
    from auth.audit_log_entries a
    join me on me.id_text = a.payload ->> 'actor_id' or me.email = a.payload ->> 'actor_username'),
  'profil', (
    select jsonb_build_object(
      'benutzername', p.username, 'anzeigename', p.display_name,
      'stadt', c.name, 'vorherige_stadt', sc.name, 'stadt_gewechselt', p.city_changed_at,
      'angelegt', p.created_at, 'geaendert', p.updated_at)
    from public.profiles p
    join me on me.id = p.id
    left join public.cities c on c.id = p.city_id
    left join public.cities sc on sc.id = p.settled_city_id),
  'fledermaeuse', (
    select jsonb_agg(jsonb_build_object('platz', b.slot, 'status', b.status, 'geaendert', b.updated_at)
      order by b.slot)
    from public.bats b join me on me.id = b.owner_id),
  'freundschaften', (
    select jsonb_agg(jsonb_build_object(
      'mit', o.username, 'angefragt_von_mir', f.requester_id = me.id, 'status', f.status,
      'angefragt', f.created_at, 'angenommen', f.accepted_at))
    from public.friendships f
    join me on me.id in (f.requester_id, f.addressee_id)
    left join public.profiles o
      on o.id = case when f.requester_id = me.id then f.addressee_id else f.requester_id end),
  'blockiert', (
    select jsonb_agg(jsonb_build_object('wen', o.username, 'seit', bl.created_at))
    from public.blocks bl join me on me.id = bl.blocker_id
    left join public.profiles o on o.id = bl.blocked_id),
  'briefe', (
    select jsonb_agg(jsonb_build_object(
      'richtung', case when m.sender_id = me.id then 'gesendet' else 'empfangen' end,
      'mit', o.username, 'text', m.body, 'von_stadt', oc.name, 'nach_stadt', dc.name,
      'km', m.distance_km, 'gesendet', m.sent_at, 'landet', m.deliver_at,
      'gelandet', m.delivered_at,
      'geoeffnet', case when m.recipient_id = me.id then m.opened_at end)
      order by m.sent_at)
    from public.messages m
    join me on me.id in (m.sender_id, m.recipient_id)
    left join public.profiles o
      on o.id = case when m.sender_id = me.id then m.recipient_id else m.sender_id end
    left join public.cities oc on oc.id = m.origin_city_id
    left join public.cities dc on dc.id = m.destination_city_id),
  'meine_meldungen', (
    select jsonb_agg(jsonb_build_object(
      'gemeldet', r.created_at, 'ueber', r.reported_username, 'grund', r.reason,
      'notiz', r.note, 'brieftext', r.letter_body, 'erledigt', r.resolved_at))
    from public.reports r join me on me.id = r.reporter_id),
  -- Ohne reporter_id und ohne Notiz: wer gemeldet hat, bleibt geschützt (Art. 15 Abs. 4).
  'meldungen_ueber_mich', (
    select jsonb_agg(jsonb_build_object(
      'gemeldet', r.created_at, 'grund', r.reason, 'namen_damals',
      jsonb_build_array(r.reported_username, r.reported_display_name),
      'brieftext', r.letter_body, 'brief_gesendet', r.letter_sent_at,
      'erledigt', r.resolved_at, 'ergebnis', r.resolution))
    from public.reports r join me on me.id = r.reported_id)
)) as auskunft;
```

Ist das Konto schon gelöscht, findet die Abfrage nichts mehr. Was dann noch übrig sein kann: das
Anmeldeprotokoll (`where payload ->> 'actor_username' = '<E-Mail-Adresse>'`, bis zu 30 Tage) und
Meldungen. Meldungen über die Person tragen keine Nutzer-ID mehr, nur Benutzername und Anzeigename
von damals – und Benutzernamen werden nach einer Löschung neu vergeben; nur mit Vorsicht zuordnen.
Meldungen, die die Person selbst gemacht hat, lassen sich gar nicht mehr zuordnen: Eine Meldung
speichert über die meldende Person nur `reporter_id`, und die ist dann leer. Ist das Konto entfernt
und noch gesperrt, findet die Abfrage den Kontodatensatz, die Identität, die Sitzungen und das
Anmeldeprotokoll weiter, aber kein Profil mehr.

### 5.4 Eine Löschanfrage beantworten (Art. 17)

1. Meist kann die Person selbst löschen: Your profile → Delete my account. Kommt die Bitte per
   E-Mail: Eingang notieren, Identität wie in 5.3 klären; Frist wie dort.
2. **Konto löschen:** Dashboard → Authentication → Users → Delete user. Das gibt die E-Mail-Adresse
   frei und löscht per Kaskade wie `delete_own_account()` Profil, Fledermäuse, Freundschaften,
   Blockierungen und alle Briefe auf beiden Seiten. (`private.remove_account` ist für entfernte
   Konten und sperrt die Adresse zwei Jahre ab dem Entfernen: V7. Bei einer Löschanfrage nicht
   sperren.)
3. **Anmeldeprotokoll löschen.** Anders als `delete_own_account()` lässt das Löschen im Dashboard
   die Einträge stehen; der tägliche Auftrag löscht sie erst nach 30 Tagen. Auf Wunsch sofort
   (das geht, wenn `select private.tidy_up();` keinen Schritt `sign-in log` meldet, 5.2; V8):

   ```sql
   delete from auth.audit_log_entries
   where payload ->> 'actor_id' = '<Nutzer-ID>'
      or payload ->> 'actor_username' = '<E-Mail-Adresse>';
   ```

4. **Sagen, was bleibt und warum** (Art. 17 Abs. 3): Meldungen bis zu 180 Tage (V6); Server-
   Protokolle und Sicherungen, bis sie automatisch gelöscht oder überschrieben werden; Einträge im
   Anmeldeprotokoll ohne Nutzer-ID bis zu 30 Tage; der E-Mail-Verkehr zur Anfrage als Nachweis.
5. **Empfängern Bescheid geben** (Art. 19), soweit Daten weitergegeben wurden und das möglich ist –
   etwa der Polizei bei einer übergebenen Meldung (ob nötig: zu prüfen).
6. Die Person von Testerlisten nehmen (Play Console, TestFlight), wenn sie dort steht.
7. Die Löschung bestätigen und Datum notieren.

Sonderfälle, die die Datenschutzerklärung zusagt, jeweils mit den Schritten 2 und 3, also **ohne
Sperre**: Hat ein Kind unter 16 ohne Erlaubnis ein Konto, wird es auf Bitte der Eltern gelöscht,
nachdem geklärt ist, dass die Bitte von ihnen kommt (Datenschutzerklärung 10). Hat jemand eine
fremde E-Mail-Adresse registriert, wird das Konto auf Bitte des Inhabers der Adresse gelöscht
(3.10). Erfährt der Betreiber, dass jemand jünger als 12 ist, löscht er das Konto
(Datenschutzerklärung 10): Dashboard → Authentication → Users → Delete user, oder die Person löscht
es selbst. Nicht mit `private.remove_account`: Dessen Sperre gilt nur für Konten, die wegen
Regelverstößen entfernt werden (V7, Datenschutzerklärung 3.8), und hielte die E-Mail-Adresse eines
Kindes zwei Jahre gespeichert.

Die anderen Rechte: **Berichtigung** (Art. 16) – Anzeigename und Stadt ändert die Person selbst;
Benutzername oder E-Mail-Adresse ändert der Betreiber im Dashboard (Weg zu prüfen). **Einschränkung**
(Art. 18) und **Widerspruch** (Art. 21) gegen Verarbeitungen nach Art. 6 Abs. 1 lit. f – im
Einzelfall abwägen, Ergebnis begründet mitteilen. Lehnt der Betreiber etwas ab, teilt er das
unverzüglich, spätestens innerhalb eines Monats mit, mit Gründen und dem Hinweis auf das
Beschwerderecht bei einer Aufsichtsbehörde und auf einen gerichtlichen Rechtsbehelf
(Art. 12 Abs. 4).

### 5.5 Eine Datenpanne (Art. 33 und 34)

Eine Datenpanne ist eine Verletzung der Sicherheit, die zur Vernichtung, zum Verlust, zur
Veränderung, zur unbefugten Offenlegung von oder zum unbefugten Zugang zu personenbezogenen Daten
führt (Art. 4 Nr. 12). Bei Night Courier zum Beispiel:

- ein Service-Role- oder Secret-Schlüssel oder das Datenbankpasswort ist nach außen gelangt;
- ein Verwaltungskonto (Supabase, Microsoft, Apple, Google) wurde übernommen;
- ein Vorfall bei Supabase (Supabase muss ihn unverzüglich melden, Art. 33 Abs. 2);
- ein verlorener oder gestohlener Rechner mit Exporten (Auskunft, Polizei);
- eine E-Mail mit Daten an die falsche Person, oder eine Rundmail mit offenen Empfängern;
- Daten, die versehentlich ins öffentliche Repository gelangt sind (zum Beispiel Screenshots);
- ein Fehler in einer Funktion, der jemandem Daten anderer zeigt.

Schritte:

1. **Eindämmen, sofort:** betroffene Schlüssel neu erzeugen (Supabase: API-Schlüssel bzw.
   JWT-Secret, Datenbankpasswort) und den neuen öffentlichen Schlüssel in einer neuen App-Version
   ausliefern; Sitzungen beenden; Konten mit neuem Passwort und Zwei-Faktor-Anmeldung sichern;
   gegebenenfalls Registrierung abschalten (`enable_signup`); eine fehlerhafte Funktion
   zurücknehmen.
2. **Zeitpunkt notieren, an dem die Panne bekannt wurde.** Von da an laufen 72 Stunden.
3. **Bewerten:** welche Daten, wie viele Personen und Datensätze, sind Minderjährige betroffen,
   waren Brieftexte dabei (sie können Sensibles enthalten), welche Folgen drohen.
   - Voraussichtlich **kein Risiko** für die Betroffenen: nicht melden, aber dokumentieren
     (Schritt 6).
   - **Risiko:** der Aufsichtsbehörde melden (Schritt 4).
   - **Hohes Risiko:** zusätzlich die Betroffenen benachrichtigen (Schritt 5).
4. **Meldung an die Aufsichtsbehörde** (Art. 33): unverzüglich und möglichst binnen 72 Stunden
   nach Bekanntwerden, über den Meldeweg der Landesbehörde (Abschnitt 1). Inhalt (Art. 33 Abs. 3):
   die Art der Verletzung, soweit möglich mit Kategorien und ungefährer Zahl der Betroffenen und
   Datensätze; Name und Kontakt (hier: der Betreiber selbst); die wahrscheinlichen Folgen; die
   ergriffenen oder vorgeschlagenen Maßnahmen. Was noch nicht feststeht, darf nachgereicht werden
   (Abs. 4). Wird es später als 72 Stunden, die Gründe für die Verzögerung angeben.
5. **Benachrichtigung der Betroffenen** (Art. 34) bei hohem Risiko: unverzüglich, in klarer und
   einfacher Sprache, mit mindestens den Angaben nach Art. 33 Abs. 3 lit. b bis d und dem, was die
   Person selbst tun kann (etwa ihr Passwort ändern, wenn sie es anderswo auch benutzt). Weg: E-Mail
   an die Adressen in `auth.users`; ohne eigenes SMTP aus dem eigenen Postfach, und dann nur einzeln
   oder in Blindkopie, nie mit offenen Empfängern. Die App selbst hat keinen Weg, alle zu
   erreichen. Ausnahmen in Art. 34 Abs. 3 – etwa eine öffentliche Bekanntmachung statt Einzel-
   nachrichten, wenn diese unverhältnismäßig aufwendig wären.
6. **Dokumentieren, jede Panne, auch die nicht gemeldeten** (Art. 33 Abs. 5): Was ist passiert, wann
   bekannt, welche Daten und wie viele Personen, Bewertung des Risikos mit Begründung, gemeldet ja
   oder nein (Datum), Betroffene benachrichtigt ja oder nein (Datum), Maßnahmen.
7. **Nacharbeiten:** die Ursache beheben und dieses Verzeichnis, die TOM und die Datenschutzerklärung
   anpassen.

### 5.6 Sperren nach spätestens zwei Jahren beenden

Die Entscheidung: Ein entferntes Konto bleibt zwei Jahre ab dem Entfernen gesperrt, dann wird es
gelöscht. Der Code setzt das um: `private.remove_account` sperrt für genau `private.ban_period()`,
und der tägliche Auftrag `tidy_up` löscht den Anmeldedatensatz, sobald die Sperre abgelaufen ist.
`banned_until` trägt damit das Ende der Sperre selbst; eine eigene Liste ist nicht nötig. Was der
Betreiber noch selbst tut:

- **Nie von Hand länger sperren.** Ein Konto entfernen nur mit:

  ```sql
  select private.remove_account('<reported_id>');
  ```

- **Bei einer Drohung** soll die meldende Person erst Kopien machen können, bevor die Briefe
  verschwinden (GO-LIVE, „A threat“; Datenschutzerklärung 3.8). `remove_account` sperrt und löscht
  in einem Schritt. Wer warten muss, sperrt zuerst nur und entfernt später:

  ```sql
  update auth.users set banned_until = now() + private.ban_period() where id = '<reported_id>';
  -- später, wenn die meldende Person Kopien hat:
  select private.remove_account('<reported_id>');
  ```

  Der erste Schritt sperrt ein Konto, das noch besteht, vorläufig; der zweite setzt die Sperre neu,
  und die zwei Jahre zählen ab dem Entfernen. GO-LIVE („Handling a report“, „A threat“)
  beschreibt genau diesen Ablauf, mit einer Woche Wartezeit, der E-Mail an die meldende Person und
  dem Export für die Polizei; die Datenschutzerklärung (3.7, 3.8) sagt dasselbe.

  **Den zweiten Schritt nicht vergessen.** Bis dahin bleibt das Konto mit Profil und allen Briefen
  bestehen, und `tidy_up` löscht nur gesperrte Konten _ohne_ Profil. Bliebe es dabei, wäre die
  Anmeldung nach zwei Jahren wieder offen und das Konto mit allem Übrigen wieder da. Diese Abfrage
  zeigt gesperrte Konten, die noch ein Profil haben; nach einer Woche muss jedes darin entfernt
  sein:

  ```sql
  select u.id, u.banned_until from auth.users u
  where u.banned_until > now()
    and exists (select 1 from public.profiles p where p.id = u.id);
  ```

- **Wahlweise beim Entfernen auch die Sitzungen löschen** (Lücke L7), bei einer Drohung erst nach
  dem Export. Sonst gehen sie mit `tidy_up` rund 91 Tage nach der Sperre. Vorher am lokalen Stack
  ausprobieren, dass die Sperre danach weiter greift (zu prüfen):

  ```sql
  delete from auth.sessions where user_id = '<reported_id>';
  ```

- **Einmal im Monat** (Kalendererinnerung) nachsehen, dass der Auftrag läuft (`succeeded`), dass
  er keinen Schritt überspringt und dass keine abgelaufene Sperre übrig ist. Die zweite Abfrage muss
  `{}` ergeben, die dritte 0; dazu die Abfrage oben nach gesperrten Konten mit Profil. `succeeded`
  allein genügt nicht: Ein übersprungener Schritt ist kein Fehler (4.5).

  ```sql
  select status, start_time from cron.job_run_details
  where jobid = (select jobid from cron.job where jobname = 'tidy-up')
  order by start_time desc limit 3;

  select private.tidy_up();

  select count(*) from auth.users u
  where u.banned_until is not null
    and u.banned_until < now()
    and not exists (select 1 from public.profiles p where p.id = u.id);
  ```

- **Nach zwei Jahren** ist sonst nichts zu tun. Bleibt eine abgelaufene Sperre doch stehen, läuft
  `tidy_up` nicht, oder es überspringt den Schritt: Dann nennt `select private.tidy_up();` ihn mit
  Grund (`expired bans: …`), oder der Fehler steht in `cron.job_run_details`. Bis das gelöst ist,
  den Datensatz von Hand löschen (Dashboard → Authentication → Users → Delete user).

### 5.7 Regelmäßig

- **Täglich:** neue Meldungen ansehen (GO-LIVE).
- **Monatlich:** nachsehen, dass `tidy-up` läuft (Status `succeeded` in `cron.job_run_details`)
  und `select private.tidy_up();` `{}` ergibt, dass keine abgelaufene Sperre übrig ist und kein
  gesperrtes Konto länger als eine Woche ein Profil hat (5.6); Testerlisten aufräumen; das
  Postfach nach der festgelegten Frist aufräumen; prüfen, dass keine Exporte (Auskunft, Polizei)
  mehr herumliegen.
- **Jährlich:** dieses Verzeichnis, die TOM und die Datenschutzerklärung durchgehen; Supabases
  Unterauftragsverarbeiter und die Fristen des Tarifs prüfen; das Datum unten eintragen.
- **Bei jeder Änderung**, die andere Daten erhebt oder sie anders verwendet – eine neue Spalte oder
  Tabelle, ein neues SDK, Push-Nachrichten, Avatare, eine Web-Version, ein Altersmerkmal für Google,
  ein neuer Dienst –: dieses Verzeichnis, die Datenschutzerklärung und die Store-Formulare
  (`app-store.md`, Abschnitt 3; `google-play.md`, Abschnitt 6) zusammen ändern.

---

## 6. Zu prüfen (gesammelt)

1. Ob Art. 30 Abs. 5 eine Privatperson überhaupt erfasst (das Verzeichnis wird so oder so geführt).
2. Die Rechtsgrundlage bei Nutzern unter 16 (Art. 6 Abs. 1 lit. b oder Art. 8; Verträge mit
   Minderjährigen).
3. § 25 Abs. 2 Nr. 2 TDDDG für die Sitzung auf dem Gerät.
4. Art. 9 für Briefe, die besondere Kategorien enthalten; Art. 10 für Meldungen über Straftaten;
   Art. 6 Abs. 4 bzw. § 24 Abs. 1 Nr. 1 BDSG für die freiwillige Weitergabe an die Polizei.
5. Art. 17 Abs. 3 lit. e als Grundlage dafür, Meldungen über die Kontolöschung hinaus zu behalten.
6. § 29 Abs. 1 Satz 2 BDSG für die Notiz der meldenden Person bei einer Auskunft.
7. Ob eine Datenschutz-Folgenabschätzung (Art. 35) nötig ist, und damit nach § 38 Abs. 1 Satz 2
   BDSG ein Datenschutzbeauftragter.
8. Supabase: der Weg zum DPA, welche Module der Standardvertragsklauseln er enthält, die
   Unterauftragsverarbeiter (Cloudflare vor der API? Ort der Protokolle?), ob eine
   Transfer-Folgenabschätzung nötig ist oder das EU-US Data Privacy Framework greift; die
   Verschlüsselung gespeicherter Daten.
9. Supabase-Tarif: Aufbewahrung der Protokolle (kostenlos vermutlich ein Tag), Sicherungen und ihre
   Dauer, ob Sitzungs-Höchstdauer und Inaktivitäts-Timeout verfügbar sind.
10. GoTrue und Postgres gehostet: ob `select private.tidy_up();` `{}` ergibt, die Rolle `postgres`
    also jeden Schritt an den Tabellen von Supabase ausführen darf (sonst überspringt `tidy_up`
    diesen Schritt und nennt ihn, und `delete_own_account` überspringt das Löschen im
    Anmeldeprotokoll still, 4.5); ob `tidy-up` in `cron.job` steht; ob `ip_address` im
    Anmeldeprotokoll gefüllt wird; dass Abmelden die Sitzungen löscht; dass eine abgelehnte
    Erneuerung eines gesperrten Kontos `updated_at` der Sitzung nicht setzt; ob
    `GOTRUE_DB_CLEANUP_ENABLED` gesetzt ist und, wenn nicht, ob `tidy_up` ersetzte Refresh-Token
    selbst löschen kann; Bereinigung abgelaufener Einmal-Token; ob die Sperre greift, wenn beim
    Entfernen auch die Sitzungen gelöscht werden.
11. Microsoft: Rolle, Vertrag und Drittlandgrundlage für das Outlook.com-Postfach.
12. Apple und Google: ihre Rolle bei Testerdaten; was App Store Connect bei Testern über einen
    öffentlichen Link zeigt; die Felder in Feedback und Absturzberichten; ob Feedback gelöscht
    werden kann; Pre-Launch-Berichte im internen Test; ihre Aufbewahrungsfristen.
13. Der E-Mail-Versanddienst und der Hoster der Webseiten, sobald gewählt: Sitz, Vertrag,
    Protokolle, Fristen.
14. iOS: ob Schlüsselbund-Einträge die Deinstallation überleben; dass die gebaute Info.plist
    keinen Face-ID-Hinweis mehr enthält.
15. Wie nach dem Zurückspielen einer Sicherung erkannt wird, welche Konten erneut zu löschen sind.
16. Der Weg im Dashboard, um Benutzername oder E-Mail-Adresse zu berichtigen.
17. Ob bei einer Löschung die Polizei nach Art. 19 zu informieren ist, wenn sie eine Meldung
    bekommen hat.
18. Wie lange Nachweise über erledigte Betroffenenanfragen aufbewahrt werden.
19. Ob die Auskunft offenlegen muss, wer die Person blockiert hat (Art. 15 Abs. 4; 5.3).
20. Expo Go in der Entwicklung: ob Expo dabei Daten erhält (Abschnitt 2).

---

## Änderungsverlauf

| Datum            | Änderung                                                                                                                                                                                                                                                                                                               | Letzte Prüfung durch den Betreiber |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 4. November 2026 | Erste Fassung aus dem Datenbestand des Codes                                                                                                                                                                                                                                                                           | –                                  |
| 4. November 2026 | Gegen den Code bis Commit 665924d geprüft: 90 Tage für unbenutzte Sitzungen, Ablauf bei einer Drohung, Verhalten von `tidy_up` bei fehlenden Rechten, Auskunftsabfrage, Polizei als Empfänger von Anmeldedaten                                                                                                         | –                                  |
| 4. November 2026 | Gegen den Code bis Commit 31cf850 geprüft: jeder Schritt von `tidy_up` abgesichert, Prüfung mit `select private.tidy_up();` statt der Rechteabfrage; Android-Berechtigungen; Konto eines Kindes unter 12 ohne Sperre löschen; zwei Jahre Sperre ab dem Entfernen; Anschrift öffentlich nur in der Datenschutzerklärung | –                                  |
