import { useEffect, useState } from 'react'
import { BINDING_LEVELS, DECISION_KINDS, ENERGY_LEVELS, KNOWLEDGE_KINDS } from '@thealotta/contracts'
import { Actions, Button, Field, Input, Notice, Select, Sheet, Textarea, useToast } from '../design/index.js'
import { endpoints } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { DECISION_KIND, ENERGY, KNOWLEDGE_KIND } from '../lib/ui.js'

/**
 * Einen bestehenden Eintrag berichtigen.
 *
 * Bis hierher ließ sich auf der Bereichsseite nur anlegen und abhaken. Notizen, Fragen,
 * Entscheidungen und Aufgaben standen zum Lesen da; wer sich vertippt hatte, musste den
 * Eintrag umgehen – und für Entscheidungen gab es nicht einmal eine Aktion.
 *
 * Ein Bogen für vier Arten statt vier Bögen: Die Felder unterscheiden sich, der Ablauf nicht
 * (öffnen, ändern, speichern, neu laden). Vier fast gleiche Komponenten wären vier Stellen,
 * an denen dieselbe Regel gepflegt werden müsste.
 *
 * Was hier **nicht** steht, steht mit Absicht nicht hier: Zustand, Zuweisung, Bereich und
 * Sichtbarkeit haben eigene Wege mit eigenen Regeln. Berichtigen ist nicht umdisponieren,
 * und eine Sensitivity im selben Formular wie ein Tippfehler wäre eine Rechteänderung
 * nebenbei.
 */
export type Eintrag =
  | { art: 'knowledge'; id: string; title: string; body: string; kind: string }
  | { art: 'question'; id: string; body: string }
  | { art: 'decision'; id: string; title: string; body: string; decisionKind: string; bindingLevel: string }
  | { art: 'task'; id: string; title: string; estimatedMinutes: number | null; mentalEnergy: string; dueAt: string | null }
  | { art: 'process'; id: string; title: string; goal: string | null }

const TITEL: Record<Eintrag['art'], string> = {
  knowledge: 'Notiz ändern',
  question: 'Frage ändern',
  decision: 'Entscheidung ändern',
  task: 'Aufgabe ändern',
  process: 'Vorgang ändern',
}

const BINDING_LEVEL: Record<string, string> = {
  orientation: 'Orientierung',
  strong: 'Deutlich',
  binding: 'Verbindlich',
}

