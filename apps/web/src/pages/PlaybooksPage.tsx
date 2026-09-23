import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { endpoints, type PlaybookEntry } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { ENERGY, useAsync } from '../lib/ui.js'
import {
  Actions,
  Button,
  Card,
  Disclosure,
  EmptyState,
  Heading,
  ErrorState,
  Field,
  Input,
  Notice,
  Page,
  Panel,
  Section,
  Select,
  Sheet,
  SkeletonList,
  Step,
  Steps,
  useToast,
} from '../design/index.js'
import { prettyPath } from '../lib/domains.js'

interface StepDraft {
  title: string
  minutes: string
  energy: string
}

/**
 * §15: Vorlagen für Wiederkehrendes.
 *
 * Der Unterschied zum Vorgang wird sprachlich und visuell getragen: Ein Ablauf wird nicht
 * abgearbeitet. Aus ihm entsteht jedes Mal ein neuer Vorgang – die Vorlage bleibt.
 */
export function PlaybooksPage() {
  const { household } = useSession()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [starting, setStarting] = useState<PlaybookEntry | null>(null)

  const playbooks = useAsync(
    () => (household ? endpoints.playbooks(household.id) : Promise.resolve({ items: [], note: '' })),
    [household?.id],
  )
  const domains = useAsync(
    () => (household ? endpoints.domains(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )

  if (!household) return null
  if (playbooks.error) return <ErrorState meaning="Die Abläufe konnten nicht geladen werden." onRetry={playbooks.reload} />

  const items = playbooks.data?.items ?? []

  return (
    <Page
      title="Abläufe"
      lede="Schrittfolgen für Wiederkehrendes."
      // Der Hauptweg hier ist, aus einem Ablauf einen Vorgang zu starten. Solange es
      // Abläufe gibt, tritt das Anlegen zurück (§30).
      action={
        <Button variant={items.length > 0 ? 'secondary' : 'primary'} icon="plus" onClick={() => setCreating(true)}>
          Ablauf anlegen
        </Button>
      }
    >
      {playbooks.loading && !playbooks.data && <SkeletonList count={2} />}

      {playbooks.data && items.length === 0 && (
        <EmptyState
          icon="route"
          title="Noch kein Ablauf"
          description="Typische Kandidaten: neue Schuhe besorgen, Arzttermin vorbereiten, Saisonwechsel bei der Kleidung, Kita-Geburtstag organisieren."
          action={
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              Ersten Ablauf anlegen
            </Button>
          }
        />
      )}

      {items.length > 0 && (
        <Section count={items.length}>
          {items.map((playbook) => (
            <Card key={playbook.id}>
              <Heading className="t-sub card-title">{playbook.title}</Heading>
              {playbook.triggerDescription && (
                <p className="t-body-sm c-secondary">Wenn: {playbook.triggerDescription}</p>
              )}

              <Disclosure summary={`${playbook.steps.length} Schritte ansehen`}>
                <Steps>
                  {playbook.steps.map((step) => (
                    <Step
                      key={step.id}
                      state="open"
                      title={step.title}
                      meta={[
                        step.estimatedMinutes ? `ca. ${step.estimatedMinutes} Min.` : null,
                        step.mentalEnergy !== 'medium' ? ENERGY[step.mentalEnergy] : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  ))}
                </Steps>
              </Disclosure>

              <Actions>
                <Button variant="primary" size="sm" icon="route" onClick={() => setStarting(playbook)}>
                  Vorgang daraus starten
                </Button>
              </Actions>
            </Card>
          ))}
        </Section>
      )}

      <Notice tone="quiet">{playbooks.data?.note}</Notice>

      <Sheet
        open={starting !== null}
        onClose={() => setStarting(null)}
        title={starting ? `„${starting.title}" starten` : ''}
        description="Aus der Vorlage entsteht ein neuer Vorgang. Die Vorlage bleibt unverändert."
      >
        {starting && (
          <StartForm
            playbook={starting}
            domains={domains.data?.items ?? []}
            onStarted={(processId) => {
              setStarting(null)
              navigate(`/vorgang/${processId}`)
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="Neuer Ablauf"
        description="Schreibe die Schritte so auf, wie ihr sie tatsächlich macht."
      >
        <PlaybookForm
          domains={domains.data?.items ?? []}
          onDone={async () => {
            setCreating(false)
            await playbooks.reload()
          }}
        />
      </Sheet>
    </Page>
  )
}

function StartForm({
  playbook,
  domains,
  onStarted,
}: {
  playbook: PlaybookEntry
  domains: { id: string; path: string; name: string }[]
  onStarted: (processId: string) => void
}) {
  const { household } = useSession()
  const toast = useToast()
  const [domainId, setDomainId] = useState(playbook.domainId ?? '')
  const [busy, setBusy] = useState(false)

  return (
    <>
      <Field label="In welchem Bereich?">
        {({ id }) => (
          <Select id={id} value={domainId} onChange={(e) => setDomainId(e.target.value)}>
            <option value="">bitte wählen</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {prettyPath(d, domains)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Notice tone="quiet">
        Es entstehen {playbook.steps.length} Schritte. Nur der erste ist sofort dran – der Rest
        wartet auf seine Vorbedingung.
      </Notice>
      <Actions end>
        <Button
          variant="primary"
          disabled={busy || !domainId}
          onClick={async () => {
            if (!household) return
            setBusy(true)
            try {
              const created = await endpoints.instantiatePlaybook(household.id, playbook.id, { domainId })
              toast.show('Vorgang gestartet.')
              onStarted(created.id)
            } finally {
              setBusy(false)
            }
          }}
        >
          Starten
        </Button>
      </Actions>
    </>
  )
}

function PlaybookForm({
  domains,
  onDone,
}: {
  domains: { id: string; path: string; name: string }[]
  onDone: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [trigger, setTrigger] = useState('')
  const [domainId, setDomainId] = useState('')
  const [steps, setSteps] = useState<StepDraft[]>([{ title: '', minutes: '', energy: 'medium' }])
  const [busy, setBusy] = useState(false)

  const update = (index: number, patch: Partial<StepDraft>) =>
    setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  const filled = steps.filter((s) => s.title.trim().length > 0)

  return (
    <>
      <Field label="Wie heißt der Ablauf?">
        {({ id }) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Neue Schuhe" />}
      </Field>
      <Field label="Wann kommt er zum Einsatz?" hint="Hilft beim Wiederfinden und beim Vorschlagen.">
        {({ id }) => (
          <Input
            id={id}
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="z. B. Schuhe zu klein, kaputt oder fehlen"
          />
        )}
      </Field>
      <Field label="Zu welchem Bereich gehört er?" hint="Optional – ohne Bereich gilt er für den ganzen Haushalt.">
        {({ id }) => (
          <Select id={id} value={domainId} onChange={(e) => setDomainId(e.target.value)}>
            <option value="">— haushaltsweit —</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {prettyPath(d, domains)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <p className="t-label" style={{ marginBottom: 'var(--s-2)' }}>
        Schritte
      </p>
      <Panel sunken>
        {steps.map((step, index) => (
          <div className="field" key={index} style={{ marginBottom: index === steps.length - 1 ? 0 : 'var(--s-4)' }}>
            <Input
              value={step.title}
              onChange={(e) => update(index, { title: e.target.value })}
              placeholder={index === 0 ? 'z. B. Füße messen' : 'nächster Schritt'}
              aria-label={`Schritt ${index + 1}`}
            />
            <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-2)' }}>
              <Input
                type="number"
                min={1}
                value={step.minutes}
                onChange={(e) => update(index, { minutes: e.target.value })}
                placeholder="Min."
                aria-label={`Dauer von Schritt ${index + 1}`}
                style={{ maxWidth: 110 }}
              />
              <Select
                value={step.energy}
                onChange={(e) => update(index, { energy: e.target.value })}
                aria-label={`Energiebedarf von Schritt ${index + 1}`}
              >
                <option value="low">wenig Energie</option>
                <option value="medium">mittlere Energie</option>
                <option value="high">viel Energie</option>
              </Select>
              {steps.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSteps((c) => c.filter((_, i) => i !== index))}
                  aria-label={`Schritt ${index + 1} entfernen`}
                >
                  ✕
                </Button>
              )}
            </div>
          </div>
        ))}
        <Actions spaced>
          <Button
            variant="ghost"
            size="sm"
            icon="plus"
            onClick={() => setSteps((c) => [...c, { title: '', minutes: '', energy: 'medium' }])}
          >
            Schritt
          </Button>
        </Actions>
      </Panel>

      <Actions end>
        <Button
          variant="primary"
          disabled={busy || !title.trim() || filled.length === 0}
          onClick={async () => {
            if (!household) return
            setBusy(true)
            try {
              await endpoints.createPlaybook(household.id, {
                domainId: domainId || null,
                title: title.trim(),
                triggerDescription: trigger,
                steps: filled.map((s) => ({
                  title: s.title.trim(),
                  estimatedMinutes: s.minutes ? Number(s.minutes) : null,
                  mentalEnergy: s.energy,
                })),
              })
              toast.show('Ablauf gespeichert.')
              await onDone()
            } finally {
              setBusy(false)
            }
          }}
        >
          Ablauf speichern
        </Button>
      </Actions>
    </>
  )
}
