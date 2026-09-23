# 67 – Richtung C umgesetzt: „Familienhandbuch"

> **Überholt.** Das Produkt trägt seit September 2026 Richtung A (`docs/69`). Dieses Dokument
> bleibt als Akte der vorigen Gestalt bestehen – was hier über Schrift, Farbe und Bauteile
> steht, gilt für den heutigen Stand **nicht mehr**. Die beiden Befunde aus `docs/66`, die
> hier gelöst wurden, sind es weiterhin: „kritisch" trägt Rang, und die Lücke ist lauter als
> das Ausgefüllte.

Aus den sechs Entwürfen in `docs/66` wurde **Richtung C** gewählt und durchgesetzt. Kein
Umschalter, keine zweite Gestalt: Thealotta sieht jetzt so aus und nur so. Der Dunkelmodus
gehört dazu und wurde mitentworfen, nicht abgeleitet.

## Die eine Regel

> **Fraunces benennt. Public Sans arbeitet.**

Alles, was einen Namen hat – Seitentitel, Abschnittstitel, Bereichsnamen, Zeileneinträge,
Uhrzeiten, die Wortmarke – steht in der Serife. Alles, was funktioniert – Fließtext, Hinweise,
Beschriftungen, Knöpfe, Zähler, Formulare – steht in der Sans.

Die Grenze ist keine Geschmacksfrage, sondern messbar: **Die Serife beginnt genau dort, wo die
Sans aufhört.** Gemessen über 22 Seiten rendert Fraunces bei 17, 21 und 28 px, Public Sans bei
12, 13, 14, 15 und 16 px. Keine Überschneidung. `apps/web/e2e/typografie.spec.ts` hält das
fest – im Browser, nicht im Stylesheet, weil Schrift vererbt wird.

Warum 17 px als Untergrenze: Darunter wird Fraunces dünn, und bei 200 % Zoom in einer schmalen
Spalte bricht „Kita-Eingewöhnungsgespräch" daran (`docs/66`, Risikotabelle).

### Die Serife ist eine Identitätsentscheidung, keine Lesbarkeitsentscheidung

Damit aus diesem Abschnitt niemand das Falsche liest: **Die Serife steht hier nicht, weil sie
besser lesbar wäre.** Sie steht hier, weil sie Thealotta unverwechselbar macht und Benennen von
Arbeiten trennt.

Die Forschung gibt ein Lesbarkeitsargument nicht her. Ein Experiment mit 132 Erwachsenen
(Serife gegen Grotesk × Bildschirm gegen Papier, gemessen als Textverständnis, kognitive Last
und Lesezeit) findet **keine Wechselwirkung zwischen Medium und Schriftart** und stützt die
verbreitete Annahme format-spezifischer Optimierung nicht; ältere Eye-Tracking-Arbeiten kommen
zu uneinheitlichen Ergebnissen.

> Millhagen, O., Schmidt, F. T. C., Metz, M., Feser, M. S., & Retelsdorf, J. (2026). Just the
> font types? Effects of serif vs. sans-serif font types on text comprehension in screen vs.
> paper reading. *Behaviour & Information Technology*. DOI: 10.1080/0144929X.2026.2678378

Zugunsten der Entscheidung ist allerdings festzuhalten: Diese Studien messen
**zusammenhängendes Lesen längerer Texte**. Thealotta setzt die Serife an Namen und
Überschriften – Material, das überflogen und nicht gelesen wird. Dafür fand ich keine
belastbare Vergleichsevidenz. Die Studienlage spricht also weder für noch gegen die
Entscheidung; sie nimmt ihr nur die Möglichkeit, sich auf Forschung zu berufen.

