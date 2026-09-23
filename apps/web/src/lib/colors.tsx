import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { COLOR_TONES, type ColorTone } from '@thealotta/contracts'
import { endpoints, type ColorMap } from './api.js'
import { useSession } from './session.js'
import { colorIndex, memberColorIndex } from './people.js'

/**
 * Farben für Personen und Bereiche.
 *
 * Voreingestellt ist eine aus der ID abgeleitete Farbe – ohne jede Einrichtung hat jede
 * Person sofort eine, und sie ist auf jedem Gerät dieselbe. Wer eine andere will, wählt sie;
 * gespeichert wird nur diese Abweichung.
 *
 * Die Wahl gilt für den Betrachter allein. Deshalb kann jede Person die Farbe jeder anderen
 * einstellen, ohne jemandem etwas wegzunehmen.
 */

/** Anzeigenamen der Töne. Reihenfolge = Reihenfolge im Farbwähler = --m1 … --m12. */
export const TONE_LABEL: Record<ColorTone, string> = {
  gruen: 'Grün',
  blau: 'Blau',
  violett: 'Violett',
  braun: 'Braun',
  beere: 'Beere',
  tuerkis: 'Türkis',
  ocker: 'Ocker',
  magenta: 'Magenta',
  rost: 'Rost',
  indigo: 'Indigo',
  oliv: 'Oliv',
  pflaume: 'Pflaume',
}

/**
 * Der Ton an Position n trägt die Klasse `m-{n+1}`.
 *
 * Ohne Ton gibt es keine Klasse – nicht `m-0`. Diese Klasse hat nie existiert; sie entstand
 * aus einem Index für „unbekannte Person" und blieb wirkungslos im Markup stehen. Ein leerer
 * String sagt dasselbe, aber ehrlich: Das Bauteil bleibt bei seinen neutralen Werten.
 */
export const toneClass = (tone: ColorTone | null): string =>
  tone ? `m-${COLOR_TONES.indexOf(tone) + 1}` : ''

/** Lesbarer Name eines Tons – auch dann, wenn es keinen gibt. */
export const toneLabel = (tone: ColorTone | null): string => (tone ? TONE_LABEL[tone] : 'keine eigene Farbe')

/**
 * Voreingestellter Ton einer Person: derselbe stabile Hash wie bisher, nur als Ton benannt.
 *
 * Ohne ID gibt es niemanden, dem eine Farbe gehören könnte.
 */
export const defaultTone = (id: string | null | undefined): ColorTone | null => {
  if (!id) return null
  return COLOR_TONES[(memberColorIndex(id) - 1) % COLOR_TONES.length] ?? null
}

/**
 * Voreingestellter Ton eines Bereichs, wenn niemand für ihn mitdenkt.
 *
 * Jeder Bereich hat eine Farbe – auch der unbesetzte. Dass niemand zuständig ist, sagt nicht
 * die fehlende Farbe, sondern die gestrichelte Kante und das Abzeichen „niemand zuständig".
 * Eine Aussage über Zuständigkeit an der Abwesenheit von Farbe festzumachen hieße, sie an
 * etwas festzumachen, das man nicht sieht.
 *
 * Bereiche streuen über alle zwölf Töne: Es gibt mehr von ihnen als Personen, und sie hatten
 * nie eine Farbe, die man ihnen wegnehmen könnte.
 */
export const domainDefaultTone = (domainId: string | null | undefined): ColorTone | null => {
  if (!domainId) return null
  return COLOR_TONES[colorIndex(domainId, COLOR_TONES.length) - 1] ?? null
}

interface ColorApi {
  /** Ton einer Person – gewählt oder voreingestellt. `null`, wenn es keine Person gibt. */
  memberTone: (membershipId: string | null | undefined) => ColorTone | null
  /**
   * Ton eines Bereichs. Ohne eigene Wahl trägt er den Ton der Person, die für ihn mitdenkt –
   * und wenn niemand mitdenkt, einen eigenen, aus seiner ID abgeleiteten.
   */
  domainTone: (domainId: string | null | undefined, ownerMembershipId?: string | null) => ColorTone | null
  /** Ob für dieses Ziel eine eigene Farbe hinterlegt ist. */
  isCustom: (subject: 'member' | 'domain', id: string) => boolean
  set: (subject: 'member' | 'domain', id: string, tone: ColorTone | null) => Promise<void>
}

