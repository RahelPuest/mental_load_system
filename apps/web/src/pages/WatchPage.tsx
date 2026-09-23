import { useMemo, useState } from 'react'
import { describeRecurrence, type MonitorRuleKind, type Recurrence } from '@thealotta/contracts'
import { useNavigate } from 'react-router-dom'
import { endpoints } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { relativeDays, useAsync } from '../lib/ui.js'
import { prettyPath } from '../lib/domains.js'
import { MonitorSheet } from './DomainDetailPage.js'
import {
  Actions,
  Button,
  Card,
  Chip,
  Consequence,
  EmptyState,
  ErrorState,
  Heading,
  Notice,
  Page,
  Panel,
  Row,
  RowList,
  Section,
  SkeletonList,
  useToast,
} from '../design/index.js'

/**
 * Was das System für euch im Blick behält.
 *
 * Das ist die Ansicht, die die Kernzusage einlösbar macht: „Ich muss nicht daran denken,
 * woran ich denken muss." Wer das glauben soll, muss nachsehen können, *was* beobachtet wird
 * und *wann als Nächstes* – sonst ist es Vertrauen ins Blaue (Auftrag §46, §12).
 *
 * Bisher gab es das nur je Bereich versteckt hinter einem Aufklapper.
 */
/** Die Regelarten in der Sprache der Familie, nicht in der des Modells (§12). */
/** Vollständig über MONITOR_RULE_KINDS – der Test `rules.spec.ts` hält das nach. */
export const RULE_KIND: Record<MonitorRuleKind, string> = {
  state_freshness: 'Regelmäßig nachprüfen',
  state_unknown: 'Erinnern, solange etwas offen ist',
  state_threshold: 'Melden, wenn ein Grenzwert erreicht ist',
  date_field_lead_time: 'Rechtzeitig vor dem hinterlegten Datum melden',
  lead_time_before_event: 'Rechtzeitig vor einem Termin melden',
  dependency_recheck: 'Nach einer anderen Aufgabe',
  absence: 'Melden, wenn hier lange nichts passiert ist',
  seasonal: 'Zu einer bestimmten Jahreszeit melden',
  schedule: 'In festem Rhythmus',
}

/**
 * Was eine Regel tut, in einem Satz.
 *
 * Bei einer Wiederholung steht der Rhythmus im Klartext – `describeRecurrence` liefert
 * genau den Satz, den auch die Vorschau beim Einrichten und die Begründung der Aufgabe
 * benutzen. Hier stand vorher nur „In festem Rhythmus melden", also die Art der Regel statt
 * ihres Inhalts: Man sah nicht, ob der Müll montags oder donnerstags dran ist (Audit N1).
 */
function beschreibeRegel(rule: { ruleKind: string; config?: Record<string, unknown> }): string {
  if (rule.ruleKind === 'schedule') {
    const muster = readRecurrenceConfig(rule.config ?? {})
    if (muster) return describeRecurrence(muster)
  }
  return RULE_KIND[rule.ruleKind as MonitorRuleKind] ?? 'Regelmäßige Prüfung'
}

/** Dieselbe Lesart wie auf dem Server – ohne dessen Datumsarithmetik mitzubringen. */
function readRecurrenceConfig(config: Record<string, unknown>): Recurrence | null {
  const tag = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
  const grenzen: Recurrence = {}
  const until = tag(config['until'])
  if (until) grenzen.until = until
  if (typeof config['count'] === 'number') grenzen.count = config['count']

  const nth = config['nthWeekday'] as { nth?: unknown; weekday?: unknown } | undefined
  if (nth && typeof nth.nth === 'number' && typeof nth.weekday === 'number') {
    return { ...grenzen, nthWeekday: { nth: nth.nth, weekday: nth.weekday } }
  }
  if (Array.isArray(config['weekdays']) && config['weekdays'].length > 0) {
    return { ...grenzen, weekdays: config['weekdays'].filter((d): d is number => typeof d === 'number') }
  }
  if (typeof config['monthday'] === 'number') return { ...grenzen, monthday: config['monthday'] }
  if (typeof config['every'] === 'string') return { ...grenzen, every: config['every'] }
  return null
}

