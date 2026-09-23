import { useState } from 'react'
import { ApiError, endpoints } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { Actions, Button, Field, Input, Notice } from '../design/index.js'

/** Erster Eindruck: worum es geht, dann erst das Formular. */
export function LoginPage() {
  const { refresh } = useSession()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'register') await endpoints.register(email, password, displayName)
      await endpoints.login(email, password)
      await refresh()
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.detail ?? e.message)
          : 'Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es erneut.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="shell">
      <div className="main-col">
        <main id="main" className="content" style={{ maxWidth: '30rem', paddingTop: 'var(--s-16)' }}>
          <p className="t-overline c-muted">Thealotta</p>
          <h1 className="t-display" style={{ margin: 'var(--s-2) 0 var(--s-4)' }}>
            Ich muss nicht daran denken, woran ich denken muss.
          </h1>
          <p className="t-body c-secondary" style={{ marginBottom: 'var(--s-10)' }}>
            Thealotta hilft eurer Familie, Verantwortung sichtbar und verlässlich zu tragen – ohne dass
            jemand alles im Kopf behalten muss.
          </p>

          <form onSubmit={submit}>
            <h2 className="t-heading" style={{ marginBottom: 'var(--s-4)' }}>
              {mode === 'login' ? 'Anmelden' : 'Konto anlegen'}
            </h2>

            {mode === 'register' && (
              <Field label="Wie sollen dich die anderen sehen?">
                {({ id }) => (
                  <Input id={id} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
                )}
              </Field>
            )}

            <Field label="E-Mail-Adresse">
              {({ id }) => (
                <Input
                  id={id}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              )}
            </Field>

            <Field label="Passwort" hint={mode === 'register' ? 'Mindestens 12 Zeichen. Länge zählt mehr als Sonderzeichen.' : undefined}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="password"
                  aria-describedby={describedBy}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  minLength={12}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              )}
            </Field>

            {error && (
              <div role="alert">
                <Notice tone="attention">{error}</Notice>
              </div>
            )}

            <Actions>
              <Button type="submit" variant="primary" block disabled={busy}>
                {mode === 'login' ? 'Anmelden' : 'Konto anlegen'}
              </Button>
            </Actions>
          </form>

          <Actions>
            <Button variant="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Noch kein Konto? Konto anlegen' : 'Schon ein Konto? Anmelden'}
            </Button>
          </Actions>
        </main>
      </div>
    </div>
  )
}
