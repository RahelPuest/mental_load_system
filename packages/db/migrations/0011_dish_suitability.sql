-- 0011 – Wofür ein Gericht passt: Mittag, Abend oder beides (docs/63)
--
-- Ein Feld, kein Tag. Tags sind freier Text und beschreiben; dieses hier **steuert**: Ein
-- Gericht, das nur mittags passt, darf abends nicht vorgeschlagen werden. Worauf sich die
-- Auswahl verlässt, muss ein geschlossenes Vokabular sein (ADR-0013) – ein Tippfehler in
-- einem Tag wäre sonst eine stille Regeländerung.
--
-- Voreinstellung `both`. Damit ändert sich für bestehende Gerichte nichts, und niemand muss
-- seine Sammlung durchklassifizieren, bevor sie wieder benutzbar ist (§6).
SET lock_timeout = '3s';

ALTER TABLE dishes
  ADD COLUMN suitable_for text NOT NULL DEFAULT 'both'
    CHECK (suitable_for IN ('lunch', 'dinner', 'both'));