const EMPTY: ColorMap = { members: {}, domains: {} }

/**
 * Antworten sind Zusagen, keine Gewissheiten.
 *
 * Eine Antwort ohne `members` legte die gesamte Seite lahm – wegen einer Farbe. Farbe ist
 * Beiwerk; sie darf nichts umbringen. Deshalb wird hier normalisiert statt vertraut.
 */
function normalize(data: unknown): ColorMap {
  const raw = (data ?? {}) as Partial<ColorMap>
  const clean = (v: unknown): Record<string, ColorTone> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, ColorTone>) : {}
  return { members: clean(raw.members), domains: clean(raw.domains) }
}
/**
 * Ohne Provider gilt die Ableitung – dieselbe Farbe wie vor der Farbwahl.
 *
 * Ein Fehler wäre hier die härtere, aber schlechtere Wahl: `PersonDot` ist ein Blatt des
 * Design-Systems und wird an vielen Stellen gerendert. Dass eine davon keine persönliche
 * Farbwahl kennt, ist kein Grund, die Seite abstürzen zu lassen.
 */
const DERIVED: ColorApi = {
  memberTone: defaultTone,
  domainTone: (domainId, ownerMembershipId) => defaultTone(ownerMembershipId ?? null) ?? domainDefaultTone(domainId),
  isCustom: () => false,
  set: async () => undefined,
}

const Ctx = createContext<ColorApi>(DERIVED)

export function ColorProvider({ children }: { children: ReactNode }) {
  const { household } = useSession()
  const [map, setMap] = useState<ColorMap>(EMPTY)

  useEffect(() => {
    if (!household) {
      setMap(EMPTY)
      return
    }
    let current = true
    /*
     * Fällt der Abruf aus, bleibt es bei den abgeleiteten Farben. Das ist der Grund, warum
     * die Ableitung als Voreinstellung erhalten blieb: Die Oberfläche ist ohne diese
     * Antwort vollständig benutzbar, nur eben ohne persönliche Wahl.
     */
    endpoints
      .colors(household.id)
      .then((data) => current && setMap(normalize(data)))
      .catch(() => current && setMap(EMPTY))
    return () => {
      current = false
    }
  }, [household?.id])

  const value = useMemo<ColorApi>(() => {
    const memberTone = (id: string | null | undefined): ColorTone | null =>
      (id && map.members[id]) || defaultTone(id)

    return {
      memberTone,
      /*
       * Drei Stufen, in dieser Reihenfolge: eigene Wahl, dann die Farbe der Person, die
       * mitdenkt, dann der eigene Ton des Bereichs. Die dritte Stufe sorgt dafür, dass kein
       * Bereich farblos bleibt – auch der unbesetzte nicht.
       */
      domainTone: (domainId, ownerMembershipId) =>
        (domainId && map.domains[domainId]) || memberTone(ownerMembershipId) || domainDefaultTone(domainId),
      isCustom: (subject, id) => Boolean(subject === 'member' ? map.members[id] : map.domains[id]),
      set: async (subject, id, tone) => {
        if (!household) return
        // Sofort umschalten: Eine Farbwahl, die erst nach der Serverantwort sichtbar wird,
        // fühlt sich an, als hätte sie nicht funktioniert.
        setMap((prev) => {
          const bucket = { ...prev[subject === 'member' ? 'members' : 'domains'] }
          if (tone === null) delete bucket[id]
          else bucket[id] = tone
          return subject === 'member' ? { ...prev, members: bucket } : { ...prev, domains: bucket }
        })
        try {
          await endpoints.setColor(household.id, subject, id, tone)
        } catch (error) {
          const fresh = await endpoints.colors(household.id).catch(() => null)
          if (fresh) setMap(normalize(fresh))
          throw error
        }
      },
    }
  }, [map, household?.id])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useColors(): ColorApi {
  return useContext(Ctx)
}

/**
 * Farbklasse einer Person – der Ersatz für das frühere `memberClass`.
 *
 * Eigener Hook statt Aufruf über `useColors()`, damit Bauteile wie PersonDot eine Zeile
 * bleiben und der Grund für die Klasse an einer Stelle steht.
 */
export function useMemberClass(membershipId: string | null | undefined): string {
  return toneClass(useColors().memberTone(membershipId))
}
