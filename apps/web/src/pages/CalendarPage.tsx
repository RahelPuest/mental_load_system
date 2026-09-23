import { useState } from 'react'
import { endpoints } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { SHARE_LEVEL, formatDateTime, relativeDays, useAsync } from '../lib/ui.js'
import {
  Actions,
  Button,
  Chip,
  Chips,
  Divider,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Notice,
  Page,
  Panel,
  Row,
  RowList,
  Section,
  Select,
  Sheet,
  SkeletonList,
  useToast,
} from '../design/index.js'

const STATE: Record<string, { label: string; tone: 'success' | 'attention' | 'neutral' }> = {
  active: { label: 'verbunden', tone: 'success' },
  degraded: { label: 'liefert gerade nichts', tone: 'attention' },
  needs_reauth: { label: 'muss neu freigegeben werden', tone: 'attention' },
  disconnected: { label: 'getrennt', tone: 'neutral' },
  revoked: { label: 'widerrufen', tone: 'neutral' },
  pending_auth: { label: 'wartet auf Freigabe', tone: 'neutral' },
}

/** §14 und §18: Kalender liefert Kontext. Kein Kalenderersatz – nur Verbindung und Sicht. */
export function CalendarPage() {
  const { household } = useSession()
  const toast = useToast()
  const [adding, setAdding] = useState(false)

  const connections = useAsync(
    () =>
      household
        ? endpoints.calendarConnections(household.id)
        : Promise.resolve({ own: [], othersCount: 0, note: '' }),
    [household?.id],
  )
  const events = useAsync(
    () => (household ? endpoints.calendarEvents(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )

  if (!household) return null
  if (connections.error)
    return <ErrorState meaning="Die Kalenderverbindungen konnten nicht geladen werden." onRetry={connections.reload} />

  const own = connections.data?.own ?? []
  const upcoming = (events.data?.items ?? [])
    .filter((e) => new Date(e.startsAt).getTime() > Date.now() - 3_600_000)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 15)

  return (
    <Page
      title="Kalender"
      lede="Verbundene Kalender. Thealotta schreibt nichts hinein."
      // Solange nichts verbunden ist, führt der leere Zustand – er erklärt auch, was
      // gebraucht wird. Zweimal dieselbe Aktion auf einer leeren Seite ist Rauschen (§30).
      action={
        own.length > 0 ? (
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
            Kalender verbinden
          </Button>
        ) : undefined
      }
    >
      {connections.loading && !connections.data && <SkeletonList count={2} />}

      <Section title="Deine Kalender" count={own.length}>
        {own.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="Noch kein Kalender verbunden"
            description="Ein ICS-Abo-Link genügt – den bieten iCloud, Google, Nextcloud und die meisten Kita- und Schulkalender an."
            action={
              <Button variant="secondary" icon="plus" onClick={() => setAdding(true)}>
                Kalender verbinden
              </Button>
            }
          />
        ) : (
          <Panel>
            {own.map((connection, index) => {
              const state = STATE[connection.state] ?? { label: connection.state, tone: 'neutral' as const }
              const selection = connection.selections[0]
              return (
                <div key={connection.id}>
                  {index > 0 && <Divider />}
                  <div className="setting-row" style={{ display: 'block' }}>
                    <p className="t-sub">{connection.displayName}</p>
                    <Chips>
                      <Chip tone={state.tone} icon={connection.state === 'active' ? 'check' : 'clock'}>
                        {state.label}
                      </Chip>
                      <Chip>zuletzt abgeglichen {relativeDays(connection.lastSyncAt)}</Chip>
                    </Chips>

                    {connection.state === 'degraded' && (
                      <Notice tone="attention" title="Der Abgleich klappt gerade nicht">
                        Bestehende Termine und alles, was daraus entstanden ist, bleiben unverändert
                        erhalten – es kommen nur keine neuen dazu. Wir versuchen es weiter.
                      </Notice>
                    )}

                    {selection && (
                      <Field
                        label="Was sollen andere im Haushalt sehen?"
                        hint="Für die Zeitplanung reicht meist, dass ein Zeitraum belegt ist."
                      >
                        {({ id }) => (
                          <Select
                            id={id}
                            value={selection.shareLevel}
                            onChange={async (e) => {
                              await endpoints.updateCalendarSelection(household.id, connection.id, {
                                externalCalendarId: selection.externalCalendarId,
                                readEnabled: selection.readEnabled,
                                writeEnabled: false,
                                shareLevel: e.target.value,
                              })
                              toast.show('Sichtbarkeit geändert.')
                              await connections.reload()
                            }}
                          >
                            {Object.entries(SHARE_LEVEL).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    )}

                    <Actions spaced={false}>
                      <Button
                        size="sm"
                        onClick={async () => {
                          const result = await endpoints.syncCalendar(household.id, connection.id)
                          toast.show(result.note)
                          await connections.reload()
                        }}
                      >
                        Jetzt abgleichen
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                          await endpoints.disconnectCalendar(household.id, connection.id)
                          toast.show('Verbindung getrennt. Bestehende Termine bleiben erhalten.')
                          await connections.reload()
                        }}
                      >
                        Trennen
                      </Button>
                    </Actions>
                  </div>
                </div>
              )
            })}
          </Panel>
        )}

        {(connections.data?.othersCount ?? 0) > 0 && (
          <p className="t-body-sm c-muted" style={{ marginTop: 'var(--s-3)' }}>
            {connections.data!.othersCount} weitere Kalender gehören anderen Mitgliedern. Fremde
            Kalender kannst du weder einsehen noch verändern.
          </p>
        )}
      </Section>

      <Section title="Nächste Termine" count={upcoming.length}>
        {upcoming.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={own.length === 0 ? 'Noch nichts im Blick' : 'Keine Termine in den nächsten Tagen'}
            description={
              own.length === 0
                ? 'Sobald ein Kalender verbunden ist, stehen hier die Termine, die Vorbereitung brauchen könnten.'
                : 'Der verbundene Kalender ist erreichbar, hat für die nächsten Tage aber nichts eingetragen.'
            }
          />
        ) : (
          <RowList>
            {upcoming.map((event) => (
              <li key={event.id}>
                <Row
                  title={event.title}
                  subtitle={event.allDay ? 'ganztägig' : formatDateTime(event.startsAt)}
                  end={event.contentHidden ? <Chip icon="lock">Inhalt privat</Chip> : undefined}
                />
              </li>
            ))}
          </RowList>
        )}
      </Section>

      <Notice tone="quiet">{connections.data?.note}</Notice>

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Kalender verbinden"
        description="Nur lesend. Die Adresse wird verschlüsselt gespeichert."
      >
        <ConnectForm
          onDone={async () => {
            setAdding(false)
            await connections.reload()
          }}
        />
      </Sheet>
    </Page>
  )
}

function ConnectForm({ onDone }: { onDone: () => Promise<void> }) {
  const { household } = useSession()
  const toast = useToast()
  const [displayName, setDisplayName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <>
      <Field label="Name">
        {({ id }) => (
          <Input
            id={id}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="z. B. Familienkalender"
          />
        )}
      </Field>
      <Field
        label="ICS-Adresse"
        hint={'Der Abo-Link deines Kalenders – in iCloud, Google und Nextcloud „öffentlicher Link“ oder „Abonnieren“.'}
        error={error ?? undefined}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="url"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/kalender.ics"
          />
        )}
      </Field>

      <Actions end spaced={false}>
        <Button
          variant="primary"
          disabled={busy || !url.trim()}
          onClick={async () => {
            if (!household) return
            setBusy(true)
            setError(null)
            try {
              await endpoints.connectCalendar(household.id, {
                provider: 'ics',
                displayName: displayName.trim() || 'Kalender',
                config: { url: url.trim() },
              })
              toast.show('Verbunden. Der erste Abgleich läuft im Hintergrund.')
              await onDone()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Die Adresse konnte nicht verwendet werden.')
            } finally {
              setBusy(false)
            }
          }}
        >
          Verbinden
        </Button>
      </Actions>
    </>
  )
}
