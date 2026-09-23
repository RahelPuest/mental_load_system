import { z } from 'zod'
import {
  CAPACITY_LEVELS,
  CAPACITY_REASON_CATEGORIES,
  CRITICALITY,
  ENERGY_LEVELS,
  SENSITIVITY_LEVELS,
  VALUE_KINDS,
} from '../enums.js'

export const uuid = z.string().uuid()
export const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .describe('ISO-8601 mit Offset; Eingaben ohne Offset werden abgelehnt')

export const cursorPagination = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const sensitivity = z.enum(SENSITIVITY_LEVELS)
export const criticality = z.enum(CRITICALITY)
export const energy = z.enum(ENERGY_LEVELS)
export const valueKind = z.enum(VALUE_KINDS)
export const capacityLevel = z.enum(CAPACITY_LEVELS)
export const capacityReason = z.enum(CAPACITY_REASON_CATEGORIES)

/** RFC 9457 Problem Details – einheitliches Fehlerformat der gesamten API. */
export const problemDetails = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  current: z.unknown().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
})
export type ProblemDetails = z.infer<typeof problemDetails>

/**
 * Ein Begründungsfaktor der Priorisierung (INV-008 / ADR-0005).
 * `explanation` ist ein fertiger deutscher Satz mit konkreten Daten – kein Template-Schlüssel.
 */
export const scoreFactor = z.object({
  code: z.string(),
  label: z.string(),
  explanation: z.string(),
  contribution: z.number(),
})
export type ScoreFactor = z.infer<typeof scoreFactor>
