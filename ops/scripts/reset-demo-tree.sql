-- Den Bereichsbaum des Demohaushalts auf den Auslieferungszustand zurücksetzen.
--
-- Die Prüfungen zum Verschieben verändern echten Zustand. Ohne diesen Schnitt findet der
-- nächste Lauf einen anderen Baum vor als der vorige – und scheitert an etwas, das kein
-- Fehler ist.
\set hh '01a07d11-af2b-7173-aa52-4c6454d2e5b3'

UPDATE domains d SET
  parent_id = p.id,
  path      = (p.path::text || '.' || d.slug)::ltree,
  position  = 0
FROM domains p
WHERE d.household_id = :'hh' AND p.household_id = :'hh'
  AND ((d.name = 'Wäsche'       AND p.name = 'Haushalt')
    OR (d.name = 'Lebensmittel' AND p.name = 'Haushalt')
    OR (d.name = 'Reparaturen'  AND p.name = 'Haushalt'));

UPDATE domains SET position = 0 WHERE household_id = :'hh';
