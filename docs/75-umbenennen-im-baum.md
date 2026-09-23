# 75 – Umbenennen, wo man den Bereich sieht

Gemeldet als: **„Bereiche lassen sich nicht umbenennen."**

Das war nicht ganz richtig und trotzdem berechtigt. Die Schnittstelle konnte es die ganze Zeit
(`PATCH /households/:hid/domains/:did`, geprüft in `apps/api/test/domain-lifecycle.spec.ts`, und
gegen den laufenden Server nachgestellt: 200, Name und Pfad geändert). Auch die Oberfläche
konnte es – nur an einer Stelle, die niemand sucht.

## Wo es lag

Der Weg zum Namen führte über: Bereich öffnen → Abschnitt **Diesen Bereich verwalten** →
**Bearbeiten** → Bogen. Drei Schritte und eine Seitenladung.

Der Ort, an dem man nach so etwas sucht, ist der **Bearbeiten-Modus des Baums**. Dort konnte
man eine Zeile verschieben, eine Ebene höher schieben, einfärben und löschen:

| Werkzeug | vorhanden |
| --- | --- |
| Verschieben (Griff, Pfeiltasten) | ja |
| Eine Ebene höher | ja |
| Farbe | ja |
| Löschen | ja |
| **Umbenennen** | **nein** |

Ein Modus, der „Bearbeiten" heißt und alles kann außer der naheliegendsten Änderung, ist für
den Benutzer schlicht kaputt – unabhängig davon, ob die Funktion anderswo existiert.

## Was jetzt da ist

**Im Baum:** In jeder Zeile des Bearbeiten-Modus steht ein Stift – „… umbenennen oder
einordnen".

**Auf der Seite des Bereichs:** ein Knopf **„Umbenennen"** im Kopf, in derselben Zeile wie
„Verantwortung ändern". Diese Zeile trägt, was der Bereich *ist* (wer mitdenkt, wie wichtig er
ist), und ihre Knöpfe sind genau das Ändern dessen, was dort steht. Der Name steht einen
Zentimeter darüber als Überschrift; ihn im fünften Abschnitt zu ändern, war der Umweg.

Beide öffnen **denselben** Bogen – nicht zwei weitere, die dasselbe können. Zwei Formulare für
Name, Einordnung und Wichtigkeit laufen auseinander, sobald eines ein Feld dazubekommt.

Damit derselbe Bogen von beiden Seiten erreichbar ist, mussten zwei Dinge umziehen:

- `EditDomainSheet` nimmt jetzt **einen Bereich** entgegen (`DomainEntry`), nicht die ganze
  geladene Detailansicht (`DomainDetail`). Genau diese Abhängigkeit war der technische Grund,
  warum er nur von der Bereichsseite aus zu haben war.
- Er liegt in `apps/web/components/EditDomainSheet.tsx`, und `prettyPath` in
  `apps/web/src/lib/domains.ts`. Beides lag vorher in `DomainsPage`/`DomainDetailPage`, und die
  beiden Seiten importieren einander bereits – ein Bogen, der von beiden kommt, hätte den
  Kreis geschlossen.

## Was geprüft wird

Sechs Prüfungen in `apps/web/test/umbenennen.spec.tsx`: dass der Knopf im Baum **nur** im
Bearbeiten-Modus da ist, dass der Bogen mit dem Namen kommt, der schon dasteht, dass der neue
Name als `PATCH` hinausgeht, dass es derselbe Bogen ist (alle drei Felder) – und dasselbe für
den Weg über die Bereichsseite, samt der Prüfung, dass der Knopf dort wirklich **im Kopf**
sitzt (`closest('.page-head')`) und nicht bloß irgendwo mit der richtigen Aufschrift.

Zwei im Browser (`apps/web/e2e/umbenennen.spec.ts`), beide von Anfang bis Ende: Der Test legt sich
einen Wegwerfbereich an, benennt ihn über die Oberfläche um, prüft, dass der Baum den neuen
Namen **ohne Neuladen** zeigt, dass die alte Zeile weg ist und dass der Server denselben Namen
und einen mitgezogenen Pfad hat – und räumt den Bereich im `finally` wieder weg. Der zweite tut
dasselbe über den Kopf der Bereichsseite und prüft, dass die Überschrift mitzieht.

> Nebenbefund beim Schreiben dieses Tests: Die erste Fassung benannte „X" in „X umbenannt" um
> und prüfte dann, dass „X" verschwunden ist. `hasText` sucht Teiltexte – der Test wäre grün
> gewesen, während die alte Zeile noch dastand. Jetzt steckt kein Name im anderen.
