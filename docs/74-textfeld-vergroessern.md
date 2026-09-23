# 74 – Fließtextfelder lassen sich vergrößern

Ein Feld, in dem drei Zeilen Platz haben, sagt: *Hier gehören drei Zeilen hin.* Für eine Notiz
stimmt das oft. Für eine Zubereitung, eine ausführliche Entscheidung oder die Antwort auf eine
Frage stimmt es nicht – und wer dort mehr schreibt, arbeitet durch ein Guckloch: Was oben steht,
ist beim Schreiben der zehnten Zeile längst aus dem Bild.

Seit [docs/70](70-markdown-in-textfeldern.md) nehmen diese Felder Auszeichnungen an. Damit ist
längerer Text nicht mehr die Ausnahme, sondern der Zweck – eine Aufzählung mit acht Punkten ist
genau das, wofür Listen da sind.

## Warum der Zug am unteren Rand nicht reicht

`.textarea` trägt seit jeher `resize: vertical`; ziehen kann man also schon lange. Nur:

- **Am Finger gibt es den Griff nicht.** Auf dem Telefon ist er nicht bedienbar, und gerade
  dort ist das Guckloch am kleinsten.
- **Man muss ihn kennen.** Er ist drei Pixel groß, trägt keine Beschriftung und steht in der
  Ecke einer Fläche, die man sonst nicht anfasst.

Deshalb ein Knopf: **Größer** ⇄ **Kleiner**, neben „Vorschau". Beide beantworten dieselbe Frage –
wie man diesen Text gerade ansehen will. Der Zug bleibt daneben bestehen; der Knopf ersetzt ihn
nicht, er macht ihn entbehrlich.

## Die Höhe hängt am Fenster, nicht an einer Zahl

```css
.textarea.gross { min-height: min(60vh, 640px); }
```

Feste 600 px wären auf dem Telefon fast die ganze Seite und auf einem großen Bildschirm ein
Drittel. `min-height` statt `height`, damit der Zug am unteren Rand weiter in **beide**
Richtungen geht. Und gedeckelt, weil ein Feld, das höher ist als das Fenster, seine eigene
Fußzeile hinausschiebt – mit dem Weg zurück und den Auszeichnungshinweisen, wegen derer die
Zeile überhaupt da steht.

## Die Vorschau wächst mit

Wer den Text groß schreibt, will ihn groß gegenlesen. Klappte die Vorschau die Fläche wieder
zusammen, wäre der Gewinn beim ersten Blick auf das Ergebnis wieder weg. Die Größe gehört
deshalb zum Feld, nicht zum Bearbeiten-Zustand.

## Was der Knopf nicht tut

**Er merkt sich nichts.** Jedes Feld beginnt klein, auch wenn man das letzte groß gemacht hat.
Eine gemerkte Größe müsste irgendwo liegen – je Feld, je Person, je Gerät –, und die erste
Frage wäre sofort, ob „groß" für die Notiz auch „groß" für das Ziel eines Vorgangs heißt. Wenn
sich zeigt, dass immer wieder dasselbe Feld aufgezogen wird, ist das ein Hinweis auf seine
voreingestellte Zeilenzahl, nicht auf ein fehlendes Gedächtnis.

**Er wächst nicht mit dem Text.** Ein Feld, das beim Tippen von selbst höher wird, verschiebt
alles darunter – auch den Knopf, den man gerade drücken wollte.

## Was geprüft wird

Vier Prüfungen in `apps/web/test/markdown.spec.tsx`: dass der Knopf neben „Vorschau" steht, dass
er die Fläche umschaltet und den Rückweg beschriftet (samt `aria-pressed`), dass die Vorschau
groß bleibt – und dass ein gewöhnliches, nicht formatiertes Feld den Knopf **nicht** bekommt.

Drei im Browser (`apps/web/e2e/textfeld.spec.ts`), weil nur dort Layout gerechnet wird: dass das
Feld auf mehr als das Doppelte wächst und zurückfindet, dass die Fußzeile im Bild bleibt, und
dass das große Feld auf 390 px in den Bogen passt.
