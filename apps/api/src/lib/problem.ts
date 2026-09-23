import type { FastifyReply, FastifyRequest } from 'fastify'
import { DomainError } from '@thealotta/domain'
import { ZodError } from 'zod'

/** RFC 9457 Problem Details (docs/21 §1). */
export interface Problem {
  type: string
  title: string
  status: number
  code: string
  detail?: string
  instance?: string
  requestId?: string
  errors?: { path: string; message: string }[]
  current?: unknown
}

const TITLES: Record<string, string> = {
  unauthenticated: 'Nicht angemeldet.',
  forbidden: 'Keine Berechtigung.',
  not_found: 'Nicht gefunden.',
  version_conflict: 'Das Objekt wurde zwischenzeitlich geändert.',
  invalid_transition: 'Dieser Schritt ist im aktuellen Zustand nicht möglich.',
  precondition_required: 'Es fehlt die Angabe der bekannten Version.',
  idempotency_key_reused: 'Der Idempotency-Key wurde mit anderem Inhalt wiederverwendet.',
  request_in_flight: 'Diese Anfrage wird gerade bereits verarbeitet.',
  validation_failed: 'Die Eingabe ist unvollständig oder ungültig.',
  recipient_not_accepting: 'Diese Person nimmt gerade keine neuen Aufgaben an.',
  coverage_cannot_transfer_ownership: 'Eine Vertretung kann die dauerhafte Verantwortung nicht übertragen.',
  requires_human_actor: 'Diese Entscheidung trifft das System nicht selbst.',
  already_claimed: 'Dafür ist bereits jemand verantwortlich.',
  rate_limited: 'Zu viele Anfragen.',
  has_children: 'Da hängt noch etwas dran.',
  not_empty: 'Da steht schon etwas drin.',
  invalid_parent: 'So kann der Baum nicht aussehen.',
  invalid_target: 'Dahin geht das nicht.',
  target_archived: 'Der Zielbereich ist archiviert.',
  task_belongs_to_process: 'Die Aufgabe gehört zu einem Vorgang.',
  internal_error: 'Unerwarteter Fehler.',
}

export function toProblem(error: unknown, request: FastifyRequest): Problem {
  const instance = request.url
  const requestId = request.id

  if (error instanceof DomainError) {
    return {
      type: `https://thealotta.app/errors/${error.code}`,
      title: TITLES[error.code] ?? 'Fehler.',
      status: error.status,
      code: error.code,
      detail: error.message,
      instance,
      requestId,
      ...(error.details && 'current' in error.details ? { current: error.details['current'] } : {}),
    }
  }

  if (error instanceof ZodError) {
    return {
      type: 'https://thealotta.app/errors/validation_failed',
      title: TITLES['validation_failed']!,
      status: 422,
      code: 'validation_failed',
      instance,
      requestId,
      errors: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    }
  }

  const status = (error as { statusCode?: number })?.statusCode
  if (status === 429) {
    return { type: 'https://thealotta.app/errors/rate_limited', title: TITLES['rate_limited']!, status: 429, code: 'rate_limited', instance, requestId }
  }
  if (status && status < 500) {
    return {
      type: 'https://thealotta.app/errors/bad_request',
      title: 'Anfrage konnte nicht verarbeitet werden.',
      status,
      code: 'bad_request',
      detail: (error as Error).message,
      instance,
      requestId,
    }
  }

  return {
    type: 'https://thealotta.app/errors/internal_error',
    title: TITLES['internal_error']!,
    status: 500,
    code: 'internal_error',
    instance,
    requestId,
  }
}

export function sendProblem(reply: FastifyReply, problem: Problem): FastifyReply {
  return reply.status(problem.status).type('application/problem+json').send(problem)
}
