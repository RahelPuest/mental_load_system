import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { endpoints, type DomainEntry } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { KNOWLEDGE_KIND, DECISION_KIND, useAsync } from '../lib/ui.js'
import { prettyPath } from '../lib/domains.js'
import {
  Actions,
  Button,
  Card,
  Chip,
  Chips,
  EmptyState,
  ErrorState,
  Field,
  Heading,
  Input,
  Page,
  Row,
  RowList,
  Select,
  Sheet,
  SkeletonList,
  Textarea,
  Toggle,
  useToast,
} from '../design/index.js'

/**
 * Was die Familie weiß – über alle Bereiche hinweg.
 *
 * Bis hierher lebten Notizen, Fragen und Entscheidungen ausschließlich im jeweiligen Bereich.
 * Wer eine Sache suchte, musste wissen, wo sie einsortiert ist – also genau das im Kopf haben,
 * was dieses Produkt abnehmen soll. Diese Ansicht ist der Nachschlageort (Auftrag §6, §64).
 */

type Tab = 'notizen' | 'fragen' | 'entscheidungen'

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'notizen', label: 'Notizen', hint: 'Was jemand herausgefunden hat und niemand zweimal herausfinden soll.' },
  { key: 'fragen', label: 'Offene Fragen', hint: 'Was noch nicht geklärt ist – sichtbar, statt im Kopf zu bleiben.' },
  { key: 'entscheidungen', label: 'Entscheidungen', hint: 'Was ihr festgelegt habt, damit es nicht jedes Mal neu verhandelt wird.' },
]

