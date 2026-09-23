import { useState } from 'react'
import { endpoints } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { useAsync } from '../lib/ui.js'
import {
  Actions,
  Button,
  Field,
  Input,
  Notice,
  Select,
  Sheet,
  useToast,
} from '../design/index.js'

/**
 * Aufgabe anlegen – mit den drei Dingen, die im ersten Durchgang unerreichbar waren:
 * Zuweisung (§26), Kontextbedingungen (§13) und Wartezustand (§27).
 *
 * Alles Weitere bleibt eingeklappt: Titel eintippen und speichern muss ohne einen einzigen
 * weiteren Klick gehen.
 */
export function NewTaskSheet({
  open,
  onClose,
  domainId,
  processId,
  onDone,
}: {
  open: boolean
  onClose: () => void
  domainId?: string | null
  processId?: string | null
  onDone: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [minutes, setMinutes] = useState('')
  const [energy, setEnergy] = useState('medium')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)

  const members = useAsync(
    () => (household && open ? endpoints.members(household.id) : Promise.resolve({ items: [] })),
    [household?.id, open],
  )


  return (
    <Sheet open={open} onClose={onClose} title="Neue Aufgabe" description="Titel genügt. Der Rest ist freiwillig.">
      <Field label="Was ist zu tun?">
        {({ id }) => (
          <Input
            id={id}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Zehenraum prüfen"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit()
            }}
          />
        )}
      </Field>

      {!more ? (
        <Actions spaced={false}>
          <Button variant="ghost" size="sm" onClick={() => setMore(true)}>
            Wer, wann und wie lange festlegen
          </Button>
        </Actions>
      ) : (
        <>
          <Field
            label="Wer macht es?"
            hint="Das ändert nichts an der Verantwortung für den Bereich – nur daran, wer ausführt."
          >
            {({ id }) => (
              <Select id={id} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">— offen —</option>
                {(members.data?.items ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
            <Field label="Dauer">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="Min."
                />
              )}
            </Field>
            <Field label="Energie">
              {({ id }) => (
                <Select id={id} value={energy} onChange={(e) => setEnergy(e.target.value)}>
                  <option value="low">wenig</option>
                  <option value="medium">mittel</option>
                  <option value="high">viel</option>
                </Select>
              )}
            </Field>
          </div>
        </>
      )}

      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="primary" disabled={busy || !title.trim()} onClick={() => void submit()}>
          Anlegen
        </Button>
      </Actions>
    </Sheet>
  )

  async function submit(): Promise<void> {
    if (!household || !title.trim()) return
    setBusy(true)
    try {
      await endpoints.createTask(household.id, {
        title: title.trim(),
        domainId: domainId ?? null,
        processId: processId ?? null,
        assigneeMembershipId: assignee || null,
        estimatedMinutes: minutes ? Number(minutes) : null,
        mentalEnergy: energy,
      })
      setTitle('')
      setMinutes('')
      setMore(false)
      onClose()
      toast.show('Aufgabe angelegt.')
      await onDone()
    } finally {
      setBusy(false)
    }
  }
}

