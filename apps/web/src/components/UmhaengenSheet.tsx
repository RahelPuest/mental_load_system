import { useState } from 'react'
import { Actions, Button, Field, Notice, Select, Sheet, useToast } from '../design/index.js'
import { endpoints, type MoveItemRef, type MoveItemsResult } from '../lib/api.js'
import { useSession } from '../lib/session.js'

export interface BereichWahl {
  id: string
  name: string
  path: string
  archivedAt: string | null
}

/**
 * Wohin sollen die gewählten Einträge? (docs/72)
 *
 * Eine Auswahlliste statt einer Liste von Knöpfen: Ein Haushalt hat schnell dreißig Bereiche,
 * und dreißig Knöpfe in einem Bogen sind keine Wahl, sondern eine Suchaufgabe. Die Liste zeigt
 * den Pfad, nicht nur den Namen – „Schuhe" gibt es zweimal, „kinder.kind_a.schuhe" nicht.
 *
 * Archivierte Bereiche stehen nicht zur Wahl. Der Server lehnt sie ohnehin ab; sie erst
 * anzubieten und dann abzulehnen wäre eine Sackgasse mit Ankündigung.
 */
export function UmhaengenSheet({
  open,
  onClose,
  quelle,
  bereiche,
  items,
  onDone,
}: {
  open: boolean
  onClose: () => void
  quelle: { id: string; name: string }
  bereiche: BereichWahl[]
  items: MoveItemRef[]
  onDone: () => Promise<void> | void
}) {
  const { household } = useSession()
  const toast = useToast()
  const [ziel, setZiel] = useState('')
  const [laeuft, setLaeuft] = useState(false)

  const wahl = bereiche.filter((b) => b.id !== quelle.id && !b.archivedAt).sort((a, b) => a.path.localeCompare(b.path))

  const verschieben = async () => {
    if (!household || !ziel) return
    setLaeuft(true)
    try {
      const result: MoveItemsResult = await endpoints.moveDomainItems(household.id, quelle.id, ziel, items)
      const zielName = wahl.find((b) => b.id === ziel)?.name ?? 'den anderen Bereich'
      const anzahl = result.moved.length + result.mitgenommen.length
      /*
        Die Rückmeldung nennt, was mitkam, ohne danach gefragt worden zu sein – sonst steht
        gleich darauf eine Regel in einem Bereich, in den sie niemand gelegt hat.
      */
      toast.show(
        result.mitgenommen.length === 0
          ? `${anzahl === 1 ? 'Ein Eintrag' : `${anzahl} Einträge`} stehen jetzt in „${zielName}".`
          : `${anzahl} Einträge stehen jetzt in „${zielName}" – darunter ${result.mitgenommen
              .map((m) => `„${m.title}" (${m.grund})`)
              .join(', ')}.`,
      )
      onClose()
      await onDone()
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Wohin verschieben?"
      description={`${items.length === 1 ? 'Ein Eintrag' : `${items.length} Einträge`} aus „${quelle.name}"`}
    >
      <Field label="Zielbereich">
        {({ id }) => (
          <Select id={id} value={ziel} onChange={(e) => setZiel(e.target.value)}>
            <option value="">Bitte wählen</option>
            {wahl.map((b) => (
              <option key={b.id} value={b.id}>
                {b.path}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {/*
        Angekündigt, nicht überrascht: Regel und beobachtete Angabe sind untrennbar, ein
        Vorgang nimmt seine Aufgaben mit. Wer das erst hinterher erfährt, sucht die fehlende
        Hälfte im alten Bereich.
      */}
      <Notice tone="info">
        Eine Regel und die Angabe, die sie beobachtet, kommen zusammen. Ein Vorgang nimmt seine
        Aufgaben mit. Der Verlauf bleibt an jedem Eintrag hängen – es geht nichts verloren.
      </Notice>

      <Actions end>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="primary" disabled={!ziel || laeuft} onClick={() => void verschieben()}>
          Verschieben
        </Button>
      </Actions>
    </Sheet>
  )
}
