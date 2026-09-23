import { and, eq } from 'drizzle-orm'
import { colorPreferences, domains, householdMemberships, uuidv7, type Tx } from '@thealotta/db'
import { notFound, type EffectiveContext } from '@thealotta/domain'
import { COLOR_TONES, type ColorSubject, type ColorTone } from '@thealotta/contracts'

/**
 * Farben für Personen und Bereiche.
 *
 * Voreingestellt ist eine aus der ID abgeleitete Farbe – kein Zustand, überall gleich. Diese
 * Tabelle enthält nur, was jemand davon abweichend eingestellt hat.
 *
 * Eine Farbe gilt für den Betrachter allein. Deshalb braucht das Setzen keine Berechtigung
 * über die Mitgliedschaft hinaus: Wer eine Farbe wählt, verändert sein eigenes Bild und
 * niemandes Daten. Geprüft wird nur, dass das Ziel im selben Haushalt existiert – sonst
 * wäre die Tabelle ein Ablageort für beliebige Fremd-IDs.
 */
export class ColorService {
  /** Alle Abweichungen dieses Betrachters, nach Art getrennt. */
  async list(tx: Tx, ctx: EffectiveContext): Promise<{ members: Record<string, ColorTone>; domains: Record<string, ColorTone> }> {
    const rows = await tx
      .select({
        subjectKind: colorPreferences.subjectKind,
        subjectId: colorPreferences.subjectId,
        tone: colorPreferences.tone,
      })
      .from(colorPreferences)
      .where(
        and(
          eq(colorPreferences.householdId, ctx.householdId),
          eq(colorPreferences.viewerMembershipId, ctx.membershipId),
        ),
      )

    const members: Record<string, ColorTone> = {}
    const domainTones: Record<string, ColorTone> = {}
    for (const row of rows) {
      const bucket = row.subjectKind === 'domain' ? domainTones : members
      bucket[row.subjectId] = row.tone as ColorTone
    }
    return { members, domains: domainTones }
  }

  /**
   * Farbe setzen oder – bei `null` – auf die Voreinstellung zurücksetzen.
   *
   * Zurücksetzen ist ein Löschen und kein Sonderwert: „keine Zeile" heißt „wie
   * voreingestellt". Ein gespeichertes „Standard" wäre eine zweite Wahrheit, die mit der
   * Ableitung auseinanderlaufen könnte.
   */
  async set(
    tx: Tx,
    ctx: EffectiveContext,
    subject: ColorSubject,
    subjectId: string,
    tone: ColorTone | null,
    now: Date,
  ): Promise<void> {
    await this.assertSubjectExists(tx, ctx, subject, subjectId)

    if (tone === null) {
      await tx
        .delete(colorPreferences)
        .where(
          and(
            eq(colorPreferences.householdId, ctx.householdId),
            eq(colorPreferences.viewerMembershipId, ctx.membershipId),
            eq(colorPreferences.subjectKind, subject),
            eq(colorPreferences.subjectId, subjectId),
          ),
        )
      return
    }

    if (!COLOR_TONES.includes(tone)) throw notFound('Diese Farbe')

    await tx
      .insert(colorPreferences)
      .values({
        id: uuidv7(now.getTime()),
        householdId: ctx.householdId,
        viewerMembershipId: ctx.membershipId,
        subjectKind: subject,
        subjectId,
        tone,
      })
      .onConflictDoUpdate({
        target: [colorPreferences.viewerMembershipId, colorPreferences.subjectKind, colorPreferences.subjectId],
        set: { tone, updatedAt: now },
      })
  }

  private async assertSubjectExists(tx: Tx, ctx: EffectiveContext, subject: ColorSubject, subjectId: string) {
    if (subject === 'member') {
      const [row] = await tx
        .select({ id: householdMemberships.id })
        .from(householdMemberships)
        .where(and(eq(householdMemberships.householdId, ctx.householdId), eq(householdMemberships.id, subjectId)))
        .limit(1)
      if (!row) throw notFound('Das Mitglied')
      return
    }
    const [row] = await tx
      .select({ id: domains.id })
      .from(domains)
      .where(and(eq(domains.householdId, ctx.householdId), eq(domains.id, subjectId)))
      .limit(1)
    if (!row) throw notFound('Der Bereich')
  }
}
