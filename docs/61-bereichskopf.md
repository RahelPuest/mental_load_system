# 61 – Der Kopf gehört dem Bereich

Die Bereichsseite hatte sechs Punkte in der linken Spalte, und der erste hieß „Übersicht".
Er ist weg. Was auf ihm stand, war entweder schon woanders zu lesen oder gehört auf jeden
Abschnitt statt auf einen.

## Was die Übersicht sagte

| Was dort stand | Wo es sonst schon stand |
| --- | --- |
| „Was wir wissen · 3" mit dem dringendsten Fall | am Menüpunkt „Was wir wissen", zwei Zentimeter links daneben |
| „Regeln · 1" mit der nächsten Prüfung | am Menüpunkt „Regeln" |
| „Läuft gerade · 2" mit der nächsten Aufgabe | am Menüpunkt „Läuft gerade" |
| je ein „Öffnen"-Verweis | derselbe Menüpunkt führt dorthin |

Drei Karten neben einer Spalte, die dieselben drei Namen mit denselben drei Zahlen trug.
Zwei Auskünfte über denselben Sachverhalt, untereinander – wer beide liest, sucht den
Unterschied, und es gibt keinen.

Der Weg zur Zusammenfassung war dabei selbst schon eine Korrektur: Vorher standen dort die
ersten fünf Einträge jedes Abschnitts, was die Unterseite zu einer exakten Kopie machte
(Review C3). Die Zusammenfassung löste die Kopie und schuf die Verdopplung mit der Spalte.

## Was von ihr bleibt

Der Kopf. Nur stand er dort **einmal** statt fünfmal:

```
Bereiche / Kinder / Kind A / Kleidung
Schuhe
[verantwortlich: Anna] [geerbt] [Verantwortung ändern]
[●] [✓ Aufgabe]
```

Auf den anderen fünf Abschnitten trug der Seitenkopf den **Abschnittsnamen** – auf „Regeln"
stand „Regeln". Das ist ein Echo des Menüpunkts, den man gerade selbst gedrückt hat. Wer für
den Bereich verantwortlich ist, war dort nicht zu sehen; der Bereich selbst schrumpfte auf
eine Brotkrume.

Jetzt steht der Kopf **über beiden Spalten**, über die ganze Breite – nicht in der rechten.
Er beantwortet die vier Fragen, die für alle fünf Abschnitte gleich gelten: *Wo bin ich? Wie
heißt der Bereich? Wer denkt hier mit? Was tue ich hier am häufigsten?*

```
Bereiche / Kinder / Kind A
Kleidung
[verantwortlich: Anna] [Verantwortung ändern]
[●] [✓ Aufgabe]
Darin [Schuhe]
────────────────────────────────────────────────
 Was wir wissen  │  Was wir wissen
 Regeln          │  Angaben · Notizen · Entscheidungen
 Läuft gerade    │  …
 …               │
```

Er gehört keiner der beiden Spalten: Er benennt den Bereich, **in dem beide stehen**. Stünde
er in der rechten, wanderte er mit jedem Abschnitt mit – fünfmal derselbe Block, jedes Mal
neu aufgebaut – und die linke Spalte begänne darüber, als gehörte sie zu etwas anderem.

Der Abschnitt nennt sich eine Ebene tiefer, mit Symbol, Namen und einem Satz Zweck – bei
allen fünf gleich aufgebaut, an derselben Stelle. Damit hat die Seite drei Ebenen statt
zwei: **Schuhe** → *Was wir wissen* → Angaben · Notizen und Fragen · Entscheidungen.

## Was sonst noch auf der Übersicht lag

Drei Dinge standen dort und **nur** dort – mit ihr wären sie verschwunden:

| | wohin | warum dorthin |
| --- | --- | --- |
| Unterbereiche als Chips | in den Kopf, unter die Aktionen | Der Weg nach unten gehört neben den Weg nach oben. Von „Regeln" aus war er zwei Klicks entfernt, obwohl er ins Nachbarzimmer führt. Ein Wort davor – „Darin" –, sonst liest sich eine einzelne Pille wie ein Etikett des Bereichs |
| „Braucht eine Entscheidung" | nach „Läuft gerade", ganz oben | Ein Hinweis, auf den noch niemand reagiert hat, ist der offenste Posten des Bereichs – offener als jede Aufgabe, die schon jemand hat |
| „Wer sieht diesen Bereich" | nach „Diesen Bereich verwalten" | Es ist eine Einstellung, keine Auskunft über den Inhalt |