Das ist dieselbe Richtigstellung, die `docs/60` bei der Drei-Elemente-Grenze vorgenommen hat:
Eine ehrlich als Gestaltungsentscheidung bezeichnete Entscheidung ist leichter zu verteidigen
als eine falsch belegte. Wer es genau wissen will, misst eine Scanaufgabe („finde den Bereich
Kita") gegen beide Schriften – das hat bisher niemand getan (`docs/68`, Befund E5).

## Papier und Tinte

| | hell | dunkel |
| --- | --- | --- |
| Grund **und** Fläche | `#faf6ef` | `#16130f` |
| angehoben (Bogen, Dialog) | `#fffdf8` | `#241f18` |
| Text | `#221f1a` | `#f0e9dd` |
| Primärknopf | Tinte auf Papier | Papier auf Tinte |
| Aufmerksamkeit | Rost `#8c3a20` | `#e49b80` |
| Wo man ist | Tannengrün `#2f5d50` | `#8fbfa8` |
| Fokusring | Rost | Rost |

**Weiß kommt in der Anwendung nicht vor.** Der Grund ist ein Ton mit Temperatur; der
Dunkelmodus ist bräunlich gebrochen statt schiefergrau, damit beide Modi dasselbe Produkt sind
und nicht zwei.

**Seite und Fläche sind derselbe Ton.** Das ist die tragende Entscheidung: Eine Fläche, die
sich nicht vom Grund abhebt, behauptet auch keine Grenze. Abheben tut sich nur, was wirklich
über der Seite liegt.

Alle vierzehn Kontrastpaare, der Fokusring, die drei Randstufen und die zwölf Personenfarben
wurden vor dem ersten Pixel durchgerechnet und halten in beiden Modi. Die vier Fremdpaletten
(Dracula, Catppuccin, Nord, Solarized) bleiben unverändert bestehen: Sie überschreiben Farbe,
nicht Gestalt – Linien, Raster, Radien und Typografie sind dort dieselben.

## Was aufgehört hat, ein Kasten zu sein

| Bauteil | vorher | jetzt |
| --- | --- | --- |
| `.panel` | weiße Fläche, 1-px-Rand, Radius 16, Innenabstand 24 | Linie in Tinte darüber, kein seitlicher Innenabstand |
| `.card` | weiße Fläche, Rand, Radius 16, Schatten | Linie darüber, Farbkante links bleibt |
| `.notice` | Kachel mit Rundung und Rahmen | Band mit kräftiger Kante links |
| `.owner-badge` | gefüllte Pille in Personenfarbe | Punkt trägt die Farbe, Name steht daneben |
| `.toggle` | Kapsel mit voller Rundung | Umriss und Kante wie ein Knopf |

Radien: **0** an Flächen, **2** an Chips, **3** an Bedienelementen, **8** an Bögen. Nachgemessen
gibt es im gerenderten Bild keinen anderen Wert mehr – außer `--r-full` an Punkten, Avataren
und der Erfassen-Taste, wo ein Kreis gemeint ist.

Schatten: **keine.** Die angehobene Stufe ist ersatzlos gestrichen (`--shadow-raised: none`);
einen Schatten bekommt nur, was die Seite wirklich verdeckt.

## Zwei Befunde aus `docs/66`, in C gelöst

**„Kritisch" sah aus wie „nebensächlich".** Alle drei Dringlichkeitsstufen standen als 13-px-Grau
unter dem Namen. Jetzt trägt „kritisch" als einzige Stufe Farbe und Gewicht – Rost, die Farbe,
die in dieser Gestalt ausschließlich Aufmerksamkeit bedeutet. Umgesetzt über ein
`data-rang`-Attribut an der Zeile; kein zusätzliches Bauteil, keine neue Information.

**Die Lücke war leiser als das Ausgefüllte.** „verantwortlich: Anna" war eine farbige Pille,
„niemand zuständig" eine graue. Jetzt sind die Namen ruhige Zeilen mit einem farbigen Punkt –
und „niemand zuständig" ist die einzige kursive Zeile in Rost. In einer Spalte aus dreizehn
Bereichen ist sie damit das, was auffällt.

Der ursprüngliche Einwand gegen eine Warnfarbe an dieser Stelle (`components.css`: „in
Warnfarbe wird daraus eine Wand aus Bernstein") bleibt gültig – er richtete sich gegen eine
**Fläche**. Hier ist nichts gefüllt.

## Die Schriften liegen im Projekt

`apps/web/public/fonts/` – acht `woff2`-Dateien, variable Schnitte, 364 kB insgesamt. Geladen
wird davon je Seite nur, was gebraucht wird: für deutschen Text 65 kB Fraunces und 26 kB Public
Sans. `latin-ext` holt der Browser erst, wenn ein Name es verlangt; die kursiven Schnitte nur
bei kursivem Text.

**Selbst ausgeliefert, kein fremdes CDN.** Die CSP der API steht auf `default-src 'self'` ohne
eigene `font-src`-Direktive – eine Schrift von `fonts.gstatic.com` wäre blockiert. Unabhängig
davon wäre sie eine Anfrage an einen Dritten bei jedem Start.

`font-display: swap` erhält den Sofortstart: Bis die Datei da ist, steht der Text in der
Systemschrift.

## Was geprüft wurde

| | |
| --- | --- |
| Lint | grün |
| Typecheck | grün |
| Node- und Web-Tests | 928 grün, 9 übersprungen |
| Farbtokens (14 Paare × 2 Modi, 4 Fremdpaletten, 12 Personenfarben) | 196 grün |
| Browsertests (chromium + touch) | grün, einschließlich axe WCAG A/AA, 44-px-Trefferflächen und der Budgets für kognitive Last |
| Typografie-Grenze | 22 Seiten, keine Überschneidung |
| Waagerechter Überlauf | keiner auf neun Breiten; eine Inhaltsbreite und ein Polster je Breite |
| Sichtprüfung | Jetzt, Bereiche, Bereichsseite, Essen, Familie, Einstellungen, Erfassen-Bogen – hell und dunkel, 1440 px und 390 px |

**Kein Test wurde abgeschwächt.** Einer kam hinzu: `typografie.spec.ts` prüft die
Arbeitsteilung der beiden Schriften an der gerenderten Seite.

## Was nicht passiert ist

Keine Produktlogik, kein Datenmodell, kein Zuständigkeitsmodell, keine Arbeitsabläufe, keine
Berechtigungen, keine Kalenderlogik, kein Mental-Load-Modell (`docs/66`, §49). Geändert wurden
Tokens, Bauteilstile, zwei Datenattribute für die Dringlichkeitsstufe und ein Text, der durch
den Umbau falsch geworden wäre: Die Voreinstellung heißt nicht mehr „Schiefer und Salbei",
sondern „Papier und Tinte".

## Nachtrag – drei Zeichen, die bei 16 px zerfielen

Aufgefallen am Wochenplan, als zwei Symbolknöpfe ohne Beschriftung nebeneinander standen und
eines davon aussah wie verstreute Krümel. Die Prüfung des ganzen Satzes bei der kleinsten
benutzten Größe fand drei Fälle mit derselben Ursache – **ein kleines Detail weit weg vom
Hauptkörper**:

| Zeichen | Was bei 16 px passierte | Jetzt |
| --- | --- | --- |
| `sparkle` | Hauptstern und fast gleich großer Trabant standen so weit auseinander, dass es zwei getrennte Flusen im Diagonalen waren | größerer Hauptstern, kleiner Trabant nah genug für eine Silhouette – die Doppelform bleibt, denn sie heißt „vorgeschlagen" |
| `route` | zwei Kreise und zwei sich überlagernde Winkelstrecken verschmolzen zu einem Gekritzel – am Navigationspunkt „Vorgänge" | zwei deutlich größere Knoten, **eine** Strecke dazwischen, die einmal abbiegt |
| `battery` | der Pol saß 2,5 Einheiten neben dem Gehäuse und löste sich zu einem Fussel | Pol näher und etwas länger |

Dazu eine stille Ungenauigkeit: `now` und `clock` waren zwei fast gleiche Zeichnungen
(Zeiger 4 statt 3,8 Einheiten lang). Das sieht niemand als Unterschied, sondern als
Unsauberkeit. Jetzt eine Zeichnung, zwei Namen.

Die Ausrichtung der Ikonen war nicht das Problem – über alle 35 Seiten gemessen sitzt jedes
Zeichen mittig zu seinem Text; die wenigen Abweichungen sind gewollt (Leerzustand, Symbol vor
einem mehrzeiligen Absatz). Die Faustregel fürs Zeichnen steht jetzt im Kopf von
`apps/web/src/design/icons.tsx`.

## Bekannte Grenzen dieser Richtung

`docs/66` hat C zwei Schwächen attestiert; beide bleiben und sind nicht wegzugestalten:

- **Überfliegen.** Eine Serife lädt zum Lesen ein. „Jetzt" wird aber gescannt. Abgefedert
  wurde das über Rang statt Fläche – Rost für Kritisches, Kursiv für Lücken – aber die Gestalt
  bleibt ruhiger als eine, die auf Signalfarben setzt.
- **Mobil.** Editorialer Satz kostet Platz. Auf 390 px bricht der Seitentitel eher um als
  zuvor. Gemessen gibt es keinen Überlauf und die Trefferflächen halten; die Zeilenzahl je
  Bildschirm ist dennoch geringer.

Beides war beim Entscheiden bekannt und steht in der Bewertungsmatrix.
