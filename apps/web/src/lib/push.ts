import { endpoints } from './api.js'

/**
 * Push tatsächlich anmelden.
 *
 * Bis zum dritten Durchgang fragte die Oberfläche nur nach der Browser-Erlaubnis und
 * meldete „Erlaubnis erteilt" – angemeldet wurde nie etwas. Es wäre nie eine
 * Benachrichtigung angekommen, und die Geräteliste wäre für immer leer geblieben.
 * Ein Versprechen, das das System nicht hält, ist genau der Vertrauensbruch, den §46
 * ausschließt.
 *
 * Jeder Ausgang ist benannt, damit die Oberfläche ehrlich berichten kann.
 */
export type PushOutcome =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'not_configured' | 'failed'; detail?: string }

/** VAPID-Schlüssel liegen base64url vor; `applicationServerKey` will rohe Bytes. */
function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    base64url.length + ((4 - (base64url.length % 4)) % 4),
    '=',
  )
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export async function enablePush(householdId: string): Promise<PushOutcome> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' }
  }

  const { publicKey } = await endpoints.pushConfig().catch(() => ({ publicKey: null }))
  if (!publicKey) return { ok: false, reason: 'not_configured' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey),
      }))

    const payload = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys.auth) {
      return { ok: false, reason: 'failed' }
    }
    await endpoints.addPushSubscription(householdId, {
      endpoint: payload.endpoint,
      keys: { p256dh: payload.keys.p256dh, auth: payload.keys.auth },
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: 'failed', detail: error instanceof Error ? error.message : undefined }
  }
}

/** Meldet dieses Gerät wieder ab – Browser und Server. */
export async function disablePush(householdId: string, subscriptionId: string): Promise<void> {
  await endpoints.removePushSubscription(householdId, subscriptionId)
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  const subscription = await registration?.pushManager.getSubscription()
  await subscription?.unsubscribe()
}

/** Menschliche Erklärung statt Fehlercode. */
export function explain(outcome: PushOutcome): string {
  if (outcome.ok) return 'Dieses Gerät ist angemeldet. Push ist eine Zusatzhilfe – in der App siehst du weiterhin alles.'
  switch (outcome.reason) {
    case 'unsupported':
      return 'Dieser Browser kann keine Push-Nachrichten. Auf dem iPhone geht es erst, wenn Thealotta über „Zum Home-Bildschirm“ installiert ist.'
    case 'denied':
      return 'Ohne Erlaubnis kein Push. In der App siehst du weiterhin alles – es geht nichts verloren.'
    case 'not_configured':
      return 'Auf diesem Server ist Push nicht eingerichtet. E-Mail und die Meldungen in der App funktionieren normal.'
    default:
      return 'Die Anmeldung hat nicht geklappt. Nichts ist verloren – E-Mail und die Meldungen in der App laufen weiter.'
  }
}
