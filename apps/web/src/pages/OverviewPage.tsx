import { useNavigate } from 'react-router-dom'
import { endpoints } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { useAsync } from '../lib/ui.js'
import { HELP_ENTRY, NAV_GROUPS, SETTINGS_ENTRY } from '../lib/navigation.js'
import { Icon, Page, Row, RowList, Section, Chip } from '../design/index.js'

/**
 * Das vollständige Verzeichnis – mobil der fünfte Platz in der unteren Leiste.
 *
 * Bewusst kein „Mehr"-Sammelbecken für Reste: Hier steht *jeder* Ort mit einem Satz dazu,
 * wofür er da ist. Auf einem kleinen Bildschirm ist Platz für vier Ziele; der Rest darf
 * deshalb nicht verschwinden, sondern braucht einen erklärten Ort (Auftrag §64).
 */
export function OverviewPage() {
  const { household } = useSession()
  const navigate = useNavigate()

  const inbox = useAsync(
    () => (household ? endpoints.inbox(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const attention = useAsync(
    () => (household ? endpoints.attention(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )

  const counts: Record<string, number> = {
    inbox: inbox.data?.items.length ?? 0,
    attention: attention.data?.items.length ?? 0,
  }

  return (
    <Page title="Übersicht" lede="Alle Orte in Thealotta, und wofür sie da sind.">
      {NAV_GROUPS.map((group) => (
        <Section key={group.label} title={group.label}>
          <RowList>
            {group.entries.map((entry) => {
              const count = entry.counter ? counts[entry.counter] : 0
              return (
                <li key={entry.to}>
                  <Row
                    lead={<Icon name={entry.icon} />}
                    title={entry.label}
                    subtitle={entry.purpose}
                    end={count && count > 0 ? <Chip tone="attention">{count}</Chip> : undefined}
                    onClick={() => navigate(entry.to)}
                  />
                </li>
              )
            })}
          </RowList>
        </Section>
      ))}

      <Section title="Verwaltung">
        <RowList>
          <li>
            <Row
              lead={<Icon name={HELP_ENTRY.icon} />}
              title={HELP_ENTRY.label}
              subtitle={HELP_ENTRY.purpose}
              onClick={() => navigate(HELP_ENTRY.to)}
            />
          </li>
          <li>
            <Row
              lead={<Icon name={SETTINGS_ENTRY.icon} />}
              title={SETTINGS_ENTRY.label}
              subtitle={SETTINGS_ENTRY.purpose}
              onClick={() => navigate(SETTINGS_ENTRY.to)}
            />
          </li>
        </RowList>
      </Section>
    </Page>
  )
}
