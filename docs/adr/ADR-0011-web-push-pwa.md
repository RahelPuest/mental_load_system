# ADR-0011 – PWA mit Web Push statt nativer Apps

**Status**: Angenommen · **Datum**: 2026-09-07

## Kontext
§28 verlangt Push auf Mobilgeräten. Native Apps bedeuten zwei zusätzliche Codebasen und
Store-Zyklen.

## Entscheidung
Installierbare PWA mit Web Push (VAPID). Delivery-Kanäle sind als Adapter implementiert,
sodass native Kanäle später ohne Änderung der Notification-Logik ergänzt werden können.

## Begründung
Android und Desktop sind vollständig abgedeckt; iOS ab 16.4 nach Installation auf dem
Home-Bildschirm. Der Fallback (In-App + E-Mail) trägt die Zuverlässigkeitszusage auch dort,
wo Push scheitert – und die trägt ohnehin nicht allein (§28.1: ein ignorierter Reminder darf
nichts verlieren).

## Konsequenzen
+ Eine Codebasis, sofortige Auslieferung.
− iOS-Einschränkung; Nutzer müssen zur Installation angeleitet werden (dokumentiert).
