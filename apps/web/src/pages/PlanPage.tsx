import { useNavigate } from 'react-router-dom'
import { endpoints, type AgendaEntry } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { useAsync } from '../lib/ui.js'
import { toneClass, useColors } from '../lib/colors.js'
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Heading,
  Icon,
  Notice,
  Page,
  Panel,
  PersonDot,
  Row,
  RowList,
  Section,
  SkeletonList,
  type IconName,
  ICON,
} from '../design/index.js'

/**
 * Der gemeinsame Plan.
 *
 * „Jetzt" beantwortet „was soll ich tun". Diese Seite beantwortet die andere Frage, die in
 * einem Haushalt ständig gestellt wird: „Was steht diese Woche an – und bei wem?" Ohne sie
 * muss man die Antwort aus mehreren Ansichten zusammensetzen, und genau das soll Thealotta
 * abnehmen.
 *
 * Was zurückliegt steht oben, nicht versteckt: Ein Plan, der nur nach vorn schaut,
 * verbirgt gerade das, weswegen man ihn aufmacht. Der Ton bleibt sachlich – der Zeitpunkt
 * ist vorbei, mehr sagt es nicht (§36).
 */
const KIND: Record<AgendaEntry['kind'], { icon: IconName; label: string }> = {
  event: { icon: 'calendar', label: 'Termin' },
  task: { icon: 'check', label: 'Aufgabe' },
  check: { icon: 'eye', label: 'Prüfung' },
}

export function PlanPage() {
  const { household } = useSession()
  const navigate = useNavigate()
  const colors = useColors()

  const plan = useAsync(
    () => (household ? endpoints.agenda(household.id, 14) : Promise.resolve(null)),
    [household?.id],
  )

  if (!household) return null
  if (plan.error) return <ErrorState meaning="Der Plan konnte nicht geladen werden." onRetry={plan.reload} />

  const data = plan.data
  const nothingDated = data && data.overdue.length === 0 && data.days.length === 0

  return (
    <Page
      title="Der Plan"
      lede="Was ansteht – Termine, Fälligkeiten und Prüfungen aller, Tag für Tag."
    >
      {plan.loading && !data && <SkeletonList count={3} />}

      {data && data.overdue.length > 0 && (
        <Section icon="clock" title="Liegt schon länger" count={data.overdue.length}>
          <Panel>
            <RowList>
              {data.overdue.map((entry) => (
                <li key={`${entry.kind}-${entry.id}`}>
                  <EntryRow entry={entry} onOpen={() => openEntry(entry, navigate)} />
                </li>
              ))}
            </RowList>
          </Panel>
        </Section>
      )}

      {data && data.days.length > 0 && (
        <Section icon="calendar" title="Die nächsten Tage">
          <div className="plan-days">
            {data.days.map((day) => (
              <section key={day.date} className="plan-day">
                <header>
                  <p className="t-sub">{dayLabel(day.date)}</p>
                  <span className="t-caption c-muted">{dateLabel(day.date)}</span>
                </header>
                <RowList>
                  {day.entries.map((entry) => (
                    <li key={`${entry.kind}-${entry.id}`}>
                      <EntryRow entry={entry} onOpen={() => openEntry(entry, navigate)} />
                    </li>
                  ))}
                </RowList>
              </section>
            ))}
          </div>
        </Section>
      )}

      {nothingDated && (
        <EmptyState
          icon="calendar"
          title="Nichts mit Datum in den nächsten zwei Wochen"
          description="Das meiste in einem Haushalt hat kein Datum – es steht unten, nach Personen sortiert. Termine erscheinen hier, sobald ein Kalender verbunden ist."
          action={
            <Button variant="secondary" icon="calendar" onClick={() => navigate('/kalender')}>
              Kalender verbinden
            </Button>
          }
        />
      )}

      {data && (
        <Section icon="family" title="Ohne Datum, nach Personen" hint="Der größere Teil des Alltags.">
          <div className="card-grid">
            {data.perMember.map((member) => (
              <article key={member.membershipId} className={`card person-card ${toneClass(colors.memberTone(member.membershipId))}`}>
                {/* Eine Überschrift darf nicht in einem Absatz stehen – `div` statt `p`. */}
                <div className="card-eyebrow">
                  <PersonDot name={member.displayName} membershipId={member.membershipId} size="lg" />
                  <Heading className="t-sub">{member.displayName}</Heading>
                </div>
                <p className="t-caption c-muted">
                  {member.open === 0
                    ? 'Gerade nichts Offenes'
                    : `${member.open} offen${member.waiting > 0 ? ` · ${member.waiting} wartet auf andere` : ''}`}
                </p>
                {member.items.length > 0 && (
                  <ul className="plan-items t-body-sm">
                    {member.items.map((item) => (
                      <li key={item.id}>
                        <Icon name="check" size={ICON.sm} />
                        <span>
                          {item.title}
                          {item.domain && <span className="c-muted"> · {item.domain}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {member.open > member.items.length && (
                  <p className="t-caption c-muted">und {member.open - member.items.length} weitere</p>
                )}
              </article>
            ))}
          </div>
        </Section>
      )}

      {data && data.unassigned.length > 0 && (
        <Section icon="flag" title="Trägt gerade niemand" count={data.unassigned.length}>
          <Notice tone="attention">
            Diese Sachen sind offen, aber keinem Bereich mit Zuständigkeit zugeordnet. Ohne
            jemanden, der mitdenkt, bemerkt niemand, wenn sie liegen bleiben.
          </Notice>
          <RowList>
            {data.unassigned.map((item) => (
              <li key={item.id}>
                <Row title={item.title} subtitle={item.domain ?? undefined} chevron={false} />
              </li>
            ))}
          </RowList>
        </Section>
      )}
    </Page>
  )
}

function EntryRow({ entry, onOpen }: { entry: AgendaEntry; onOpen: () => void }) {
  const meta = KIND[entry.kind]
  const who = entry.assignee ?? entry.owner
  return (
    <Row
      lead={<Icon name={meta.icon} />}
      title={entry.hidden ? 'Belegt' : entry.title}
      subtitle={[
        entry.allDay ? 'ganztägig' : timeLabel(entry.at),
        entry.domain?.name,
        entry.assignee ? `${entry.assignee.displayName} führt aus` : undefined,
      ]
        .filter(Boolean)
        .join(' · ')}
      end={
        who ? (
          <span className="entry-who">
            <PersonDot name={who.displayName} membershipId={who.membershipId} />
          </span>
        ) : entry.kind === 'event' ? (
          <Chip>Termin</Chip>
        ) : undefined
      }
      chevron={entry.kind !== 'event'}
      onClick={entry.kind === 'event' ? undefined : onOpen}
    />
  )
}

function openEntry(entry: AgendaEntry, navigate: (to: string) => void): void {
  if (entry.domain) navigate(`/bereiche/${entry.domain.id}`)
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  const today = new Date()
  const diff = Math.round((d.getTime() - new Date(today.toDateString()).getTime()) / 86_400_000)
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Morgen'
  return d.toLocaleDateString('de-DE', { weekday: 'long' })
}

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
