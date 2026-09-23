import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { endpoints } from '../lib/api.js'
import { disablePush, enablePush, explain } from '../lib/push.js'
import { useSession } from '../lib/session.js'
import { DEFAULT_SCHEME, readScheme, readSetting, writeSetting } from '../lib/storage.js'
import { ROLE, ROLE_HINT, formatDateTime, relativeDays, useAsync, useWideScreen } from '../lib/ui.js'
import { toneClass, toneLabel, useColors } from '../lib/colors.js'
import { ColorPicker } from '../components/ColorPicker.js'
import {
  Actions,
  Button,
  Consequence,
  Chip,
  Chips,
  Divider,
  EmptyLine,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Input,
  Notice,
  Page,
  Panel,
  PermissionDenied,
  Row,
  RowList,
  Section,
  Select,
  SettingRow,
  Sheet,
  SkeletonList,
  Toggle,
  useToast,
  ICON,
  type IconName,
} from '../design/index.js'
import { prettyPath } from '../lib/domains.js'

type SectionKey =
  | 'haushalt'
  | 'mitglieder'
  | 'rechte'
  | 'benachrichtigungen'
  | 'verbindungen'
  | 'geraete'
  | 'darstellung'
  | 'farben'
  | 'konto'
  | 'daten'
  | 'protokoll'

const SECTIONS: { key: SectionKey; title: string; description: string; icon: IconName }[] = [
  { key: 'haushalt', title: 'Haushalt', description: 'Name, Zeitzone, Darstellung', icon: 'domains' },
  { key: 'mitglieder', title: 'Mitglieder', description: 'Wer dabei ist, Einladungen, Rollen', icon: 'family' },
  { key: 'rechte', title: 'Wer sieht was', description: 'Zugriff auf einzelne Bereiche', icon: 'eye' },
  { key: 'benachrichtigungen', title: 'Benachrichtigungen', description: 'Wann Thealotta sich meldet', icon: 'bell' },
  { key: 'geraete', title: 'Geräte', description: 'Push auf diesem Gerät', icon: 'device' },
  { key: 'verbindungen', title: 'Verbindungen', description: 'Bring! und andere Dienste', icon: 'route' },
  { key: 'darstellung', title: 'Darstellung', description: 'Wie dicht Thealotta Informationen zeigt', icon: 'sparkle' },
  { key: 'farben', title: 'Farben', description: 'Welche Farbe wer und was bei dir hat', icon: 'family' },
  { key: 'konto', title: 'Konto', description: 'Passwort und Abmeldung', icon: 'lock' },
  { key: 'daten', title: 'Deine Daten', description: 'Export und Löschung', icon: 'archive' },
  { key: 'protokoll', title: 'Sicherheitsprotokoll', description: 'Anmeldungen und Rechteänderungen', icon: 'history' },
]

/**
 * Master-Detail – und zwar wirklich.
 *
 * Vorher gab es auf jedem Bildschirm erst eine Liste und dann eine Unterseite: neun Zeilen
 * in voller Breite, links und rechts Leere, und auf dem Desktop zwei Klicks für etwas, das
 * nebeneinander passt. Jetzt trägt eine schmale Spalte die Bereiche, daneben steht der
 * Inhalt – ohne Auswahl der erste Bereich, statt einer Liste ins Nichts (§24, §54).
 *
 * Auf schmalen Bildschirmen bleibt es beim Weg Liste → Unterseite: dort ist für zwei
 * Spalten kein Platz.
 */
export function SettingsPage() {
  const { section } = useParams<{ section?: string }>()
  const navigate = useNavigate()
  const wide = useWideScreen()

  const current = SECTIONS.find((s) => s.key === section) ?? (wide ? SECTIONS[0]! : undefined)

  const list = (compact: boolean) => (
    <RowList>
      {SECTIONS.map((s) => (
        <li key={s.key}>
          <Row
            title={s.title}
            subtitle={compact ? undefined : s.description}
            lead={<Icon name={s.icon} />}
            chevron={!compact}
            onClick={() => navigate(`/einstellungen/${s.key}`)}
            end={compact && s.key === current?.key ? <Chip tone="accent">offen</Chip> : undefined}
          />
        </li>
      ))}
    </RowList>
  )

  // Schmal und ohne Auswahl: nur das Verzeichnis.
  if (!current) {
    return (
      <Page title="Einstellungen" lede="Haushalt, Menschen, Zugriff, Konto und Daten.">
        <Section>{list(false)}</Section>
      </Page>
    )
  }

  /*
    Der Kopf steht über beiden Spalten – wie auf der Bereichsseite (docs/61).

    Vorher lag der ganze `Page` in der rechten Spalte. Gemessen begann der Seitentitel dadurch
    368 px weiter rechts als auf **jeder anderen** Seite der Anwendung: 662 px statt 294 px
    (docs/65). Zwei Seiten mit derselben Struktur – Verzeichnis links, Inhalt rechts – hatten
    zwei verschiedene Lösungen, und nur eine davon lag auf der Achse des Produkts.

    Der Abschnitt nennt sich jetzt eine Ebene tiefer, genau wie dort.
  */
  return (
    <Page
      back={wide ? undefined : { label: 'Einstellungen', onClick: () => navigate('/einstellungen') }}
      title="Einstellungen"
      lede="Haushalt, Menschen, Zugriff, Konto und Daten."
    >
      <div className="split bereich-spalten">
        {/*
          Schmal: entweder das Verzeichnis oder ein Abschnitt, nie beides.

          `.split` stapelt unter 1080 px – und damit standen auf einem Tablet elf
          Verzeichniszeilen über dem Abschnitt, den man gerade geöffnet hatte. Der Weg zurück
          steht schon als „‹ Einstellungen" im Kopf; die Liste ein zweites Mal darunter ist
          kein zweiter Komfort, sondern elf Zeilen Scrollen bis zum Inhalt (docs/65).
        */}
        {wide && (
          <nav className="master" aria-label="Einstellungsbereiche">
            {list(true)}
          </nav>
        )}

        <div className="split-detail">
          <Section title={current.title} hint={current.description} icon={current.icon}>
            {current.key === 'haushalt' && <HouseholdSection />}
            {current.key === 'mitglieder' && <MembersSection />}
            {current.key === 'rechte' && <PermissionsSection />}
            {current.key === 'benachrichtigungen' && <NotificationSection />}
            {current.key === 'geraete' && <DevicesSection />}
            {current.key === 'verbindungen' && <ConnectionsSection />}
            {current.key === 'darstellung' && <DisplaySection />}
            {current.key === 'farben' && <ColorsSection />}
            {current.key === 'konto' && <AccountSection />}
            {current.key === 'daten' && <DataSection />}
            {current.key === 'protokoll' && <AuditSection />}
          </Section>
        </div>
      </div>
    </Page>
  )
}

/* ══ Haushalt ════════════════════════════════════════════════════════ */