/** §26: Delegation ändert die Ausführung, nie die Verantwortung. */
export function AssignSheet({
  open,
  onClose,
  taskId,
  taskTitle,
  onDone,
}: {
  open: boolean
  onClose: () => void
  taskId: string
  taskTitle: string
  onDone: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [membershipId, setMembershipId] = useState('')
  const [kind, setKind] = useState('delegated')
  const [overrideReason, setOverrideReason] = useState('')
  const [needsOverride, setNeedsOverride] = useState(false)
  const [busy, setBusy] = useState(false)

  const members = useAsync(
    () => (household && open ? endpoints.members(household.id) : Promise.resolve({ items: [] })),
    [household?.id, open],
  )

  const submit = async (withOverride: boolean) => {
    if (!household) return
    setBusy(true)
    try {
      await endpoints.assignTask(household.id, taskId, {
        membershipId: membershipId || null,
        delegationKind: kind,
        override: withOverride,
        overrideReason: withOverride ? overrideReason : undefined,
      })
      onClose()
      setNeedsOverride(false)
      setOverrideReason('')
      toast.show('Zugewiesen. Die Verantwortung für den Bereich bleibt unverändert.')
      await onDone()
    } catch (error) {
      // Die Person nimmt gerade nichts Neues an – kein Fehler, sondern eine Rückfrage.
      if (error instanceof Error && error.message.includes('nimmt gerade keine')) setNeedsOverride(true)
      else toast.show('Das konnte nicht gespeichert werden.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Aufgabe zuweisen" description={taskTitle}>
      <Notice tone="quiet">
        Zuweisen heißt: Diese Person führt aus. Wer für den Bereich mitdenkt, ändert sich dadurch nicht.
      </Notice>

      <Field label="Wer führt aus?">
        {({ id }) => (
          <Select id={id} value={membershipId} onChange={(e) => setMembershipId(e.target.value)}>
            <option value="">— niemand, wieder offen —</option>
            {(members.data?.items ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="Wie ist das gemeint?">
        {({ id }) => (
          <Select id={id} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="delegated">Delegiert – du bleibst dran</option>
            <option value="transferred">Übertragen – die Aufgabe gehört jetzt dorthin</option>
            <option value="shared">Gemeinsam</option>
            <option value="support_requested">Nur Unterstützung angefragt</option>
          </Select>
        )}
      </Field>

      {needsOverride && (
        <>
          <Notice tone="attention" title="Diese Person nimmt gerade nichts Neues an">
            Sie hat für diesen Zeitraum reduzierte Kapazität angegeben. Du kannst die Aufgabe
            trotzdem zuweisen – mit einer kurzen Begründung, die festgehalten wird.
          </Notice>
          <Field label="Warum trotzdem?">
            {({ id }) => (
              <Input
                id={id}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="z. B. kurz abgesprochen"
              />
            )}
          </Field>
        </>
      )}

      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={busy || (needsOverride && !overrideReason.trim())}
          onClick={() => void submit(needsOverride)}
        >
          {needsOverride ? 'Trotzdem zuweisen' : 'Zuweisen'}
        </Button>
      </Actions>
    </Sheet>
  )
}

/** §27: Warten ist ein eigener Zustand mit Wiedervorlage – nicht „liegt halt rum". */
export function WaitSheet({
  open,
  onClose,
  taskId,
  taskTitle,
  onDone,
}: {
  open: boolean
  onClose: () => void
  taskId: string
  taskTitle: string
  onDone: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [kind, setKind] = useState('external_party')
  const [description, setDescription] = useState('')
  const [recheck, setRecheck] = useState(() => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Worauf wartet das?"
      description={taskTitle}
    >
      <Notice tone="quiet">
        Die Aufgabe verschwindet aus „Jetzt", bleibt aber unter „Wartet auf andere" sichtbar –
        und meldet sich zum gewählten Zeitpunkt von selbst zurück.
      </Notice>

      <Field label="Art">
        {({ id }) => (
          <Select id={id} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="external_party">Antwort von außen (Praxis, Amt, Verein)</option>
            <option value="person">Entscheidung einer Person</option>
            <option value="delivery">Lieferung</option>
            <option value="event">Ein Ereignis</option>
            <option value="date">Einen Zeitpunkt</option>
            <option value="manual_release">Etwas anderes</option>
          </Select>
        )}
      </Field>

      <Field label="Worauf genau?">
        {({ id }) => (
          <Input
            id={id}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="z. B. Rückruf der Kinderarztpraxis"
          />
        )}
      </Field>

      <Field label="Wann soll es wieder auftauchen?" hint="Auch wenn nichts passiert, meldet sich Thealotta zu diesem Termin.">
        {({ id }) => <Input id={id} type="date" value={recheck} onChange={(e) => setRecheck(e.target.value)} />}
      </Field>

      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={busy || !description.trim() || !recheck}
          onClick={async () => {
            if (!household) return
            setBusy(true)
            try {
              await endpoints.waitTask(household.id, taskId, {
                waitingKind: kind,
                description: description.trim(),
                recheckAt: new Date(recheck).toISOString(),
                waitingOnMembershipId: null,
                externalParty: null,
              })
              setDescription('')
              onClose()
              toast.show('Notiert. Kommt zum gewählten Zeitpunkt zurück.')
              await onDone()
            } finally {
              setBusy(false)
            }
          }}
        >
          Als wartend markieren
        </Button>
      </Actions>
    </Sheet>
  )
}
