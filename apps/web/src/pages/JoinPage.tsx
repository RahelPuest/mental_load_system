import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { endpoints } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { formatDate, ROLE, ROLE_HINT, useAsync } from '../lib/ui.js'
import { Actions, Button, ErrorState, Notice, Panel, SkeletonList } from '../design/index.js'

/**
 * §7.1 Haushaltsbeitritt.
 *
 * Vor dem Beitritt steht eine Vorschau: Wer lädt ein, in welchen Haushalt, mit welcher Rolle.
 * Niemand soll einem Link folgen und danach überrascht Mitglied sein.
 */
export function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { status, refresh } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview = useAsync(
    () => (token ? endpoints.previewInvitation(token) : Promise.reject(new Error('–'))),
    [token],
  )

  if (preview.error) {
    return (
      <div className="content" style={{ maxWidth: '30rem' }}>
        <ErrorState
          title="Diese Einladung gilt nicht mehr"
          meaning="Sie wurde zurückgezogen, ist abgelaufen oder wurde bereits angenommen."
          reassurance="Bitte die Person, die dich eingeladen hat, um einen neuen Link."
        />
      </div>
    )
  }
  if (!preview.data) {
    return (
      <div className="content" style={{ maxWidth: '30rem' }}>
        <SkeletonList count={1} />
      </div>
    )
  }

  return (
    <div className="content" style={{ maxWidth: '30rem', paddingTop: 'var(--s-16)' }}>
      <p className="t-overline c-muted">Einladung</p>
      <h1 className="t-title" style={{ margin: 'var(--s-2) 0 var(--s-4)' }}>
        Du wurdest zu „{preview.data.householdName}" eingeladen
      </h1>

      <Panel>
        <p className="t-body-sm c-secondary">
          Rolle: <strong>{ROLE[preview.data.role] ?? preview.data.role}</strong>
        </p>
        <p className="t-body-sm c-muted" style={{ marginTop: 'var(--s-1)' }}>
          {ROLE_HINT[preview.data.role]}
        </p>
        <p className="t-body-sm c-muted" style={{ marginTop: 'var(--s-3)' }}>
          Gilt für {preview.data.emailHint} · gültig bis {formatDate(preview.data.expiresAt)}
        </p>
      </Panel>

      {status === 'anonymous' ? (
        <Notice tone="accent" title="Zuerst anmelden">
          Melde dich mit der eingeladenen E-Mail-Adresse an oder lege ein Konto damit an. Danach
          öffne diesen Link erneut.
        </Notice>
      ) : (
        <>
          {error && <Notice tone="attention">{error}</Notice>}
          <Actions>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                if (!token) return
                setBusy(true)
                setError(null)
                try {
                  await endpoints.acceptInvitation(token)
                  await refresh()
                  navigate('/jetzt')
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Der Beitritt hat nicht geklappt.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Beitreten
            </Button>
            <Button variant="ghost" onClick={() => navigate('/jetzt')}>
              Später
            </Button>
          </Actions>
        </>
      )}
    </div>
  )
}