Die vierte Zeile der alten Nebenspalte – „Zuletzt passiert: Notiz festgehalten, gestern" –
ist ersatzlos entfallen. Der Abschnitt „Was hier passiert ist" listet genau das, vollständig
und mit Datum.

## Die Brotkrumen sind jetzt sichtbar begehbar

Sie waren die ganze Zeit Links. Man sah es ihnen nur nicht an: Versalien, gesperrt, gedämpft,
ohne Unterstreichung – in diesem Entwurf ist das die Form eines **Etiketts**. So steht
„TÄGLICH" über der Navigation und „SCHUHGRÖSSE" über einem Wert. Ein Etikett klickt niemand
an.

| | vorher | jetzt |
| --- | --- | --- |
| Schriftbild | `t-overline`: Versalien, 0.08em gesperrt | normale Textgröße, gemischte Schreibung |
| Ruhezustand | keine Unterstreichung, `text-muted` | dezente Unterstreichung in Randfarbe, `text-secondary` |
| Beim Zeigen | Akzentfarbe | Akzentfarbe **und** volle Unterstreichung |

## Eine Form für die Auskunftszeile

Drei Dinge in einer Zeile, und sie hatten drei Formen: ein gefärbtes Abzeichen mit 3 px
Innenabstand, ein grauer Chip mit einem anderen, und ein unterstrichener Textlink ohne
jeden. Auf einer Grundlinie standen sie damit nicht.

Jetzt teilen sich alle drei Höhe (24 px), Rundung und Innenabstand. Unterschieden werden sie
durch **Farbe und Umrandung, nicht durch Größe**: das Abzeichen trägt die Farbe der Person,
der Chip eine Fläche, die Handlung einen Rand. „Ich übernehme das" ist dabei vom
Sekundärknopf zur selben Pille geworden – es steht in einer Auskunftszeile, nicht in einer
Werkzeugleiste.

## Die Kante unter dem Kopf

Der Kopf ist keine Überschrift des Inhalts, sondern der Rahmen um **beide** Spalten. Ohne
Kante las er sich als Anfang der rechten Spalte, und die linke begann irgendwo daneben.

Drei Dinge machen ihn jetzt zu einem eigenen Feld:

1. **Eine Linie über beiden Spalten**, die bis an den Rand des Inhaltsbereichs läuft. Eine
   Linie, die dort endet, wo ein Absatz endet, liest sich als Unterstreichung; eine, die
   durchläuft, trennt die Seite.
2. **Innen enger als außen** (Gestalt: Nähe). Der Kopf hatte unter sich denselben Abstand wie
   die Linie zum Inhalt und zerfiel dadurch in zwei Häufchen. Jetzt staffelt es sich:
   innerhalb des Kopfes die kleinste Lücke, zur Linie eine größere, unter ihr die größte.
3. **Kante statt Abstand.** Abstände verschieben sich mit der Informationsdichte
   (`data-density='compact'` schrumpft jede Stufe), eine Linie nicht.

## Nebenbefund: Zeilen zerdrückten ihren Text

Auf 390 px stand der Name einer Regel senkrecht, ein Wort je Zeile. Ursache: `.setting-row`
gab seiner Textspalte `flex: 1` – das heißt `flex-basis: 0`, sie darf also auf nichts
schrumpfen. Neben vier Knöpfen blieb nichts.

Zwei Änderungen: die Handlungen einer Zeile sind jetzt eine Gruppe (`.row-actions`), und die
Textspalte hat eine Mindestbreite als Basis (`flex: 1 1 14rem`). Wird es eng, rücken die
Handlungen geschlossen unter den Text, statt ihn zu zerdrücken. Das gilt für **jede**
Einstellungszeile der Anwendung, nicht nur für Regeln.

## Was geprüft wird

