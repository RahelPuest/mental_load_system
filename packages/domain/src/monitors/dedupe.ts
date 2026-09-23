import { createHash } from 'node:crypto'

/**
 * §11 / ADR-0004: Wiederholte Auswertung derselben Evidenz darf kein zweites Signal erzeugen.
 *
 * Der Schlüssel besteht aus Monitor, Signalart und einem regeltypspezifischen „Bucket“.
 * Ändert sich die Evidenz (z. B. ein neues `verifiedAt`), ändert sich der Bucket – dann ist
 * ein neues Signal fachlich korrekt und das alte wird `superseded`.
 */
export function dedupeKey(monitorId: string, signalKind: string, bucket: string): string {
  return createHash('sha256').update(`${monitorId}|${signalKind}|${bucket}`).digest('hex').slice(0, 40)
}

/** Unterdrückung greift auf Bucket-Ebene: exakt oder als Präfix mit '*'. */
export function isSuppressed(
  bucket: string,
  suppressions: readonly { bucketPattern: string; until: Date | null }[],
  now: Date,
): boolean {
  return suppressions.some((s) => {
    if (s.until && s.until.getTime() <= now.getTime()) return false
    if (s.bucketPattern.endsWith('*')) return bucket.startsWith(s.bucketPattern.slice(0, -1))
    return s.bucketPattern === bucket
  })
}
