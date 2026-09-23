/**
 * Welche Warteschlangen bedient dieser Prozess?
 *
 * `WORKER_QUEUES` stand seit jeher im Zod-Schema und wurde nie gelesen: Jeder Worker-Prozess
 * startete alle drei BullMQ-Worker. Damit war die in README §Betrieb und docs/27 §2
 * beschriebene Aufteilung in drei Deployments mit je eigener Datenbankrolle **nicht möglich**
 * – drei Container hätten sich die Jobs gegenseitig weggenommen und wären an fehlenden
 * Rechten gescheitert.
 *
 * INV-006 („Zustellung ändert keine fachlichen Objekte") und INV-012 („Integrationsausfälle
 * löschen nichts") waren deshalb dokumentiert, aber nicht durch Berechtigungen durchgesetzt.
 * Genau das ist der Unterschied zwischen einer Zusage und einer Regel: Eine Rolle, die es
 * nicht darf, kann es nicht – eine Konvention hält nur, solange alle mitmachen.
 */
export const QUEUE_NAMES = ['default', 'sync', 'notify'] as const
export type QueueName = (typeof QUEUE_NAMES)[number]

/**
 * Liest die Liste aus der Umgebung.
 *
 * Ein unbekannter Name bricht den Start ab, statt still ignoriert zu werden. Ein Tippfehler
 * in `WORKER_QUEUES=notifiy` hieße sonst: Der Prozess läuft, meldet nichts, und die
 * Zustellung steht – der teuerste aller Fehler, weil niemand ihn bemerkt.
 */
export function parseQueues(raw: string): Set<QueueName> {
  const teile = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (teile.length === 0) {
    throw new Error('WORKER_QUEUES ist leer – ein Worker ohne Warteschlange hätte nichts zu tun.')
  }

  const unbekannt = teile.filter((t) => !(QUEUE_NAMES as readonly string[]).includes(t))
  if (unbekannt.length > 0) {
    throw new Error(
      `WORKER_QUEUES nennt unbekannte Warteschlangen: ${unbekannt.join(', ')}. ` +
        `Möglich sind: ${QUEUE_NAMES.join(', ')}.`,
    )
  }

  return new Set(teile as QueueName[])
}

/**
 * Wer stellt die wiederkehrenden Jobs ein?
 *
 * Nur der Prozess, der die `default`-Schlange bedient. Sonst trügen drei Prozesse dieselben
 * Wiederholungen ein – BullMQ verwirft Doppel zwar über den Wiederholungsschlüssel, aber
 * ein Prozess, der etwas einreiht, was er selbst nie abarbeitet, ist eine Irreführung für
 * den nächsten, der die Protokolle liest.
 */
export function schedulesRepeatables(aktiv: ReadonlySet<QueueName>): boolean {
  return aktiv.has('default')
}
