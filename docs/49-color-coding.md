# 49 – Farben für Personen und Bereiche

Farbe war in Thealotta bis hierher eine Ableitung: Ein Hash über die Mitglieds-ID wählte einen von
acht Tönen. Das hatte gute Gründe – kein Zustand, keine Migration, überall dieselbe Farbe –
aber zwei Schwächen. Man konnte sie nicht wählen, und sie war an den Stellen, an denen man
tatsächlich arbeitet, kaum zu sehen.

## Was nicht zu sehen war

Auf `/jetzt` trug eine Karte die Farbe ihres Bereichs nur als 18-px-Punkt in der letzten
Zeile: das schwächste Signal an der unauffälligsten Stelle.

Auf `/familie` war es schlimmer. Die Zuständigkeits-Abzeichen der Liste „Wer was trägt" waren
**nie** eingefärbt – die Aufrufstelle übergab `membershipId` schlicht nicht:

```tsx
<OwnerBadge kind={…} name={domain.effectiveOwner.displayName} />   // ohne membershipId
```

Dieselbe Person war auf `/bereiche` farbig und auf `/familie` grau. Gefunden wurde das nicht
durch Hinsehen, sondern durch Auslesen der Klassen im Browser: Jeder Punkt dort trug `m-0` –
eine Klasse, die es im Stylesheet nie gab.

## Was jetzt zu sehen ist

Eine Karte beginnt mit ihrer Zugehörigkeit statt sie zu beschließen: eine 4 px breite Kante
links und die Herkunftszeile im selben Ton. Zwei Signale für dieselbe Sache – die Zuordnung
hängt nicht an der Farbe allein (§38).

Dringlichkeit und Zugehörigkeit teilen sich dabei keine Ausdrucksmittel: Der Ton für
Dringlichkeit sitzt im Hintergrund der Karte, die Zugehörigkeit an ihrer Kante. Zwei Kanäle,
die sich nicht ins Gehege kommen.

### Jeder Bereich hat eine Farbe – auch der unbesetzte

Ein Zwischenstand ließ Bereiche ohne Zuständigkeit farblos, weil eine Farbe dort nach
Zuständigkeit aussieht. Das erkaufte „ehrlich" mit „unvollständig": Die Bereichsliste war
gescheckt, und eine Aussage hing an etwas, das man nicht sieht.

Jetzt gilt eine dreistufige Kette – **eigene Wahl → Farbe der zuständigen Person → eigener
Ton des Bereichs**. Damit trägt jede Zeile und jede Karte eine Farbe.

Die Kante ist überall durchgezogen. Sie sagt, **um welchen Bereich** es geht – nicht, wie es
um ihn steht. Dass niemand mitdenkt, sagt das Abzeichen „niemand zuständig" im Text daneben.

*Zwischenschritt, der wieder zurückgebaut wurde:* Eine gestrichelte Kante sollte die
Zuständigkeit anzeigen. Sie hat zwei Aussagen auf dasselbe Element gelegt – Identität und
Zustand – und wirkte in beiden Zusammenhängen als Unruhe. Eine Eigenschaft, ein Ausdrucksmittel.

Bereiche streuen über alle zwölf Töne (Personen über die ersten acht): Es gibt mehr von ihnen,
und sie hatten nie eine Farbe, die man ihnen wegnehmen könnte.

*Bekannte Grenze:* Der eigene Ton eines unbesetzten Bereichs kann zufällig dem einer Person
gleichen – im Testbestand trifft „Haushalt" auf Annas Beere. Die Strichelung und das Abzeichen
unterscheiden beide; die Farbe allein tut es nicht. Das ist der Preis dafür, dass die
Zuordnung stabil bleibt: Würde man kollidierende Töne überspringen, bekämen alle Bereiche
neue Farben, sobald jemand seine ändert.

## Die Palette: zwölf statt acht

| | Ton | Farbwinkel | | Ton | Farbwinkel |
| --- | --- | ---: | --- | --- | ---: |
| m1 | Grün | 152° | m7 | Ocker | 45° |
| m2 | Blau | 210° | m8 | Magenta | 300° |
| m3 | Violett | 268° | **m9** | **Rost** | **0°** |
| m4 | Braun | 22° | **m10** | **Indigo** | **235°** |
| m5 | Beere | 340° | **m11** | **Oliv** | **80°** |
| m6 | Türkis | 190° | **m12** | **Pflaume** | **320°** |

Die vier neuen Töne sind nicht von Hand gemischt. Die acht vorhandenen folgten – wie sich beim
Nachrechnen zeigte – exakt derselben Formel, und die neuen sitzen in den vier größten Lücken
des Farbkreises:

```
hell    fg hsl(H 52% 30%)   bg hsl(H 42% 94%)   line hsl(H 35% 80%)
dunkel  fg hsl(H 45% 72%)   bg hsl(H 29% 16%)   line hsl(H 28% 30%)
```

Wer einen Ton ergänzt, wählt also nur einen Farbwinkel – die Garantien folgen daraus. Der
schwächste Kontrast über alle zwölf Töne und beide Modi liegt bei **4,83:1** (Oliv, hell); der
kleinste Abstand auf dem Farbkreis bleibt bei **20°**, also unverändert zu vorher.

**Warum keine freie Farbwahl?** Ein frei gewählter Farbwert müsste für den dunklen Modus so
weit nachkorrigiert werden, dass er nicht mehr der gewählte wäre – und zwei Personen könnten
einander zum Verwechseln ähnlich werden. Zwölf geprüfte Töne sagen beides zu.

