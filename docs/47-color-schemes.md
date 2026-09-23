# Farbschemata

> Auftrag §25 (Design System), §26 (Farbgestaltung), §38 (Barrierefreiheit).

Unter **Einstellungen → Darstellung** stehen fünf Paletten und drei Modi zur Wahl. Beides
wird pro Gerät gespeichert (`localStorage`) und vor dem ersten Rendern gesetzt, damit die
Oberfläche nicht springt.

| Palette | Hell | Dunkel |
|---|---|---|
| **Thealotta** (Voreinstellung) | Schiefer und Salbei | dieselbe Familie, dunkel |
| **Dracula** | Alucard | Dracula |
| **Catppuccin** | Latte | Mocha |
| **Nord** | Snow Storm | Polar Night |
| **Solarized** | Solarized Light | Solarized Dark |

Der Modus ist unabhängig davon: *Wie das Gerät · Hell · Dunkel*. Wer sein Betriebssystem
dunkel stellt, will nicht zwangsläufig jede Anwendung dunkel – vorher gab es diese Wahl
nicht, und die helle Fassung bekam mancher nie zu Gesicht.

---

## Warum die offiziellen Werte nicht unverändert übernommen sind

Diese Paletten sind für **Code-Editoren** entworfen. Dort ist ein eingegrauter Kommentar
erwünscht: Er soll zurücktreten. In einer Oberfläche mit viel Fließtext ist derselbe Ton
schlicht schlecht lesbar.

Gemessen an WCAG AA (4.5:1 für Fließtext):

| Palette | Befund im Originalzustand |
|---|---|
| Dracula | Vordergrund 13.4:1 ✓ · **Comment `#6272a4` nur 3.0:1** auf dem Grund |
| Catppuccin Latte | Text 7.1:1 ✓ · **Subtext0 4.4:1**, **Grün als Akzentschrift 3.0:1** |
| Nord | Text 10.8:1 ✓ · **`nord10` als Akzent auf Hell 3.5:1** |
| Solarized | Dark ✓ · **`base00` auf `base3` 4.1:1**, **Blau 3.4:1** |

**Keine der vier Paletten hält die Anforderung unverändert.**

## Was stattdessen geschieht

Flächen und Identitätsfarben bleiben exakt die offiziellen Werte – Dracula sieht aus wie
Dracula. Nur dort, wo eine Textrolle die Grenze verfehlt, wird der Wert **aus derselben
Palette abgeleitet**: Der offizielle Ton wird in Richtung des eigenen Vordergrunds gemischt,
bis 4.6:1 gegen den ungünstigsten Untergrund erreicht ist. Kein erfundener Farbton, nur ein
hellerer Nachbar.

| Rolle | offiziell | verwendet |
|---|---|---|
| Dracula · Sekundärtext | `#6272a4` | `#a0a9c4` |
| Dracula · gedämpfter Text | `#6272a4` | `#98a2c0` |
| Catppuccin Latte · Sekundärtext | `#6c6f85` | `#5d6078` |
| Catppuccin Latte · gedämpfter Text | `#6c6f85` | `#63667d` |
| Catppuccin Latte · Akzentschrift | `#8839ef` | `#8538ea` |
| Nord Light · Akzentschrift | `#5e81ac` | `#4c688b` |
| Nord Dark · Akzentschrift | `#88c0d0` | `#94c6d4` |
| Solarized Light · gedämpfter Text | `#586e75` | `#546b72` |
| Solarized Light · Akzentschrift | `#268bd2` | `#1d6ba2` |
| Solarized Dark · Sekundärtext | `#93a1a1` | `#b4bbb5` |
| Solarized Dark · gedämpfter Text | `#93a1a1` | `#aab4b0` |
| Solarized Dark · Akzentschrift | `#268bd2` | `#82b9d9` |

Erzeugt werden die Blöcke aus den Palettenwerten, nicht von Hand gepflegt.

## Zwei getrennte Akzentrollen

`--accent` färbt **Text und Symbole**, `--accent-solid` ist die **Fläche des Primärknopfs**.
Im Hellen ist beides derselbe Ton; im Dunkeln nicht: Dort muss Text hell sein und eine
Knopffläche trotzdem satt. Solange beides eine Variable war, wurde der Primärknopf im
Dunkelmodus ein blasser Pastellknopf mit dunkler Schrift – er sah aus wie deaktiviert, und
die Sekundärknöpfe stachen stärker hervor.

## Abgesichert

- `apps/web/test/tokens.spec.ts` rechnet **jedes Schema in beiden Modi** durch: dreizehn
  Textpaare, Fokusring, Ränder, Knopffläche. 184 Prüfungen.
- `apps/web/e2e/schemes.spec.ts` rendert jedes Schema im Browser und lässt axe darüber
  laufen; die Aufnahmen liegen als `SCHEME-<palette>-<modus>.png` in `.shots/`.

Dieser Test hat eine Lücke im eigenen Testaufbau aufgedeckt: Das Paar *Akzentschrift auf
Akzentfläche* – Chips und der aktive Navigationseintrag – war nie geprüft. Es fehlte bei
Dracula und Nord im Dunkeln und ist jetzt Teil der Prüfliste.
