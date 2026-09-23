/**
 * Schlüsselverwaltung mit Rotation.
 *
 * Ein Chiffrat trägt die `keyId` im Klartext-Header. Alte Schlüssel bleiben zum Entschlüsseln
 * verfügbar, während neue Daten bereits mit dem aktiven Schlüssel geschrieben werden – so ist
 * eine Rotation ohne Ausfall und ohne Massen-Neuverschlüsselung möglich (§27.7).
 */
export interface KeyProvider {
  activeKeyId(): string
  key(keyId: string): Buffer
}

export class EnvKeyProvider implements KeyProvider {
  private readonly keys: Map<string, Buffer>

  constructor(keys: Record<string, string>, private readonly active: string) {
    this.keys = new Map(Object.entries(keys).map(([id, b64]) => [id, Buffer.from(b64, 'base64')]))
    const activeKey = this.keys.get(active)
    if (!activeKey) throw new Error(`ENCRYPTION_ACTIVE_KEY_ID "${active}" ist in ENCRYPTION_KEYS nicht enthalten`)
    for (const [id, k] of this.keys) {
      if (k.length !== 32) throw new Error(`Schlüssel "${id}" muss 32 Byte lang sein (AES-256)`)
    }
  }

  activeKeyId(): string {
    return this.active
  }

  key(keyId: string): Buffer {
    const k = this.keys.get(keyId)
    if (!k) throw new Error(`Unbekannte Schlüssel-ID "${keyId}" – Daten können nicht entschlüsselt werden`)
    return k
  }
}