export function WatchPage() {
  const { household } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [neu, setNeu] = useState(false)

  const monitors = useAsync(
    () => (household ? endpoints.monitors(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const attention = useAsync(
    () => (household ? endpoints.attention(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const domains = useAsync(
    () => (household ? endpoints.domains(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )

  const domainList = domains.data?.items ?? []
  const nameOf = useMemo(() => {
    const map = new Map(domainList.map((d) => [d.id, prettyPath(d, domainList)]))
    return (id: string | null) => (id ? (map.get(id) ?? 'Bereich') : 'Ohne Bereich')
  }, [domainList])

  if (!household) return null
  if (monitors.error)
    return <ErrorState meaning="Die Beobachtungen konnten nicht geladen werden." onRetry={monitors.reload} />

  const rules = monitors.data?.items ?? []
  const open = attention.data?.items ?? []
  const active = rules.filter((r) => r.enabled)
  const paused = rules.filter((r) => !r.enabled)

  return (
    <Page
      title="Regeln"
      /*
        Hieß „Beobachtung". Seit eine Regel auch jeden Donnerstag den Müll anlegen kann, ist
        das zu eng: Diese Regel beobachtet nichts. Dasselbe Objekt hieß zudem an drei Stellen
        verschieden – „Beobachtung", „Worauf wir achten", „Regel" (Audit M3).
      */
      lede="Was von selbst passiert oder auffällt – und was sich gemeldet hat."
      /*
        Diese Seite listet alle Regeln des Haushalts – und hatte keinen Weg, eine anzulegen.
        Wer eine regelmäßige Aufgabe einrichten wollte, musste wissen, dass das auf der Seite
        eines Bereichs geht. Genau hier sucht man es (§31).
      */
      action={
        <Button variant="primary" icon="plus" onClick={() => setNeu(true)}>
          Regel einrichten
        </Button>
      }
    >
      {(monitors.loading || attention.loading) && !monitors.data && <SkeletonList count={3} />}

      <Section
        icon="bell"
        title="Hat sich gemeldet"
        count={open.length}
        hint="Etwas ist aufgefallen. Nichts davon ist eine Aufgabe, bis ihr entscheidet."
      >
        {open.length === 0 ? (
          <Panel sunken>
            <p className="t-body-sm c-secondary">
              Gerade nichts. Das heißt nicht, dass nichts läuft – es heißt, dass nichts eine
              Entscheidung braucht.
            </p>
          </Panel>
        ) : (
          <div className="card-grid">
            {open.map((item) => (
              <Card key={item.id} tone="attention">
                <p className="t-overline c-muted">{nameOf(item.domainId)}</p>
                <Heading className="t-sub card-title">{item.title}</Heading>
                <p className="t-body-sm c-secondary" style={{ marginTop: 'var(--s-1)' }}>
                  {item.whyNow}
                </p>
                <Consequence>{item.ifItWaits}</Consequence>
                <Actions>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy === item.id}
                    onClick={async () => {
                      setBusy(item.id)
                      try {
                        const result = await endpoints.promote(household.id, item.id)
                        navigate(`/vorgang/${result.processId}`)
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    Kümmern wir uns drum
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === item.id}
                    onClick={async () => {
                      setBusy(item.id)
                      try {
                        await endpoints.triage(household.id, item.id, 'snooze', {
                          until: new Date(Date.now() + 7 * 86_400_000).toISOString(),
                        })
                        toast.show('In einer Woche wieder da.')
                        await attention.reload()
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    In einer Woche
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === item.id}
                    onClick={async () => {
                      setBusy(item.id)
                      try {
                        await endpoints.triage(household.id, item.id, 'dismiss', {})
                        toast.show('Erledigt sich anders.')
                        await attention.reload()
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    Jetzt nicht
                  </Button>
                </Actions>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section
        icon="eye"
        title="Aktive Regeln"
        count={active.length}
        hint="In klarer Sprache: was, wie oft, und wann das nächste Mal."
      >
        {active.length === 0 ? (
          <EmptyState
            icon="eye"
            title="Noch keine Regel"
            description={'Eine Regel nimmt euch das Daran-Denken ab: „Alle sechs Wochen prüfen, ob die Schuhe noch passen." Oder sie legt selbst eine Aufgabe an: „donnerstags Müll rausbringen."'}
            action={
              <Button variant="secondary" icon="plus" onClick={() => setNeu(true)}>
                Regel einrichten
              </Button>
            }
          />
        ) : (
          <RowList>
            {active.map((rule) => (
              <li key={rule.id}>
                <Row
                  title={rule.name}
                  subtitle={`${beschreibeRegel(rule)} · ${nameOf(rule.domainId)}${
                    rule.nextEvaluationAt ? ` · nächste Prüfung ${relativeDays(rule.nextEvaluationAt)}` : ''
                  }`}
                  end={
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === rule.id}
                      onClick={async () => {
                        setBusy(rule.id)
                        try {
                          const result = await endpoints.evaluateMonitor(household.id, rule.id)
                          toast.show(
                            result.signalsCreated > 0
                              ? 'Etwas ist aufgefallen – steht oben.'
                              : 'Nichts Neues. Alles im Rahmen.',
                          )
                          await Promise.all([attention.reload(), monitors.reload()])
                        } finally {
                          setBusy(null)
                        }
                      }}
                    >
                      Jetzt prüfen
                    </Button>
                  }
                  onClick={rule.domainId ? () => navigate(`/bereiche/${rule.domainId}`) : undefined}
                />
              </li>
            ))}
          </RowList>
        )}
      </Section>

      {paused.length > 0 && (
        <Section title="Ruht gerade" count={paused.length} hint="Diese Beobachtungen melden sich nicht.">
          <RowList>
            {paused.map((rule) => (
              <li key={rule.id}>
                <Row
                  title={rule.name}
                  subtitle={nameOf(rule.domainId)}
                  end={<Chip>pausiert</Chip>}
                  onClick={rule.domainId ? () => navigate(`/bereiche/${rule.domainId}`) : undefined}
                />
              </li>
            ))}
          </RowList>
        </Section>
      )}

      <Notice tone="quiet" title="Warum das hier steht">
        Ein System, dem man das Mitdenken überlässt, muss zeigen, was es tatsächlich beobachtet.
        Sonst verlässt man sich auf etwas, das man nie überprüft hat.
      </Notice>
      <MonitorSheet
        open={neu}
        onClose={() => setNeu(false)}
        domains={domainList}
        states={[]}
        monitors={rules}
        onDone={async () => {
          await monitors.reload()
        }}
      />
    </Page>
  )
}
