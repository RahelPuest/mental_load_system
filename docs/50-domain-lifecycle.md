# 50 – Bereiche ändern, archivieren, löschen

Bereiche ließen sich anlegen und danach nicht mehr anfassen: Ein Tippfehler im Namen blieb
stehen, ein falsch einsortierter Bereich blieb, wo er war, und ein versehentlich angelegter
blieb für immer. Die Fähigkeit fehlte auf allen Ebenen – kein Dienst, keine Route, keine
Oberfläche.

## Drei Wege, nicht einer

| Weg | Wann | Was passiert |
| --- | --- | --- |
| **Bearbeiten** | Name, Wichtigkeit, Beschreibung, Platz im Baum stimmen nicht mehr | Ändert sich sofort überall; Unterbereiche wandern mit |
| **Archivieren** | „Brauche ich nicht mehr" | Verschwindet aus den Listen, **behält alles**; jederzeit umkehrbar |
| **Löschen** | „Das war ein Versehen" | Nur bei leerem Bereich; sonst nennt die Meldung, was drinsteht |

Archivieren ist der übliche Weg. Löschen ist die Ausnahme für den Fall, in dem nichts
verloren gehen *kann* – dann ist es kein Verlust, sondern eine Korrektur.

## Der Pfad ist das Heikle

Jeder Bereich trägt einen `ltree`-Pfad, und der steckt auch in jedem seiner Nachkommen. Ein
neuer Name ergibt einen neuen Slug und damit einen neuen Pfad; ein Umzug ebenso. Wird der
Teilbaum nicht mitgezogen, hängt ein halber Baum an einem Namen, den es nicht mehr gibt –
sichtbar erst irgendwann später und dann schwer zuzuordnen.

```sql
UPDATE domains
   SET path = :newPath::ltree || subpath(path, nlevel(:oldPath::ltree))
 WHERE household_id = :hh AND path <@ :oldPath::ltree AND id <> :id
```

Das ist gefahrlos, weil Pfade **ausschließlich** in dieser Tabelle stehen: Berechtigungen und
Vererbung arbeiten mit Bereichs-IDs und lesen die Pfade bei jeder Anfrage neu.

Die Reihenfolge ist nicht beliebig – erst der Bereich, dann seine Nachkommen. Der bestehende
Trigger `check_domain_tree` prüft bei jeder Zeile, dass ihr Pfad unter dem ihres
übergeordneten Bereichs liegt; andersherum stünde ein Kind kurzzeitig unter einem Pfad, den
es noch nicht gibt.

Zyklen fängt der Dienst ab, bevor die Datenbank es tut: Ein Bereich kann weder in sich selbst
noch unter einen seiner eigenen Unterbereiche wandern.

## Löschen sagt, warum nicht

Jeder Fremdschlüssel auf `domains` steht auf `RESTRICT` – 16 Tabellen. Die Datenbank
verweigert das Löschen eines Bereichs mit Inhalt also ohnehin. Ohne Vorprüfung käme dabei ein
Datenbankfehler heraus, und der Mensch läse „Unerwarteter Fehler."

Der Dienst zählt deshalb vorher und schreibt einen Satz:

> In „Schuhe" steht schon etwas: 13 Aufgaben, 1 Angabe, 1 offene Frage, 1 Entscheidung,
> 1 Beobachtungsregel, 1 Vorgang, 2 Abläufe, 1 Bedarf. Löschen würde das mitnehmen –
> archiviere den Bereich stattdessen, dann bleibt alles erhalten.

Einzahl und Mehrzahl stehen dabei ausgeschrieben. „1 Vorgänge" ist kein Deutsch, und dieser
Satz erscheint in einem Moment, in dem jemand etwas Zerstörerisches vorhat – gerade da soll
er nicht holpern.

Zuständigkeiten und Vertretungen werden beim Löschen mitgenommen: Sie sind Aussagen *über*
den Bereich und ohne ihn gegenstandslos. Was jemand angelegt hat, ist nie betroffen – gäbe es
davon etwas, käme man gar nicht bis hierher.

## Ein Fund, der weit über diese Funktion hinausgeht

