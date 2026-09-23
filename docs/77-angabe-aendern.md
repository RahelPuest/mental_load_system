# 77 – Eine Angabe ändern, nicht nur ihren Wert

Gemeldet als: **„Beim Ändern von Angaben kann man den Namen der Angabe nicht ändern. Beim
Ändern sollen alle Optionen wie auch beim Erstellen zur Verfügung stehen."**

Das stimmte, und es war schlimmer als eine fehlende Bequemlichkeit: Es gab **keine**
Schnittstelle dafür. Weder Route noch Dienstmethode – nur Anlegen, Auflisten und den Wert
schreiben.

> Bemerkenswert: `docs/21` führte `PATCH /households/:hid/state-definitions/:sdid` die ganze
> Zeit auf. Die Zeile stand da, der Code nicht. Ein Vertrag, den niemand durchsetzt, ist eine
> Absichtserklärung – dasselbe Argument, das in `docs/08` für Invarianten gilt und dort einen
> Abdeckungstest erzwingt. Für den API-Vertrag gibt es den nicht. Ein Tippfehler im Namen war damit endgültig. Die Angabe hieß für immer „Schugröße",
und der einzige Ausweg wäre eine neue gewesen – womit der Verlauf der alten an der falschen
Beschriftung hängen bliebe.

## Ein Bogen für beides

`StateSheet` legt jetzt an **und** ändert. Zwei Formulare für dieselben fünf Felder wären die
andere schlechte Antwort gewesen; sie laufen auseinander, sobald eines ein Feld dazubekommt.

Damit verschwindet auch der frühere Sonderweg: „Ändern" klappte in der Zeile eine Eingabe auf,
die **ausschließlich** den Wert setzen konnte. Jetzt öffnet derselbe Knopf den ganzen Bogen –
ein Weg statt zwei, und alles, was beim Anlegen zur Wahl stand, steht auch beim Ändern da.

## Was sich nicht ändern lässt – und warum

**Der technische Schlüssel (`key`).** Regeln, Import und Export verweisen darauf. Ihn mit dem
Namen mitzuziehen hieße, diese Verweise stillschweigend zu lösen. Er wird beim Anlegen aus dem
Namen gebildet und bleibt dann liegen; der Name darüber ist das, was Menschen lesen.

**Die Art, sobald ein Wert vorliegt.** „29" als Zahl ist als Datum nichts. Statt den Wert bei
der Gelegenheit wegzuwerfen, lehnt der Dienst ab (`409 has_value`) und nennt den Ausweg: erst
auf „weiß ich nicht" setzen, wenn die Art wirklich falsch ist. Im Bogen ist das Feld dann
gesperrt, mit dem Grund daneben – ein Feld anzubieten, das beim Speichern scheitert, wäre eine
Falle.

**„Unbekannt" zählt dabei nicht als Wert.** Da steht nichts, was seine Bedeutung verlieren
könnte, und jede neue Angabe startet so (INV-010). Die Art gleich nach dem Anlegen zu
berichtigen ist der Normalfall, nicht die Ausnahme.

## Die Frist wirkt sofort

`stale_at` steckt im **Wert**, nicht in der Angabe – es wurde beim letzten Schreiben aus der
damaligen Frist gerechnet. Wird die Frist geändert, rechnet der Dienst es neu. Sonst altert die
Angabe weiter nach der alten Regel, während die Oberfläche die neue anzeigt: zwei Wahrheiten
über denselben Sachverhalt, von denen die sichtbare die falsche ist.

Der Test dazu setzt die Frist von einem Jahr auf einen Tag, schiebt die Uhr drei Tage vor und
verlangt, dass die Angabe dann veraltet ist.

## Was hinausgeht

```
PATCH /households/:hid/state-definitions/:sid
      { label?, dataType?, unit?, freshnessInterval?, isCritical?, description? }
```

Beim Ändern geht nur hinaus, was sich wirklich geändert hat. Sonst stünde nach jedem Öffnen des
Bogens eine Änderung im Verlauf, auch wenn jemand nur nachgesehen hat. Das Ereignis
`state.definition_updated` trägt den alten Namen in `before` – wer im Verlauf einer Angabe
liest, sieht, wie sie vorher hieß.

## Was geprüft wird

Acht Prüfungen in `apps/api/test/angabe-aendern.spec.ts`: Name ändern, Schlüssel bleibt, Frist
und Wichtigkeit ändern, Art ändern solange nur „unbekannt" dasteht, Art **nicht** ändern sobald
ein Wert da ist (samt Ausweg in der Meldung), Name geht trotzdem, die neue Frist macht eine
bestätigte Angabe veraltet, und der Verlauf trägt den alten Namen.

Fünf in der Oberfläche (`apps/web/test/angabe-anlegen.spec.tsx`): dass der Bogen mit allem
kommt, was dasteht – nicht nur mit dem Wert –, dass der Tippfehler sich berichtigen lässt, dass
**nichts** hinausgeht, wenn sich nichts geändert hat, und dass die Art gesperrt ist, solange ein
Wert dasteht (und frei, wenn nicht).
