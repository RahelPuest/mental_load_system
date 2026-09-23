import { useState } from 'react'
import { capture } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { Button, Field, Sheet, Textarea, Toggle, useToast } from '../design/index.js'

const EXAMPLES = [
  'Schuhe von Kind A werden knapp',
  'Kita braucht Gummistiefel',
  'Zahnarzt: Kontrolle in sechs Monaten',
  'Wo liegen die Ersatzsachen?',
]

/**
 * §1.8 / §16: Erfassen ist die häufigste Handlung und muss von überall in zwei Sekunden
 * gehen. Deshalb ein Overlay statt einer eigenen Seite – der Kontext bleibt erhalten.
 */
export function CaptureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { household } = useSession()
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!household || text.trim().length === 0) return
    setBusy(true)
    try {
      const result = await capture(household.id, text.trim())
      setText('')
      onClose()
      toast.show(result.queued ? 'Gespeichert – geht raus, sobald du online bist.' : 'Im Eingang gespeichert.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Was ist dir eingefallen?"
      description="Einfach hinschreiben. Bereich, Datum und Art kommen später – oder nie."
    >
      <Field label="Notiz">
        {({ id }) => (
          <Textarea
            id={id}
            rows={4}
            value={text}
            placeholder="z. B. Schuhe von Kind A werden knapp"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Auf Desktop ist das der schnellste Weg: schreiben, ⌘↵, weiter.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit()
            }}
          />
        )}
      </Field>

      <div className="chips" style={{ marginBottom: 'var(--s-5)' }}>
        {EXAMPLES.map((example) => (
          <Toggle key={example} pressed={false} onToggle={() => setText(example)}>
            {example}
          </Toggle>
        ))}
      </div>

      <div className="actions end">
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="primary" onClick={() => void submit()} disabled={busy || text.trim().length === 0}>
          Speichern
        </Button>
      </div>
    </Sheet>
  )
}
