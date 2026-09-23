# 63 – Essensplanung

„Was essen wir diese Woche, und was brauchen wir dafür?" ist keine Rezeptfrage. Sie ist eine
der teuersten wiederkehrenden Entscheidungen im Haushalt: Sie fällt jede Woche neu an, sie
hat keinen festen Zuständigen, und wer sie beantwortet, muss dafür fünf Dinge gleichzeitig im
Kopf haben – was wir mögen, was wir kürzlich hatten, wer wann Zeit hat, was noch da ist, und
was daraus zu kaufen wäre.

Dieser Bereich nimmt diese fünf Dinge auseinander und legt sie ab.

| Was das System hält | Wo es liegt |
| --- | --- |
| Was wir kochen | die Gerichtesammlung – das Gedächtnis |
| Was wir mögen | Bewertungen, je Person |
| Was wir kürzlich hatten | der vergangene Plan, abgefragt statt gepflegt |
| Was wann passt | Tags und Regeln für Wochentage |
| Was zu kaufen ist | die Einkaufsliste, aus den Zutaten abgeleitet |

## Ein Objekt: das Gericht

Es gibt **kein** „Rezept" neben dem Gericht. Ein Rezept ist nichts anderes als ein Gericht,
über das man mehr weiß.

Zwei Objekte hießen: beim Anlegen entscheiden müssen, welches von beidem man gerade meint –
und später zwei Orte pflegen. Das ist genau die Verwaltungsarbeit, die dieser Bereich abnehmen
soll.

Deshalb ist am Gericht **alles außer dem Namen NULL-bar**:

```
+ Gericht
Name: Kartoffelauflauf
[Speichern]
```

Fertig, und sofort einplanbar. Zutaten, Zeiten, Portionen, Zubereitung, Tags, Quelle und Bild
sind Nachtrag, nie Pflicht — und liegen im Bogen hinter einem Aufklapper **„Zutaten, Zeiten
und Zubereitung"**: sichtbar, dass es sie gibt, aber nicht im Weg.

### Der Aufklapper muss wie einer aussehen

Er war zuerst ein Schalter in Chipform. Ergebnis: *„Wie sollen denn die Einkaufslisten
entstehen, wenn man nirgends ein Feld zum Eintragen der Zutaten hat?"* — das Feld war da, es
sah nur nicht danach aus. Drei Korrekturen:

1. **Ein echter Aufklapper** (`<details>/<summary>`) statt eines Chips. Dieselbe Form wie
   überall sonst im Produkt, mit Pfeil und Tastaturbedienung.
2. **Offen, wenn schon etwas darin liegt.** Zutaten sind Inhalt, keine Einstellung: Wer ein
   Gericht mit sechs Zutaten öffnet und sie nicht sieht, glaubt, es habe keine.
3. **Ein Satz, der die Frage beantwortet:** „Die Zutaten sind die Grundlage der Einkaufsliste:
   Was hier steht, taucht dort auf, sobald das Gericht in einer Woche geplant ist."

