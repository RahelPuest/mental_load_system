# 70 – Textfelder verstehen Markdown

Fließtextfelder nehmen ab sofort Auszeichnungen an: **fett**, *kursiv*, Aufzählungen,
nummerierte Listen, Verweise, Absätze. Betroffen sind die sieben Felder, in denen tatsächlich
Fließtext steht — Notiz, Details einer Entscheidung, Antwort auf eine Frage (zweimal),
Zubereitung, Gericht-Notiz, Erkenntnisse aus einem Vorgang.

Nicht betroffen ist das Ziel eines Vorgangs: eine Zeile, die als Untertitel erscheint. Eine
Liste in einem Untertitel wäre Unsinn.

## Geschrieben wird roh, gelesen formatiert

Das Eingabefeld formatiert **nicht beim Tippen**. Ein Feld, das den Text unter den Fingern
umbaut, nimmt einem die Kontrolle darüber, was gespeichert ist — und man kann eine Auszeichnung
nicht mehr zurücknehmen, ohne zu raten, wie sie entstanden ist.

Stattdessen zwei Wege zur Formatierung:

- **Wo Text gelesen wird**, steht er formatiert: Notizen und Entscheidungen im Bereich.
- **Wo ein Feld die einzige Ansicht ist** — Zubereitung, Antworten — gibt es einen Umschalter
  „Vorschau" / „Bearbeiten". Rezeptschritte stehen in dieser Anwendung nur im Bogen; ohne den
  Umschalter würde die Formatierung dort nie sichtbar.

Unter jedem solchen Feld steht eine Fußzeile mit drei Beispielen (`**fett**`, `_kursiv_`,
`- Liste`). Das beantwortet die Frage dort, wo sie entsteht, und kostet keine Hilfeseite.

**Nachtrag (September 2026):** In derselben Fußzeile steht seit
[docs/74](74-textfeld-vergroessern.md) ein zweiter Knopf – **Größer** ⇄ **Kleiner**. Sobald ein
Feld Auszeichnungen annimmt, ist längerer Text nicht mehr die Ausnahme, sondern der Zweck; drei
Zeilen Platz sagen dann das Falsche.

## Was verstanden wird – und was nicht

| Eingabe | Ergebnis |
| --- | --- |
| `**fett**` | fett |
| `*kursiv*`, `_kursiv_` | kursiv |
| `- Zeile`, `* Zeile` | Aufzählung |
| `1. Zeile` | nummerierte Liste |
| `[Text](https://…)` | Verweis |
| Leerzeile | neuer Absatz |
| einfacher Umbruch | Zeilenumbruch |

**Alles andere bleibt stehen, wie es getippt wurde.** Keine Überschriften, keine Zitate, keine
Tabellen, keine Codeblöcke. Das ist Absicht: Wer `#` schreibt, meint meist eine Raute; wer
`2*3` schreibt, meint eine Rechnung. Ein Formatierer, der Text verschluckt, den jemand wörtlich
gemeint hat, ist schlimmer als einer, der zu wenig kann.

## Warum kein HTML entsteht

Der naheliegende Weg wäre eine Bibliothek, die Markdown zu HTML macht, eine zweite, die das
Ergebnis säubert, und `dangerouslySetInnerHTML`. Stattdessen erzeugt der Parser
(`apps/web/src/design/markdown.tsx`, rund 150 Zeilen) **React-Knoten**.

Damit gibt es keinen Pfad, auf dem Nutzertext zu Markup werden könnte: kein `onerror=`, kein
`javascript:`, nichts zu säubern, keine zwei Abhängigkeiten. Die Content-Security-Policy
(`script-src 'self'`) ist die zweite Verteidigungslinie, nicht die erste.

Verweise sind zusätzlich auf `http:`, `https:` und `mailto:` beschränkt und tragen
`rel="noreferrer noopener"`. Ein Ziel mit anderem Schema wird **nicht stillschweigend
entfernt**, sondern bleibt als Text stehen — sonst verschwände etwas, das jemand geschrieben
hat.

## Was geprüft wurde

Elf neue Tests (`apps/web/test/markdown.spec.tsx`), davon sechs für das, was **nicht** passieren
darf:

- `[klick](javascript:alert(1))` erzeugt keinen Verweis, der Text bleibt vollständig stehen
- getipptes `<img src=x onerror=…>` wird Text, kein Element
- `# 1 der Klasse > alle \`x\`` bleibt unverändert
- `2*3 ist 6` wird nicht kursiv
- leerer und nur aus Leerzeichen bestehender Text ergibt nichts

Dazu: Lint, Typecheck, die volle Browsersuite und eine Prüfung am gerenderten Bogen (fett,
kursiv, beide Listenarten und ein Verweis in einer Notiz).

## Offen

Die Kartenvorschau in der Wissensliste (`KnowledgePage`) zeigt weiterhin **rohen** Text, auf
drei Zeilen beschnitten. Eine Aufzählung in einem Dreizeilen-Ausschnitt sähe kaputt aus; dort
ist ungeformter Text die ehrlichere Vorschau. Wenn die Liste einmal eine Volltextansicht
bekommt, gehört die Formatierung dorthin.