| Datei | Was sie festhält |
| --- | --- |
| `apps/web/e2e/domain-struktur.spec.ts` | Bereichsname, Zuständigkeit und Weg zurück stehen über **jedem** der fünf Abschnitte; jeder Abschnitt nennt sich selbst und seinen Zweck; es gibt keine Übersicht mehr; der nackte Pfad führt auf den ersten Abschnitt |
| `apps/web/e2e/domain-view.spec.ts` | Die Reihenfolge steht in der linken Spalte; drei Überschriftenebenen, jede kleiner als die darüber; ein leerer Bereich ist aus jedem Abschnitt heraus zu füllen |
| `apps/web/e2e/domain-manage.spec.ts` | Umbenennen wirkt sofort im Kopf – dort steht jetzt der Name, nicht in der Krume |
| `apps/web/test/domain-struktur.spec.tsx` | Ohne Browser: der Kopf trägt den Bereich, nicht den Abschnitt |

Die Prüfung „der Bereich steht nicht in seinem eigenen Pfad" bleibt, wie sie war: Die
Brotkrumen enden vor dem Bereich, sein Name steht als Überschrift darunter. Zweimal
denselben Namen untereinander war schon einmal der Anlass, diese Seite umzubauen.

## Nachtrag – der Weg nach unten konnte bisher nicht wachsen (September 2026)

Die Leiste „Darin" stand nur da, wenn es schon Unterbereiche gab. Damit fehlte sie genau in
dem Moment, in dem man den ersten anlegen will.

Und anlegen ging **nur** über die Übersicht: Dort öffnet „Bereich anlegen" einen Bogen mit der
Frage „Gehört er zu einem größeren Bereich?" und einer Aufklappliste aller Bereiche. Wer in
„Kleidung" stand und dort „Schuhe" anlegen wollte, musste die Seite verlassen, den Bogen
öffnen und den eigenen Bereich in einer Liste von dreizehn wiederfinden — eine Frage
beantworten, die er durch seinen Standort längst beantwortet hatte.

**Jetzt steht am Ende der Leiste ein Knopf „Unterbereich", und die Leiste erscheint auch ohne
Kinder** (dann mit „Noch nichts darin" davor). Er öffnet denselben Bogen wie die Übersicht —
nur mit festgelegtem Elternteil: Statt der Aufklappliste steht dort die Auskunft „Wird ein
Unterbereich von **Kleidung**". Eine Liste erst zu laden, um eine bereits bekannte Antwort
anzuzeigen, wäre eine Frage ohne Anlass.

Der Bogen bleibt **einer** (`NewDomainSheet`, aus `DomainsPage` exportiert). Zwei Bögen für
dasselbe Objekt wären zwei Orte, an denen ein Feld vergessen wird.

Damit tragen Brotkrumen und „Darin" beide Richtungen des Baums an derselben Stelle — und der
Weg nach unten kann jetzt auch wachsen.

**Dasselbe in der Übersicht:** Jede Zeile des Bereichsbaums trägt jetzt einen „+" zwischen
Zuständigkeit und Pfeil. Er legt einen Unterbereich **an dieser Zeile** an, ohne die Seite zu
verlassen. Vorher musste man den Bereich, auf den man gerade zeigte, im Bogen aus einer Liste
aller dreizehn wiederfinden.

Drei Entscheidungen dabei:

- **`variant="ghost"`.** Dreizehn umrandete Knöpfe mit Versatzschatten wären in Richtung A
  eine zweite Spalte aus Kästen. Ohne Rahmen bilden sie eine ruhige senkrechte Reihe.
- **Nicht im Bearbeiten-Modus.** Dort stehen Verschieben, Farbe und Löschen — Struktur einer
  bestehenden Zeile ändern. Etwas Neues anlegen ist eine andere Handlung und bleibt in der
  normalen Ansicht.

Gemessen: dreizehn Zeilen, dreizehn Knöpfe, 28 Bedienelemente auf der Seite (Budget 40), und
der Klick öffnet den Bogen, ohne die Zeile zu öffnen — `row-end` liegt über der Trefferfläche
der Zeile und bleibt eigenständig.
