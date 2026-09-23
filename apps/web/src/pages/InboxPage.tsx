import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { endpoints } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { useAsync } from '../lib/ui.js'
import {
  Actions,
  Button,
  Card,
  Chips,
  EmptyState,
  Heading,
  Disclosure,
  ErrorState,
  Page,
  Section,
  SkeletonList,
  Toggle,
  useToast,
} from '../design/index.js'

const TARGET: Record<string, { label: string; hint: string }> = {
  task: { label: 'Aufgabe', hint: 'Etwas, das erledigt werden muss.' },
  question: { label: 'Frage', hint: 'Etwas, das ihr noch nicht wisst.' },
  knowledge: { label: 'Wissen', hint: 'Etwas, das ihr euch merken wollt.' },
  decision: { label: 'Entscheidung', hint: 'Etwas, das ihr festgelegt habt.' },
  process: { label: 'Vorgang', hint: 'Etwas Mehrschrittiges.' },
  monitor: { label: 'Regel', hint: 'Etwas, das regelmäßig geprüft gehört.' },
}

/**
 * §21: Verarbeitungspunkt, kein zweiter Aufgabenbereich.
 *
 * Der Vorschlag ist vorausgewählt, aber sichtbar begründet und mit einem Klick änderbar –
 * so bleibt die Zahl der Entscheidungen bei eins.
 */
export function InboxPage() {
  const { household } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [choice, setChoice] = useState<Record<string, string>>({})

  const inbox = useAsync(
    () => (household ? endpoints.inbox(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )

  if (!household) return null
  if (inbox.error) return <ErrorState meaning="Der Eingang konnte nicht geladen werden." onRetry={inbox.reload} />

  const items = inbox.data?.items ?? []

  const accept = async (item: {
    id: string
    rawText: string
    suggestion: { targetType: string; domainId: string | null; fields: Record<string, unknown> } | null
  }) => {
    const targetType = choice[item.id] ?? item.suggestion?.targetType ?? 'task'
    setBusy(item.id)
    try {
      /*
       * Was der Server erkannt hat, wird auch übernommen (Audit 2, M7).
       *
       * Vorher baute diese Stelle die Nutzlast noch einmal aus dem Rohtext zusammen und warf
       * dabei die gesamte Erkennung weg: den Bereich, der im Text stand, und – seit der
       * Datumserkennung – den Zeitpunkt. Der Nutzer las „Der Bereich ‚Schuhe' wurde im Text
       * erkannt" und bekam anschließend eine Aufgabe ohne Bereich.
       *
       * Nur wenn er die Art selbst umgestellt hat, passen die erkannten Felder nicht mehr –
       * dann bleibt der Rohtext.
       */
      const erkannt = item.suggestion && targetType === item.suggestion.targetType ? item.suggestion : null
      const basis =
        targetType === 'question'
          ? { body: item.rawText }
          : targetType === 'knowledge'
            ? { title: item.rawText.slice(0, 120), body: item.rawText }
            : targetType === 'decision'
              ? { title: item.rawText.slice(0, 120), body: item.rawText, decisionKind: 'family_decision' }
              : { title: item.rawText.slice(0, 200) }
      const payload = erkannt
        ? { ...basis, ...erkannt.fields, ...(erkannt.domainId ? { domainId: erkannt.domainId } : {}) }
        : basis
      await endpoints.processInbox(household.id, item.id, targetType, payload)
      toast.show(`Als ${TARGET[targetType]?.label ?? 'Eintrag'} übernommen.`)
      await inbox.reload()
    } catch {
      toast.show('Das konnte nicht übernommen werden. Die Notiz bleibt im Eingang.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Page
      title="Eingang"
      lede="Erfasstes, das noch nirgends einsortiert ist."
    >
      {inbox.loading && !inbox.data && <SkeletonList count={2} />}

      {inbox.data && items.length === 0 && (
        <EmptyState
          icon="check"
          title="Der Eingang ist leer"
          description="Alles Erfasste hat seinen Platz gefunden. Neue Notizen landen hier – über die Plus-Taste, von überall."
          action={
            <Button variant="secondary" icon="now" onClick={() => navigate('/jetzt')}>
              Zurück zu Jetzt
            </Button>
          }
        />
      )}

      {items.length > 0 && (
        <Section count={items.length} title="Noch nicht einsortiert">
          <div className="card-grid">
          {items.map((item) => {
            const selected = choice[item.id] ?? item.suggestion?.targetType ?? 'task'
            const changed = selected !== (item.suggestion?.targetType ?? 'task')
            return (
              <Card key={item.id}>
                <Heading className="t-sub card-title">{item.rawText}</Heading>

                {item.suggestion ? (
                  <p className="t-body-sm c-secondary">
                    Sieht aus wie <strong>{TARGET[item.suggestion.targetType]?.label}</strong> – {item.suggestion.reason}
                  </p>
                ) : (
                  <p className="t-body-sm c-secondary">{TARGET[selected]?.hint}</p>
                )}

                {/*
                  Die sechs Zielarten stehen hinter einem Aufklapper.
                  Vorher standen sie offen an jeder Karte: bei sieben Einträgen 42 Knöpfe auf
                  einer Seite, die laut §17 „möglichst wenige Entscheidungen" verlangen soll.
                  Der Vorschlag stimmt meistens – wer ihn ändern will, findet die Auswahl in
                  einem Klick, verborgen ist sie nicht (§40, §64).
                */}
                <Disclosure summary={changed ? `Wird ${TARGET[selected]?.label}` : 'Anders einsortieren'}>
                  <Chips>
                    {Object.entries(TARGET).map(([value, meta]) => (
                      <Toggle
                        key={value}
                        role="radio"
                        pressed={selected === value}
                        onToggle={() => setChoice((c) => ({ ...c, [item.id]: value }))}
                      >
                        {meta.label}
                      </Toggle>
                    ))}
                  </Chips>
                  <p className="t-body-sm c-muted" style={{ marginTop: 'var(--s-2)' }}>
                    {TARGET[selected]?.hint}
                  </p>
                </Disclosure>

                <Actions>
                  <Button variant="primary" icon="check" disabled={busy === item.id} onClick={() => void accept(item)}>
                    Als {TARGET[selected]?.label} übernehmen
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy === item.id}
                    onClick={async () => {
                      setBusy(item.id)
                      try {
                        await endpoints.discardInbox(household.id, item.id, 'Braucht es doch nicht.')
                        toast.show('Verworfen.')
                        await inbox.reload()
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    Braucht es nicht
                  </Button>
                </Actions>
              </Card>
            )
          })}
          </div>
        </Section>
      )}
    </Page>
  )
}
