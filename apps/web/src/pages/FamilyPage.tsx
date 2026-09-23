import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { endpoints } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { MealLine } from './MealsPage.js'
import { CAPACITY, CRITICALITY, ROLE, formatDate, formatDateTime, useAsync } from '../lib/ui.js'
import {
  Actions,
  Button,
  Chip,
  Chips,
  Disclosure,
  Divider,
  EmptyLine,
  ErrorState,
  Field,
  Icon,
  Input,
  Notice,
  OwnerBadge,
  PersonDot,
  Page,
  Panel,
  Row,
  RowList,
  Auswahl,
  Section,
  Select,
  Sheet,
  SkeletonList,
  useToast,
} from '../design/index.js'

/**
 * Wie lange eine Angabe gilt (Audit 2, H2).
 *
 * Vorher gab es diese Wahl nicht: Die Oberfläche schickte immer `endsAt: null`, obwohl das
 * Datenmodell ein Ende kennt und der Versand es auswertet. Eine Pause galt damit, bis jemand
 * daran dachte, sie zurückzunehmen – genau die Merkarbeit, die diese Anwendung abnehmen soll.
 *
 * Vorgewählt ist „bis morgen früh". Ein Ende, das von selbst kommt, ist der sichere Fall:
 * Wer länger braucht, sagt es noch einmal; wer es vergisst, bekommt nicht wochenlang nichts
 * mehr zu sehen. „Ohne Ende" bleibt möglich – dann aber als bewusste Wahl.
 */
const DAUERN: { value: string; label: string; ends: (now: Date) => Date | null }[] = [
  {
    value: 'evening',
    label: 'bis heute Abend',
    ends: (now) => {
      const d = new Date(now)
      d.setHours(20, 0, 0, 0)
      return d.getTime() > now.getTime() ? d : new Date(now.getTime() + 4 * 60 * 60 * 1000)
    },
  },
  {
    value: 'tomorrow',
    label: 'bis morgen früh',
    ends: (now) => {
      const d = new Date(now)
      d.setDate(d.getDate() + 1)
      d.setHours(8, 0, 0, 0)
      return d
    },
  },
  {
    value: 'week',
    label: 'diese Woche',
    ends: (now) => {
      const d = new Date(now)
      // Montag als Wochenanfang: bis einschließlich Sonntag, 20 Uhr.
      const bisSonntag = (7 - ((d.getDay() + 6) % 7) - 1 + 7) % 7 || 7
      d.setDate(d.getDate() + bisSonntag)
      d.setHours(20, 0, 0, 0)
      return d
    },
  },
  { value: 'open', label: 'ohne Ende', ends: () => null },
]

const LEVELS: { value: string; hint: string }[] = [
  { value: 'normal', hint: 'Alles wie sonst.' },
  { value: 'reduced', hint: 'Aufwendiges tritt in den Hintergrund.' },
  { value: 'minimal', hint: 'Höchstens eine Sache auf einmal.' },
  { value: 'paused', hint: 'Keine neuen Zuweisungen, keine Push-Nachrichten.' },
]

/**
 * §31 und §23–25: Kapazität, Vertretungen und Verantwortungsübersicht.
 *
 * Ausdrücklich kein Leistungsvergleich (§42): keine Zählungen pro Person, keine Reihenfolge,
 * keine Prozentwerte. Sichtbar ist, *wo* Verantwortung liegt und wo sie fehlt.
 */
