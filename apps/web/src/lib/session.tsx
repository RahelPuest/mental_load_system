import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, endpoints, type HouseholdSummary, type MeResponse } from './api.js'
import { readSetting, writeSetting } from './storage.js'

interface SessionValue {
  status: 'loading' | 'anonymous' | 'authenticated'
  /** Die Sitzung besteht, aber der Server war zuletzt nicht erreichbar. */
  degraded: boolean
  me: MeResponse | null
  households: HouseholdSummary[]
  household: HouseholdSummary | null
  selectHousehold(id: string): void
  refresh(): Promise<void>
  signOut(): Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)
/* Der Schlüssel zieht mit um (siehe `storage.ts`) – niemand soll seinen Haushalt verlieren. */
const STORAGE_KEY = 'household'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionValue['status']>('loading')
  const [degraded, setDegraded] = useState(false)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [households, setHouseholds] = useState<HouseholdSummary[]>([])
  const [householdId, setHouseholdId] = useState<string | null>(() => readSetting(STORAGE_KEY))

  /**
   * Abgemeldet wird nur, wenn der Server das sagt.
   *
   * Vorher führte *jeder* Fehler beim Laden des Profils zum Anmeldebildschirm – ein
   * Netzwerkaussetzer, ein 429 aus der Ratenbegrenzung, ein kurzer Serverfehler. Wer
   * mitten in der Arbeit auf dem Anmeldeformular landet, verliert das Vertrauen in ein
   * System, dem er seine Verantwortung überlassen soll (§21, §46, §58).
   *
   * Nur 401 heißt „nicht angemeldet". Alles andere heißt „gerade nicht erreichbar" – die
   * Sitzung bleibt, die Oberfläche sagt es, und der nächste Versuch räumt es auf.
   */
  const refresh = useCallback(async () => {
    try {
      const profile = await endpoints.me()
      const list = await endpoints.households()
      setMe(profile)
      setHouseholds(list.items)
      setStatus('authenticated')
      setDegraded(false)
      setHouseholdId((current) => {
        const valid = current && list.items.some((h) => h.id === current)
        return valid ? current : (list.items[0]?.id ?? null)
      })
    } catch (error) {
      const unauthenticated = error instanceof ApiError && (error.status === 401 || error.status === 403)
      if (unauthenticated) {
        setMe(null)
        setHouseholds([])
        setDegraded(false)
        setStatus('anonymous')
        return
      }
      setDegraded(true)
      // Beim allerersten Laden gibt es noch nichts zu halten – dann bleibt nur der Login.
      setStatus((current) => (current === 'authenticated' ? 'authenticated' : 'anonymous'))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (householdId) writeSetting(STORAGE_KEY, householdId)
  }, [householdId])

  const value = useMemo<SessionValue>(
    () => ({
      status,
      degraded,
      me,
      households,
      household: households.find((h) => h.id === householdId) ?? null,
      selectHousehold: setHouseholdId,
      refresh,
      signOut: async () => {
        await endpoints.logout().catch(() => undefined)
        setStatus('anonymous')
        setMe(null)
      },
    }),
    [status, degraded, me, households, householdId, refresh],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession außerhalb des SessionProvider verwendet')
  return value
}
