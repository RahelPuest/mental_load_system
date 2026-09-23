import { invalidTransition } from '../errors.js'

export interface Transition<S extends string, E extends string> {
  from: S
  event: E
  to: S
  /** Zusätzliche fachliche Bedingung, die zur Laufzeit erfüllt sein muss. */
  guard?: string
}

export interface StateMachine<S extends string, E extends string> {
  readonly name: string
  readonly initial: S
  readonly states: readonly S[]
  readonly terminal: readonly S[]
  readonly transitions: readonly Transition<S, E>[]
}

export function can<S extends string, E extends string>(m: StateMachine<S, E>, from: S, event: E): boolean {
  return m.transitions.some((t) => t.from === from && t.event === event)
}

export function next<S extends string, E extends string>(m: StateMachine<S, E>, from: S, event: E): S {
  const t = m.transitions.find((x) => x.from === from && x.event === event)
  if (!t) throw invalidTransition(m.name, from, event)
  return t.to
}

/** Alle von `from` aus erreichbaren Ereignisse – für UI-Aktionslisten. */
export function availableEvents<S extends string, E extends string>(m: StateMachine<S, E>, from: S): E[] {
  return [...new Set(m.transitions.filter((t) => t.from === from).map((t) => t.event))]
}

export function isTerminal<S extends string, E extends string>(m: StateMachine<S, E>, s: S): boolean {
  return m.terminal.includes(s)
}
