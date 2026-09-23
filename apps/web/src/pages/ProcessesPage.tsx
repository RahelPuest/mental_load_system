import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { endpoints } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { useAsync } from '../lib/ui.js'
import { prettyPath } from '../lib/domains.js'
import {
  Button,
  Chip,
  Chips,
  EmptyState,
  ErrorState,
  Notice,
  Page,
  Row,
  RowList,
  Section,
  SkeletonList,
  Toggle,
} from '../design/index.js'

/**
 * Alles, was gerade läuft – über alle Bereiche hinweg.
 *
 * Vorher war ein Vorgang nur über den Bereich auffindbar, in dem er lebt. Wer nicht mehr
 * wusste, wo „Neue Schuhe besorgen" einsortiert ist, fand ihn nur über die Suche. Genau
 * dieses „ich muss wissen, wo etwas liegt" soll das Produkt abnehmen.
 */
const STATES = [
  { key: 'active', label: 'Läuft' },
  { key: 'blocked', label: 'Wartet' },
  { key: 'completed', label: 'Abgeschlossen' },
] as const

export function ProcessesPage() {
  const { household } = useSession()
  const navigate = useNavigate()
  const [state, setState] = useState<(typeof STATES)[number]['key']>('active')

  const processes = useAsync(
    () => (household ? endpoints.processes(household.id, state) : Promise.resolve({ items: [] })),
    [household?.id, state],
  )
  const domains = useAsync(
    () => (household ? endpoints.domains(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const playbooks = useAsync(
    () => (household ? endpoints.playbooks(household.id) : Promise.resolve({ items: [], note: '' })),
    [household?.id],
  )

  const domainList = domains.data?.items ?? []
  const nameOf = useMemo(() => {
    const map = new Map(domainList.map((d) => [d.id, prettyPath(d, domainList)]))
    return (id: string | null) => (id ? (map.get(id) ?? 'Bereich') : 'Ohne Bereich')
  }, [domainList])

  if (!household) return null
  if (processes.error)
    return <ErrorState meaning="Die Vorgänge konnten nicht geladen werden." onRetry={processes.reload} />

  const items = processes.data?.items ?? []

  return (
    <Page
      title="Vorgänge"
      lede="Was gerade läuft – aus allen Bereichen."
      action={
        <Button variant="secondary" icon="route" onClick={() => navigate('/ablaeufe')}>
          Abläufe verwalten
        </Button>
      }
    >
      <Chips>
        {STATES.map((s) => (
          <Toggle key={s.key} pressed={state === s.key} onToggle={() => setState(s.key)}>
            {s.label}
          </Toggle>
        ))}
      </Chips>

      <div style={{ height: 'var(--s-5)' }} />

      {processes.loading && !processes.data && <SkeletonList count={3} />}

      {processes.data && items.length === 0 && (
        <EmptyState
          icon="route"
          title={state === 'active' ? 'Gerade läuft nichts' : 'Hier ist nichts'}
          description={
            state === 'active'
              ? 'Ein Vorgang ist etwas Mehrschrittiges: „Neue Schuhe besorgen" statt einer einzelnen Aufgabe. Gestartet wird er im jeweiligen Bereich – oder aus einem Ablauf.'
              : 'Sobald Vorgänge diesen Zustand erreichen, stehen sie hier.'
          }
          action={
            <Button variant="secondary" icon="domains" onClick={() => navigate('/bereiche')}>
              Zu den Bereichen
            </Button>
          }
        />
      )}

      {items.length > 0 && (
        <Section count={items.length}>
          <RowList>
            {items.map((process) => (
              <li key={process.id}>
                <Row
                  title={process.title}
                  /* §14: Was ist der Stand, und was ist der nächste Schritt? Ohne das ist
                     eine Vorgangsliste nur eine Titelliste. */
                  /*
                   * Warten ist ein Zustand, kein Versäumnis (§27) – es steht als Text da,
                   * nicht als Warnfarbe. Sieben bernsteinfarbene Abzeichen untereinander
                   * lesen sich wie sieben Probleme.
                   */
                  subtitle={
                    [
                      process.nextStep ? `Als Nächstes: ${process.nextStep.title}` : null,
                      process.waiting && !process.nextStep ? 'Wartet auf jemand anderen' : null,
                      !process.nextStep && !process.waiting ? (process.goal ?? nameOf(process.domainId)) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  }
                  end={
                    <>
                      {process.progress.total > 0 && (
                        <Chip>
                          {process.progress.done} von {process.progress.total}
                        </Chip>
                      )}
                      {process.outcome && <Chip>{OUTCOME[process.outcome] ?? process.outcome}</Chip>}
                    </>
                  }
                  onClick={() => navigate(`/vorgang/${process.id}`)}
                />
              </li>
            ))}
          </RowList>
        </Section>
      )}

      {state === 'active' && (playbooks.data?.items.length ?? 0) > 0 && (
        <Section
          icon="sparkle"
          title="Erprobte Abläufe"
          hint="Wiederkehrende Vorhaben mit festen Schritten. Daraus lässt sich ein Vorgang starten, ohne ihn neu zu erfinden."
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/ablaeufe')}>
              Alle ansehen
            </Button>
          }
        >
          <RowList>
            {(playbooks.data?.items ?? []).slice(0, 4).map((playbook) => (
              <li key={playbook.id}>
                <Row
                  title={playbook.title}
                  subtitle={playbook.triggerDescription}
                  onClick={() => navigate('/ablaeufe')}
                />
              </li>
            ))}
          </RowList>
        </Section>
      )}

      {state === 'completed' && items.length > 0 && (
        <Notice tone="quiet" title="Warum das aufgehoben wird">
          Abgeschlossene Vorgänge bleiben mit dem Gelernten stehen. Beim nächsten Mal spart das
          die Sucherei – und macht sichtbar, wie viel tatsächlich getragen wurde.
        </Notice>
      )}
    </Page>
  )
}

const OUTCOME: Record<string, string> = {
  achieved: 'erreicht',
  partially: 'teilweise',
  obsolete: 'hat sich erledigt',
  abandoned: 'aufgegeben',
}