Eine Fehlerantwort trägt zwei Texte: `title` ist die Kategorie („Konflikt."), `detail` der
Satz, den jemand für genau diesen Fall geschrieben hat. Der Server hat `detail` immer
mitgeschickt. Die Oberfläche hat ihn immer verworfen:

```ts
throw new ApiError(status, code, problem.title ?? '…', problem.detail)   // detail: nie benutzt
```

Jede Meldung in der App zeigte damit nur die Kategorie. „Es muss mindestens eine Person die
Verwaltung übernehmen können" wurde zu „Konflikt."; meine Löschmeldung zu „Fehler." Der
Fehler fiel erst auf, weil hier zum ersten Mal ein Satz gebraucht wurde, den *nur* der Server
kennt. `ApiError.message` ist jetzt das Genauere von beidem, `title` bleibt als Kategorie
erhalten.

### Und was dabei ans Licht kam

Sobald der ausführliche Satz angezeigt wird, wird auch sichtbar, wie er formuliert ist. Die
Ablehnungen der Rechteprüfung lauteten:

> Für „domain:archive" liegt keine Berechtigung vor.

Modellbezeichner, die niemandem etwas sagen (§3.1) – jahrelang unauffällig, weil sie nie
jemand zu sehen bekam. Betroffen waren auch die Einstufungen („health", „sensitive") und die
Geltungsebenen („household", „domain"). Alle vier Ablehnungsgründe sind jetzt deutsche Sätze;
der maschinenlesbare Teil steht unverändert in `matchedRule` und in den Details der Ausnahme.
`packages/domain/test/authz.spec.ts` prüft jeden Ablehnungsgrund gegen eine Liste von
Modellbegriffen.

## Wo es steht

### Auf der Bereichsliste: ein Bearbeiten-Modus

`/bereiche` hat einen Knopf **„Bearbeiten"**. Er schaltet die Liste in einen Modus, in dem
jede Zeile einen Griff und zwei Knöpfe trägt:

| | |
| --- | --- |
| ⠿ Griff | **Ziehen**: senkrecht die Reihenfolge, waagerecht die Ebene |
| ↑ | Eine Ebene höher – als eigener Knopf |
| ✦ | Farbe – die zwölf Töne klappen unter der Zeile auf |
| 🗑 | Löschen, mit zweiter Bestätigung in derselben Zeile |

„Eine Ebene höher" hat trotz Ziehen einen eigenen Knopf: Waagerecht auf die richtige Stufe zu
treffen ist die fummeligste Bewegung von allen, und „raus aus diesem Bereich" ist der
häufigste Wunsch beim Aufräumen. Auf der obersten Ebene ist er deaktiviert – das sieht man der
fehlenden Einrückung ohnehin an, und ein Knopf, der jedes Mal dasselbe antwortet, ist Lärm.

Der Pfeil zeigt nach oben, nicht nach links. Im Baum ist die Bewegung waagerecht, gemeint und
gesagt wird aber „hoch"; verwechseln kann man ihn nicht, weil kein zweiter Pfeil in der Zeile
steht.

Ein ausdrücklicher Modus statt dauerhafter Bedienelemente: Sie sind beim Ansehen im Weg und
beim Umbauen genau richtig. Im Normalzustand ist keines davon da – ein Test hält das fest.

**Ziehen ist nicht der einzige Weg.** Hat der Griff den Fokus, bewegen die Pfeiltasten
dieselbe Zeile: ↑↓ die Reihenfolge, →← die Ebene. Das ist keine Nettigkeit, sondern
Bedingung (WCAG 2.5.7 „Dragging Movements"), und es steht in der Vorlesebeschriftung des
Griffs, damit man es auch erfährt. Umgesetzt über Zeigerereignisse statt der
HTML5-Ziehschnittstelle – die kennt kein Berührungsgerät.

**Während des Zugs ist zu sehen, wohin es fällt:** Die aufgenommene Zeile tritt zurück, und
eine Einfügemarke zeigt Stelle *und* Ebene. Ohne die Einrückung der Marke wäre „eine Ebene
tiefer" unsichtbar – man erführe es erst nach dem Loslassen.

#### Wohin ein Zug fällt

Die Rechnung steht getrennt in `apps/web/src/lib/tree-drag.ts`, ohne Zeigergesten und
Bildschirmkoordinaten. Ein Baum, der beim Loslassen woanders landet als angezeigt, ist schwer
zu bemerken und noch schwerer zu erklären – also gehört das an eine Stelle, die man ohne
Ziehen prüfen kann (zwölf Fälle in `apps/web/test/tree-drag.spec.ts`).

Die senkrechte Position ergibt die Lücke, die waagerechte die Ebene. Zwei Grenzen halten den
Baum heil:

- höchstens **eine Stufe tiefer** als die Zeile darüber – sonst hinge die Zeile in der Luft;
- mindestens **so tief wie die Zeile darunter** – sonst würde die zur Waise, weil ihr
  übergeordneter Bereich plötzlich unter ihr stünde.

Der eigene Teilbaum fällt als Ziel weg: Ein Bereich kann nicht in sich selbst.

#### Ein Ziel statt einer Richtung

Beim Ziehen kennt der Client das Ziel als Ganzes. `POST …/reposition` nimmt `parentId` und
`beforeId` entgegen und setzt beides in einem Zug. Eine Folge von `move`-Schritten daraus zu
bauen wäre nicht nur umständlich, sondern falsch: Dazwischen stünde der Baum jeweils in einem
Zustand, den niemand haben wollte. `move` bleibt für die Tastatur – dort *ist* die Eingabe
eine Richtung.

`position` gab es in der Tabelle seit jeher, ungenutzt: Die Liste war nach Pfad sortiert, also
alphabetisch. Beim ersten Verschieben bekommen die Geschwister Positionen in genau der
Reihenfolge, in der sie ohnehin schon standen – nichts springt.

**Meldungen stehen an ihrer Zeile.** Oben auf der Seite stünden sie weit weg von dem, was sie
ausgelöst hat. Und der Ton unterscheidet: „steht schon ganz oben" ist eine Auskunft (ruhig),
„da steht schon etwas drin" eine Ablehnung (auffällig). Am Ende einer Liste anzukommen ist
kein Fehler.

### Auch auf der Seite des Bereichs

Ganz unten, als eigener Abschnitt **„Diesen Bereich verwalten"**.
Die drei Wege stehen dort ausgeschrieben nebeneinander, jeder mit seiner Folge im Klartext –
nicht hinter „…" (§19). Löschen verlangt eine zweite, ausdrücklich benannte Bestätigung
(„Wirklich löschen") und steht als einziger Knopf in der zerstörerischen Variante.

**Der erste Anlauf war nicht auffindbar.** Der Abschnitt lag als dritter von sieben
Aufklappern innerhalb von „Mehr zu diesem Bereich" – einer Überschrift, die nach
Nachschlagematerial *über* den Bereich klingt, nicht nach Verwaltung *des* Bereichs. Ohne
einen Klick war nichts davon sichtbar, und wer „löschen" suchte, hatte keinen Grund, dort
hineinzusehen. Existieren und auffindbar sein sind zwei verschiedene Dinge (§31).

Jetzt ist es ein Abschnitt mit eigener Überschrift: Er steht in der Gliederung der Seite und
ist beim Überfliegen der Überschriften zu finden. Ganz unten und in zurückgenommenen Knöpfen
– man kommt selten hierher, aber wenn, dann gezielt. Ein E2E-Test prüft, dass alle drei
Knöpfe **ohne einen einzigen Klick** sichtbar sind.

Der Bogen zum Bearbeiten bietet als neuen übergeordneten Bereich nur an, was auch möglich
ist: Der Bereich selbst und alles darunter fallen weg. Der Server weist das ohnehin ab – aber
eine Auswahl anzubieten, die dann scheitert, ist eine Falle.

## Prüfungen

| Datei | Was sie festhält |
| --- | --- |
| `apps/api/test/domain-lifecycle.spec.ts` | Umbenennen und Verschieben ziehen Kinder **und Enkel** mit; kein Zyklus; nicht mitgeschickte Felder bleiben; Archivieren ist umkehrbar; Löschen nennt den Inhalt in richtiger Zahl |
| `apps/web/e2e/domain-manage.spec.ts` | Die drei Wege auf der Seite des Bereichs, samt zweiter Bestätigung und der Meldung des Servers im Wortlaut |
| `apps/web/e2e/domain-edit.spec.ts` | Der Bearbeiten-Modus: nichts im Normalzustand, Ziehen für Reihenfolge und Ebene, Einfügemarke, Pfeiltasten als zweiter Weg, Farbe, Löschen |
| `apps/web/test/tree-drag.spec.ts` | Wohin ein Zug fällt – Grenzen des Baums, eigener Teilbaum, Nullzug |
| `apps/web/e2e/touch.spec.ts` | Die sechs Werkzeuge sind mit dem Finger treffbar, und der Name bleibt daneben lesbar |
| `apps/web/test/flows.spec.tsx` | `ApiError` trägt den ausführlichen Satz, nicht die Kategorie |
| `apps/api/test/tenant-isolation.spec.ts` | Die vier neuen Routen sind mandantengetrennt – automatisch |

---

# Die Ansicht eines Bereichs

Zwei Dinge stimmten nicht: Der Name stand zweimal untereinander, und die Seite war nach nichts
geordnet.

## Der Name stand zweimal

Über der Überschrift stand der volle Pfad als Text – `Kinder / Kind A / Kleidung / Schuhe`
über `Schuhe`. Kein Zufall, sondern das Ergebnis von `prettyPath`, das den Bereich selbst
einschließt.

Aus dem Pfad sind **Brotkrumen** geworden: dieselbe Kette, aber anklickbar und **ohne den
letzten Teil**. Der steht direkt darunter als Überschrift. Ein Klick auf `Kind A` führt dorthin,
`Bereiche` zurück zur Liste. Der frühere „Alle Bereiche"-Knopf darüber entfällt – die erste
Krume tut dasselbe.

Übergeordnete Bereiche, die man nicht sehen darf, fehlen in der Kette. Eine Krume, die ins
Nichts führt, wäre schlimmer als eine fehlende.

## Die Reihenfolge

Vorher begann die Seite mit „Läuft gerade", während Verantwortung, Beobachtung und
Entscheidungen – die Begriffe, auf denen alles andere aufsetzt – in einer Nebenspalte unter
**„Mehr zu diesem Bereich"** lagen. Diese Überschrift sagt nichts darüber, was darunter steht,
und die sechs Aufklapper hatten miteinander nichts zu tun (§17: „Mehr" darf keine Müllhalde
sein).

Jetzt folgt die Seite der Reihenfolge, in der ein Bereich entsteht:

| | Abschnitt | Was drinsteht |
| --- | --- | --- |
| Kopf | Brotkrumen, Name, **wer mitdenkt** | Die Auskunft, nicht das Formular |
| | Unterbereiche | Der Weg nach unten – Gegenstück zu den Krumen |
| 1 | **Was wir wissen** | Angaben · Notizen und Fragen · Entscheidungen |
| 2 | **Worauf wir achten** | Beobachtungsregeln |
| 3 | **Läuft gerade** | Hinweise, Vorgänge, Bedarfe |
| 4 | **Diesen Bereich verwalten** | Bearbeiten, Archivieren, Löschen · Übergabe · Verlauf · Farbe |

## Der erste Anlauf war überladen

Der Zwischenstand hatte die Reihenfolge richtig, aber alles zu einem eigenen Abschnitt
befördert: acht gleichrangige Überschriften, nichts mehr eingeklappt, 3165 px hoch. Eine
Reihenfolge zu haben heißt nicht, dass alles gleich viel Platz bekommt.

Gemessen, wo die Länge herkam:

| Abschnitt | Höhe | Inhalt |
| --- | ---: | --- |
| **Wer mitdenkt** | **920 px** | fast nur Formulare zum Übergeben und Beteiligen |
| Was wir wissen | 778 px | echter Inhalt |
| Diesen Bereich verwalten | 545 px | drei Wege mit ihren Folgen |
| Worauf wir achten | 213 px | eine Regel |
| Läuft gerade | 111 px | ein Vorgang |

Der längste Abschnitt der Seite war der mit dem wenigsten Inhalt. **Wer mitdenkt** ist eine
Auskunft von einer Zeile – wer, wie wichtig, und ein Weg zum Ändern. Die Formulare dahinter
öffnen sich jetzt in einem Bogen. Ist niemand zuständig, steht „Ich übernehme das" direkt
neben der Lücke: die häufigste Handlung dieser Seite gehört nicht hinter einen Klick.

Die Nebenspalte ist weg – bei vier Abschnitten trägt eine zweite Spalte nichts mehr.

| | vorher | Zwischenstand | jetzt |
| --- | ---: | ---: | ---: |
| Abschnitte oberster Ebene | 5 | 8 | **4** |
| Bedienelemente | 28 | 28 | **23** |
| Größe-Gewicht-Paare | 12 | 11 | **10** |
| Höhe | 3165 px | 3165 px | **2453 px** |

## Hierarchie statt Gleichrang

Angaben, Notizen, Fragen und Entscheidungen sind alle dasselbe: was ihr über den Bereich
wisst. Als drei gleichrangige Abschnitte standen sie nebeneinander, als wären es drei Themen.
Jetzt ist es eines mit drei Teilen.

`Section` staffelt die Überschriftenebene von selbst (h2 → h3) – die **Größe musste folgen**,
sonst behauptet das Markup eine Hierarchie, die im Bild nicht steht. Vier sichtbare Stufen:

```
26 px  Schuhe
20 px    Was wir wissen
17 px      Angaben · Notizen und Fragen · Entscheidungen
15 px        ▸ Wissensübergabe · Was hier passiert ist · Farbe
```

`apps/web/e2e/domain-view.spec.ts` misst diese Staffelung nach: Ein h3, das so groß ist wie
sein h2, lässt den Test fehlschlagen.

## Visuelle Trennung

Die Abschnitte standen nach dem Umbau nur durch Weißraum getrennt da – kein Strich, keine
Fläche, nichts als 52 px Luft. Gemessen war das Verhältnis zwar richtig (14 px von der
Überschrift zu ihrem Inhalt gegen 52 px zum Abschnitt davor, also Nähe als Gruppierung), aber
auf einer 2400 px langen Seite ist Weißraum kein Einschnitt, sondern eine Pause.

**Eine Haarlinie zwischen Abschnitten.** Sie sitzt näher am folgenden Abschnitt als am vorigen
(40 px darüber, 28 px darunter) – dadurch gehört sie sichtbar zu dem, was sie einleitet,
statt zwischen beiden zu schweben.

Die Linie benutzt `--border`, nicht `--border-subtle`. Das Designsystem hat drei Randstufen
mit eigenen Untergrenzen (1.1 / 1.45 / 1.8 gegen ihre Fläche); die feinste ist für
Kartenkanten gedacht, wo die Füllung die Arbeit tut. Eine Linie, die für sich allein die
Struktur trägt, muss man auch auf einem gedimmten Bildschirm sehen: 1.14:1 → **1.43:1** hell,
1.38:1 → **1.77:1** dunkel.

**Eine Fläche je Abschnitt.** Vorher war es uneinheitlich: „Was wir wissen" hatte drei Kästen
nebeneinander, „Worauf wir achten" einen eingesenkten, „Läuft gerade" gar keinen. Jetzt trägt
jeder Abschnitt genau eine Karte, und Kästen stapeln sich nicht mehr – ein innerer Kasten
verliert Rahmen und Füllung und wird zum Abschnitt seiner Fläche, getrennt durch eine feine
Linie (`.panel .panel`).

**Und eine Verdopplung, die ich selbst eingebaut hatte:** Zuständigkeit und Wichtigkeit
standen zweimal – in der neuen Kopfzeile und im alten Chip-Block darunter. Genau der Fehler,
mit dem dieser Durchgang angefangen hat.

| | vorher | jetzt |
| --- | ---: | ---: |
| Trennlinien zwischen Abschnitten | keine | 3 |
| Kontrast der Linie (hell / dunkel) | – | 1.43 / 1.77 |
| Flächen in „Was wir wissen" | 3 nebeneinander | 1 mit drei Teilen |
| sichtbar verschachtelte Kästen | 3 | **0** |
| Höhe | 2453 px | 2388 px |

## Der Fehler, den das gekostet hat

Beim Umbau war ein `{!isNew && …}` im Spiel: Solange nichts im Bereich stand, blieben mehrere
Abschnitte ausgeblendet – damit nicht „vier leere Hüllen untereinander" stehen.

Das war richtig, **solange die Optionen in einer Nebenspalte lagen**: Beobachtung, Entscheidungen
und Verantwortung waren dort immer sichtbar, man konnte also trotzdem etwas anlegen. Als sie in
die Hauptspalte wanderten und die Nebenspalte wegfiel, kam die Bedingung mit – und plötzlich
zeigte ein leerer Bereich nur noch einen Hinweis und die Verwaltung. **Kein Weg mehr, ihn zu
füllen.** Ausgerechnet dort, wo man es am ehesten will.

Neun von dreizehn Bereichen im Testbestand sind leer; sichtbar war das trotzdem in keinem Test,
weil alle Prüfungen auf „Schuhe" liefen – den einen Bereich mit Inhalt.

**Die Antwort auf leere Hüllen ist nicht Verstecken, sondern ein knapper Leerzustand.**
`EmptyState` (Symbol, Titel, Absatz, Knopf) ist für Seiten gedacht, auf denen sonst nichts
steht. Viermal untereinander ergibt er eine leere Seite, die **länger ist als eine volle**:

| | leerer Bereich | voller Bereich |
| --- | ---: | ---: |
| mit `EmptyState` | 2728 px | 2388 px |
| mit `EmptyLine` | **2351 px** | 2388 px |

`apps/web/e2e/domain-view.spec.ts` prüft jetzt einen leeren Bereich mit: dieselben vier
Abschnitte, in jedem ein Weg ihn zu füllen, und nicht länger als ein voller.

## Die Abstände an den Trennlinien

Die Linien saßen falsch, und der Grund war ein stiller:

```css
padding-top: var(--s-7);   /* diese Stufe gibt es nicht */
```

Die Abstandsskala springt von 6 auf 8 – **`--s-7` existiert nicht.** Eine ungültige
CSS-Deklaration wird verworfen, ohne Fehler und ohne Warnung. Gemessen kam dabei heraus:
52 px über der Linie, **1 px darunter**. Die Überschrift klebte an ihr.

Dazu kam, dass die App eine Dichte-Einstellung hat, die die Skala umdefiniert: `--s-5` ist im
Modus „ruhig" 24 px, nicht 20. Wer die Zahlen aus der Tokendatei abliest, rechnet mit den
falschen.

**Jetzt:** über der Linie `--s-10`, darunter `--s-5` – etwa halb so viel. Dadurch gehört die
Linie sichtbar zu der Überschrift, die sie einleitet, statt zwischen beiden zu schweben.
Verschachtelte Abschnitte folgen demselben Verhältnis eine Stufe kleiner (`--s-6` / `--s-3`).

| Dichte | über der Linie | darunter | Verhältnis |
| --- | ---: | ---: | ---: |
| kompakt | 31 px | 17 px | 1.8:1 |
| ruhig | 52 px | 25 px | 2.1:1 |
| großzügig | 40 px | 21 px | 1.9:1 |

**Und Linien in einer Karte reichen jetzt bis an deren Kanten.** Beidseitig 25 px eingerückt
sahen sie aus wie ein Strich, der im Kasten schwebt – eine Linie, die eine Karte in Teile
schneidet, muss sie auch durchschneiden. Der Inhalt bleibt bündig: Was die Linie an Rand
gewinnt, bekommt sie als Innenabstand zurück (`--panel-pad`).

### Zwei Prüfungen dagegen

`apps/web/test/tokens.spec.ts` prüft, dass **jeder** `var(--…)`-Verweis in `components.css`
auf ein Token zeigt, das es gibt. Laufzeitwerte (`--p-fg`, `--depth`, `--panel-pad`) sind
ausgenommen und benannt. Gegenprobe gemacht: Ein erfundenes `var(--s-7)` lässt den Test
fehlschlagen.

`apps/web/e2e/domain-view.spec.ts` misst das Verhältnis über und unter der Linie (zwischen
1.5:1 und 3:1) und dass die Überschrift nicht daran klebt. Beides hätte den Fehler gefangen.

---

# „geerbt" ist jetzt der Weg, es zu beenden

Ein Unterbereich ohne eigene Zuweisung erbt die Verantwortung von oben (Q-04 in
[docs/12](12-open-questions.md)). Neben dem Namen der verantwortlichen Person stand dafür ein
Etikett: **geerbt**.

Das war eine Auskunft, die den häufigsten nächsten Schritt kennt und ihn nicht anbietet. Wer
„geerbt" liest, will meistens genau eines – dass es für diesen Bereich nicht mehr gilt. Dafür
musste man den Bereich öffnen und dort „Ich übernehme das" suchen: zwei Klicks und eine
Seitenladung für etwas, das direkt unter dem Zeiger steht.

Jetzt **ist das Etikett der Knopf**. Beim Darauffahren und bei Tastaturfokus wechselt die
Aufschrift zu **übernehmen**; ein Klick legt die reguläre eigene Zuweisung an
(`POST …/domains/:id/claim`, `primary_owner`) und beendet damit die Vererbung – dieselbe
Handlung wie bisher, an der Stelle, an der die Frage entsteht.

## Drei Dinge, die daran nicht offensichtlich sind

**Am Finger gibt es kein Darauffahren.** Eine Aufschrift, die nur die Maus kennt, wäre auf dem
Telefon eine unsichtbare Funktion mit sichtbarer Trefferfläche. Unter `@media (hover: none)`
steht deshalb dauerhaft „übernehmen", und der Knopf wächst auf `--control-h` – dort ist er ein
Bedienelement und kein Etikett. `apps/web/e2e/touch.spec.ts` prüft die 44 px mit.

**Der vorgelesene Name ändert sich nicht.** Ein Bedienelement, dessen Name unter dem Zeiger
wechselt, ist für jemanden, der es nicht sieht, zwei verschiedene Dinge. Der Knopf trägt
deshalb einen festen `aria-label` („Verantwortung für „Schuhe" selbst übernehmen – bisher
geerbt"), und beide Aufschriften sind `aria-hidden`.

**Der Knopf wächst nicht unter dem Zeiger.** Beide Aufschriften liegen in derselben
Gitterzelle übereinander, die Breite richtet sich nach der längeren. Sonst schöbe der Wechsel
die Zeile daneben weg – und die Maus stünde plötzlich woanders.

## Der Fehler dabei: das Bauteil nachgebaut statt benutzt

Der erste Anlauf gab dem Knopf sein Äußeres selbst – eigener Innenabstand, eigene Zeilenhöhe,
`inline-grid` statt `inline-flex`, damit die beiden Aufschriften übereinanderliegen. Er sah
aus wie ein Chip und saß trotzdem **4,9 px** neben den Abzeichen derselben Zeile: Ein
Inline-Gitter setzt seine Grundlinie anders als eine Inline-Flexbox, und eine abweichende
Zeilenhöhe verschiebt sie mit.

Behoben, indem der Knopf wieder ein Chip *ist* (`class="chip erbe-chip"`) und nur noch seinen
**Inhalt** besonders behandelt: Das Gitter mit den zwei Aufschriften sitzt in einem Kind,
nicht am Knopf selbst.

> Wer ein vorhandenes Bauteil umbaut, ändert seinen Inhalt – nicht seine Kiste.

`apps/web/e2e/erbe.spec.ts` misst seitdem den Abstand der Mittellinien (≤ 1,5 px) und dass der
Knopf beim Darauffahren weder wächst noch springt. Gegenprobe gemacht: Mit dem alten
Stylesheet meldet der Test „geerbt steht 4.9 px neben dem Abzeichen".

## Was geprüft wird

Fünf Prüfungen in `apps/web/test/erbe-uebernehmen.spec.tsx` und zwei im Browser
(`apps/web/e2e/erbe.spec.ts`, oben beschrieben). In jsdom: dass das Etikett ein `<button>`
ist, dass beide Aufschriften darin stehen, dass der vorgelesene Name stabil ist, dass ein Klick
wirklich `POST …/claim` auslöst – und dass **nicht jede** Zeile den Knopf trägt, sondern nur
die geerbten. Ein Knopf an jedem Bereich wäre eine Aufforderung dort, wo es nichts zu beenden
gibt.
