# 58 · Daten mitnehmen und zurückbringen

Export und Import eines Haushalts als eine JSON-Datei.

## Was vorher da war

Ein Knopf „Export anfordern". Er legte eine Zeile in `export_jobs` mit `state: 'queued'` an,
schrieb ein Ereignis ins Ledger – und **kein Job hat diese Zeile je verarbeitet**. Die
Oberfläche meldete „Du bekommst Bescheid, sobald er bereitsteht"; es passierte nie etwas.
Der Text daneben versprach zusätzlich „JSONL und lesbare Textdateien", die es nie gab.

Ein Haushalt ist klein – der Demohaushalt ergibt **22 kB**. Dafür braucht es keine
Warteschlange, keinen Ablageort und keinen Zustellweg: Die Daten gehen direkt über die
Leitung.

## Das Format

```jsonc
{
  "format": "thealotta.household",
  "version": 1,
  "exportedAt": "2026-09-10T…",
  "household": { "name": "…", "timezone": "Europe/Berlin" },
  "bereiche": [], "angaben": [], "werte": [],
  "wissen": [], "fragen": [], "entscheidungen": [],
  "regeln": [], "vorgaenge": [], "aufgaben": [], "abhaengigkeiten": [],
  "personen": [], "mitglieder": [], "zustaendigkeiten": []
}
```

**Was mitgeht:** die Struktur (Bereiche mit Baum, Wichtigkeit, Sichtbarkeit), das Wissen
(Angaben samt Werten, Notizen, offene Fragen, Entscheidungen), die Regeln, die laufende
Arbeit (Vorgänge, Aufgaben, Abhängigkeiten) und die Personen ohne Zugang.

**Was nicht mitgeht:** Zugänge, Passwörter, Sitzungen, Geräte, Benachrichtigungen und der
Ereignisverlauf. Eine Sicherungsdatei ist kein Konto. Ein Test hält das fest – er sucht in
der erzeugten Datei nach `passwordHash`, `session` und Adressen.

Weggelassen werden außerdem Zeitstempel und Zählerstände der Zeilen (`createdAt`, `version`,
`lastEvaluatedAt` …): Sie gehören zum alten Leben einer Zeile, nicht zur Sache selbst. Ebenso
`physicalEnergy`, `focusRequired` und `socialLoad` – drei Spalten, die in der Datenbank noch
stehen, deren Bedeutung aber im Audit entfernt wurde. Sie zu exportieren hieße, eine
zurückgenommene Entscheidung wieder mitzuschleppen.

## Lesbar geschrieben

Die Datei ist eingerückt und ohne leere Felder:

| | vorher | nachher |
| --- | --- | --- |
| Zeilen | **1** | 652 |
| Zeichen | 22 957 | 21 264 |
| längste Zeile | 22 957 | **69** |

Fastify schreibt ohne Zutun eine einzige Zeile – für eine Maschine gleichwertig, für einen
Menschen unbrauchbar. Eine Datei, die man mitnehmen kann, sollte man auch aufmachen können.
Die Einrückung kostet nichts, weil die entfallenen `null`-Felder sie aufwiegen: Eine Zeile
`"note": null` ist nicht vollständiger als gar keine, nur länger. Beim Einlesen ist ein
fehlendes Feld ohnehin dasselbe wie ein leeres.

Kennungen bleiben als solche stehen, lösen sich aber **innerhalb der Datei** auf: `createdBy`
und `assigneeMembershipId` verweisen auf die Liste `mitglieder`, die Namen trägt. Die Datei
ist damit für sich lesbar, ohne dass ein Name mehrfach darin steht.

## Import: immer Ergänzung, nie Ersatz

Ein Import legt neue Objekte an und lässt Bestehendes unberührt. Das ist die einzige
Variante, die nichts zerstören kann: Wer sich vertut, hat danach zu viel und kann es löschen –
nicht zu wenig und muss es neu erfinden.

**Kennungen werden neu vergeben.** Beziehungen bleiben, weil die alte Kennung auf die neue
abgebildet wird. Zeigt ein Verweis auf etwas, das nicht mitkam, wird er zu `null`, statt die
Zeile scheitern zu lassen.

**Bereiche kommen in Baumreihenfolge** – ein Kind erst nach seinem Elternteil, sonst zeigt
sein `parentId` ins Leere. Der `path` wird neu gebaut; die alten Pfade gehören zu einem
anderen Haushalt.

**Zuständigkeiten kommen ausdrücklich nicht mit.** Sie zeigen auf Mitglieder, und die
Mitglieder einer fremden Datei sind in diesem Haushalt niemand. Wer welchen Bereich trägt,
entscheidet der Haushalt – nicht die Datei. Der Import sagt das auch: *„8 Zuständigkeiten –
wer welchen Bereich trägt, entscheidet ihr, nicht die Datei."* Dasselbe gilt für
Aufgabenzuweisungen.

## Abgewiesen wird

| Fall | Meldung |
| --- | --- |
| Kein lesbares JSON | „Diese Datei ist kein lesbares JSON." |
| Anderes Format | „Das ist keine Thealotta-Sicherungsdatei." |
| Andere Fassung | „Diese Datei ist in Fassung 99 geschrieben, gelesen wird Fassung 1." |

Abgewiesen heißt: gar nichts eingelesen. Es gibt keinen halben Import.

## Endpunkte

| | |
| --- | --- |
| `GET /households/:id/export` | liefert das Dokument mit `content-disposition: attachment`, Dateiname `thealotta-<haushalt>-<datum>.json` |
| `POST /households/:id/import` | nimmt das Dokument, antwortet mit `{ angelegt, uebersprungen }` |

Rechte: Export braucht `export:request`, Import `household:manage`. Beides wird im
Prüfprotokoll vermerkt (`export.completed`, `household.imported`).

