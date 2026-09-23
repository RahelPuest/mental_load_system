import { useState } from 'react'
import { endpoints } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { Actions, Button, Field, Input, Notice } from '../design/index.js'

/** Risiko P3: Der Einstieg darf nicht selbst zum Mental Load werden – ein Feld genügt. */
export function OnboardingPage() {
  const { refresh } = useSession()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="shell">
      <div className="main-col">
        <main id="main" className="content" style={{ maxWidth: '30rem', paddingTop: 'var(--s-16)' }}>
          <p className="t-overline c-muted">Erster Schritt</p>
          <h1 className="t-title" style={{ margin: 'var(--s-2) 0 var(--s-4)' }}>
            Wie heißt euer Haushalt?
          </h1>

          <Notice tone="quiet">
            Wir legen ein paar übliche Bereiche an – Haushalt, Familie, Kinder. Du kannst alles
            umbenennen, löschen oder ergänzen. Nichts davon ist endgültig.
          </Notice>

          <form
            onSubmit={async (event) => {
              event.preventDefault()
              setBusy(true)
              try {
                await endpoints.createHousehold(
                  name.trim() || 'Unser Haushalt',
                  Intl.DateTimeFormat().resolvedOptions().timeZone,
                )
                await refresh()
              } finally {
                setBusy(false)
              }
            }}
          >
            <Field label="Name">
              {({ id }) => (
                <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Familie Meyer" autoFocus />
              )}
            </Field>
            <Actions>
              <Button type="submit" variant="primary" block disabled={busy}>
                Loslegen
              </Button>
            </Actions>
          </form>
        </main>
      </div>
    </div>
  )
}