Dazu zwei Hinweise außerhalb des Bogens: In der Sammlung steht bei jedem Gericht, ob Zutaten
hinterlegt sind – auch die **Lücke** („keine Zutaten") ist die Antwort auf „warum steht das
nicht auf meiner Liste?". Und der Leerzustand der Einkaufsliste sagt, woher ihre Zeilen
kommen, mit einem Weg zur Sammlung.

**Gerichte ohne Zutaten sind vollwertig.** „Brotzeit", „Pizza bestellen", „Bei Oma essen",
„Reste" stehen gleichberechtigt in der Sammlung. Sie tragen nur nichts zur Einkaufsliste bei.

## Wofür ein Gericht passt

Ein Gericht kann **mittags und abends**, **nur mittags** oder **nur abends** passen. Pfannkuchen
sind ein Mittagessen, Brotzeit ein Abendessen; das Meiste ist beides.

Das ist ein **Feld, kein Tag** – und der Unterschied ist der Punkt: Tags beschreiben, dieses
hier **steuert**. Ein Gericht, das nur mittags passt, wird abends nicht vorgeschlagen. Worauf
sich die Auswahl verlässt, muss ein geschlossenes Vokabular sein (ADR-0013); ein Tippfehler in
einem freien Tag wäre sonst eine stille Regeländerung.

Aus demselben Grund steht der Selektor **oben im Bogen**, direkt unter dem Namen, und nicht im
Aufklapper: Wer ihn erst nach dem Aufklappen fände, bekäme Pfannkuchen zum Abendessen und
wüsste nicht, warum.

**„Beides" ist die Voreinstellung.** Niemand muss seine Sammlung durchklassifizieren, bevor sie
benutzbar ist (§6). Und die Beschränkung gilt nur für Vorschläge – von Hand lässt sich jedes
Gericht auf jeden Platz setzen. In der Sammlung steht nur die **Abweichung** („nur mittags");
„mittags und abends" bei fast jedem Gericht wäre Rauschen.

## Tags: mächtig, aber ohne Pflicht

Tags sind **freier Text**. Eine geschlossene Liste wäre wieder Verwaltungsarbeit; ein Angebot
ist es nicht. Die Contracts führen deshalb Vorschläge in sieben Gruppen (Ernährung, Aufwand,
Situation, Familie, Basis, Küche, Saison) – anklickbar, aber nicht abzuarbeiten.

Zwei Gruppen tun mehr als beschreiben:

| Gruppe | Wirkung |
| --- | --- |
| **Basis** (Nudeln, Reis, Kartoffeln, Suppe, Auflauf …) | entscheidet, was als „ähnlich" gilt – daran hängt, dass nicht vier Nudelgerichte hintereinander stehen |
| **Saison** (Frühling … Winter) | verschiebt Gewichte im Jahreslauf |

Gefiltert wird mit **einem Chip in drei Zuständen**: egal → *nur das* → *nie das* → egal
(§20, §27). Zwei getrennte Listen „fordern" und „ausschließen" wären zwei Bedienelemente je
Tag und eine Frage mehr – ein Tag ist eins von beidem, nie beides. Dieselben Filter gelten
für „Woche füllen" (§45).

Ähnlichkeit wird **nicht geraten**. Ob Lasagne und Carbonara einander ähneln, weiß der
Haushalt, nicht ein Wortabgleich auf dem Namen. Was niemand getaggt hat, gilt als unähnlich –
lieber keine Regel als eine erfundene.

## Wer mag was: vier Worte statt fünf Sternen

Fünf Sterne behaupten eine Auflösung, die niemand hat. Der Unterschied zwischen drei und vier
Sternen bei einem Kartoffelauflauf ist nicht bestimmbar, und ihn zu erfragen ist Arbeit ohne
Ertrag.

**mag ich sehr · mag ich · geht so · eher nicht**

Die Stimme hängt an **einer Person**, nicht am Haushalt. Was „die Familie" davon hält, wird
daraus abgeleitet und nirgends getrennt gepflegt – sonst gäbe es zwei Wahrheiten.

„Eher nicht" wiegt dabei schwerer als „mag ich sehr" (−3 gegen +2). Das ist Absicht: Ein
Gericht, das drei lieben und eines ablehnt, ist nicht dasselbe wie eines, das alle bloß mögen.
Am Tisch sitzt dann jemand, der nichts isst, und daraus wird eine zweite Mahlzeit – genau die
Arbeit, die die Planung abnehmen soll.

In der Oberfläche steht das als Satz, nicht als Zahl: *„Ben mag das eher nicht"*, *„Mögen alle
sehr"*.

**Favorit** ist kein eigenes Kreuzchen, sondern eine Ableitung: Favorit ist, was mindestens
einer sehr mag und **niemand** ablehnt. Zwei Arten, dasselbe zu sagen, laufen auseinander –
und §9 warnt ausdrücklich vor unnötiger Bewertungsarbeit. Die Sammlung lässt sich danach
sortieren (§7) und zeigt es an der Zeile.

## Nutzungszahlen entstehen, sie werden nicht gepflegt

Es gibt **keine** Spalten `last_planned_at` oder `planned_count`. Wann ein Gericht zuletzt
dran war und wie oft, steht im vergangenen Plan und wird abgefragt. Ein Zähler daneben wäre
eine zweite Wahrheit, die irgendwann von der ersten abweicht.

Zukünftige Einträge zählen nicht: geplant ist nicht gewesen.

## Der Wochenplan

Ein Gericht je Tag und Mahlzeit. Zwei wären ein Menü, und ein Menü ist keine Entscheidung
mehr, sondern eine zweite.

### Ein Kalender, keine Liste

Tage waagerecht, Mahlzeiten senkrecht, über die volle Breite – die Anordnung, die jeder
Wochenkalender hat:

```
              Montag   Dienstag  Mittwoch  Donnerstag  Freitag  Samstag  Sonntag
              7.9.     8.9.      9.9.      10.9.       11.9.    12.9.    13.9.

Mittagessen     +         +         +          +          +      [ + ]    [ + ]

Abendessen    [ + ]   Kürbis-    [ + ]    Ofengemüse    [ + ]    [ + ]    [ + ]
                       suppe               mit Feta
                       40 Min.             50 Min.
```

Sie beantwortet die beiden Fragen, die man an einen Wochenplan stellt, mit je einer
Blickrichtung: *„Was gibt es Donnerstag?"* läuft eine Spalte hinunter, *„Was essen wir diese
Woche abends?"* eine Zeile entlang. Untereinander gestapelt beantwortet man beide durch
Zählen.

**Der Kalender bekommt die ganze Breite.** Die Gerichtesammlung lag zuerst als Spalte daneben,
wie §44 es vorschlägt. Gemessen blieben dem Kalender dann rund 950 px für sieben Tagesspalten –
110 px je Tag, in denen ein Gerichtename dreimal umbricht. Von zwei nebeneinanderliegenden
Dingen muss eines schmal sein, und ein Wochenkalender ist eine Fläche, kein Beiwerk. Die
Sammlung steht deshalb **darunter**, breit und mehrspaltig.

Der Weg zum Einplanen leidet nicht darunter: Ziehen geht über die Seite hinweg, und der Weg
ohne Maus – Gericht antippen, dann einen Platz – braucht ohnehin zwei Klicks, gleich wo die
Liste steht.

Den **Mittagsplatz gibt es an jedem Tag** – auch an dem, für den keiner eingestellt ist. Dort
hat er **keinen Rahmen**: Wo ein Kasten steht, ist ein Essen vorgesehen und „Freie Woche
füllen" trägt eines ein; wo keiner steht, ist es die Ausnahme, die §12 vorsieht – Ferien,
Feiertag, Homeoffice. Wer dort etwas einträgt, hat sie, und der Eintrag bleibt stehen.

In einer Tagesspalte ist wenig Platz. Der leere Platz trägt deshalb nur ein Pluszeichen; was
er meint, steht am Zeilenkopf („Mittagessen") und in der Spaltenüberschrift („Donnerstag").
Die vollständige Beschriftung bleibt am Knopf – wer vorlesen lässt, sieht weder Zeile noch
Spalte.

**Unter 1080 px wird daraus ein Stapel** – und zwar nach **Tagen**, nicht nach Mahlzeiten:
Auf dem Telefon lautet die Frage „was ist heute?". Sieben Spalten auf 390 px wären sieben
Spalten mit je zwei Wörtern Breite. Deshalb zwei Zweige im Markup statt einer
CSS-Umsortierung: Eine umsortierte Anzeige träte die Vorlesereihenfolge von der sichtbaren
ab. Die Zelle selbst ist in beiden Fällen dieselbe Komponente – zwei Zellen für denselben
Platz würden früher oder später auseinanderlaufen.

**Mittagessen gibt es standardmäßig nur am Wochenende.** Unter der Woche essen die meisten
auswärts; ein leerer Platz an fünf Tagen wäre die häufigste Zeile des Plans und immer leer.
Die Tage sind je Haushalt einstellbar – und ein einzeln eingetragenes Mittagessen (Ferien,
Feiertag, Homeoffice) bleibt stehen, auch wenn sein Wochentag nicht angehakt ist.

### Der Bogen einer Mahlzeit

Eine Zelle im Kalender ist **ein** Ziel: Der Name öffnet den Bogen für diesen einen Platz.
Darin steht, was zu dieser Mahlzeit gehört und nicht zum Gericht:

| | |
| --- | --- |
| **Für wie viele?** (§34) | Leer heißt „wie üblich". Die Einkaufsliste rechnet damit – am Gericht stünde es für immer, hier gilt es für den Sonntag |
| **Notiz für diesen Tag** | „Oma isst mit", „ohne Zwiebeln" |
| **Festhalten** (§43) | Auch „ganze Woche neu vorschlagen" lässt den Platz dann stehen |
| **Kopieren** (§13) | Auf einen anderen Platz, dieser bleibt. Mit der Maus ließe sich Kopieren nicht vom Verschieben unterscheiden, ohne eine Zusatztaste zu verlangen – und die gibt es auf einem Telefon nicht |
| **Entfernen** | Der Platz wird frei, das Gericht bleibt in der Sammlung |

In der Zelle selbst steht genau ein Knopf: **„Anderer Vorschlag"**, und nur an Vorschlägen.
Das ist die Handlung, die man gleich nach dem Füllen mehrmals macht (§23); was von Hand
gesetzt wurde, würfelt niemand neu. Fünf Symbole in einer 110 px breiten Spalte wären
unlesbar, und bei vierzehn belegten Plätzen wären es siebzig Ziele.

### Zwei Bedienwege, gleichrangig

| Weg | wofür |
| --- | --- |
| **Ziehen** | Gericht aus der Sammlung auf einen Platz; Plätze untereinander tauschen |
| **Wählen** | Gericht antippen → Platz antippen. Oder am Platz „Gericht wählen" |

Der zweite ist nicht der Notbehelf fürs Telefon, sondern der einzige, der mit Tastatur und
Vorleseprogramm funktioniert. Er wird deshalb gleichwertig geprüft.

Ein belegter Platz, der auf einen belegten gezogen wird, **tauscht** – das ist, was jemand
beim Ziehen erwartet, und die Alternative wäre, ein Gericht stillschweigend zu verlieren.

## Vorschlagen

„Freie Woche füllen" schlägt Gerichte für alles vor, was leer ist.

**Was es nicht tut:** eine Rangliste ausrechnen und die Spitze nehmen. Dann stünden bei jedem
Klick dieselben fünf Gerichte da, und der Knopf wäre nach dem zweiten Mal nutzlos.
Stattdessen eine **gewichtete Ziehung**: Das Gewicht verschiebt Wahrscheinlichkeiten, es
entscheidet nicht.

### Die Signale

| Signal | Wirkung |
| --- | --- |
| **Wie lange her** | Sättigung bei 42 Tagen. „Vor vier Monaten" und „vor acht Monaten" sind für die Frage „hatten wir das lange nicht?" dasselbe. „Noch nie geplant" zählt wie „sehr lange her" |
| **Beliebtheit** | aus den einzelnen Stimmen, auf 0…1 gestaucht, damit sie nicht alles überstimmt |
| **Tempo** | nur wenn eine Zeit hinterlegt ist – ohne Angabe weder Bonus noch Malus |
| **Jahreszeit** | Zuschlag, kein Filter. Kürbissuppe im März ist erlaubt, nur seltener |

### Was ausgeschlossen wird

Hart: Gerichte, die für diese Mahlzeit nicht vorgesehen sind (siehe oben), von Vorschlägen
ausgenommene Gerichte (§29), Tagfilter, Zeitgrenzen aus Filter und Tagesregel.

**Ein Gericht ohne Zeitangabe wird von einer Zeitgrenze nicht ausgeschlossen.** „Höchstens 30
Minuten" heißt „nichts Aufwendiges", nicht „nur was jemand gestoppt hat" – sonst bestraft der
Filter die Pflegelücke statt das Gericht.

Weich, in drei Stufen, jede nur so streng wie möglich: nicht schon in dieser Woche → nicht in
den letzten zehn Tagen → dem Vortag nicht ähnlich. Bleibt nichts übrig, fällt die jeweils
letzte Bedingung. „Nicht ohne guten Grund doppelt" heißt: **ein leerer Platz ist ein guter
Grund.**

### Umfang: ganze Woche, nur Abendessen, ein Tag, ein Platz (§22)

Ein Knopf mit einem Auswahlfeld daneben, kein Knopfregal:

```
[ alle freien Plätze ▾ ]  [ ✨ Freie Woche füllen ]
   nur Abendessen
   nur Montag … nur Sonntag
```

Der **einzelne Platz** hat seinen eigenen Weg – den Würfel in der Zelle. Vier Knöpfe für vier
Umfänge wären vier Entscheidungen vor der ersten Handlung.

### Fünf Absichten statt Regler

Ausgewogen · Abwechslung · Favoriten · Schnell · Überrasch mich.

Ein Gewichtungspanel als Standardansicht wäre ein Algorithmus-Konfigurator: Wer ihn bedienen
will, muss verstehen, wie das Ranking rechnet. Fünf benannte Absichten sagen dasselbe in der
Sprache der Sache.

### Erklärbar, ohne Punktzahl

Jeder Vorschlag trägt einen Satz: *„Lange nicht gegessen"*, *„Mögen hier alle"*, *„Noch nie
geplant"*, *„Passt in den Herbst"*, *„In 20 Minuten fertig"*.

Es gibt **keine** Prozentzahl und keinen Score. Die Rechnung darf innen komplex sein; sie ist
kein Anzeigematerial.

### Was nicht angefasst wird

| Handlung | fasst an |
| --- | --- |
| „Freie Woche füllen" | nur leere Plätze |
| „Anderer Vorschlag" | nur diesen einen Platz |
| „Ganze Woche neu vorschlagen" | nur eigene Vorschläge – nie von Hand Geplantes, nie Festgehaltenes |

Damit man das sehen kann, trägt jeder Vorschlag ein Zeichen „Vorschlag". Ohne Kennzeichnung
müsste man raten, was der Knopf mit dieser Zeile tut.

## Die Einkaufsliste

Aus den Zutaten der geplanten Gerichte, auf die geplante Personenzahl skaliert und
zusammengezählt.

**Im Zweifel zwei Zeilen statt einer falschen.** Eine Summe, die nicht stimmt, merkt man erst
im Laden; zwei Zeilen sieht man vorher.

| Fall | Ergebnis |
| --- | --- |
| 2 Zwiebeln + 3 Zwiebeln | 5 Stück |
| 500 g + 1 kg Hackfleisch | 1500 g |
| 2 Dosen + 400 g Tomaten | zwei Zeilen, mit Begründung daneben |
| „Parmesan" (ohne Menge) + 50 g Parmesan | zwei Zeilen, mit Begründung daneben |

Skaliert wird nur, wenn **beide** Portionszahlen bekannt sind. Ein Rezept ohne Portionsangabe
auf sechs Personen zu rechnen hieße raten, für wie viele es gedacht war – ein geratener Faktor
ist im Einkaufswagen teurer als eine Zeile, die man selbst anpasst.

### Eine Zeile ändern (§36)

Zwei Ziele je Zeile, und die Aufteilung folgt der Häufigkeit:

- **Der Haken links** – abhaken. Das macht man im Laden zwanzigmal, mit dem Daumen, im Gehen.
- **Der Rest der Zeile** – öffnet den Bogen: Name, Menge, Einheit, Notiz, „haben wir schon",
  entfernen. Das macht man einmal beim Durchsehen.

Fünf Symbole je Zeile wären bei dreißig Posten hundertfünfzig Ziele. Und jede dieser
Änderungen macht die Zeile **berührt** – beim nächsten Erzeugen bleibt sie stehen.

### Erneutes Erzeugen zerstört keine Arbeit

Eine Liste je Woche. Beim zweiten „Erzeugen" wird nur ersetzt, was aus Gerichten stammt **und**
unangetastet geblieben ist. Von Hand hinzugefügte Zeilen, geänderte Mengen, Abgehaktes und
„haben wir schon" bleiben. Sonst verlöre der zweite Klick genau die Arbeit, für die man sich
beim ersten Zeit genommen hat.

Umgekehrt gilt: **Änderungen an der Liste schlagen nie auf das Rezept zurück.**

### Bring!

Die offenen Zeilen gehen einzeln an Bring – Zeile für Zeile, und ein Fehlschlag bricht nicht
ab. Bring hat keine Schnittstelle für mehrere Artikel auf einmal und keine Zusage, dass es die
für einen überhaupt gibt (docs/59). Wer bei Artikel drei abbricht, hinterlässt eine halb
übertragene Liste, von der niemand weiß, wie weit sie kam. Die Antwort zählt deshalb, was
durchkam und was nicht.

Ist keine Liste verbunden, steht statt des Knopfes ein Verweis auf die Einstellungen. Ein
Knopf, der erst beim Drücken sagt „nichts verbunden", wäre eine Sackgasse mit Ankündigung.

## Wo es sonst auftaucht

| Ort | Was dort steht |
| --- | --- |
| **Familie** | „Was es zu essen gibt" – heute und morgen, zwei Zeilen, ein Verweis in den Plan. Steht nichts im Plan, steht dort auch nichts |
| **Jetzt** | eine Zeile: *„Heute Abend: Chili sin Carne · ca. 25 Minuten"* |

Beide zeigen die Auskunft und übernehmen die Planung nicht. Wer an zwei Orten planen kann,
hat zwei Wahrheiten.

## Was gemessen wurde

Die Seite war beim ersten Bau **zu dicht**: 49 Bedienelemente auf dem Wochenplan, 67 auf der
Sammlung – das Budget der Anwendung liegt bei 40, und die dichteste bestehende Seite (Jetzt)
liegt bei 17.

Drei Änderungen, jede auch ohne die Messung richtig:

1. **Die Gerichteliste unter dem Kalender ist gedeckelt** (6 Einträge, sortiert nach „lange
   nicht gegessen"). Bei zweihundert Gerichten wäre eine vollständige Liste kein Angebot,
   sondern eine zweite Suchaufgabe – und §7 verlangt ausdrücklich, dass man auch dann schnell
   etwas findet. Sechs statt acht, weil die Seite mit acht bei 41 Bedienelementen lag.
2. **Die Tagliste ist zugeklappt.** Suchen ist der häufigere Weg, Filtern die Absicht.
3. **Ändern, Bewerten, Wegräumen und Löschen stehen im Bogen**, nicht an jeder Zeile. Bei 14
   Gerichten waren das 56 Ziele für Handlungen, die man selten braucht.

Danach: Wochenplan 36 – auch bei **voll** geplanter Woche –, Sammlung 23, Einstellungen 31.

Dass eine volle Woche im Budget bleibt, ist der eigentliche Prüfstein: Mit drei Symbolen je
Zelle wären es bei vierzehn belegten Plätzen 63 gewesen. Gemessen wird deshalb nicht die
leere Seite, sondern die gefüllte.

Die Einkaufsliste trägt ein **eigenes, ausgeschriebenes Budget** (`interactiveBudget` in
`e2e/pages.ts`): Zwei Ziele je Zeile – abhaken und „haben wir schon" –, und die Zeilen sind
der Inhalt. Eine Liste von dreißig Posten verlangt keine Sortierarbeit vom Blick; sie ist eine
Reihenfolge zum Abarbeiten. Das allgemeine Budget bleibt, wofür es gedacht ist.

## Was geprüft wird

| Datei | Was sie festhält |
| --- | --- |
| `packages/domain/test/meal-suggest.spec.ts` | 24 Eigenschaften der Auswahl: ein Mittagsgericht kommt abends nie vor, „lange nicht" schlägt „gestern" (>150 von 200 Läufen), Beliebtheit erhöht ohne zu bestimmen, nichts doppelt in einer Woche, keine zwei gleichen Basen hintereinander, Filter und Tagesregeln, Jahreszeit verschiebt ohne auszuschließen, gleicher Startwert – gleiches Ergebnis |
| `packages/domain/test/meal-shopping.spec.ts` | 17 Fälle Skalierung und Summe, davon fünf für „nicht zusammenlegen" |
| `apps/api/test/essensplanung.spec.ts` | 29 Tests entlang der Akzeptanzkriterien §50–§60, samt „wofür ein Gericht passt" |
| `apps/web/e2e/essen.spec.ts` | Der zentrale Ablauf aus §41 im Browser, beide Bedienwege, Filter, Sortierung, Familienseite – und der Weg, der zwischenzeitlich nicht zu finden war: Gericht anlegen → Zutaten eintragen → einplanen → Liste erzeugen |
| `apps/web/e2e/cognitive-load.spec.ts`, `touch.spec.ts`, `a11y.spec.ts` | Die neuen Ansichten laufen in denselben Budgets wie alle anderen |

Die Auswahl wird über **Eigenschaften** geprüft, nicht über Zahlen: „B kommt deutlich häufiger
als A" statt „B hat Gewicht 3,4". Die Gewichte dürfen sich ändern, ohne dass die Tests falsch
werden – die Aussagen darin sind das Versprechen, nicht die Formel.

Alle Läufe sind deterministisch: Der Startwert der Ziehung ist ein **Pflichtparameter**. Die
Domäne liest keine Uhr, und ein Vorschlagswerk, das sich seinen Zufall selbst besorgt, ließe
sich nicht prüfen.

## Was bewusst fehlt

| | Warum |
| --- | --- |
| **Frühstück** | wiederholt sich in den meisten Haushalten so weit, dass es nichts zu entscheiden gibt. Ein dritter Platz wäre eine Zeile mehr an sieben Tagen, für nichts |
| **Vorratshaltung** | „was ist noch da?" ist ein eigenes Vorhaben mit eigenem Pflegeaufwand. Die Einkaufsliste hat dafür „haben wir schon" – eine Auskunft im Moment des Einkaufs, keine zweite Datenbank |
| **Nährwerte** | dieser Bereich soll Entscheidungslast senken, nicht eine neue Bewertungsachse einführen |
| **Import von Rezeptseiten** | ein Link zur Quelle genügt für den Zweck. Ein Importer wäre ein Dauerauftrag gegen fremde Seiten, die sich ändern |
| **Bilder hochladen** | Ein Bild wird als **Adresse** hinterlegt, nicht als Datei. Ein Uploader brächte Speicher, Größenbegrenzungen, Löschfristen und eine Sichtbarkeitsfrage mit – für ein Bild, das meist ohnehin auf der Seite liegt, von der das Rezept stammt |

## Nachtrag – die Zelle im Wochenplan (September 2026)

Eine Zelle trug bis dahin den Namen, eine Unterzeile aus Dauer, Begründung und Meinung sowie
bis zu drei Chips („Vorschlag", „bleibt", Portionen). Bei vierzehn belegten Plätzen waren das
vierzehnmal fünf Angaben in 150 px breiten Spalten – ein Wochenplan, den man lesen musste,
statt ihn zu überblicken.

**Jetzt steht in der Zelle der Name und sonst nichts**, dazu zwei Knöpfe: *anderes Gericht*
und *aus dem Plan nehmen*. Alles Übrige – festhalten, Portionen, Notiz, kopieren, die
Begründung des Vorschlags – steht weiterhin im Bogen hinter dem Namen.

Zwei Änderungen an der Bedienung folgen daraus:

- **Gewürfelt wird an jedem Gericht**, nicht mehr nur an Vorschlägen. Wer von Hand geplant
  hatte, musste vorher den Bogen öffnen, um etwas anderes zu bekommen – beim Planen einer
  Woche ist das die häufigste Bewegung.
- **Entfernen sitzt am Platz**, nicht mehr nur im Bogen.

**Jeder Platz ist gleich groß – der belegte wie der leere.** Vorher wuchs eine Zelle mit ihrem
Inhalt, und jede Zeile des Gitters bekam eine andere Höhe. Die Höhe fasst zwei Zeilen Namen und
die Knopfreihe; längere Namen werden getrennt (`hyphens: auto`) und danach abgeschnitten.
Gemessen: vierzehn Zellen, eine Höhe.

**Was in den Bogen umgezogen ist:** Die Herkunft eines Platzes. Sie stand als Unterzeile in
der Zelle – „Vorschlag, seit 47 Tagen nicht gegessen" – und steht jetzt als erste Zeile im
Bogen, zusammen mit der Dauer. Das musste mitziehen und nicht wegfallen: §25 verlangt, dass
jeder Vorschlag sich in Worten erklärt, und §24 verlangt, dass man sieht, was „Ganze Woche neu
vorschlagen" anfassen wird. Die Oberflächenprüfungen prüfen beides jetzt dort.

**Was aus dem Bild verschwunden ist:** Die Marke „bleibt" an einer festgehaltenen Mahlzeit.
„Ganze Woche neu vorschlagen" lässt Festgehaltenes weiterhin stehen – im Gitter ist jetzt aber
nicht mehr zu sehen, welche das sind. Sichtbar ist es im Bogen („Wird festgehalten").

### Nachtrag zum Nachtrag: die Höhe war zweimal falsch

Die erste Fassung der gleichen Zellhöhe rechnete `calc(var(--s-16) + var(--s-10))`. Das ist
falsch, und zwar auf eine Art, die man in der Voreinstellung „ruhig" nicht sieht: `--s-10`
schrumpft mit der Informationsdichte (52 → 40 → 31 px), der Inhalt einer Zelle aber nicht.
Zwei Zeilen Serife plus Knopfreihe brauchen immer dasselbe.

Gemessen: Bei „standard" und „kompakt" saß die Knopfreihe eines zweizeiligen Gerichts **59 px
zu hoch und lag über dem Namen**. Bei einigen Zellen waren die Knöpfe dadurch gar nicht mehr zu
sehen.

Die Höhe kommt jetzt aus dem Inhalt: zwei Zeilen in der Eintragsrolle, Zeilenabstand, eine
kompakte Knopfreihe, zweimal Polster. Jeder Summand ist dichteunabhängig — die Zelle ist
deshalb in allen drei Dichten gleich hoch (106 px), und das ist richtig: **Dichte regelt den
Abstand zwischen Dingen, nicht das Minimum, das ein Ding braucht.** Statt `height` steht dort
`min-height`, damit ein unerwartet größerer Inhalt die Zelle wachsen lässt, statt ihn zu
zerschneiden.

Im Stapel auf dem Telefon war dieselbe Formel aus einem zweiten Grund falsch: Dort liegen Name
und Knöpfe **nebeneinander**. Senkrecht addiert ergab das 40 px tote Fläche unter jedem
Eintrag; jetzt zählt das Höhere von beidem (87 px statt 127 px).

### Und die Worttrennung war auch falsch

Sichtbar wurde sie erst, als die Zellen richtig hoch waren. Drei Fehler übereinander:

**Erstens: es wurde gar nicht getrennt, sondern zerstückelt.** `overflow-wrap: break-word`
brach an beliebiger Stelle — „Kartoffelsupp | e", „Gemüseaufl | auf". Ein einzelner Buchstabe
auf der zweiten Zeile ist keine Trennung.

**Zweitens: an der falschen Stelle.** Mit `hyphens: auto` allein nimmt der Browser die
**letztmögliche** gültige Trennstelle, weil das die erste Zeile am besten füllt:
„Kartoffelsup-pe", „Gemüseauf-lauf", „Fischstäb-chen". Alle drei sind nach den Silbenregeln
zulässig — aber im Deutschen wird ein zusammengesetztes Wort **zuerst an der Fuge** getrennt.
Das ist der Unterschied zwischen richtig und richtig gesetzt.

Die Lösung ist `hyphenate-limit-chars: 10 4 5`. Die beiden Zahlen tun Verschiedenes: Die
hintere (mindestens fünf Zeichen nach dem Strich) schließt die Schwanzbrüche aus — vier
reichten nicht, weil „Gemüseauf-lauf" und „Fischstäb-chen" genau vier haben. Die vordere
bleibt bewusst milder: auf fünf gesetzt sperrte sie „Ofen-gemüse" aus, und das Wort wurde
stattdessen wortlos zu „Ofengemü" abgeschnitten.

Ergebnis: Kartoffel-suppe, Gemüse-auflauf, Kürbis-suppe, Fisch-stäbchen, Pfann-kuchen,
Ofen-gemüse, Linsen-curry.

**Drittens: es fehlte ein Pixel.** „Kartoffelsuppe" braucht 125 px, verfügbar waren 124 —
deshalb brach ausgerechnet der häufigste Namenstyp überhaupt um. Das waagerechte Polster der
Zelle steht jetzt auf `--s-1` statt `--s-2`; damit sind es 132 px, und bei 1440 px passen die
gängigen Namen wieder auf eine Zeile.

**Eine Warnung für später:** `hyphens: auto` braucht ein Trennwörterbuch im Browser. Fehlt es,
passiert schlicht nichts — ein stiller Rückfall. Zusammen mit `break-word` führte genau das zur
Zerstückelung. Jetzt bricht die Zeile ohne Wörterbuch nur noch am Leerzeichen; das ist die
harmlose Rückfallebene.

### Drei Zeilen, oberbündig, kurze Beschriftung

Drei Nachbesserungen am selben Gitter:

**Der Name darf drei Zeilen haben.** Bei zwei Zeilen wurde „Fisch-stäbchen mit Kartoffelpüree"
abgeschnitten. Die Zellhöhe fasst jetzt drei Zeilen (130 px statt 107); gemessen wird damit
über alle Breiten und Dichten **kein Name mehr abgeschnitten**.

**Alles steht oben.** Vorher füllte der Name die Zelle und drückte die Knopfreihe an den
unteren Rand: Die Knöpfe aller Zellen lagen auf einer Linie, die Namen standen unterschiedlich
weit darüber. Jetzt beginnt jede Zelle oben — Zeilenkopf, Name, Pluszeichen und Knöpfe auf
derselben Höhe — und der Freiraum sammelt sich unten, wo er nicht stört.

**„Mittag" und „Abend" statt „Mittagessen" und „Abendessen".** Die lange Form passte nicht in
ihre Spalte: „Abendessen" braucht 85 px, die Beschriftungsspalte hatte 72 — das Wort war
abgeschnitten. Die kurze Form passt, und die Spalte kann von `5rem` auf `4rem` schrumpfen; die
sechzehn Pixel gehen an die sieben Tagesspalten (Namensbreite bei 1280 px: 112 → 115).

Gekürzt wurde **überall**, nicht nur am Zeilenkopf. Ein Begriff, der an der Tabelle anders
heißt als im Bogen, ist derselbe Fehler wie eine Schriftrolle in zwei Ausprägungen (`docs/65`).
Im Satz liest sich die Kurzform ohnehin besser: „Dienstag, Abend".

### Die Knopfreihe bekommt eine eigene Linie

Oberbündig gilt für den **Inhalt**: Ein einzeiliger Name beginnt so hoch wie ein dreizeiliger.
Für die Knöpfe wäre das falsch — sie lägen dann je nach Namenslänge auf drei verschiedenen
Höhen, und man müsste sie in jedem Feld neu suchen. Sie sitzen deshalb unten; weil alle Zellen
gleich hoch sind, ist das quer durch das Gitter genau **eine** Linie (gemessen: 85 px von der
Zellkante, in allen Breiten und Dichten).

**Auch der leere Platz trägt den Würfel.** „Schlag mir hier etwas vor" ist an einem leeren Platz
die naheliegendste Handlung überhaupt und ging bisher nur über „Freie Woche füllen" für *alle*
Plätze auf einmal. Nebeneffekt: Die Reihe liegt jetzt in jeder Zelle an derselben Stelle, ob
belegt oder nicht.

**Eine Ausnahme, gemessen statt vermutet:** Am außerplanmäßigen Mittagsplatz — einem Wochentag,
für den der Haushalt kein Mittagessen eingestellt hat — antwortete der Würfel „Hier ist schon
alles geplant" und tat nichts, weil „Woche füllen" diese Plätze nicht bedient. Ein Knopf, der
nichts bewirkt und dabei etwas Falsches meldet, ist schlechter als keiner. Diese fünf Plätze
tragen weiterhin nur das Pluszeichen — so wie sie auch keinen Rahmen tragen (§12).

**Das Budget an Bedienelementen für `/essen` steht jetzt auf 70** (`apps/web/e2e/pages.ts`).
Vierzehn gleiche Zellen mit je drei Zielen sind 42; die Zahl kommt daher, dass die Woche sieben
Tage hat, nicht daher, dass die Seite viel anbietet. Der Rest der Seite bleibt bei 22 und
wächst nicht.
