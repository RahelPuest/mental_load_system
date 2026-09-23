/**
 * Personenfarben.
 *
 * Jede Person im Haushalt bekommt eine Farbe abgeleitet aus ihrer Mitglieds-ID. Das ist die
 * Voreinstellung, nicht die letzte Instanz: Wer eine andere will, wählt sie (lib/colors.tsx).
 * Gespeichert wird nur die Abweichung – ohne Wahl bleibt es bei kein Zustand, keine
 * Migration und auf jedem Gerät dieselbe Farbe für dieselbe Person.
 *
 * Farbe ist immer Zusatz, nie einzige Information: neben jedem farbigen Element steht der
 * Name (§38, §26). Wer die Farben nicht unterscheiden kann, verliert nichts.
 */
/*
 * Die Voreinstellung streut über die ersten acht der zwölf Töne – nicht über alle.
 *
 * Das ist Absicht: Würde hier 12 stehen, bekäme jede Person im Bestand schlagartig eine
 * andere Farbe, ohne dass jemand etwas geändert hätte. Die vier hinzugekommenen Töne sind
 * über die Farbwahl erreichbar, nicht über den Zufall.
 */
export const MEMBER_COLORS = 8

/**
 * Kleiner, stabiler Hash – gleiche ID ergibt überall dieselbe Farbe.
 *
 * `slots` ist die Zahl der Töne, über die gestreut wird. Personen bleiben bei acht, damit
 * niemandem im Bestand die Farbe wegrutscht; Bereiche streuen über alle zwölf, weil es von
 * ihnen mehr gibt und sie diese Streuung nie anders kannten.
 */
export function colorIndex(id: string | null | undefined, slots: number): number {
  if (!id) return 0
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return (hash % slots) + 1
}

export const memberColorIndex = (membershipId: string | null | undefined): number =>
  colorIndex(membershipId, MEMBER_COLORS)

/** Die Anfangsbuchstaben für den farbigen Punkt – höchstens zwei. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}
