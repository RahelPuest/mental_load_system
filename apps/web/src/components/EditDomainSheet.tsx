import { useEffect, useState } from 'react'
import { Actions, Button, Field, Input, Notice, Select, Sheet, useToast } from '../design/index.js'
import { endpoints, type DomainEntry } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { CRITICALITY } from '../lib/ui.js'
import { prettyPath } from '../lib/domains.js'

/**
 * Name, Einordnung, Wichtigkeit – von der Bereichsseite **und** aus dem Baum.
 *
 * Der Bogen nimmt einen einzelnen Bereich entgegen, nicht die ganze geladene Detailansicht.
 * Solange er `DomainDetail` verlangte, war er nur von der Bereichsseite aus zu haben – und
 * genau das war der Grund, warum sich im Bearbeiten-Modus des Baums alles ändern ließ außer
 * dem Namen (docs/75).
 */
export function EditDomainSheet({
  open,
  onClose,
  domain,
  allDomains,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  domain: DomainEntry
  allDomains: DomainEntry[]
  onSaved: () => Promise<void>
}) {
  const { household } = useSession()
  const toast = useToast()
  const [name, setName] = useState(domain.name)
  const [parentId, setParentId] = useState(domain.parentId ?? '')
  const [criticality, setCriticality] = useState(domain.criticality)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Beim Öffnen den aktuellen Stand zeigen, nicht den von vorhin.
  useEffect(() => {
    if (!open) return
    setName(domain.name)
    setParentId(domain.parentId ?? '')
    setCriticality(domain.criticality)
    setError(null)
  }, [open, domain.id, domain.name, domain.parentId, domain.criticality])

  /*
   * Der eigene Bereich und alles darunter fallen als Ziel weg: Ein Bereich kann nicht in
   * sich selbst liegen. Der Server weist das auch ab – aber eine Auswahl anzubieten, die
   * dann scheitert, ist eine Falle.
   */
  const targets = allDomains.filter(
    (d) => d.id !== domain.id && !d.path.startsWith(`${domain.path}.`) && !d.archivedAt,
  )

  return (
    <Sheet open={open} onClose={onClose} title="Bereich bearbeiten" description={domain.name}>
      <Field label="Wie heißt der Bereich?">
        {({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>

      <Field label="Gehört er zu einem größeren Bereich?" hint="Unterbereiche wandern mit.">
        {({ id }) => (
          <Select id={id} value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— eigenständig —</option>
            {targets.map((d) => (
              <option key={d.id} value={d.id}>
                {prettyPath(d, allDomains)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field
        label="Wie wichtig ist er?"
        hint="Kritisch heißt: Liegenbleiben hätte spürbare Folgen für Versorgung oder Sicherheit."
      >
        {({ id }) => (
          <Select id={id} value={criticality} onChange={(e) => setCriticality(e.target.value)}>
            {Object.entries(CRITICALITY).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {error && <Notice tone="attention">{error}</Notice>}

      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            if (!household) return
            setBusy(true)
            setError(null)
            try {
              await endpoints.updateDomain(household.id, domain.id, {
                name: name.trim(),
                parentId: parentId || null,
                criticality,
              })
              toast.show('Gespeichert.')
              await onSaved()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Das ging gerade nicht.')
            } finally {
              setBusy(false)
            }
          }}
        >
          Speichern
        </Button>
      </Actions>
    </Sheet>
  )
}