export function EintragSheet({
  eintrag,
  onClose,
  onSaved,
}: {
  eintrag: Eintrag | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [titel, setTitel] = useState('')
  const [text, setText] = useState('')
  const [art, setArt] = useState('')
  const [zweiteArt, setZweiteArt] = useState('')
  const [minuten, setMinuten] = useState('')
  const [frist, setFrist] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  // Beim Öffnen den aktuellen Stand zeigen, nicht den vom letzten Mal.
  useEffect(() => {
    if (!eintrag) return
    setFehler(null)
    setTitel('title' in eintrag ? eintrag.title : '')
    setText('body' in eintrag ? eintrag.body : eintrag.art === 'process' ? (eintrag.goal ?? '') : '')
    setArt(eintrag.art === 'knowledge' ? eintrag.kind : eintrag.art === 'decision' ? eintrag.decisionKind : '')
    setZweiteArt(eintrag.art === 'decision' ? eintrag.bindingLevel : eintrag.art === 'task' ? eintrag.mentalEnergy : '')
    setMinuten(eintrag.art === 'task' && eintrag.estimatedMinutes !== null ? String(eintrag.estimatedMinutes) : '')
    // Das Datumsfeld will „JJJJ-MM-TT", der Server liefert einen vollen Zeitpunkt.
    setFrist(eintrag.art === 'task' && eintrag.dueAt ? eintrag.dueAt.slice(0, 10) : '')
  }, [eintrag])

  if (!eintrag || !household) return null

  const speichern = async () => {
    setBusy(true)
    setFehler(null)
    try {
      if (eintrag.art === 'knowledge') {
        await endpoints.updateKnowledge(household.id, eintrag.id, { title: titel, body: text, kind: art })
      } else if (eintrag.art === 'question') {
        await endpoints.updateQuestion(household.id, eintrag.id, { body: text })
      } else if (eintrag.art === 'decision') {
        await endpoints.updateDecision(household.id, eintrag.id, {
          title: titel,
          body: text,
          decisionKind: art,
          bindingLevel: zweiteArt,
        })
      } else if (eintrag.art === 'process') {
        // Ein leeres Ziel ist kein leerer Text, sondern keins.
        await endpoints.updateProcess(household.id, eintrag.id, { title: titel, goal: text.trim() === '' ? null : text })
      } else {
        await endpoints.updateTask(household.id, eintrag.id, {
          title: titel,
          // Leeres Feld heißt „keine Schätzung", nicht „null Minuten".
          estimatedMinutes: minuten.trim() === '' ? null : Number(minuten),
          mentalEnergy: zweiteArt,
          // Mittag statt Mitternacht: „am 5." heißt nicht „in der Nacht zum 5." – so fällt
          // die Aufgabe nicht durch eine Zeitzonenverschiebung auf den Vortag.
          dueAt: frist === '' ? null : new Date(`${frist}T12:00:00`).toISOString(),
        })
      }
      await onSaved()
      toast.show('Geändert.')
      onClose()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Das hat gerade nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={TITEL[eintrag.art]} description={'title' in eintrag ? eintrag.title : undefined}>
      {eintrag.art !== 'question' && (
        <Field label={eintrag.art === 'task' ? 'Was ist zu tun?' : 'Worum geht es?'}>
          {({ id }) => <Input id={id} value={titel} onChange={(e) => setTitel(e.target.value)} />}
        </Field>
      )}

      {eintrag.art !== 'task' && (
        <Field
          label={eintrag.art === 'question' ? 'Die Frage' : eintrag.art === 'process' ? 'Wozu läuft das?' : 'Der Text'}
          hint={eintrag.art === 'process' ? 'Das Ziel. Leer lassen, wenn es sich von selbst versteht.' : undefined}
        >
          {({ id }) => <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={4} />}
        </Field>
      )}

      {eintrag.art === 'knowledge' && (
        <Field label="Was für eine Notiz ist das?">
          {({ id }) => (
            <Select id={id} value={art} onChange={(e) => setArt(e.target.value)}>
              {KNOWLEDGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KNOWLEDGE_KIND[k] ?? k}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {eintrag.art === 'decision' && (
        <>
          <Field label="Was für eine Entscheidung ist das?">
            {({ id }) => (
              <Select id={id} value={art} onChange={(e) => setArt(e.target.value)}>
                {DECISION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DECISION_KIND[k] ?? k}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Wie verbindlich ist sie?">
            {({ id }) => (
              <Select id={id} value={zweiteArt} onChange={(e) => setZweiteArt(e.target.value)}>
                {BINDING_LEVELS.map((k) => (
                  <option key={k} value={k}>
                    {BINDING_LEVEL[k] ?? k}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </>
      )}

      {eintrag.art === 'task' && (
        <>
          <Field label="Wie lange dauert das ungefähr?" hint="In Minuten. Leer lassen, wenn du es nicht schätzen willst.">
            {({ id }) => (
              <Input id={id} type="number" min={1} value={minuten} onChange={(e) => setMinuten(e.target.value)} />
            )}
          </Field>
          <Field label="Wie anstrengend ist es?" hint="Wird gegen die Kapazität geprüft, die du für heute angegeben hast.">
            {({ id }) => (
              <Select id={id} value={zweiteArt} onChange={(e) => setZweiteArt(e.target.value)}>
                {ENERGY_LEVELS.map((k) => (
                  <option key={k} value={k}>
                    {ENERGY[k] ?? k}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Bis wann?" hint="Leer lassen heißt: ohne Frist.">
            {({ id }) => <Input id={id} type="date" value={frist} onChange={(e) => setFrist(e.target.value)} />}
          </Field>
        </>
      )}

      {fehler && <Notice tone="attention">{fehler}</Notice>}

      <Actions end>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Abbrechen
        </Button>
        <Button variant="primary" onClick={() => void speichern()} disabled={busy}>
          Speichern
        </Button>
      </Actions>
    </Sheet>
  )
}