export function KnowledgePage() {
  const { household } = useSession()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab | null>(null)
  const [domainFilter, setDomainFilter] = useState('')
  const [adding, setAdding] = useState(false)

  const domains = useAsync(
    () => (household ? endpoints.domains(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const knowledge = useAsync(
    () => (household ? endpoints.knowledge(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const questions = useAsync(
    () => (household ? endpoints.questions(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const decisions = useAsync(
    () => (household ? endpoints.decisions(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )

  const domainList = domains.data?.items ?? []
  const nameOf = useMemo(() => {
    const map = new Map(domainList.map((d) => [d.id, prettyPath(d, domainList)]))
    return (id: string | null) => (id ? (map.get(id) ?? 'Bereich') : 'Ohne Bereich')
  }, [domainList])

  if (!household) return null

  /*
   * Der erste Reiter, der etwas enthält – nicht stur der erste (Audit 2, M5).
   *
   * Die Seite öffnete auf „Notizen" und zeigte einen Leerzustand, während unter „Offene
   * Fragen" und „Entscheidungen" je ein Eintrag lag. Wer nicht weiterklickt, hält die Seite
   * für leer. Die Wahl gilt nur, solange niemand selbst einen Reiter angetippt hat: Danach
   * darf ein Nachladen den Reiter nicht unter der Hand wechseln.
   */
  const gefuellt: Tab | null =
    (knowledge.data?.items.length ?? 0) > 0
      ? 'notizen'
      : (questions.data?.items.length ?? 0) > 0
        ? 'fragen'
        : (decisions.data?.items.length ?? 0) > 0
          ? 'entscheidungen'
          : null
  const aktiv: Tab = tab ?? gefuellt ?? 'notizen'

  const current =
    aktiv === 'notizen' ? knowledge : aktiv === 'fragen' ? questions : decisions
  const hasItems = (current.data?.items.length ?? 0) > 0
  const inDomain = <T extends { domainId: string | null }>(items: T[]) =>
    domainFilter ? items.filter((i) => i.domainId === domainFilter) : items

  if (current.error)
    return <ErrorState meaning="Das Wissen konnte nicht geladen werden." onRetry={current.reload} />

  return (
    <Page
      title="Wissen"
      lede="Notizen, offene Fragen und Entscheidungen – über alle Bereiche."
      // Genau eine dominante Primäraktion je Ansicht: ist nichts da, führt der leere
      // Zustand – der erklärt außerdem, wozu das Ganze gut ist (§30, §20).
      action={
        hasItems ? (
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
            {aktiv === 'fragen' ? 'Frage stellen' : aktiv === 'entscheidungen' ? 'Entscheidung festhalten' : 'Notiz anlegen'}
          </Button>
        ) : undefined
      }
    >
      <Chips>
        {TABS.map((t) => (
          <Toggle key={t.key} pressed={aktiv === t.key} onToggle={() => setTab(t.key)}>
            {t.label}
          </Toggle>
        ))}
      </Chips>

      <p className="t-body-sm c-secondary" style={{ margin: 'var(--s-3) 0 var(--s-5)' }}>
        {TABS.find((t) => t.key === aktiv)!.hint}
      </p>

      {/* Ein Filter über nichts ist Ballast. */}
      {domainList.length > 1 && hasItems && (
        <Field label="Auf einen Bereich beschränken">
          {({ id }) => (
            <Select id={id} value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
              <option value="">Alle Bereiche</option>
              {domainList.map((d) => (
                <option key={d.id} value={d.id}>
                  {prettyPath(d, domainList)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {current.loading && !current.data && <SkeletonList count={3} />}

      {aktiv === 'notizen' && knowledge.data && (
        <NoteList
          items={inDomain(knowledge.data.items)}
          nameOf={nameOf}
          onOpen={(domainId) => domainId && navigate(`/bereiche/${domainId}`)}
          onAdd={() => setAdding(true)}
        />
      )}

      {aktiv === 'fragen' && questions.data && (
        <QuestionList
          items={inDomain(questions.data.items)}
          nameOf={nameOf}
          onAnswered={questions.reload}
          onAdd={() => setAdding(true)}
        />
      )}

      {aktiv === 'entscheidungen' && decisions.data && (
        <DecisionList
          items={inDomain(decisions.data.items)}
          nameOf={nameOf}
          onOpen={(domainId) => domainId && navigate(`/bereiche/${domainId}`)}
          onAdd={() => setAdding(true)}
        />
      )}

      <AddSheet
        open={adding}
        tab={aktiv}
        domains={domainList}
        onClose={() => setAdding(false)}
        onDone={async () => {
          setAdding(false)
          await current.reload()
        }}
      />
    </Page>
  )
}

function NoteList({
  items,
  nameOf,
  onOpen,
  onAdd,
}: {
  items: { id: string; title: string; body: string; kind: string; domainId: string | null; confirmedAt: string | null }[]
  nameOf: (id: string | null) => string
  onOpen: (domainId: string | null) => void
  onAdd: () => void
}) {
  if (items.length === 0)
    return (
      <EmptyState
        icon="book"
        title="Noch nichts festgehalten"
        description={'Eine Notiz ist etwas, das jemand einmal herausgefunden hat: „Die Praxis nimmt nur vormittags Termine an." Ohne sie findet es die nächste Person wieder heraus.'}
        action={
          <Button variant="primary" icon="plus" onClick={onAdd}>
            Erste Notiz anlegen
          </Button>
        }
      />
    )

  return (
    <div className="card-grid">
      {items.map((item) => (
        <Card key={item.id} onClick={() => onOpen(item.domainId)}>
          <p className="t-overline c-muted">{nameOf(item.domainId)}</p>
          <Heading className="t-sub card-title">{item.title}</Heading>
          <p className="t-body-sm c-secondary clamp-3">{item.body}</p>
          <Chips>
            <Chip>{KNOWLEDGE_KIND[item.kind] ?? item.kind}</Chip>
            {item.confirmedAt === null && <Chip tone="attention">nicht bestätigt</Chip>}
          </Chips>
        </Card>
      ))}
    </div>
  )
}

function QuestionList({
  items,
  nameOf,
  onAnswered,
  onAdd,
}: {
  items: { id: string; body: string; domainId: string | null; directedTo: string | null }[]
  nameOf: (id: string | null) => string
  onAnswered: () => Promise<void>
  onAdd: () => void
}) {
  const { household } = useSession()
  const toast = useToast()
  const [answering, setAnswering] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')

  if (items.length === 0)
    return (
      <EmptyState
        icon="flag"
        title="Nichts offen"
        description="Offene Fragen sind Dinge, die noch niemand geklärt hat. Sie hier zu notieren heißt: sie müssen nicht im Kopf bleiben."
        action={
          <Button variant="primary" icon="plus" onClick={onAdd}>
            Frage stellen
          </Button>
        }
      />
    )

  return (
    <>
      <div className="card-grid">
        {items.map((item) => (
          <Card key={item.id}>
            <p className="t-overline c-muted">{nameOf(item.domainId)}</p>
            <Heading className="t-sub card-title">{item.body}</Heading>
            <Actions>
              <Button variant="secondary" size="sm" onClick={() => setAnswering(item.id)}>
                Beantworten
              </Button>
            </Actions>
          </Card>
        ))}
      </div>

      <Sheet
        open={answering !== null}
        onClose={() => setAnswering(null)}
        title="Frage beantworten"
        description="Die Antwort wird als Wissen gespeichert – dann muss sie niemand erneut suchen."
      >
        <Field label="Antwort">
          {({ id }) => <Textarea markdown id={id} rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} />}
        </Field>
        <Actions end>
          <Button variant="ghost" onClick={() => setAnswering(null)}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            disabled={!answer.trim() || !household}
            onClick={async () => {
              if (!household || !answering) return
              await endpoints.answerQuestion(household.id, answering, { body: answer.trim() })
              setAnswer('')
              setAnswering(null)
              toast.show('Beantwortet und als Wissen gespeichert.')
              await onAnswered()
            }}
          >
            Speichern
          </Button>
        </Actions>
      </Sheet>
    </>
  )
}

function DecisionList({
  items,
  nameOf,
  onOpen,
  onAdd,
}: {
  items: { id: string; title: string; body: string; decisionKind: string; bindingLevel: string; domainId: string | null }[]
  nameOf: (id: string | null) => string
  onOpen: (domainId: string | null) => void
  onAdd: () => void
}) {
  if (items.length === 0)
    return (
      <EmptyState
        icon="shield"
        title="Noch nichts festgelegt"
        description={'Eine Entscheidung hält fest, was gilt: „Wir kaufen Schuhe eine Nummer größer." Das erspart die immer gleiche Diskussion.'}
        action={
          <Button variant="primary" icon="plus" onClick={onAdd}>
            Entscheidung festhalten
          </Button>
        }
      />
    )

  return (
    <RowList>
      {items.map((item) => (
        <li key={item.id}>
          <Row
            title={item.title}
            subtitle={`${nameOf(item.domainId)} · ${DECISION_KIND[item.decisionKind] ?? item.decisionKind}`}
            onClick={() => onOpen(item.domainId)}
          />
        </li>
      ))}
    </RowList>
  )
}

function AddSheet({
  open,
  tab,
  domains,
  onClose,
  onDone,
}: {
  open: boolean
  tab: Tab
  domains: DomainEntry[]
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [domainId, setDomainId] = useState('')
  const [busy, setBusy] = useState(false)

  const labels = {
    notizen: { title: 'Neue Notiz', field: 'Worum geht es?', body: 'Was solltet ihr wissen?' },
    fragen: { title: 'Neue Frage', field: 'Was ist offen?', body: '' },
    entscheidungen: { title: 'Entscheidung festhalten', field: 'Was gilt?', body: 'Warum? (optional)' },
  }[tab]

  const submit = async () => {
    if (!household) return
    setBusy(true)
    try {
      if (tab === 'notizen') {
        await endpoints.createKnowledge(household.id, {
          title: title.trim(),
          body: body.trim() || title.trim(),
          kind: 'fact',
          domainId: domainId || null,
        })
      } else if (tab === 'fragen') {
        await endpoints.createQuestion(household.id, { body: title.trim(), domainId: domainId || null })
      } else {
        await endpoints.createDecision(household.id, {
          title: title.trim(),
          body: body.trim() || title.trim(),
          decisionKind: 'family_decision',
          bindingLevel: 'agreed',
          domainId: domainId || null,
        })
      }
      setTitle('')
      setBody('')
      toast.show('Gespeichert.')
      await onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={labels.title} description="Ein Bereich ist hilfreich, aber nicht nötig.">
      <Field label={labels.field}>
        {({ id }) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      {labels.body && (
        <Field label={labels.body}>
          {({ id }) => <Textarea markdown id={id} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />}
        </Field>
      )}
      <Field label="Bereich" hint="Leer lassen, wenn es zu nichts Bestimmtem gehört.">
        {({ id }) => (
          <Select id={id} value={domainId} onChange={(e) => setDomainId(e.target.value)}>
            <option value="">— ohne Bereich —</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {prettyPath(d, domains)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="primary" disabled={busy || !title.trim()} onClick={() => void submit()}>
          Speichern
        </Button>
      </Actions>
    </Sheet>
  )
}