function HouseholdSection() {
  const { household, refresh } = useSession()
  const toast = useToast()
  const settings = useAsync(
    () => (household ? endpoints.settings(household.id) : Promise.reject(new Error('–'))),
    [household?.id],
  )
  const [name, setName] = useState<string | null>(null)

  if (settings.error) return <ErrorState meaning="Die Einstellungen konnten nicht geladen werden." onRetry={settings.reload} />
  if (!settings.data || !household) return <SkeletonList count={1} />

  const save = async (patch: Record<string, unknown>) => {
    await endpoints.updateSettings(household.id, patch)
    toast.show('Gespeichert.')
    await settings.reload()
    await refresh()
  }

  return (
    <>
      <Section title="Grunddaten">
        <Panel>
          <Field label="Name des Haushalts">
            {({ id }) => (
              <Input
                id={id}
                value={name ?? settings.data!.name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name !== null && name !== settings.data!.name && void save({ name })}
              />
            )}
          </Field>
          <Field label="Zeitzone" hint={'Bestimmt, wann „morgens“ und „Wochenende“ gelten.'}>
            {({ id }) => (
              <Select id={id} value={settings.data!.timezone} onChange={(e) => void save({ timezone: e.target.value })}>
                {['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'UTC'].map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <p className="t-body-sm c-muted">
            Deine Rolle hier: <strong>{ROLE[settings.data.yourRole] ?? settings.data.yourRole}</strong>
          </p>
        </Panel>
      </Section>

      <Section title="Datenschutz und Darstellung">
        <Panel>
          <SettingRow
            title="Inhalte in Push und E-Mail"
            description={settings.data.explanations['notificationContentLevel'] ?? ''}
          >
            <Select
              value={settings.data.notificationContentLevel}
              onChange={(e) => void save({ notificationContentLevel: e.target.value })}
              aria-label="Inhaltsstufe für Benachrichtigungen"
              style={{ width: 'auto' }}
            >
              <option value="minimal">nur Hinweis</option>
              <option value="titles">mit Titel</option>
            </Select>
          </SettingRow>

          <SettingRow title="Verteilungsansicht" description={settings.data.explanations['balanceViewEnabled'] ?? ''}>
            <Toggle
              pressed={settings.data.balanceViewEnabled}
              onToggle={() => void save({ balanceViewEnabled: !settings.data!.balanceViewEnabled })}
            >
              {settings.data.balanceViewEnabled ? 'an' : 'aus'}
            </Toggle>
          </SettingRow>
        </Panel>
      </Section>
    </>
  )
}

/* ══ Farben ══════════════════════════════════════════════════════════ */

/**
 * Farben für Personen – und die Liste der Bereiche, die von ihrer Voreinstellung abweichen.
 *
 * Die Farbe gilt für dich allein. Das ist der Grund, warum du hier auch die Farbe anderer
 * einstellen darfst, ohne dass jemand gefragt werden müsste: Du änderst dein Bild, nicht
 * ihres. Der Satz steht bewusst oben – ohne ihn wäre „Farbe von Ben" eine Anmaßung.
 */
function ColorsSection() {
  const { household } = useSession()
  const colors = useColors()

  const members = useAsync(
    () => (household ? endpoints.members(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const domains = useAsync(
    () => (household ? endpoints.domains(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )

  if (!household) return null

  const items = members.data?.items ?? []
  const myMembershipId = household.membershipId
  const mine = items.find((m) => m.id === myMembershipId)
  const others = items.filter((m) => m.id !== myMembershipId)
  const tinted = (domains.data?.items ?? []).filter((d) => !d.archivedAt && colors.isCustom('domain', d.id))

  return (
    <>
      <Notice tone="quiet">
        Diese Farben gelten nur für deine Ansicht. Du kannst also auch einstellen, in welcher
        Farbe du andere siehst, ohne dass sich für sie etwas ändert.
      </Notice>

      {mine && (
        <Section title="Deine Farbe">
          <Panel>
            <ColorPicker subject="member" subjectId={mine.id} label={mine.displayName} />
          </Panel>
        </Section>
      )}

      {others.length > 0 && (
        <Section title="Die anderen" count={others.length}>
          <Panel>
            {others.map((member, index) => (
              <div key={member.id}>
                {index > 0 && <Divider />}
                <p className="t-body-sm" style={{ marginBottom: 'var(--s-2)' }}>
                  {member.displayName}
                </p>
                <ColorPicker subject="member" subjectId={member.id} label={member.displayName} />
              </div>
            ))}
          </Panel>
        </Section>
      )}

      {/*
        Bereiche bekommen ihre Farbe dort, wo man sie ansieht – nicht in einer Liste mit
        zwanzig Farbwählern. Hier steht nur, welche abweichen, damit man den Überblick
        behält und einzeln zurücksetzen kann.
      */}
      <Section title="Bereiche mit eigener Farbe" count={tinted.length}>
        <Notice tone="quiet">
          Jeder Bereich hat eine Farbe: die der Person, die für ihn mitdenkt – und wenn
          niemand mitdenkt, eine eigene. Abweichend einstellen kannst du sie auf der Seite
          des Bereichs.
        </Notice>
        {tinted.length === 0 ? (
          <EmptyLine text="Kein Bereich weicht ab." />
        ) : (
          <Panel sunken>
            <RowList>
              {tinted.map((domain) => (
                <li key={domain.id}>
                  <Row
                    lead={<span className={`swatch-dot ${toneClass(colors.domainTone(domain.id))}`} aria-hidden="true" />}
                    title={domain.name}
                    subtitle={toneLabel(colors.domainTone(domain.id))}
                    end={
                      <Button variant="ghost" size="sm" onClick={() => void colors.set('domain', domain.id, null)}>
                        Zurücksetzen
                      </Button>
                    }
                  />
                </li>
              ))}
            </RowList>
          </Panel>
        )}
      </Section>
    </>
  )
}

/* ══ Mitglieder ══════════════════════════════════════════════════════ */

function MembersSection() {
  const { household, me } = useSession()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const [addingPerson, setAddingPerson] = useState(false)
  const [leaving, setLeaving] = useState<{ id: string; name: string; self: boolean } | null>(null)
  const meId = me?.memberships.find((m) => m.householdId === household?.id)?.membershipId ?? null

  const members = useAsync(
    () => (household ? endpoints.members(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const persons = useAsync(
    () => (household ? endpoints.persons(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )

  if (!household) return null

  return (
    <>
      <Notice tone="quiet">
        Die Rolle legt fest, was jemand grundsätzlich sehen darf. Kinder und Gäste sehen ohne
        ausdrückliche Freigabe nichts – zusätzliche Zugänge vergibst du unter „Wer sieht was".
      </Notice>

      <Section title="Mit eigenem Zugang" count={members.data?.items.length ?? 0}>
        <Panel>
          {(members.data?.items ?? []).map((member, index) => (
            <div key={member.id}>
              {index > 0 && <Divider />}
              <Field label={member.displayName} hint={ROLE_HINT[member.role]}>
                {({ id }) => (
                  <Select
                    id={id}
                    value={member.role}
                    onChange={async (e) => {
                      setError(null)
                      try {
                        await endpoints.changeRole(household.id, member.id, e.target.value)
                        toast.show('Rolle geändert.')
                        await members.reload()
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Das ging nicht.')
                      }
                    }}
                  >
                    {Object.entries(ROLE).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {/*
                Der Weg hinaus (Audit 2, H4).

                Es gab ihn nicht – Beziehung endet, Person zieht aus, Kind wechselt den
                Haushalt: alles Sackgassen. Der Knopf steht bewusst unter der Rolle und
                nicht daneben: Rolle ändern ist Alltag, gehen ist es nicht.
              */}
              <Actions>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="trash"
                  onClick={() => setLeaving({ id: member.id, name: member.displayName, self: member.id === meId })}
                >
                  {member.id === meId ? 'Haushalt verlassen' : `${member.displayName} entfernen`}
                </Button>
              </Actions>
            </div>
          ))}
        </Panel>
        {error && <Notice tone="attention">{error}</Notice>}
      </Section>

      <LeaveSheet
        target={leaving}
        onClose={() => setLeaving(null)}
        onDone={async (self) => {
          setLeaving(null)
          if (self) {
            // Der eigene Zugang zu diesem Haushalt ist weg – die Sitzung muss das erfahren.
            window.location.assign('/')
            return
          }
          await members.reload()
        }}
      />

      <Section
        title="Personen ohne Zugang"
        count={persons.data?.items.length ?? 0}
        action={
          <Button variant="ghost" size="sm" icon="plus" onClick={() => setAddingPerson(true)}>
            Person
          </Button>
        }
      >
        <Notice tone="quiet">
          Kinder und betreute Personen brauchen keinen Login, um im System vorzukommen. Über sie
          wird Wissen geführt – handeln können sie nicht.
        </Notice>
        {(persons.data?.items ?? []).length === 0 ? (
          <EmptyState
            icon="family"
            title="Noch keine Person angelegt"
            description="Sobald es eine Person gibt, lassen sich Bereiche und Angaben ihr zuordnen – etwa „Kind A / Kleidung“."
            action={
              <Button variant="secondary" icon="plus" onClick={() => setAddingPerson(true)}>
                Person hinzufügen
              </Button>
            }
          />
        ) : (
          <RowList>
            {(persons.data?.items ?? []).map((person) => (
              <li key={person.id}>
                <Row title={person.displayName} end={<Chip>{personKindLabel(person.personKind)}</Chip>} />
              </li>
            ))}
          </RowList>
        )}
      </Section>

      <InvitationsBlock />

      <PersonSheet
        open={addingPerson}
        onClose={() => setAddingPerson(false)}
        onDone={async () => {
          setAddingPerson(false)
          await persons.reload()
        }}
      />
    </>
  )
}

const personKindLabel = (kind: string): string =>
  ({ child: 'Kind', dependent: 'betreut', caregiver: 'Betreuung', external: 'extern', adult_member: 'erwachsen' })[
    kind
  ] ?? kind

function PersonSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const { household } = useSession()
  const toast = useToast()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('child')

  return (
    <Sheet open={open} onClose={onClose} title="Person hinzufügen" description="Jemand, über den das System Wissen führt.">
      <Field label="Name">
        {({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Kind A" />}
      </Field>
      <Field label="Art">
        {({ id }) => (
          <Select id={id} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="child">Kind</option>
            <option value="dependent">betreute Person</option>
            <option value="adult_member">erwachsenes Mitglied</option>
            <option value="caregiver">Betreuungsperson</option>
            <option value="external">externe Person</option>
          </Select>
        )}
      </Field>
      <Actions end spaced={false}>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={!name.trim()}
          onClick={async () => {
            if (!household) return
            await endpoints.createPerson(household.id, { displayName: name.trim(), personKind: kind })
            setName('')
            toast.show('Person hinzugefügt.')
            await onDone()
          }}
        >
          Hinzufügen
        </Button>
      </Actions>
    </Sheet>
  )
}

/* ══ Rechte ══════════════════════════════════════════════════════════ */

const ACCESS_PRESETS: { key: string; label: string; description: string; capabilities: string[]; sensitivity: string }[] = [
  {
    key: 'read',
    label: 'Ansehen',
    description: 'Kann den Bereich, seinen Zustand und das Wissen sehen – aber nichts ändern.',
    capabilities: ['domain:read', 'state:read', 'knowledge:read', 'task:read', 'attention:read', 'process:read'],
    sensitivity: 'normal',
  },
  {
    key: 'help',
    label: 'Ansehen und mithelfen',
    description: 'Kann zusätzlich Angaben bestätigen, Aufgaben anlegen und erledigen.',
    capabilities: [
      'domain:read',
      'state:read',
      'state:write',
      'knowledge:read',
      'knowledge:write',
      'task:read',
      'task:create',
      'task:complete_others',
      'attention:read',
      'attention:triage',
      'process:read',
      'process:manage',
    ],
    sensitivity: 'normal',
  },
  {
    key: 'health',
    label: 'Auch Gesundheitsangaben',
    description: 'Wie „Ansehen und mithelfen", zusätzlich mit Gesundheitsinformationen.',
    capabilities: [
      'domain:read',
      'state:read',
      'state:write',
      'knowledge:read',
      'task:read',
      'attention:read',
      'process:read',
      'health:read',
    ],
    sensitivity: 'health',
  },
]

/**
 * §44: Berechtigungen verständlich machen.
 *
 * Statt einer Matrix aus Capabilities zeigt die Oberfläche Sätze: „Ben kann Kind A / Gesundheit
 * ansehen und mithelfen." Vergeben wird über drei verständliche Stufen, nicht über 47 Einzelrechte.
 */
function PermissionsSection() {
  const { household } = useSession()
  const toast = useToast()
  const [granting, setGranting] = useState(false)

  const grants = useAsync(
    () => (household ? endpoints.grants(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const members = useAsync(
    () => (household ? endpoints.members(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  const domains = useAsync(
    () => (household ? endpoints.domains(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )

  if (!household) return null
  if (grants.error) return <PermissionDenied what="Die Zugriffsverwaltung" />
  if (!grants.data) return <SkeletonList count={1} />

  // Grants pro (Person, Bereich) zu einem Satz zusammenfassen.
  const grouped = new Map<string, { membershipId: string; scopeId: string | null; scopeName: string | null; caps: Set<string>; sensitivity: string; ids: string[] }>()
  for (const grant of grants.data.items) {
    const key = `${grant.membershipId}|${grant.scopeId ?? 'household'}`
    const entry = grouped.get(key) ?? {
      membershipId: grant.membershipId,
      scopeId: grant.scopeId,
      scopeName: grant.scopeName,
      caps: new Set<string>(),
      sensitivity: grant.maxSensitivity,
      ids: [],
    }
    entry.caps.add(grant.capability)
    entry.ids.push(grant.id)
    if (grant.maxSensitivity === 'health' || grant.maxSensitivity === 'sensitive') entry.sensitivity = grant.maxSensitivity
    grouped.set(key, entry)
  }

  const nameOf = (id: string) => members.data?.items.find((m) => m.id === id)?.displayName ?? 'unbekannt'

  return (
    <>
      <Notice tone="quiet">
        Die Rolle legt den Grundzugriff fest. Hier kommen einzelne Bereiche dazu – zum Beispiel,
        damit eine Betreuungsperson genau einen Bereich sieht und sonst nichts.
      </Notice>

      <Section
        title="Zusätzliche Zugänge"
        count={grouped.size}
        action={
          <Button variant="ghost" size="sm" icon="plus" onClick={() => setGranting(true)}>
            Zugang geben
          </Button>
        }
      >
        {grouped.size === 0 ? (
          <EmptyState
            icon="eye"
            title="Keine zusätzlichen Zugänge"
            description="Alle sehen genau das, was ihre Rolle vorgibt. Zusätzliche Zugänge gibst du gezielt für einzelne Bereiche."
            action={
              <Button variant="secondary" icon="plus" onClick={() => setGranting(true)}>
                Zugang geben
              </Button>
            }
          />
        ) : (
          <Panel>
            {[...grouped.values()].map((entry, index) => (
              <div key={`${entry.membershipId}-${entry.scopeId}`}>
                {index > 0 && <Divider />}
                <div className="setting-row">
                  <div className="text">
                    {/* Ein Satz statt einer Matrix. */}
                    <p className="t-sub">
                      {nameOf(entry.membershipId)} kann {entry.scopeName ? `„${entry.scopeName}"` : 'den Haushalt'}{' '}
                      {entry.caps.has('state:write') || entry.caps.has('process:manage')
                        ? 'ansehen und mithelfen'
                        : 'ansehen'}
                      .
                    </p>
                    <p className="t-body-sm desc">
                      {entry.sensitivity === 'health' || entry.sensitivity === 'sensitive'
                        ? 'Einschließlich Gesundheitsangaben.'
                        : 'Ohne Gesundheitsangaben und ohne besonders geschützte Inhalte.'}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      for (const id of entry.ids) await endpoints.revokeGrant(household.id, id)
                      toast.show('Zugang entzogen.')
                      await grants.reload()
                    }}
                  >
                    Entziehen
                  </Button>
                </div>
              </div>
            ))}
          </Panel>
        )}
      </Section>

      <GrantSheet
        open={granting}
        onClose={() => setGranting(false)}
        members={members.data?.items ?? []}
        domains={domains.data?.items ?? []}
        onDone={async () => {
          setGranting(false)
          await grants.reload()
        }}
      />
    </>
  )
}

function GrantSheet({
  open,
  onClose,
  members,
  domains,
  onDone,
}: {
  open: boolean
  onClose: () => void
  members: { id: string; displayName: string }[]
  domains: { id: string; path: string; name: string }[]
  onDone: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [membershipId, setMembershipId] = useState('')
  const [domainId, setDomainId] = useState('')
  const [preset, setPreset] = useState('read')
  const [busy, setBusy] = useState(false)

  const chosen = ACCESS_PRESETS.find((p) => p.key === preset)!
  const memberName = members.find((m) => m.id === membershipId)?.displayName
  const domainName = domains.find((d) => d.id === domainId)?.name

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Zugang zu einem Bereich geben"
      description="Gilt für den Bereich und alles darunter."
    >
      <Field label="Wer?">
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

      <Field label="Welcher Bereich?">
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

      <Field label="Wie viel Zugriff?">
        {() => (
          <Chips>
            {ACCESS_PRESETS.map((p) => (
              <Toggle key={p.key} role="radio" pressed={preset === p.key} onToggle={() => setPreset(p.key)}>
                {p.label}
              </Toggle>
            ))}
          </Chips>
        )}
      </Field>
      <p className="t-body-sm c-secondary">{chosen.description}</p>

      {membershipId && domainId && (
        <Notice tone="accent" title="Das bedeutet konkret">
          {memberName} kann „{domainName}" und alle darunter liegenden Bereiche{' '}
          {preset === 'read' ? 'ansehen' : 'ansehen und dort mithelfen'}
          {preset === 'health' ? ', einschließlich Gesundheitsangaben' : ''}. Besonders geschützte
          Inhalte bleiben unsichtbar.
        </Notice>
      )}

      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={busy || !membershipId || !domainId}
          onClick={async () => {
            if (!household) return
            setBusy(true)
            try {
              for (const capability of chosen.capabilities) {
                await endpoints.createGrant(household.id, {
                  membershipId,
                  scopeType: 'domain',
                  scopeId: domainId,
                  capability,
                  maxSensitivity: chosen.sensitivity,
                  effect: 'allow',
                })
              }
              toast.show('Zugang gegeben.')
              await onDone()
            } finally {
              setBusy(false)
            }
          }}
        >
          Zugang geben
        </Button>
      </Actions>
    </Sheet>
  )
}

/* ══ Benachrichtigungen ══════════════════════════════════════════════ */

const CHANNELS = [
  { key: 'in_app', label: 'In der App' },
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'E-Mail' },
]

function NotificationSection() {
  const { household } = useSession()
  const toast = useToast()
  const prefs = useAsync(
    () => (household ? endpoints.notificationPreferences(household.id) : Promise.reject(new Error('–'))),
    [household?.id],
  )

  if (prefs.error) return <ErrorState meaning="Die Einstellungen konnten nicht geladen werden." onRetry={prefs.reload} />
  if (!prefs.data || !household) return <SkeletonList count={2} />

  const toggle = async (kind: string, channel: string) => {
    const entry = prefs.data!.items.find((i) => i.notificationKind === kind)!
    const channels = entry.channels.includes(channel)
      ? entry.channels.filter((c) => c !== channel)
      : [...entry.channels, channel]
    try {
      await endpoints.setNotificationPreferences(household.id, [
        { notificationKind: kind, priorityFloor: entry.priorityFloor, channels, quietHours: entry.quietHours },
      ])
      await prefs.reload()
    } catch {
      toast.show('Sicherheitsmeldungen brauchen mindestens einen Kanal.')
    }
  }

  return (
    <>
      <Notice tone="quiet">{prefs.data.note}</Notice>
      <Section title="Wann soll Thealotta sich melden?" count={prefs.data.items.length}>
        <Panel>
          {prefs.data.items.map((item, index) => (
            <div key={item.notificationKind}>
              {index > 0 && <Divider />}
              <div className="setting-row" style={{ display: 'block' }}>
                <p className="t-sub">{item.explanation}</p>
                {!item.configurable && (
                  <p className="t-body-sm c-muted" style={{ marginTop: 2 }}>
                    Sicherheits- und Systemmeldungen lassen sich nicht abschalten – nur der Kanal ist wählbar.
                  </p>
                )}
                <Chips>
                  {CHANNELS.map((channel) => {
                    const on = item.channels.includes(channel.key)
                    const locked = !item.configurable && on && item.channels.length === 1
                    return (
                      <Toggle
                        key={channel.key}
                        pressed={on}
                        onToggle={() => {
                          if (!locked) void toggle(item.notificationKind, channel.key)
                        }}
                      >
                        {channel.label}
                      </Toggle>
                    )
                  })}
                </Chips>
              </div>
            </div>
          ))}
        </Panel>
      </Section>
    </>
  )
}

/* ══ Geräte ══════════════════════════════════════════════════════════ */

function DevicesSection() {
  const { household } = useSession()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const subs = useAsync(
    () => (household ? endpoints.pushSubscriptions(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )
  /** Ohne Serverschlüssel gibt es keinen Push – das sagen wir vorher, nicht hinterher. */
  const config = useAsync(() => endpoints.pushConfig().catch(() => ({ publicKey: null })), [])

  if (!household) return null

  const available = config.data?.publicKey !== null
  const register = async () => {
    setBusy(true)
    try {
      const outcome = await enablePush(household.id)
      toast.show(explain(outcome))
      if (outcome.ok) await subs.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Notice tone="quiet">
        Push ist eine Zusatzhilfe, kein Verlass. Alles bleibt in der App sichtbar – auch wenn eine
        Nachricht nie ankommt.
      </Notice>

      {config.data && !available && (
        <Notice tone="attention" title="Push ist auf diesem Server nicht eingerichtet">
          E-Mail und die Meldungen in der App funktionieren normal. Wer den Server betreibt, kann
          Push mit einem VAPID-Schlüsselpaar aktivieren.
        </Notice>
      )}

      <Section
        title="Angemeldete Geräte"
        count={subs.data?.items.length ?? 0}
        action={
          available && (subs.data?.items ?? []).length > 0 ? (
            <Button variant="secondary" size="sm" icon="bell" disabled={busy} onClick={() => void register()}>
              Dieses Gerät anmelden
            </Button>
          ) : undefined
        }
      >
        {subs.loading && !subs.data ? (
          <SkeletonList count={1} />
        ) : (subs.data?.items ?? []).length === 0 ? (
          <EmptyState
            icon="device"
            title="Noch kein Gerät angemeldet"
            description={
              available
                ? 'Push kann helfen, muss aber nicht sein. Auf dem iPhone funktioniert es erst, wenn Thealotta über „Zum Home-Bildschirm“ installiert ist.'
                : 'Sobald der Server Push unterstützt, kannst du dieses Gerät hier anmelden.'
            }
            action={
              available ? (
                <Button variant="secondary" icon="bell" disabled={busy} onClick={() => void register()}>
                  Push einrichten
                </Button>
              ) : undefined
            }
          />
        ) : (
          <RowList>
            {(subs.data?.items ?? []).map((sub) => (
              <li key={sub.id}>
                <Row
                  title={`Gerät seit ${relativeDays(sub.createdAt)}`}
                  subtitle={
                    sub.disabledAt
                      ? 'Der Browser nimmt keine Nachrichten mehr an. Neu anmelden hilft.'
                      : sub.lastSuccessAt
                        ? `zuletzt erreicht ${relativeDays(sub.lastSuccessAt)}`
                        : 'noch keine Nachricht zugestellt'
                  }
                  end={
                    <>
                      {sub.disabledAt ? (
                        <Chip tone="attention">nicht mehr erreichbar</Chip>
                      ) : (
                        <Chip tone="success">aktiv</Chip>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await disablePush(household.id, sub.id)
                          toast.show('Gerät entfernt. Auf diesem Gerät kommt jetzt kein Push mehr an.')
                          await subs.reload()
                        }}
                      >
                        Entfernen
                      </Button>
                    </>
                  }
                />
              </li>
            ))}
          </RowList>
        )}
      </Section>
    </>
  )
}

/* ══ Daten ═══════════════════════════════════════════════════════════ */

/**
 * Einzahl zu den Zählwörtern des Imports.
 *
 * „1 Bereiche" liest sich wie ein Fehler, und ein Fehler an dieser Stelle lässt an allem
 * anderen zweifeln, was die Meldung behauptet.
 */
/**
 * Das Wort für die harte Bestätigung.
 *
 * Ausdrücklich **nicht** der Haushaltsname: Den verlangt schon die Haushaltslöschung
 * darunter. Zwei zerstörende Handlungen mit derselben Eingabe wären eine Falle.
 * Der Server prüft dasselbe Wort noch einmal – ein Schutz, den nur der Client kennt, ist keiner.
 */
const LEEREN_WORT = 'ALLES LÖSCHEN'

const EINZAHL: Record<string, string> = {
  Bereiche: 'Bereich',
  Personen: 'Person',
  Angaben: 'Angabe',
  Werte: 'Wert',
  Notizen: 'Notiz',
  Fragen: 'Frage',
  Entscheidungen: 'Entscheidung',
  Regeln: 'Regel',
  Vorgänge: 'Vorgang',
  Aufgaben: 'Aufgabe',
  Abhängigkeiten: 'Abhängigkeit',
}

function DataSection() {
  const { household } = useSession()
  const toast = useToast()
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [importErgebnis, setImportErgebnis] = useState<{
    angelegt: Record<string, number>
    uebersprungen: string[]
  } | null>(null)
  const [importFehler, setImportFehler] = useState<string | null>(null)
  const [leeren, setLeeren] = useState(false)
  const [leerWort, setLeerWort] = useState('')
  const [leerFehler, setLeerFehler] = useState<string | null>(null)

  if (!household) return null

  return (
    <>
      {/*
        Mitnehmen und zurückbringen – als eine Datei.

        Hier stand ein Knopf „Export anfordern", der einen Auftrag in eine Warteschlange
        legte, die niemand abarbeitete: Die Meldung versprach „Du bekommst Bescheid, sobald
        er bereitsteht", und es passierte nie etwas. Ein Haushalt ist klein genug, um ihn
        sofort auszuliefern.
      */}
      <Section title="Daten mitnehmen">
        <Panel>
          <div className="setting-row">
            <div className="text">
              <p className="t-body-sm">
                Eine JSON-Datei mit euren Bereichen, Angaben, Notizen, Fragen, Entscheidungen,
                Regeln, Vorgängen und Aufgaben.
              </p>
              <Consequence>
                Zugänge, Passwörter und Geräte stehen nicht darin – eine Sicherungsdatei ist
                kein Konto.
              </Consequence>
            </div>
            <Button
              variant="primary"
              icon="shield"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const { text, dateiname } = await endpoints.exportHousehold(household.id)
                  /*
                    Der Browser lädt keine Datei herunter, die er nicht selbst kennt: Ein
                    kurzlebiger Blob-Verweis ist der einzige Weg, ohne die Datei zweimal
                    über die Leitung zu schicken. Er wird sofort wieder freigegeben.
                  */
                  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
                  const a = document.createElement('a')
                  a.href = url
                  a.download = dateiname
                  a.click()
                  URL.revokeObjectURL(url)
                  toast.show('Datei gespeichert.')
                } catch {
                  toast.show('Der Export ist nicht durchgekommen.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Datei speichern
            </Button>
          </div>
        </Panel>
      </Section>

      <Section title="Daten zurückbringen">
        <Panel>
          <div className="setting-row">
            <div className="text">
              <p className="t-body-sm">
                Eine zuvor gespeicherte Datei einlesen. Alles darin kommt <strong>zusätzlich</strong>{' '}
                herein – Bestehendes bleibt unberührt.
              </p>
              <Consequence>
                Wer welchen Bereich trägt, kommt nicht mit: Die Mitglieder der Datei sind in
                diesem Haushalt niemand. Die Zuständigkeit vergebt ihr danach selbst.
              </Consequence>
            </div>
            <label className="btn btn-secondary btn-sm">
              <Icon name="plus" size={ICON.sm} />
              Datei wählen
              <input
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                onChange={async (e) => {
                  const datei = e.target.files?.[0]
                  e.target.value = ''
                  if (!datei) return
                  setBusy(true)
                  setImportFehler(null)
                  try {
                    const doc = JSON.parse(await datei.text()) as unknown
                    setImportErgebnis(await endpoints.importHousehold(household.id, doc))
                  } catch (err) {
                    setImportFehler(
                      err instanceof SyntaxError
                        ? 'Diese Datei ist kein lesbares JSON.'
                        : err instanceof Error
                          ? err.message
                          : 'Das ging nicht.',
                    )
                  } finally {
                    setBusy(false)
                  }
                }}
              />
            </label>
          </div>

          {importFehler && (
            <>
              <Divider />
              <Notice tone="attention" title="So geht das nicht">
                {importFehler}
              </Notice>
            </>
          )}

          {importErgebnis && (
            <>
              <Divider />
              <Notice tone="info" title="Eingelesen">
                {/* Eine Zeile statt einer Liste: Sechs Zahlen lesen sich nebeneinander besser. */}
                <p className="t-body-sm">
                  {Object.entries(importErgebnis.angelegt)
                    .map(([was, wie]) => `${wie} ${wie === 1 ? (EINZAHL[was] ?? was) : was}`)
                    .join(' · ') || 'Nichts Neues – die Datei war leer.'}
                </p>
                {importErgebnis.uebersprungen.length > 0 && (
                  <p className="t-body-sm c-secondary">
                    Nicht übernommen: {importErgebnis.uebersprungen.join(' · ')}
                  </p>
                )}
              </Notice>
            </>
          )}
        </Panel>
      </Section>

      {/*
        Alles leeren – zwischen Mitnehmen und Löschen, weil es beides berührt: Man leert nach
        einem Export, und man leert *statt* zu löschen, wenn der Haushalt bleiben soll.

        Die Bestätigung ist ein eigenes Wort und nicht der Haushaltsname. Zwei zerstörende
        Handlungen mit derselben Eingabe wären eine Falle: Wer im falschen Dialog das
        Richtige tippt, merkt es erst danach.
      */}
      <Section title="Alle Einträge löschen">
        <Panel>
          <div className="setting-row">
            <div className="text">
              <p className="t-body-sm">
                Leert den Haushalt: Bereiche, Angaben, Notizen, Fragen, Entscheidungen, Regeln,
                Vorgänge, Aufgaben, Zuständigkeiten und Personen ohne Zugang.
              </p>
              <Consequence>
                Der Haushalt bleibt bestehen, ebenso alle Mitglieder mit Zugang samt ihren
                Einstellungen. Genau das, was ein Export mitnimmt, wird gelöscht – wer die
                Datei vorher speichert, kann alles zurückbringen.
              </Consequence>
            </div>
            {!leeren && (
              <Button variant="destructive" size="sm" icon="trash" onClick={() => setLeeren(true)}>
                Alles löschen
              </Button>
            )}
          </div>

          {leeren && (
            <>
              <Divider />
              <Notice tone="critical" title="Das lässt sich nicht rückgängig machen">
                Es gibt keine Karenzzeit und keinen Papierkorb. Wenn du die Daten behalten
                willst, speichere zuerst oben die Datei.
              </Notice>
              <Field
                label="Zur Bestätigung eingeben"
                hint={`Erwartet: ${LEEREN_WORT}`}
              >
                {({ id }) => (
                  <Input
                    id={id}
                    value={leerWort}
                    autoComplete="off"
                    onChange={(e) => setLeerWort(e.target.value)}
                  />
                )}
              </Field>
              {leerFehler && <Notice tone="attention">{leerFehler}</Notice>}
              <Actions spaced={false}>
                <Button
                  variant="destructive"
                  disabled={leerWort !== LEEREN_WORT || busy}
                  onClick={async () => {
                    setBusy(true)
                    setLeerFehler(null)
                    try {
                      const { geloescht } = await endpoints.clearHousehold(household.id, leerWort)
                      const summe = Object.values(geloescht).reduce((a, b) => a + b, 0)
                      toast.show(summe === 0 ? 'Es war schon leer.' : `${summe} Einträge gelöscht.`)
                      setLeerWort('')
                      setLeeren(false)
                      // Die halbe Anwendung hält jetzt Daten, die es nicht mehr gibt.
                      window.location.assign('/bereiche')
                    } catch (err) {
                      setLeerFehler(err instanceof Error ? err.message : 'Das ging gerade nicht.')
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Endgültig löschen
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setLeeren(false)
                    setLeerWort('')
                    setLeerFehler(null)
                  }}
                >
                  Behalten
                </Button>
              </Actions>
            </>
          )}
        </Panel>
      </Section>

      <Section title="Haushalt löschen">
        <Panel>
          <p className="t-body-sm c-secondary">
            Die Löschung startet nicht sofort: Es gibt 30 Tage Karenzzeit, in denen sie
            zurückgenommen werden kann. Alle Verwaltenden werden informiert.
          </p>
          {!deleting ? (
            <Actions spaced>
              <Button variant="destructive" onClick={() => setDeleting(true)}>
                Löschung vorbereiten
              </Button>
            </Actions>
          ) : (
            <>
              <Field
                label="Zur Bestätigung den Namen eingeben"
                hint={`Erwartet: ${household.name}`}
              >
                {({ id }) => <Input id={id} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />}
              </Field>
              <Actions spaced={false}>
                <Button
                  variant="destructive"
                  disabled={confirmName !== household.name}
                  onClick={async () => {
                    const result = await endpoints.requestDeletion(household.id, {
                      scope: 'household',
                      mode: 'hard',
                      confirmation: confirmName,
                    })
                    toast.show(result.note)
                    setConfirmName('')
                    setDeleting(false)
                  }}
                >
                  Löschung beantragen
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(false)}>
                  Behalten
                </Button>
              </Actions>
            </>
          )}
        </Panel>
      </Section>
    </>
  )
}

/* ══ Protokoll ═══════════════════════════════════════════════════════ */

const AUDIT_LABEL: Record<string, string> = {
  'auth.login_succeeded': 'Anmeldung',
  'auth.login_failed': 'Fehlgeschlagene Anmeldung',
  'auth.password_reset_completed': 'Passwort geändert',
  'auth.session_revoked': 'Sitzung beendet',
  'membership.role_changed': 'Rolle geändert',
  'grant.created': 'Zugang gegeben',
  'grant.revoked': 'Zugang entzogen',
  'grant.self_elevated': 'Zugang selbst erweitert',
  'calendar.connected': 'Kalender verbunden',
  'calendar.disconnected': 'Kalender getrennt',
  'calendar.scope_changed': 'Kalender-Sichtbarkeit geändert',
  'export.requested': 'Export angefordert',
  'deletion.requested': 'Löschung beantragt',
  'deletion.cancelled': 'Löschung zurückgenommen',
}

function AuditSection() {
  const { household } = useSession()
  const audit = useAsync(
    () => (household ? endpoints.audit(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )

  if (audit.error) return <PermissionDenied what="Das Sicherheitsprotokoll" />
  if (!audit.data) return <SkeletonList count={1} />

  return (
    <>
      <Notice tone="quiet">
        Hier stehen nur sicherheitsrelevante Vorgänge – Anmeldungen, Rechte, Kalender, Export,
        Löschung. Inhalte eurer Daten tauchen darin nie auf.
      </Notice>

      <Section title="Verlauf" count={audit.data.items.length}>
        {audit.data.items.length === 0 ? (
          <p className="t-body-sm c-muted">Noch nichts protokolliert.</p>
        ) : (
          <RowList>
            {audit.data.items.map((entry) => (
              <li key={entry.id}>
                <Row
                  title={AUDIT_LABEL[entry.action] ?? entry.action}
                  subtitle={formatDateTime(entry.occurredAt)}
                  end={
                    entry.outcome !== 'success' ? (
                      <Chip tone="attention">{entry.outcome === 'failure' ? 'fehlgeschlagen' : 'abgelehnt'}</Chip>
                    ) : undefined
                  }
                />
              </li>
            ))}
          </RowList>
        )}
      </Section>
    </>
  )
}

/* ══ Einladungen ═════════════════════════════════════════════════════ */

/**
 * §7.1: Ein Haushalt entsteht selten allein. Ohne diesen Fluss konnte die zweite Person
 * nur direkt in der Datenbank entstehen.
 */
function InvitationsBlock() {
  const { household } = useSession()
  const toast = useToast()
  const [inviting, setInviting] = useState(false)
  const [lastLink, setLastLink] = useState<string | null>(null)

  const invitations = useAsync(
    () => (household ? endpoints.invitations(household.id) : Promise.resolve({ items: [] })),
    [household?.id],
  )

  if (!household) return null

  return (
    <Section
      title="Offene Einladungen"
      count={invitations.data?.items.length ?? 0}
      action={
        <Button variant="ghost" size="sm" icon="plus" onClick={() => setInviting(true)}>
          Einladen
        </Button>
      }
    >
      {(invitations.data?.items ?? []).length === 0 ? (
        <EmptyState
          icon="family"
          title="Niemand eingeladen"
          description="Thealotta wird nützlicher, sobald mehr als eine Person mitdenkt – dann lässt sich Verantwortung überhaupt erst verteilen."
          action={
            <Button variant="secondary" icon="plus" onClick={() => setInviting(true)}>
              Jemanden einladen
            </Button>
          }
        />
      ) : (
        <Panel>
          {(invitations.data?.items ?? []).map((invitation, index) => (
            <div key={invitation.id}>
              {index > 0 && <Divider />}
              <div className="setting-row">
                <div className="text">
                  <p className="t-sub">{invitation.email}</p>
                  <p className="t-body-sm desc">
                    Als {ROLE[invitation.role] ?? invitation.role} ·{' '}
                    {invitation.expired
                      ? 'abgelaufen'
                      : `gültig bis ${new Date(invitation.expiresAt).toLocaleDateString('de-DE')}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await endpoints.revokeInvitation(household.id, invitation.id)
                    toast.show('Einladung zurückgezogen.')
                    await invitations.reload()
                  }}
                >
                  Zurückziehen
                </Button>
              </div>
            </div>
          ))}
        </Panel>
      )}

      {lastLink && (
        <Notice tone="accent" title="Einladungslink">
          Schick diesen Link an die eingeladene Person – er funktioniert nur mit ihrer
          E-Mail-Adresse: <code>{window.location.origin + lastLink}</code>
        </Notice>
      )}

      <InviteSheet
        open={inviting}
        onClose={() => setInviting(false)}
        onDone={async (url) => {
          setInviting(false)
          setLastLink(url)
          await invitations.reload()
        }}
      />
    </Section>
  )
}

function InviteSheet({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: (inviteUrl: string) => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('adult')
  const [expiresAt, setExpiresAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Jemanden einladen"
      description="Die Einladung gilt nur für diese Adresse und läuft nach sieben Tagen ab."
    >
      <Field label="E-Mail-Adresse" error={error ?? undefined}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="email"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </Field>

      <Field label="Welche Rolle?" hint={ROLE_HINT[role]}>
        {({ id }) => (
          <Select
            id={id}
            value={role}
            onChange={(e) => {
              setRole(e.target.value)
              if (e.target.value !== 'guest') setExpiresAt('')
            }}
          >
            {Object.entries(ROLE).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {role === 'guest' && (
        <Field label="Zugang endet am" hint="Gastzugänge sind immer befristet.">
          {({ id }) => <Input id={id} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />}
        </Field>
      )}

      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={busy || !email.trim() || (role === 'guest' && !expiresAt)}
          onClick={async () => {
            if (!household) return
            setBusy(true)
            setError(null)
            try {
              const result = await endpoints.invite(household.id, {
                email: email.trim(),
                role,
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
              })
              setEmail('')
              toast.show('Einladung erstellt.')
              await onDone(result.inviteUrl)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Das ging nicht.')
            } finally {
              setBusy(false)
            }
          }}
        >
          Einladen
        </Button>
      </Actions>
    </Sheet>
  )
}

/* ══ Darstellung ═════════════════════════════════════════════════════ */

const DENSITIES = [
  { key: 'calm', label: 'Ruhig', hint: 'Mehr Luft, weniger auf einen Blick. Empfohlen.' },
  { key: 'default', label: 'Standard', hint: 'Ausgewogen.' },
  { key: 'compact', label: 'Kompakt', hint: 'Mehr Inhalt pro Bildschirm.' },
]

/**
 * §41: Personalisierung ist erlaubt, aber keine Voraussetzung. Der Standard muss bereits
 * gut sein – die Einstellung verschiebt nur die Dichte, nie den Funktionsumfang.
 */
const THEMES = [
  { key: 'system', label: 'Wie das Gerät' },
  { key: 'light', label: 'Hell' },
  { key: 'dark', label: 'Dunkel' },
]

/**
 * Etablierte Paletten. Flächen und Identitätsfarben stammen unverändert aus den offiziellen
 * Werten; neun Textrollen sind abgeleitet, weil diese Schemata für Code-Editoren gemacht
 * sind und eingegraute Kommentare dort erwünscht, in einer Oberfläche mit viel Fließtext
 * aber unlesbar sind (docs/47).
 */
const SCHEMES = [
  { key: 'thealotta', label: 'Thealotta', hint: 'Papier und Tinte – die Voreinstellung.' },
  { key: 'dracula', label: 'Dracula', hint: 'Dracula im Dunkeln, Alucard im Hellen.' },
  { key: 'catppuccin', label: 'Catppuccin', hint: 'Mocha im Dunkeln, Latte im Hellen.' },
  { key: 'nord', label: 'Nord', hint: 'Polar Night und Snow Storm.' },
  { key: 'solarized', label: 'Solarized', hint: 'Der Klassiker von Ethan Schoonover.' },
]

function DisplaySection() {
  const [density, setDensity] = useState(() => readSetting('density') ?? 'calm')
  const [theme, setTheme] = useState(() => readSetting('theme') ?? 'system')
  const [scheme, setScheme] = useState(() => readScheme())

  const apply = (value: string) => {
    setDensity(value)
    writeSetting('density', value)
    document.documentElement.dataset['density'] = value
  }

  /*
   * Die Geräteeinstellung ist ein guter Standard, aber keine Entscheidung: Wer sein System
   * dunkel stellt, will nicht zwangsläufig jede App dunkel. Ohne diese Wahl war der
   * Dunkelmodus für viele der einzige Modus, den sie je zu sehen bekamen.
   */
  const applyTheme = (value: string) => {
    setTheme(value)
    writeSetting('theme', value)
    if (value === 'system') delete document.documentElement.dataset['theme']
    else document.documentElement.dataset['theme'] = value
  }

  const applyScheme = (value: string) => {
    setScheme(value)
    writeSetting('scheme', value)
    if (value === DEFAULT_SCHEME) delete document.documentElement.dataset['scheme']
    else document.documentElement.dataset['scheme'] = value
  }

  return (
    <>
      <Notice tone="quiet">
        Die Einstellung gilt nur auf diesem Gerät und verändert ausschließlich die Dichte –
        es verschwindet nichts.
      </Notice>

      <Section title="Informationsdichte">
        <Panel>
          <Chips>
            {DENSITIES.map((d) => (
              <Toggle key={d.key} role="radio" pressed={density === d.key} onToggle={() => apply(d.key)}>
                {d.label}
              </Toggle>
            ))}
          </Chips>
          <p className="t-body-sm c-muted" style={{ marginTop: 'var(--s-3)' }}>
            {DENSITIES.find((d) => d.key === density)?.hint}
          </p>
        </Panel>
      </Section>

      <Section title="Palette">
        <Panel>
          <Chips>
            {SCHEMES.map((c) => (
              <Toggle key={c.key} role="radio" pressed={scheme === c.key} onToggle={() => applyScheme(c.key)}>
                {c.label}
              </Toggle>
            ))}
          </Chips>
          <p className="t-body-sm c-muted" style={{ marginTop: 'var(--s-3)' }}>
            {SCHEMES.find((c) => c.key === scheme)?.hint} Jede Palette ist in beiden Modi auf
            Lesbarkeit geprüft.
          </p>
        </Panel>
      </Section>

      <Section title="Hell oder dunkel">
        <Panel>
          <Chips>
            {THEMES.map((t) => (
              <Toggle key={t.key} role="radio" pressed={theme === t.key} onToggle={() => applyTheme(t.key)}>
                {t.label}
              </Toggle>
            ))}
          </Chips>
          <p className="t-body-sm c-muted" style={{ marginTop: 'var(--s-3)' }}>
            {theme === 'system'
              ? 'Thealotta folgt der Einstellung deines Geräts.'
              : theme === 'light'
                ? 'Immer hell – unabhängig vom Gerät.'
                : 'Immer dunkel – unabhängig vom Gerät.'}{' '}
            „Bewegung reduzieren" wird in jedem Fall übernommen.
          </p>
        </Panel>
      </Section>
    </>
  )
}

/* ══ Konto ═══════════════════════════════════════════════════════════ */

function AccountSection() {
  const { me, signOut } = useSession()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <>
      <Section title="Anmeldung">
        <Panel>
          <p className="t-body-sm c-secondary">
            Angemeldet als <strong>{me?.user.displayName}</strong> ({me?.user.email})
          </p>
        </Panel>
      </Section>

      <Section title="Passwort ändern">
        <Panel>
          <Field label="Aktuelles Passwort">
            {({ id }) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Neues Passwort"
            hint="Mindestens 12 Zeichen. Länge zählt mehr als Sonderzeichen."
            error={error ?? undefined}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            )}
          </Field>
          <Notice tone="quiet">
            Nach der Änderung werden alle Sitzungen beendet – auch auf anderen Geräten. Das ist
            der Sinn der Sache.
          </Notice>
          <Actions spaced>
            <Button
              variant="primary"
              disabled={busy || !current || next.length < 12}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  const result = await endpoints.changePassword(current, next)
                  toast.show(result.note)
                  setCurrent('')
                  setNext('')
                  window.setTimeout(() => void signOut(), 1500)
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Das ging nicht.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Passwort ändern
            </Button>
          </Actions>
        </Panel>
      </Section>

      <Section title="Abmelden">
        <Actions spaced={false}>
          <Button onClick={() => void signOut()}>Abmelden</Button>
        </Actions>
      </Section>
    </>
  )
}

/**
 * Was beim Ausscheiden mit der Verantwortung geschieht – bevor es geschieht.
 *
 * Die Folge steht hier, nicht als Fließtext neben dem Knopf: Sie betrifft eine Handlung,
 * die nicht rückgängig zu machen ist, und der Moment des Bestätigens ist der Moment, in
 * dem sie zählt. Der Text nennt die Variante beim Namen – Verantwortung fällt auf
 * „niemand" und wird sichtbar; sie wandert nicht stillschweigend zu der Person, die
 * entfernt (Audit 2, H4).
 */
function LeaveSheet({
  target,
  onClose,
  onDone,
}: {
  target: { id: string; name: string; self: boolean } | null
  onClose: () => void
  onDone: (self: boolean) => Promise<void> | void
}) {
  const { household } = useSession()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (target) setError(null)
  }, [target])

  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={target?.self ? 'Haushalt verlassen' : `${target?.name ?? ''} entfernen`}
    >
      <p className="t-body">
        {target?.self
          ? 'Du siehst danach nichts mehr aus diesem Haushalt. Dein Konto bleibt bestehen.'
          : `${target?.name} sieht danach nichts mehr aus diesem Haushalt.`}
      </p>
      <Consequence>
        Bereiche, für die {target?.self ? 'du' : 'diese Person'} verantwortlich {target?.self ? 'bist' : 'ist'},
        stehen danach unter „Wo niemand mitdenkt" – sie werden niemandem zugeteilt. Offene Aufgaben
        bleiben stehen, nur ohne Namen. Nichts wird gelöscht, der Verlauf bleibt lesbar.
      </Consequence>
      {error && <Notice tone="attention">{error}</Notice>}
      <Actions>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="destructive"
          disabled={busy}
          onClick={async () => {
            if (!household || !target) return
            setBusy(true)
            setError(null)
            try {
              const result = await endpoints.removeMember(household.id, target.id)
              toast.show(
                result.vacatedDomains.length > 0
                  ? `Erledigt. ${result.vacatedDomains.length} Bereich(e) stehen jetzt ohne Zuständige da.`
                  : 'Erledigt.',
              )
              await onDone(target.self)
            } catch (err) {
              // Der Server sagt genau, was im Weg steht – etwa die letzte verwaltende Person.
              setError(err instanceof Error ? err.message : 'Das ging gerade nicht.')
            } finally {
              setBusy(false)
            }
          }}
        >
          {target?.self ? 'Verlassen' : 'Entfernen'}
        </Button>
      </Actions>
    </Sheet>
  )
}

/* ══ Verbindungen: Bring! ════════════════════════════════════════════ */

/**
 * Die Anbindung an Bring!.
 *
 * Zwei Dinge stehen bewusst im Text und nicht im Kleingedruckten: dass die Schnittstelle
 * **nicht offiziell** ist, und dass Thealotta **das Passwort nicht speichert**. Beides wäre für
 * jemanden, der seine Zugangsdaten eingibt, wichtig zu wissen – und beides würde er sonst
 * nirgends erfahren.
 */
function ConnectionsSection() {
  const { household } = useSession()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [listen, setListen] = useState<{ uuid: string; name: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const status = useAsync(
    () => (household ? endpoints.bringStatus(household.id) : Promise.resolve({ verbindung: null })),
    [household?.id],
  )
  if (!household) return null
  const v = status.data?.verbindung ?? null

  const verbinden = async () => {
    setBusy(true)
    setFehler(null)
    try {
      const r = await endpoints.bringConnect(household.id, email.trim(), passwort)
      setPasswort('')
      setListen(r.listen)
      await status.reload()
      if (r.listen.length === 0) setFehler('In diesem Bring-Konto gibt es keine Liste.')
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Das ging gerade nicht.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Bring!" hint="Einkäufe dorthin schicken, wo ihr sie ohnehin abhakt.">
      <Notice tone="quiet">
        Bring bietet keine offizielle Schnittstelle für Einkaufslisten an. Diese Anbindung
        benutzt denselben Weg wie die Web-App von Bring – sie kann ohne Vorwarnung aufhören zu
        funktionieren. Thealotta meldet das dann hier, statt still nichts mehr zu senden.
      </Notice>

      {!v && (
        <Panel>
          <p className="t-body-sm">
            Einmal anmelden. Thealotta tauscht die Angaben gegen ein Zugriffsmerkmal und{' '}
            <strong>speichert das Passwort nicht</strong> – wer den Zugang widerrufen will,
            ändert sein Bring-Passwort.
          </p>
          <Field label="E-Mail des Bring-Kontos">
            {({ id }) => (
              <Input id={id} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
          </Field>
          <Field label="Passwort">
            {({ id }) => (
              <Input
                id={id}
                type="password"
                autoComplete="off"
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
              />
            )}
          </Field>
          {fehler && <Notice tone="attention">{fehler}</Notice>}
          <Actions spaced={false}>
            <Button variant="primary" disabled={busy || !email || !passwort} onClick={() => void verbinden()}>
              {busy ? 'Verbinde …' : 'Verbinden'}
            </Button>
          </Actions>
        </Panel>
      )}

      {v && (
        <Panel>
          <div className="setting-row">
            <div className="text">
              <p className="t-sub">{v.email}</p>
              <p className="t-body-sm desc">
                {v.listName
                  ? `Einkäufe gehen auf die Liste „${v.listName}".`
                  : 'Noch keine Liste ausgewählt – bis dahin geht nichts hinaus.'}
                {v.lastPushAt ? ` Zuletzt gesendet ${relativeDays(v.lastPushAt)}.` : ''}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon="trash"
              onClick={async () => {
                await endpoints.bringDisconnect(household.id)
                setListen(null)
                await status.reload()
                toast.show('Verbindung getrennt.')
              }}
            >
              Trennen
            </Button>
          </div>

          {v.state !== 'connected' && (
            <>
              <Divider />
              <Notice tone="attention" title="Die Verbindung trägt gerade nicht">
                {v.state === 'needs_reauth'
                  ? 'Der Zugang gilt nicht mehr. Bitte trennen und neu verbinden.'
                  : 'Der letzte Versuch ist fehlgeschlagen. Nichts ist verloren – beim nächsten Senden wird es erneut versucht.'}
              </Notice>
            </>
          )}

          {(listen ?? []).length > 0 && (
            <>
              <Divider />
              <Field label="Auf welche Liste?">
                {({ id }) => (
                  <Select
                    id={id}
                    value={v.listUuid ?? ''}
                    onChange={async (e) => {
                      const gewaehlt = (listen ?? []).find((l) => l.uuid === e.target.value)
                      if (!gewaehlt) return
                      await endpoints.bringChooseList(household.id, gewaehlt.uuid, gewaehlt.name)
                      await status.reload()
                      toast.show(`Einkäufe gehen jetzt auf „${gewaehlt.name}".`)
                    }}
                  >
                    <option value="">— bitte wählen —</option>
                    {(listen ?? []).map((l) => (
                      <option key={l.uuid} value={l.uuid}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </>
          )}
        </Panel>
      )}
    </Section>
  )
}