## Die Wahl gilt für den Betrachter

Das ist die tragende Entscheidung. Eine Farbe ist eine Ansichtseinstellung, keine Eigenschaft
der Person. Daraus folgt alles Weitere:

- Jede Person darf die Farbe **jeder** anderen einstellen, ohne dass jemand gefragt werden
  müsste – sie verändert ihr eigenes Bild, nicht das der anderen. Deshalb steht an den Routen
  keine Rechteprüfung; geprüft wird nur, dass das Ziel im selben Haushalt existiert.
- Ein API-Test hält genau das fest: Was Anna wählt, sieht Ben nicht, und Bens Wahl
  überschreibt Annas nicht.

```
GET  /households/:id/colors                      → { members: {…}, domains: {…} }
PUT  /households/:id/colors/:subject/:subjectId   { tone: 'indigo' | null }
```

`color_preferences` speichert **nur Abweichungen**. Zurücksetzen ist ein `DELETE`, kein
Sonderwert: „keine Zeile" heißt „wie voreingestellt". Ein gespeichertes „Standard" wäre eine
zweite Wahrheit, die mit der Ableitung auseinanderlaufen könnte.

Die Voreinstellung streut weiterhin über die **ersten acht** Töne. Stünde dort zwölf, bekäme
jede Person im Bestand schlagartig eine andere Farbe, ohne dass jemand etwas geändert hätte.

## Wo man wählt

| | Ort | Warum dort |
| --- | --- | --- |
| Eigene Farbe | Einstellungen → Farben | Alle Farbentscheidungen als eine mentale Einheit |
| Andere Personen | Einstellungen → Farben | dito – bei zwei bis sechs Personen eine kurze Liste |
| Bereiche | Auf der Seite des Bereichs | Man wählt sie im Blick auf ihn (§17) |
| Bereichs-Abweichungen | Einstellungen → Farben | Übersicht und Zurücksetzen an einer Stelle (§31) |

Zwölf Felder pro Mitglied in die Rollenliste zu mischen hätte diese Seite verdoppelt; zwanzig
Farbwähler in einer Bereichsliste wären unbenutzbar gewesen.

Der Wähler ist eine Radiogruppe, kein Menü: Alle zwölf Möglichkeiten stehen gleichzeitig da,
die aktuelle trägt einen Ring **und** ein Häkchen, und jeder Knopf hat seinen Namen als
Vorlesebeschriftung. Wer Farben nicht unterscheiden kann, kann trotzdem wählen.

## Was dabei nebenbei gefunden wurde

- **Ein bedingter Hook.** `useColors()` stand hinter einem frühen `return` – React verlässt
  sich auf eine unveränderliche Aufrufreihenfolge. Nichts hat es gemeldet. Seitdem läuft
  `eslint-plugin-react-hooks` mit `rules-of-hooks: error`. (`exhaustive-deps` bleibt aus: Die
  Ladehaken hängen bewusst an `household?.id` statt am Objekt.)
- **Vertragsdrift.** Der Client-Typ für `effectiveOwner` kannte kein `membershipId`, obwohl
  der Server es seit jeher sendet. Genau deshalb fiel die fehlende Übergabe nicht auf.
- **Eine Farbe brachte die Seite um.** Eine unerwartete Antwort auf `/colors` ließ die
  gesamte Ansicht abstürzen. Farbe ist Beiwerk; sie darf nichts umbringen. Die Antwort wird
  jetzt normalisiert, und ohne Provider gilt schlicht die Ableitung.
- **`m-0`.** Die Klasse für „unbekannte Person" hat nie existiert. Jetzt gibt es für „keine
  Farbe" keinen Klassennamen, sondern keinen – und der Typ sagt das auch.
- **Zwei Regeln auf derselben Kante.** `.tree-child` (Ebenenlinie) und `.tone-edge`
  (Farbkante) setzen beide `border-left`. Solange nur zuständige Bereiche eine Farbkante
  trugen, fiel nicht auf, dass die Farbkante die Ebenenlinie verdrängt – seit jeder Bereich
  eine hat, hätten alle verschachtelten Bereiche ihre Ebenenlinie verloren. Die Farbkante
  übernimmt deren Aufgabe jetzt ausdrücklich, statt sie über die Reihenfolge im Stylesheet
  zufällig zu gewinnen.

## Prüfungen

| Datei | Was sie festhält |
| --- | --- |
| `apps/api/test/colors.spec.ts` | Die Wahl gilt pro Betrachter; Zurücksetzen hinterlässt keine Zeile; jeder Ton des Vokabulars wird von der Datenbank angenommen |
| `apps/web/test/tokens.spec.ts` | Alle zwölf Töne ≥ 4,5:1 in beiden Modi, untereinander verschieden, und jeder hat seine drei Tokens |
| `apps/web/e2e/colors.spec.ts` | Die Wahl überlebt das Neuladen und wirkt auf anderen Seiten; Farbe ist nie das einzige Signal; jeder Bereich hat eine Farbe und unbesetzte sind an der gestrichelten Kante **und** im Text erkennbar |
| `apps/web/e2e/touch.spec.ts` | Die Farbfelder sind mit dem Finger treffbar (44 px unter `pointer: coarse`) |
| `apps/api/test/tenant-isolation.spec.ts` | Die neuen Routen sind mandantengetrennt – automatisch, weil der Test jede registrierte Haushaltsroute erfasst |
