import { hash, verify, Algorithm } from '@node-rs/argon2'

/**
 * Argon2id nach den Parametern aus docs/25 §5.
 * `verifyPassword` meldet zusätzlich, ob mit aktuellen Parametern neu gehasht werden sollte –
 * so wandern bestehende Konten bei jedem Login auf den neuen Stand.
 */
const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65_536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
} as const

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

export async function verifyPassword(digest: string, password: string): Promise<{ valid: boolean; needsRehash: boolean }> {
  try {
    const valid = await verify(digest, password, OPTIONS)
    return { valid, needsRehash: valid && !digest.includes(`m=${OPTIONS.memoryCost}`) }
  } catch {
    return { valid: false, needsRehash: false }
  }
}

/**
 * Minimale Passwortpolitik: Länge schlägt Zeichenklassen. Zusätzlich werden offensichtlich
 * schwache Muster abgelehnt; eine echte Breach-Liste kommt über einen Betreiber-Datensatz dazu.
 */
export function assessPassword(password: string, personalTerms: string[] = []): { ok: boolean; reason?: string } {
  if (password.length < 12) return { ok: false, reason: 'Mindestens 12 Zeichen.' }
  if (password.length > 200) return { ok: false, reason: 'Höchstens 200 Zeichen.' }
  if (/^(.)\1+$/.test(password)) return { ok: false, reason: 'Das Passwort besteht nur aus einem Zeichen.' }
  const lower = password.toLowerCase()
  for (const term of personalTerms) {
    if (term.length >= 4 && lower.includes(term.toLowerCase())) {
      return { ok: false, reason: 'Das Passwort enthält Teile deiner E-Mail-Adresse oder deines Namens.' }
    }
  }
  const common = ['password', 'passwort', '123456789012', 'qwertzuiop', 'iloveyou1234']
  if (common.some((c) => lower.includes(c))) return { ok: false, reason: 'Dieses Passwort ist zu verbreitet.' }
  return { ok: true }
}
