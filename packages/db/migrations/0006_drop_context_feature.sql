-- Umstände ("Kontext") entfallen vollständig.
--
-- Die Idee war: Aufgaben nur zeigen, wenn der Moment passt – „im Supermarkt", „Telefonat
-- möglich". In der Nutzung erwies sie sich als Fehlkonstruktion: Sie verlangt eine
-- Selbstauskunft, die niemand pflegt, und ohne gepflegte Auskunft filtert sie falsch.
-- Ein System, dem man das Mitdenken überlässt, darf nicht davon abhängen, dass man ihm
-- laufend seinen Aufenthaltsort meldet.
--
-- Was bleibt: Zeitliche Umstände (Wochentag, Tageszeit) leitet der Server weiterhin selbst
-- ab, wo er sie braucht. Dafür ist keine Tabelle nötig.

DROP TABLE IF EXISTS task_context_requirements;
DROP TABLE IF EXISTS context_tags;

ALTER TABLE playbook_steps DROP COLUMN IF EXISTS context_requirements;
