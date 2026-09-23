import { and, eq, isNull } from 'drizzle-orm'
import { assessPassword, generateToken, hashPassword, hashToken, verifyPassword } from '@thealotta/crypto'
import { DomainError } from '@thealotta/domain'
import { householdMemberships, passwordResetTokens, userSessions, users, uuidv7, type Database } from '@thealotta/db'
import { recordAudit } from '@thealotta/db'
import { withoutTenant } from '@thealotta/db'

export interface SessionIssued {
  token: string
  csrfToken: string
  expiresAt: Date
  sessionId: string
}

export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly ttlDays: number,
  ) {}

  async register(input: { email: string; password: string; displayName: string }): Promise<{ userId: string }> {
    const check = assessPassword(input.password, [input.email.split('@')[0] ?? '', input.displayName])
    if (!check.ok) throw new DomainError('validation_failed', 422, check.reason ?? 'Passwort ungeeignet.')

    const existing = await this.db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1)
    if (existing.length > 0) {
      // Keine Kontoauskunft nach außen; der Konflikt wird generisch gemeldet.
      throw new DomainError('validation_failed', 422, 'Registrierung nicht möglich.')
    }

    const [user] = await this.db
      .insert(users)
      .values({
        id: uuidv7(),
        email: input.email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName,
      })
      .returning({ id: users.id })

    return { userId: user!.id }
  }

  /**
   * Login mit konstanter Arbeitslast: Auch bei unbekannter E-Mail wird ein Hash verifiziert,
   * damit die Antwortzeit keine Konten verrät.
   */
  async login(
    input: { email: string; password: string },
    meta: { ipHash?: string; userAgentHash?: string },
  ): Promise<{ userId: string; session: SessionIssued }> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, input.email), isNull(users.deletedAt)))
      .limit(1)

    const digest = user?.passwordHash ?? DUMMY_HASH
    const { valid, needsRehash } = await verifyPassword(digest, input.password)

    if (!user || !valid || user.status !== 'active') {
      await withoutTenant(this.db, 'audit_login_failure', (tx) =>
        recordAudit(tx, {
          action: 'auth.login_failed',
          outcome: 'failure',
          userId: user?.id ?? null,
          ipHash: meta.ipHash ?? null,
          userAgentHash: meta.userAgentHash ?? null,
        }),
      )
      throw new DomainError('unauthenticated', 401, 'E-Mail-Adresse oder Passwort stimmt nicht.')
    }

    if (needsRehash) {
      await this.db.update(users).set({ passwordHash: await hashPassword(input.password) }).where(eq(users.id, user.id))
    }

    const session = await this.issueSession(user.id, uuidv7(), meta)
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
    await withoutTenant(this.db, 'audit_login_success', (tx) =>
      recordAudit(tx, {
        action: 'auth.login_succeeded',
        userId: user.id,
        ipHash: meta.ipHash ?? null,
        userAgentHash: meta.userAgentHash ?? null,
      }),
    )
    return { userId: user.id, session }
  }

  async issueSession(
    userId: string,
    familyId: string,
    meta: { ipHash?: string; userAgentHash?: string },
  ): Promise<SessionIssued> {
    const token = generateToken()
    const expiresAt = new Date(Date.now() + this.ttlDays * 86_400_000)
    const [row] = await this.db
      .insert(userSessions)
      .values({
        id: uuidv7(),
        userId,
        refreshTokenHash: hashToken(token),
        familyId,
        expiresAt,
        ipHash: meta.ipHash ?? null,
        userAgentHash: meta.userAgentHash ?? null,
      })
      .returning({ id: userSessions.id })
    return { token, csrfToken: generateToken(24), expiresAt, sessionId: row!.id }
  }

  /**
   * Rotation mit Reuse-Detection: Wird ein bereits rotiertes Token erneut vorgelegt, ist es
   * abgeflossen. Dann fällt die gesamte Token-Familie (docs/25 §5).
   */
  async rotate(token: string, meta: { ipHash?: string; userAgentHash?: string }): Promise<SessionIssued> {
    const hash = hashToken(token)
    const [session] = await this.db.select().from(userSessions).where(eq(userSessions.refreshTokenHash, hash)).limit(1)
    if (!session) throw new DomainError('unauthenticated', 401, 'Sitzung ist nicht gültig.')

    if (session.revokedAt) {
      await this.db
        .update(userSessions)
        .set({ revokedAt: new Date(), revokedReason: 'token_reuse_detected' })
        .where(and(eq(userSessions.familyId, session.familyId), isNull(userSessions.revokedAt)))
      await withoutTenant(this.db, 'audit_token_reuse', (tx) =>
        recordAudit(tx, { action: 'auth.session_revoked', outcome: 'denied', userId: session.userId, metadata: { reason: 'token_reuse_detected' } }),
      )
      throw new DomainError('unauthenticated', 401, 'Sitzung wurde aus Sicherheitsgründen beendet.')
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new DomainError('unauthenticated', 401, 'Sitzung ist abgelaufen.')
    }

    await this.db
      .update(userSessions)
      .set({ revokedAt: new Date(), revokedReason: 'rotated', lastUsedAt: new Date() })
      .where(eq(userSessions.id, session.id))

    return this.issueSession(session.userId, session.familyId, meta)
  }

  async logout(token: string): Promise<void> {
    await this.db
      .update(userSessions)
      .set({ revokedAt: new Date(), revokedReason: 'logout' })
      .where(eq(userSessions.refreshTokenHash, hashToken(token)))
  }

  /** Antwortet immer gleich – ob das Konto existiert, verrät die API nicht. */
  async requestPasswordReset(email: string): Promise<{ token: string; userId: string } | null> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1)
    if (!user || user.status !== 'active') return null
    const token = generateToken()
    await this.db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    })
    return { token, userId: user.id }
  }

  async confirmPasswordReset(token: string, password: string): Promise<void> {
    const [row] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, hashToken(token)), isNull(passwordResetTokens.usedAt)))
      .limit(1)
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      throw new DomainError('validation_failed', 422, 'Dieser Link ist nicht mehr gültig.')
    }
    const check = assessPassword(password)
    if (!check.ok) throw new DomainError('validation_failed', 422, check.reason ?? 'Passwort ungeeignet.')

    await this.db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, row.userId))
    await this.db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id))
    // Ein Passwortwechsel beendet alle Sitzungen – sonst bliebe ein Angreifer angemeldet.
    await this.db
      .update(userSessions)
      .set({ revokedAt: new Date(), revokedReason: 'password_changed' })
      .where(and(eq(userSessions.userId, row.userId), isNull(userSessions.revokedAt)))
    await withoutTenant(this.db, 'audit_password_reset', (tx) =>
      recordAudit(tx, { action: 'auth.password_reset_completed', userId: row.userId }),
    )
  }

  /**
   * Passwortwechsel mit Nachweis des aktuellen Passworts. Beendet anschließend alle Sitzungen –
   * sonst bliebe ein Angreifer angemeldet, der genau deshalb ausgesperrt werden soll.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) throw new DomainError('not_found', 404, 'Konto nicht gefunden.')

    const { valid } = await verifyPassword(user.passwordHash, currentPassword)
    if (!valid) throw new DomainError('invalid_credentials', 422, 'Das aktuelle Passwort stimmt nicht.')

    const check = assessPassword(newPassword, [user.email.split('@')[0] ?? '', user.displayName])
    if (!check.ok) throw new DomainError('validation_failed', 422, check.reason ?? 'Passwort ungeeignet.')

    await this.db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, userId))
    await this.db
      .update(userSessions)
      .set({ revokedAt: new Date(), revokedReason: 'password_changed' })
      .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))

    await withoutTenant(this.db, 'audit_password_change', (tx) =>
      recordAudit(tx, { action: 'auth.password_changed', userId }),
    )
  }

  async memberships(userId: string): Promise<{ householdId: string; membershipId: string; role: string; displayName: string }[]> {
    return withoutTenant(this.db, 'list_own_memberships', async (tx) =>
      tx
        .select({
          householdId: householdMemberships.householdId,
          membershipId: householdMemberships.id,
          role: householdMemberships.role,
          displayName: householdMemberships.displayName,
        })
        .from(householdMemberships)
        .where(and(eq(householdMemberships.userId, userId), eq(householdMemberships.status, 'active'))),
    )
  }
}

/** Argon2id-Hash eines Zufallswerts – nur um die Verifikationszeit konstant zu halten. */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHR2YWx1ZQ$3f8Yl5nJZ0nZ5YQZ0nZ5YQZ0nZ5YQZ0nZ5YQZ0nZ5YQ'
