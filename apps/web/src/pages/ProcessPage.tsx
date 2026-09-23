import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { endpoints, type ProcessDetail } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { ENERGY, TASK_STATE, useAsync } from '../lib/ui.js'
import {
  Actions,
  Button,
  Disclosure,
  ErrorState,
  Field,
  Notice,
  Page,
  Panel,
  Row,
  RowList,
  Section,
  Sheet,
  SkeletonList,
  Step,
  Steps,
  Textarea,
  useToast,
} from '../design/index.js'
import { AssignSheet, NewTaskSheet, WaitSheet } from '../components/TaskSheet.js'

/**
 * Ein laufender Vorgang (§14 des UX-Auftrags).
 *
 * Prominent ist nur der nächste Schritt. Die übrigen Schritte sind sichtbar, aber
 * zurückgenommen – der Nutzer soll nicht mit dem ganzen Ablauf gleichzeitig belastet werden.
 */
export function ProcessPage() {
  const { household } = useSession()
  const { processId } = useParams<{ processId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [closing, setClosing] = useState(false)
  const [assigning, setAssigning] = useState<{ id: string; title: string } | null>(null)
  const [waiting, setWaiting] = useState<{ id: string; title: string } | null>(null)

  const detail = useAsync<ProcessDetail | null>(
    () => (household && processId ? endpoints.process(household.id, processId) : Promise.resolve(null)),
    [household?.id, processId],
  )
  // §33: Nachvollziehbarkeit existiert im System – sie muss auch sichtbar sein.
  const history = useAsync(
    () => (household && processId ? endpoints.history(household.id, `subjectId=${processId}`) : Promise.resolve({ items: [] })),
    [household?.id, processId],
  )

  if (!household || !processId) return null
  if (detail.error) return <ErrorState meaning="Dieser Vorgang konnte nicht geladen werden." onRetry={detail.reload} />
  if (!detail.data) return <SkeletonList count={2} />

  const d = detail.data
  const nextIds = new Set(d.nextActions.map((t) => t.id))
  const finished = d.process.state === 'completed' || d.process.state === 'abandoned'

  const stepState = (task: ProcessDetail['tasks'][number]): 'done' | 'next' | 'open' | 'blocked' => {
    if (task.state === 'done') return 'done'
    if (nextIds.has(task.id)) return 'next'
    if (task.state === 'blocked' || task.state === 'waiting') return 'blocked'
    return 'open'
  }

  const complete = async (taskId: string, title: string) => {
    setBusy(taskId)
    try {
      await endpoints.completeTask(household.id, taskId)
      toast.show(`„${title}" erledigt.`, async () => {
        await endpoints.reopenTask(household.id, taskId).catch(() => undefined)
        await detail.reload()
      })
      await detail.reload()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Page
      back={{ label: 'Zum Bereich', onClick: () => navigate(`/bereiche/${d.process.domainId}`) }}
      eyebrow="Vorgang"
      title={d.process.title}
      lede={d.process.goal ?? undefined}
      action={
        !finished ? (
          <Button variant="secondary" icon="check" onClick={() => setClosing(true)}>
            Vorgang abschließen
          </Button>
        ) : undefined
      }
    >
      {finished ? (
        <Notice tone="quiet" title="Abgeschlossen">
          {d.process.outcome === 'achieved' ? 'Erledigt.' : 'Verworfen.'} Die Schritte bleiben als Verlauf erhalten.
        </Notice>
      ) : (
        <Notice tone="accent" title="Nächster Schritt">
          {d.nextStepHint}
        </Notice>
      )}

      <Section title="Schritte" count={d.tasks.length}>
        <Panel>
          <Steps>
            {d.tasks.map((task) => (
              <Step
                key={task.id}
                state={stepState(task)}
                title={task.title}
                meta={[
                  TASK_STATE[task.state],
                  task.estimatedMinutes ? `ca. ${task.estimatedMinutes} Min.` : null,
                  task.mentalEnergy !== 'medium' ? ENERGY[task.mentalEnergy] : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                action={
                  !finished && (task.state === 'ready' || task.state === 'in_progress') ? (
                    <span style={{ display: 'flex', gap: 'var(--s-1)' }}>
                      <Button
                        variant={nextIds.has(task.id) ? 'primary' : 'ghost'}
                        size="sm"
                        icon="check"
                        disabled={busy === task.id}
                        onClick={() => void complete(task.id, task.title)}
                      >
                        Erledigt
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Optionen für „${task.title}"`}
                        onClick={() => setAssigning({ id: task.id, title: task.title })}
                        icon="family"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`„${task.title}" wartet auf etwas`}
                        onClick={() => setWaiting({ id: task.id, title: task.title })}
                        icon="clock"
                      />
                    </span>
                  ) : !finished && task.state === 'waiting' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === task.id}
                      onClick={async () => {
                        setBusy(task.id)
                        try {
                          await endpoints.releaseWait(household.id, task.id)
                          toast.show('Wieder freigegeben.')
                          await detail.reload()
                        } finally {
                          setBusy(null)
                        }
                      }}
                    >
                      Ist eingetroffen
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </Steps>
        </Panel>

        {!finished && (
          <Actions>
            <Button variant="ghost" size="sm" icon="plus" onClick={() => setAdding(true)}>
              Schritt ergänzen
            </Button>
          </Actions>
        )}
      </Section>

      {history.data && history.data.items.length > 0 && (
        <Section title="Verlauf">
          <Panel sunken>
            <Disclosure summary={`${history.data.items.length} Ereignisse`}>
              <RowList>
                {history.data.items.map((event) => (
                  <li key={event.id}>
                    <Row
                      title={describeEvent(event.eventType)}
                      subtitle={`${new Date(event.occurredAt).toLocaleString('de-DE')}${
                        event.actorKind === 'system' ? ' · vom System' : ''
                      }`}
                    />
                  </li>
                ))}
              </RowList>
            </Disclosure>
          </Panel>
        </Section>
      )}

      <NewTaskSheet
        open={adding}
        onClose={() => setAdding(false)}
        processId={processId}
        domainId={d.process.domainId}
        onDone={detail.reload}
      />

      {assigning && (
        <AssignSheet
          open
          onClose={() => setAssigning(null)}
          taskId={assigning.id}
          taskTitle={assigning.title}
          onDone={detail.reload}
        />
      )}
      {waiting && (
        <WaitSheet
          open
          onClose={() => setWaiting(null)}
          taskId={waiting.id}
          taskTitle={waiting.title}
          onDone={detail.reload}
        />
      )}

      <Sheet
        open={closing}
        onClose={() => setClosing(false)}
        title="Vorgang abschließen"
        description="Was ihr dabei gelernt habt, erspart beim nächsten Mal die Sucherei."
      >
        <CloseProcess
          processId={processId}
          openTaskCount={d.openTaskCount}
          onDone={async () => {
            setClosing(false)
            await detail.reload()
          }}
        />
      </Sheet>
    </Page>
  )
}

/** Ereignistypen in Klartext – niemand soll `task.state_changed` lesen müssen. */
export function describeEvent(eventType: string): string {
  const map: Record<string, string> = {
    'process.created': 'Vorgang angelegt',
    'process.completed': 'Vorgang abgeschlossen',
    'process.stalled': 'Kein nächster Schritt festgelegt',
    'task.created': 'Schritt hinzugefügt',
    'task.state_changed': 'Schritt geändert',
    'task.assigned': 'Ausführung zugewiesen',
    'task.waiting_declared': 'Wartet auf etwas',
    'task.waiting_released': 'Wartezeit beendet',
    'task.overdue_reassessed': 'Neu bewertet',
    /* Gelöscht heißt nicht spurlos – der Verlauf behält den Titel (§4). */
    'task.deleted': 'Aufgabe gelöscht',
    'ownership.assigned': 'Verantwortung übernommen',
    'ownership.transferred': 'Verantwortung übergeben',
    'ownership.released': 'Verantwortung abgegeben',
    'state.value_updated': 'Angabe aktualisiert',
    'state.conflict_detected': 'Zwei Angaben im Widerspruch',
    'state.conflict_resolved': 'Widerspruch geklärt',
    'attention.created': 'Hinweis entstanden',
    'attention.promoted': 'Aus Hinweis wurde ein Vorgang',
    'knowledge.created': 'Notiz festgehalten',
    'question.asked': 'Frage festgehalten',
    'question.answered': 'Frage beantwortet',
    'decision.recorded': 'Entscheidung festgehalten',
    'playbook.instantiated': 'Aus Ablauf erzeugt',
    'domain.created': 'Bereich angelegt',
    'capacity.declared': 'Kapazität angegeben',
  }
  return map[eventType] ?? eventType
}

function CloseProcess({
  processId,
  openTaskCount,
  onDone,
}: {
  processId: string
  openTaskCount: number
  onDone: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [learnings, setLearnings] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <>
      <Field label="Was habt ihr gelernt?" hint="Optional. Landet als Notiz im Bereich.">
        {({ id }) => <Textarea markdown id={id} rows={3} value={learnings} onChange={(e) => setLearnings(e.target.value)} />}
      </Field>

      {openTaskCount > 0 && (
        <Notice tone="attention" title={`${openTaskCount} Schritte sind noch offen`}>
          Beim Abschließen werden sie mit Begründung verworfen – sie verschwinden nicht
          stillschweigend und bleiben im Verlauf sichtbar.
        </Notice>
      )}

      <Actions end>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            if (!household) return
            setBusy(true)
            try {
              await endpoints.completeProcess(household.id, processId, {
                outcome: 'achieved',
                learnings: learnings || undefined,
                forceCloseReason: openTaskCount > 0 ? 'Beim Abschluss nicht mehr nötig' : undefined,
              })
              toast.show('Vorgang abgeschlossen.')
              await onDone()
            } finally {
              setBusy(false)
            }
          }}
        >
          Erledigt und abschließen
        </Button>
      </Actions>
    </>
  )
}