export function FamilyPage() {
  const { household, me } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const meId = me?.memberships.find((m) => m.householdId === household?.id)?.membershipId ?? null
  const [coverageOpen, setCoverageOpen] = useState(false)
  const [dauerWahl, setDauerWahl] = useState('tomorrow')
  const [careFor, setCareFor] = useState<string | null>(null)

  const overview = useAsync(
    () => (household ? endpoints.overview(household.id) : Promise.reject(new Error('–'))),
    [household?.id],
  )
  const capacity = useAsync(
    () => (household ? endpoints.capacity(household.id) : Promise.reject(new Error('–'))),
    [household?.id],
  )
  const members = useAsync(
    () => (household ? endpoints.members(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const coverages = useAsync(
    () => (household ? endpoints.coverages(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const settings = useAsync(
    () => (household ? endpoints.settings(household.id) : Promise.reject(new Error('–'))),
    [household?.id],
  )

  if (!household) return null
  if (overview.error) return <ErrorState meaning="Die Übersicht konnte nicht geladen werden." onRetry={overview.reload} />
  if (!overview.data || !capacity.data) return <SkeletonList count={3} />

  const nameOf = (id: string) => members.data?.items.find((m) => m.id === id)?.displayName ?? 'unbekannt'
  const domainName = (id: string) => overview.data?.domains.find((d) => d.id === id)?.name ?? 'Bereich'
  const active = (coverages.data?.items ?? []).filter((c) => c.state === 'active' || c.state === 'pending_return')
  /** Wie viele Bereiche jemanden haben, der mitdenkt – die Antwort auf die Frage der Seite. */
  const owned = (overview.data?.domains ?? []).filter((d) => d.effectiveOwner).length

  const setLevel = async (level: string, dauer = dauerWahl) => {
    if (level === 'normal') {
      await endpoints.clearCapacity(household.id)
      setDauerWahl('tomorrow')
      toast.show('Wieder auf normal.')
    } else {
      const ends = DAUERN.find((d) => d.value === dauer)?.ends(new Date()) ?? null
      const result = await endpoints.setCapacity(household.id, {
        level,
        acceptsNewAssignments: level !== 'paused',
        criticalOnly: level === 'paused' || level === 'minimal',
        mutePush: level === 'paused',
        endsAt: ends ? ends.toISOString() : null,
        reasonCategory: 'unspecified',
      })
      toast.show(
        result.coverageGaps.length > 0
          ? `Übernommen. ${result.coverageGaps.length} wichtige Bereiche brauchen jetzt eine Klärung.`
          : 'Übernommen. Es wird dir weniger gezeigt.',
      )
    }
    await capacity.reload()
    await overview.reload()
  }

  return (
    <Page
      title="Familie"
      lede="Wer woran mitdenkt, und wo das offen ist."
    >
      {/*
        Was heute auf den Tisch kommt – kompakt (§38).

        Die Familienseite wird ausdrücklich **nicht** zur Essensplanung. Sie beantwortet die
        eine Frage, die alle betrifft, und verweist für alles Weitere dorthin, wo geplant wird.
        Wer hier planen könnte, hätte zwei Orte für dieselbe Sache.
      */}
      <MealsToday />

      <Section title="Deine Kapazität heute">
        <Notice tone="quiet">
          Eine Selbstauskunft, keine Bewertung. Sie verändert nur, was dir angezeigt wird – nicht,
          wofür du verantwortlich bist. Ein Grund wird nicht gespeichert.
        </Notice>
        <Auswahl
          label="Kapazität heute"
          value={capacity.data!.level}
          options={LEVELS.map((l) => ({ value: l.value, label: CAPACITY[l.value] ?? l.value }))}
          onChange={(v) => void setLevel(v)}
        />
        <p className="t-body-sm c-muted" style={{ marginTop: 'var(--s-2)' }}>
          {LEVELS.find((l) => l.value === capacity.data!.level)?.hint}
        </p>

        {/*
          Das Ende steht bei der Angabe, nicht in einem Formular dahinter: Wer nicht sieht,
          wie lange etwas gilt, muss es sich merken.
        */}
        {capacity.data!.level !== 'normal' && (
          <div className="field-row" style={{ marginTop: 'var(--s-4)' }}>
            <p className="t-body-sm">
              {capacity.data!.endsAt
                ? `Gilt bis ${formatDateTime(capacity.data!.endsAt!)}, danach wieder normal.`
                : 'Gilt ohne Ende – bis du sie selbst zurücknimmst.'}
            </p>
            <Auswahl
              label="Wie lange gilt das?"
              value={dauerWahl}
              options={DAUERN.map((d) => ({ value: d.value, label: d.label }))}
              onChange={(v) => {
                setDauerWahl(v)
                void setLevel(capacity.data!.level, v)
              }}
            />
          </div>
        )}
      </Section>

      {overview.data.reducedCapacity.length > 0 && (
        <Section title="Gerade weniger Kapazität">
          <Panel>
            {overview.data.reducedCapacity.map((person) => (
              <div className="setting-row" key={person.membershipId}>
                <div className="text">
                  <p className="t-sub">{person.displayName}</p>
                  <p className="t-body-sm desc">Gründe werden weder gespeichert noch angezeigt.</p>
                </div>
                <Chip tone="info">{CAPACITY[person.level] ?? person.level}</Chip>
              </div>
            ))}
          </Panel>
        </Section>
      )}

<UnownedSection
        domains={overview.data.domains}
        members={(members.data?.items ?? []).map((m) => ({ membershipId: m.id, displayName: m.displayName }))}
        meId={meId}
        onClaimed={async () => {
          await overview.reload()
        }}
        onOpen={(id) => navigate(`/bereiche/${id}`)}
      />


      {/*
        Dieselbe Liste stand hier vorher offen – und noch einmal weiter oben unter „Ohne
        Zuständigkeit", und ein drittes Mal auf der Seite „Bereiche". Drei Darstellungen
        derselben Sache konkurrieren um Aufmerksamkeit, ohne etwas hinzuzufügen.
        Jetzt: eine Zahl, die die Frage beantwortet, und die vollständige Liste einen Klick
        entfernt. Nichts ist verschwunden – nur nicht mehr alles gleichzeitig laut.
      */}
      <Section
        icon="shield"
        title="Wer was trägt"
        action={
          <Button variant="ghost" size="sm" icon="domains" onClick={() => navigate('/bereiche')}>
            Alle Bereiche
          </Button>
        }
      >
        <Panel sunken>
          <p className="t-body">
            <strong className="num">{owned}</strong> von {overview.data.domains.length} Bereichen haben
            jemanden, der mitdenkt.
          </p>
          <p className="t-body-sm c-muted" style={{ marginTop: 'var(--s-1)' }}>
            {overview.data.note}
          </p>
          <Disclosure summary="Alle Bereiche und ihre Zuständigkeit">
        <RowList>
          {overview.data.domains.map((domain) => (
            <li key={domain.id} data-rang={domain.criticality}>
              <Row
                title={domain.name}
                subtitle={domain.criticality !== 'normal' ? CRITICALITY[domain.criticality] : undefined}
                end={
                  domain.effectiveOwner ? (
                    /* Ohne membershipId blieb dieses Abzeichen farblos – die Liste zeigte
                       Namen ohne jede Farbzuordnung, während dieselbe Person auf anderen
                       Seiten farbig war. */
                    <OwnerBadge
                      kind={domain.effectiveOwner.viaCoverage ? 'coverage' : 'responsibility'}
                      name={domain.effectiveOwner.displayName}
                      membershipId={domain.effectiveOwner.membershipId}
                    />
                  ) : (
                    <OwnerBadge kind="vacant" />
                  )
                }
                onClick={() => navigate(`/bereiche/${domain.id}`)}
              />
            </li>
          ))}
        </RowList>
          </Disclosure>
        </Panel>
      </Section>

      <Section
        icon="pause"
        title="Wenn jemand gerade nicht kann"
        hint="Vertretung einrichten oder ansehen, was jemand gerade trägt."
        action={
          <Button variant="ghost" size="sm" icon="plus" onClick={() => setCoverageOpen(true)}>
            Vertretung einrichten
          </Button>
        }
      >
        {active.length === 0 ? (
          <EmptyLine text="Gerade vertritt niemand jemanden." />
        ) : (
          <Panel>
            {active.map((coverage, index) => (
              <div key={coverage.id}>
                {index > 0 && <Divider />}
                <div className="setting-row">
                  <div className="text">
                    <p className="t-sub">{domainName(coverage.domainId)}</p>
                    <p className="t-body-sm desc">
                      {nameOf(coverage.coveringMembershipId)} vertritt bis {formatDate(coverage.endsAt)}.
                      {coverage.state === 'pending_return' &&
                        ' Der Zeitraum ist abgelaufen – die Vertretung bleibt zuständig, bis die Rückgabe bestätigt ist.'}
                    </p>
                  </div>
                  {coverage.state === 'pending_return' && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        await endpoints.confirmCoverageReturn(household.id, coverage.id)
                        toast.show('Rückgabe bestätigt.')
                        await coverages.reload()
                        await overview.reload()
                      }}
                    >
                      Rückgabe bestätigen
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </Panel>
        )}

        <Panel sunken>
          <RowList>
            {(members.data?.items ?? []).map((member) => (
              <li key={member.id}>
                <Row
                  lead={<PersonDot name={member.displayName} membershipId={member.id} size="lg" />}
                  title={member.displayName}
                  subtitle="Ansehen, was diese Person gerade trägt"
                  onClick={() => setCareFor(member.id)}
                />
              </li>
            ))}
          </RowList>
        </Panel>
      </Section>

      {/*
        Verteilung und Mitgliederliste sind beides seltene Nachschlagevorgänge über den
        Haushalt als Ganzes – eine mentale Einheit, keine zwei Abschnitte.
      */}
      <Section icon="family" title="Der Haushalt">
        <Panel sunken>
          <Disclosure summary={`Wer dazugehört – ${members.data?.items.length ?? 0} Mitglieder`}>
            <RowList>
              {(members.data?.items ?? []).map((member) => (
                <li key={member.id}>
                  <Row
                    lead={<PersonDot name={member.displayName} membershipId={member.id} />}
                    title={member.displayName}
                    end={<Chip>{ROLE[member.role] ?? member.role}</Chip>}
                  />
                </li>
              ))}
            </RowList>
            <Actions>
              <Button variant="ghost" size="sm" icon="settings" onClick={() => navigate('/einstellungen/mitglieder')}>
                Rollen und Rechte verwalten
              </Button>
            </Actions>
          </Disclosure>

          {settings.data?.balanceViewEnabled && (
            <>
              <Divider />
              {/* Die Einordnung steht in BalanceView selbst – sie hier zu wiederholen hieße,
                  dieselbe Zeile zweimal untereinander zu lesen. */}
              <Disclosure summary="Wie ist es verteilt?">
                <BalanceView />
              </Disclosure>
            </>
          )}
        </Panel>
      </Section>

      {careFor && (
        <CareModeSheet
          membershipId={careFor}
          onClose={() => setCareFor(null)}
          onCoverage={() => {
            setCareFor(null)
            setCoverageOpen(true)
          }}
        />
      )}

      <CoverageSheet
        open={coverageOpen}
        onClose={() => setCoverageOpen(false)}
        domains={overview.data.domains}
        members={members.data?.items ?? []}
        onDone={async () => {
          setCoverageOpen(false)
          await coverages.reload()
          await overview.reload()
        }}
      />
    </Page>
  )
}

function CoverageSheet({
  open,
  onClose,
  domains,
  members,
  onDone,
}: {
  open: boolean
  onClose: () => void
  domains: { id: string; name: string }[]
  members: { id: string; displayName: string }[]
  onDone: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [domainId, setDomainId] = useState('')
  const [membershipId, setMembershipId] = useState('')
  const [until, setUntil] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Vertretung einrichten"
      description="Die dauerhafte Zuständigkeit bleibt unverändert. Nach Ablauf wird nachgefragt – sie endet nicht stillschweigend."
    >
      <Field label="Welcher Bereich?">
        {({ id }) => (
          <Select id={id} value={domainId} onChange={(e) => setDomainId(e.target.value)}>
            <option value="">bitte wählen</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Wer übernimmt?">
        {({ id }) => (
          <Select id={id} value={membershipId} onChange={(e) => setMembershipId(e.target.value)}>
            <option value="">bitte wählen</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Bis wann?">
        {({ id }) => <Input id={id} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />}
      </Field>

      <Actions end spaced={false}>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={busy || !domainId || !membershipId || !until}
          onClick={async () => {
            if (!household) return
            setBusy(true)
            try {
              await endpoints.createCoverage(household.id, {
                domainId,
                coveringMembershipId: membershipId,
                startsAt: new Date().toISOString(),
                endsAt: new Date(until).toISOString(),
                returnMode: 'require_confirmation',
                reasonCategory: 'unspecified',
              })
              toast.show('Vertretung eingerichtet.')
              await onDone()
            } finally {
              setBusy(false)
            }
          }}
        >
          Einrichten
        </Button>
      </Actions>
    </Sheet>
  )
}

export { Icon }

/* ══ Ownerlose Bereiche, Care Mode, Verteilung ═══════════════════════ */

/**
 * §31: Sichtbar machen, wo Verantwortung fehlt – und zwar als bearbeitbare Liste.
 * Als bloße Textzeile war der Befund zwar korrekt, aber folgenlos.
 */
function UnownedSection({
  domains,
  members,
  meId,
  onClaimed,
  onOpen,
}: {
  domains: { id: string; name: string; criticality: string; effectiveOwner: unknown | null }[]
  members: { membershipId: string; displayName: string }[]
  meId: string | null
  onClaimed: () => Promise<void>
  onOpen: (id: string) => void
}) {
  const { household } = useSession()
  const toast = useToast()
  const [fragen, setFragen] = useState<{ id: string; name: string } | null>(null)
  const andere = members.filter((m) => m.membershipId !== meId)
  const vacant = domains.filter((d) => !d.effectiveOwner)
  if (vacant.length === 0) return null

  const important = vacant.filter((d) => d.criticality === 'high' || d.criticality === 'critical')

  return (
    <Section icon="flag" title="Wo niemand mitdenkt" count={vacant.length}>
      {/*
        Der Satz muss zur Liste passen (Audit 2, H3).

        Vorher stand hier „Bei diesen Bereichen hätte Liegenbleiben spürbare Folgen", sobald
        auch nur einer der Bereiche wichtig war – daneben in derselben Liste ein Bereich, der
        ausdrücklich als „nebensächlich" markiert ist. Ein Hinweis, den die Daten daneben
        widerlegen, kostet Vertrauen in alle anderen.
      */}
      <Notice tone={important.length > 0 ? 'attention' : 'quiet'}>
        {important.length === 0
          ? 'Kein Drama, aber gut zu wissen: Für diese Bereiche fühlt sich niemand ausdrücklich zuständig.'
          : important.length === vacant.length
            ? 'Bei diesen Bereichen hätte Liegenbleiben spürbare Folgen – und gerade denkt niemand mit.'
            : `Für diese Bereiche denkt gerade niemand mit. Bei ${important.length === 1 ? 'einem davon' : `${important.length} davon`} hätte Liegenbleiben spürbare Folgen.`}
      </Notice>
      {/*
        Vorher zwei Knöpfe je Zeile – bei fünf Lücken zehn gleich aussehende Ziele.
        Jetzt trägt die Zeile selbst das Öffnen (wie überall sonst in Thealotta), und nur die
        eigentliche Entscheidung bleibt als Knopf stehen. Gleiche Funktionen, halb so viele
        konkurrierende Elemente.
      */}
      <Panel>
        <RowList>
          {vacant.map((domain) => (
            <li key={domain.id}>
              <Row
                title={domain.name}
                subtitle={CRITICALITY[domain.criticality]}
                chevron={false}
                onClick={() => onOpen(domain.id)}
                end={
                  /*
                    Zwei Auswege, nicht einer (Audit 2, H3).

                    Vorher stand hier allein „Ich übernehme". Wer nachsah, wo etwas offen ist,
                    bekam es angehängt – üblicherweise die Person, die ohnehin am meisten
                    trägt. Das ist das Gegenteil dessen, was die Anwendung erreichen soll.

                    „Fragen" weist nicht zu: Es entsteht eine an eine Person gerichtete Frage.
                    Zuständig wird jemand erst, wenn er selbst zusagt.
                  */
                  <Actions spaced={false}>
                    {andere.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="search"
                        onClick={(event) => {
                          event.stopPropagation()
                          setFragen(domain)
                        }}
                      >
                        Fragen
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="shield"
                      onClick={async (event) => {
                        event.stopPropagation()
                        if (!household) return
                        await endpoints.claimDomain(household.id, domain.id)
                        toast.show(`Du bist jetzt für „${domain.name}" verantwortlich.`)
                        await onClaimed()
                      }}
                    >
                      Ich übernehme
                    </Button>
                  </Actions>
                }
              />
            </li>
          ))}
        </RowList>
      </Panel>

      <Sheet
        open={fragen !== null}
        onClose={() => setFragen(null)}
        title="Jemanden fragen"
        description={fragen?.name}
      >
        <p className="t-body-sm c-secondary">
          Es entsteht eine Frage an diese Person – keine Zuweisung. Zuständig wird sie erst,
          wenn sie den Bereich selbst übernimmt.
        </p>
        <Actions>
          {andere.map((m) => (
            <Button
              key={m.membershipId}
              variant="secondary"
              icon="search"
              onClick={async () => {
                if (!household || !fragen) return
                await endpoints.createQuestion(household.id, {
                  domainId: fragen.id,
                  body: `Magst du für „${fragen.name}" mitdenken?`,
                  directedTo: m.membershipId,
                })
                toast.show(`${m.displayName} wurde gefragt.`)
                setFragen(null)
              }}
            >
              {m.displayName} fragen
            </Button>
          ))}
        </Actions>
      </Sheet>
    </Section>
  )
}

/** §25.2 Care Mode – ohne Bewertung der Person. */
function CareModeSheet({
  membershipId,
  onClose,
  onCoverage,
}: {
  membershipId: string
  onClose: () => void
  onCoverage: () => void
}) {
  const { household } = useSession()
  const care = useAsync(
    () => (household ? endpoints.careMode(household.id, membershipId) : Promise.resolve(null)),
    [household?.id, membershipId],
  )

  return (
    <Sheet
      open
      onClose={onClose}
      title={care.data ? `Was ${care.data.member.displayName} gerade trägt` : 'Entlastung'}
      description="Kein Urteil und keine medizinische Einschätzung – nur eine Grundlage für die Absprache."
    >
      {!care.data ? (
        <SkeletonList count={1} />
      ) : (
        <>
          <Chips>
            <Chip tone={care.data.capacity.active ? 'info' : 'neutral'}>
              Kapazität: {CAPACITY[care.data.capacity.level] ?? care.data.capacity.level}
            </Chip>
          </Chips>

          {care.data.needsHandover.length > 0 && (
            <>
              <p className="t-overline c-muted" style={{ marginTop: 'var(--s-5)' }}>
                Sollte jemand übernehmen
              </p>
              <Panel sunken>
                {care.data.needsHandover.map((entry, index) => (
                  <div key={entry.domainId}>
                    {index > 0 && <Divider />}
                    <div className="setting-row">
                      <div className="text">
                        <p className="t-sub">{entry.name}</p>
                        <p className="t-body-sm desc">{entry.reason}</p>
                      </div>
                      <Chip tone="attention">{CRITICALITY[entry.criticality]}</Chip>
                    </div>
                  </div>
                ))}
              </Panel>
              <Actions>
                <Button variant="primary" icon="shield" onClick={onCoverage}>
                  Vertretung einrichten
                </Button>
              </Actions>
            </>
          )}

          {care.data.alreadyCovered.length > 0 && (
            <>
              <p className="t-overline c-muted" style={{ marginTop: 'var(--s-5)' }}>
                Bereits vertreten
              </p>
              <ul className="reasons t-body-sm">
                {care.data.alreadyCovered.map((entry) => (
                  <li key={entry.domainId}>
                    <span className="marker" aria-hidden="true">
                      •
                    </span>
                    <span>{entry.name}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {care.data.canPause.length > 0 && (
            <>
              <p className="t-overline c-muted" style={{ marginTop: 'var(--s-5)' }}>
                Darf ruhen
              </p>
              <ul className="reasons t-body-sm">
                {care.data.canPause.map((entry) => (
                  <li key={entry.domainId}>
                    <span className="marker" aria-hidden="true">
                      •
                    </span>
                    <span>{entry.name}</span>
                  </li>
                ))}
              </ul>
              <p className="t-body-sm c-muted" style={{ marginTop: 'var(--s-2)' }}>
                Was hier liegen bleibt, bleibt sichtbar und geht nicht verloren.
              </p>
            </>
          )}

          <Notice tone="quiet">{care.data.note}</Notice>
        </>
      )}
    </Sheet>
  )
}

const BAND_TONE: Record<string, 'attention' | 'info' | 'neutral'> = {
  'deutlich mehr': 'attention',
  mehr: 'info',
  ausgeglichen: 'neutral',
  weniger: 'neutral',
  'deutlich weniger': 'neutral',
}

/**
 * §32 / ADR-0012: Bänder statt Prozentwerte, mit sichtbarer Datenqualität.
 * Ausdrücklich kein Ranking und keine Gesamtwertung (§42).
 */
function BalanceView() {
  const { household } = useSession()
  const balance = useAsync(
    () => (household ? endpoints.balance(household.id) : Promise.resolve(null)),
    [household?.id],
  )

  if (!balance.data) return <SkeletonList count={1} />

  return (
    <>
      <Notice tone="quiet">{balance.data.note}</Notice>
      <Panel>
        {balance.data.dimensions.map((dimension, index) => (
          <div key={dimension.key}>
            {index > 0 && <Divider />}
            <div className="setting-row" style={{ display: 'block' }}>
              <p className="t-sub">{dimension.label}</p>
              <p className="t-body-sm desc">{dimension.question}</p>
              {dimension.evenlyShared ? (
                <Chips>
                  <Chip tone="success">ausgeglichen</Chip>
                </Chips>
              ) : (
                <Chips>
                  {dimension.members.map((member) => (
                    <Chip key={member.membershipId} tone={BAND_TONE[member.band] ?? 'neutral'}>
                      {member.displayName}: {member.band}
                    </Chip>
                  ))}
                </Chips>
              )}
            </div>
          </div>
        ))}
      </Panel>
      <Notice tone="quiet" title="Worauf das beruht">
        {balance.data.dataQuality.note}
      </Notice>
    </>
  )
}

/**
 * Heute und morgen auf dem Tisch – zwei Zeilen, kein Planungswerkzeug (§38).
 *
 * Steht nichts im Plan, steht hier auch nichts: Ein leerer Kasten „noch nichts geplant" auf
 * einer Seite, die von Zuständigkeiten handelt, wäre ein Vorwurf ohne Anlass. Der Weg zum
 * Planen steht nur da, wenn es etwas zu sehen gibt – oder gar nicht.
 */
function MealsToday() {
  const { household } = useSession()
  const essen = useAsync(
    () => (household ? endpoints.upcomingMeals(household.id, 2) : Promise.resolve(null)),
    [household?.id],
  )
  const items = essen.data?.items ?? []
  if (items.length === 0) return null

  return (
    <Section
      icon="meal"
      title="Was es zu essen gibt"
      action={
        <Link className="linklike" to="/essen">
          Zum Wochenplan
        </Link>
      }
    >
      <Panel>
        <RowList>
          {items.map((item) => (
            <li key={`${item.date}-${item.slot}`}>
              <MealLine item={item} heute={essen.data!.today} />
            </li>
          ))}
        </RowList>
      </Panel>
    </Section>
  )
}