Der alte `POST /exports` bleibt bestehen, weil er im Ledger auftaucht – benutzt wird er von
der Oberfläche nicht mehr.

## Robustheit beim Einlesen

Beim Erstellen einer Beispieldatei von Hand kamen zwei Fehler heraus, die jede fremde Datei
getroffen hätten:

| Fall | vorher | jetzt |
| --- | --- | --- |
| Slug enthält ein Zeichen, das `ltree` nicht erlaubt (`me-time`) | 500, ohne Hinweis auf die Zeile | Slug wird neu gebildet |
| Slug ist im Zielhaushalt schon vergeben | 500 beim **zweiten** Import derselben Datei | Zählsuffix, beide Bäume stehen nebeneinander |
| Feld fehlt, dessen Spalte `NOT NULL` mit Vorgabewert ist (`conflict_window`) | 500 | Feld wird weggelassen, die Vorgabe greift |

Ein vierter kam beim Benutzen heraus – und er war der teuerste, weil der Import ihn nicht
gemeldet hat:

**Angaben kamen ohne ihren Wert an.** INV-010 verlangt, dass jede Angabe mit einem
ausdrücklichen `unknown` beginnt: „Wir wissen es nicht" ist eine Aussage, kein leeres Feld.
Der Import legte nur die Definition an. Die Zahlen stimmten, der Baum stand, die Regeln waren
da – aber jede Bereichsseite **mit Angaben** lief in ein 404: *„Dieser Bereich konnte nicht
geladen werden."* Betroffen waren fünf von einundzwanzig Bereichen, gerade so wenige, dass es
nach Zufall aussah.

Daraus folgt der Test, der gefehlt hat: Nach einem Import wird **jede Ansicht aufgerufen** –
alle Bereichsseiten, alle Vorgänge, `/now`, `/overview`, die Querlisten. Zählen genügt nicht;
man muss die Seiten auch aufmachen.

Der dritte Punkt war eine ganze Fehlerklasse: Ein ausdrückliches `null` hebelt den
Vorgabewert einer Spalte aus. Seitdem laufen **alle** Einfügungen des Imports durch einen
Filter, der leere Felder entfernt – die Datenbank entscheidet dann, wie sie es immer täte.

## Beispieldatei

`ops/beispiele/mental-load.json` – eine von Hand geschriebene Vorlage: 21 Bereiche,
10 Angaben, 15 Regeln, 14 Aufgaben, 3 Notizen. Ein Test liest sie bei jedem Lauf ein und
prüft Baum, Regeln und Angaben; eine Vorlage, die beim ersten Versuch abgewiesen wird, ist
schlimmer als keine.

## Alle Einträge löschen

Zwischen Mitnehmen und Zurückbringen steht der dritte Weg: den Haushalt leeren, ohne ihn
aufzugeben. Gelöscht wird **genau das, was ein Export mitnimmt** – wer die Datei vorher
speichert, kann alles zurückbringen.

**Nicht gelöscht:** der Haushalt selbst, die Mitglieder mit Zugang samt Einstellungen und
Geräten, sowie der Ereignisverlauf. Wer den ganzen Haushalt loswerden will, nimmt die
Löschung mit Karenzzeit – dieser Weg ist zum Neuanfangen, nicht zum Verschwinden.

**Die Bestätigung ist ein eigenes Wort:** `ALLES LÖSCHEN`, wörtlich getippt. Ausdrücklich
nicht der Haushaltsname – den verlangt schon die Haushaltslöschung darunter. Zwei
zerstörende Handlungen mit derselben Eingabe wären eine Falle: Wer im falschen Dialog das
Richtige tippt, merkt es erst danach. Geprüft wird das Wort **im Dienst**, nicht nur im
Formular; ein Schutz, den nur der Client kennt, ist keiner.

### Die Belege – eine Rechtefrage, kein Fehler

`signals` und `state_observations` waren für die Anwendung anhängend: Migration 0003 nimmt
ihr `UPDATE` **und** `DELETE`. Der Grund ist gut – niemand soll umschreiben können, was eine
Regel gesehen oder eine Person gemeldet hat.

Dasselbe Recht verhinderte aber, dass ein Haushalt seine Daten vollständig löscht: Beide
Tabellen hängen mit `ON DELETE RESTRICT` an Bereichen und Angaben. Ohne Löschrecht bliebe
jeder Bereich stehen, an dem je eine Regel gelaufen ist – nach kurzer Zeit also jeder.

Migration **0008** löst das mit einem Unterschied, auf den es ankommt: Einen Beleg **ändern**
heißt, die Vergangenheit anders darzustellen. Ihn **löschen** heißt, ihn zu beenden –
zusammen mit der Sache, zu der er gehört. `UPDATE` bleibt entzogen, `DELETE` wird erteilt.

## Geprüft

| | |
| --- | --- |
| API | 19 Tests: Inhalt, keine Zugangsdaten, Dateikopf, Struktur im Zielhaushalt mit neuen Kennungen, Baum bleibt Baum, Zuständigkeiten bleiben draußen, fremde Dateien, lesbare Formatierung, zweimaliger Import; Leeren: Wortprüfung, Umfang, Haushalt bleibt, Belege, leerer Haushalt |
| Browser | 4 Tests: der Knopf liefert wirklich eine Datei; unbrauchbare Dateien ergeben eine verständliche Auskunft; die Bestätigung sperrt, bis das Wort stimmt; die beiden zerstörenden Wege verlangen Verschiedenes |
| Gemessen | Demohaushalt: 22 622 Bytes – 13 Bereiche, 3 Angaben, 4 Regeln, 15 Aufgaben, 9 Abhängigkeiten |
