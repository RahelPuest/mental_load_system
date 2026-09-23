# 59 · Anbindung an Bring!

Einkäufe dorthin schicken, wo sie ohnehin abgehakt werden.

## Die Ausgangslage, ehrlich

**Bring hat keine offizielle Schnittstelle für Einkaufslisten.** Die offiziellen Bring-APIs
betreffen Logistik und Versand. Was für Einkaufslisten existiert, ist zurückentwickelt und
wird von mehreren Gemeinschaftsprojekten benutzt ([`miaucl/bring-api`], [`foxriver76/node-bring-api`]);
deren eigene Dokumentation sagt: *„in keiner Weise von Bring! Labs AG unterstützt oder damit
verbunden"*.

Daraus folgen drei Entwurfsentscheidungen.

### 1. Alles über Bring steht an einer Stelle

`packages/services/src/bring/client.ts` ist der einzige Ort, der Adressen, Kopfzeilen und
Feldnamen kennt. Ändert Bring etwas, ist das die eine Datei. `fetch` wird hereingereicht statt
importiert – so lässt sich die Logik prüfen, ohne Bring anzurufen, und kein Test ruft
versehentlich einen fremden Dienst.

### 2. Es scheitert laut, nicht still

Jeder Fehlschlag wird zu einem Grund, den man einem Menschen zeigen kann:

| Grund | Text | Hilft Wiederholen? |
| --- | --- | --- |
| `anmeldung_abgelehnt` | „E-Mail oder Passwort stimmen nicht." | nein |
| `token_abgelaufen` | „Der Zugang gilt nicht mehr. Bitte neu verbinden." | nein |
| `liste_unbekannt` | „Diese Bring-Liste gibt es nicht mehr." | nein |
| `nicht_erreichbar` | „Bring war gerade nicht erreichbar. Nichts ist verloren." | ja |
| `unerwartete_antwort` | „Bring hat anders geantwortet als erwartet. Die Schnittstelle ist nicht offiziell und kann sich ändern." | nein |

Der letzte Fall ist der wichtige: Antwortet Bring freundlich, aber anders, ist das kein
Bedienfehler. Der Unterschied zwischen „nochmal versuchen hilft" und „hier hilft kein
Versuchen" steht im Text.

Die Verbindung führt ihren Zustand mit (`connected` · `needs_reauth` · `error`). Was nicht
durchkommt, wird an der Verbindung sichtbar – nicht dadurch, dass Einkäufe stumm verschwinden.

### 3. Das Passwort wird nicht gespeichert

Bring kennt kein OAuth: Die Anmeldung läuft über E-Mail und Passwort. Thealotta nimmt beides
**einmal** entgegen, tauscht es gegen Tokens und legt nur den **Refresh-Token** ab –
verschlüsselt im Umschlagverfahren, wie die Kalender-Zugangsdaten.

Wer den Zugang widerrufen will, ändert sein Bring-Passwort; dann verfällt der Token, und die
Verbindung geht sichtbar auf `needs_reauth`.

Drei Tests halten das fest: Weder Passwort noch Zugangs-Token noch der Refresh-Token im
Klartext stehen in der Datenbank, und weder Passwort noch die Bring-Adresse stehen im
Ereignisverlauf.

## Was es tut

**Einbahnstraße: Thealotta → Bring.** Ein Rückweg hieße, zwei Wahrheiten über denselben Einkauf zu
führen und sie abgleichen zu müssen. Für den Zweck ist er nicht nötig: Die Verantwortung
bleibt in Thealotta sichtbar, der Einkauf landet in Bring.

**Die Aufgabe bleibt offen.** Wer „Brot kaufen" nach Bring schickt, hat es dort auf der Liste
**und** hier weiterhin als Aufgabe. Erledigt wird sie in Thealotta – dort steht, wer dafür
mitdenkt.

**Der Knopf erscheint nur mit verbundener Liste.** Ein Knopf, der erst beim Drücken sagt
„nichts verbunden", ist eine Sackgasse mit Ankündigung.

## Einrichtung

Einstellungen → **Verbindungen** → Bring!: E-Mail und Passwort eingeben, dann die Zielliste
wählen. Ohne gewählte Liste ist die Verbindung angelegt, aber es geht nichts hinaus – und die
Seite sagt das.

Eine Verbindung je Haushalt. Erneutes Verbinden ersetzt die alte; zwei wären zwei Wahrheiten
darüber, wohin ein Einkauf geht.

## Rechte und Ablage

| | |
| --- | --- |
| Tabelle | `bring_connections`, eine Zeile je Haushalt, mit RLS wie alle Haushaltstabellen |
| `thealotta_app` | volle DML |
| `thealotta_sync` | nur `SELECT` und `UPDATE` auf Zustandsspalten – der Zusteller darf fortschreiben, aber keine Verbindung anlegen oder löschen |
| Verbinden und Trennen | `household:manage` |

## Was nicht gebaut wurde – und warum

**Der Rezept-Deeplink.** Bring kann Zutaten selbst von einer Seite holen
(`api.getbring.com/rest/bringrecipes/deeplink?url=…`). Das würde ohne Zugangsdaten auskommen –
verlangt aber, dass Thealotta **aus dem öffentlichen Internet erreichbar** ist, damit Bring die
Liste abrufen kann. Das Mealie-Projekt dokumentiert genau das als Angriffsfläche. Für eine
Anwendung mit Familiendaten ist der Preis zu hoch.

**Automatisches Senden aus einer Regel.** Wäre möglich (die Regel „Wochenendeinkauf" legt eine
Aufgabe an, die Aufgabe ginge weiter an Bring), ist aber bewusst nicht gebaut: Solange die
Schnittstelle keine Zusage hat, soll jeder Versand eine bewusste Handlung mit sichtbarer
Rückmeldung sein.

## Geprüft

| | |
| --- | --- |
| Adapter | 7 Tests gegen ein gefälschtes `fetch`: Anmeldung, Unterscheidung falsches Passwort ↔ geänderte Schnittstelle, Netzfehler, Token-Erneuerung ohne neuen Refresh-Token, Listen mit unvollständigen Einträgen, Artikel senden, verschwundene Liste |
| Dienst und Routen | 6 Tests: leerer Anfangszustand, unvollständige Eingaben, Senden ohne Verbindung, Senden ohne Liste, was in der Datenbank landet, was im Ereignisverlauf landet |
| Browser | 2 Tests: die Seite sagt vor der Eingabe, worauf man sich einlässt; der Knopf erscheint nur mit verbundener Liste |

Kein Test ruft Bring an.

[`miaucl/bring-api`]: https://github.com/miaucl/bring-api
[`foxriver76/node-bring-api`]: https://github.com/foxriver76/node-bring-api
